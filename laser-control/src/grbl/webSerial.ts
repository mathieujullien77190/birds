import type { GrblTransport } from './types';

/** Le strict nécessaire de l'API Web Serial (absente de la bibliothèque DOM de TypeScript). */
interface SerialPortLike {
  open(o: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; flowControl?: string; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  addEventListener(type: 'disconnect', cb: () => void): void;
  removeEventListener(type: 'disconnect', cb: () => void): void;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike { requestPort(o?: object): Promise<SerialPortLike> }

function serial(): SerialLike | undefined { return (navigator as Navigator & { serial?: SerialLike }).serial; }

/** L'API Web Serial est disponible (Chrome / Edge, en HTTPS ou sur localhost). */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!serial() && (typeof window === 'undefined' || window.isSecureContext);
}

/** Pourquoi Web Serial n'est pas utilisable (message pour l'utilisateur), ou `null` s'il l'est. */
export function webSerialProblem(): string | null {
  if (typeof navigator === 'undefined') return 'Pas de navigateur.';
  if (!serial()) return "Ce navigateur ne sait pas piloter un port USB (API Web Serial absente). Utilise Chrome ou Edge ; Firefox et Safari ne la proposent pas.";
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'Le pilotage USB demande une page en HTTPS ou sur localhost.';
  return null;
}

/** Octets d'une chaîne latin-1 (un caractère = un octet, même 0x85). */
export const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** Port série réel (Web Serial), 115200 bauds 8N1 sans contrôle de flux. */
export class WebSerialTransport implements GrblTransport {
  readonly kind = 'serial' as const;
  label = 'Port USB';
  onData: ((chunk: string) => void) | null = null;
  onClose: ((unexpected: boolean, reason?: string) => void) | null = null;
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private closing = false;
  private lost = () => this.finish(true, 'port déconnecté');

  /** Demande le port à l'utilisateur (doit être appelée directement par un clic), l'ouvre et lance la lecture. */
  async open(): Promise<void> {
    const s = serial();
    if (!s) throw new Error(webSerialProblem()!); // sans navigator.serial, webSerialProblem() rend toujours un message
    const port = await s.requestPort();
    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 4096 });
    this.port = port;
    const info = port.getInfo?.();
    if (info?.usbVendorId) this.label = `Port USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`;
    port.addEventListener('disconnect', this.lost);
    if (!port.readable || !port.writable) throw new Error('Port série sans flux lisible / inscriptible');
    this.writer = port.writable.getWriter();
    this.reader = port.readable.getReader();
    void this.readLoop(this.reader);
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const dec = new TextDecoder('latin1');
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.length) this.onData?.(dec.decode(value));
      }
      this.finish(true, 'flux terminé');
    } catch (e) {
      this.finish(true, e instanceof Error ? e.message : 'erreur de lecture');
    }
  }

  async write(data: string): Promise<void> {
    if (!this.writer) throw new Error('Port fermé');
    await this.writer.write(latin1(data));
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.release();
    this.onClose?.(false);
  }

  private async release() {
    const { reader, writer, port } = this;
    this.reader = this.writer = this.port = null;
    port?.removeEventListener('disconnect', this.lost);
    try { await reader?.cancel(); } catch { /* déjà fermé */ }
    try { reader?.releaseLock(); } catch { /* idem */ }
    try { writer?.releaseLock(); } catch { /* idem */ }
    try { await port?.close(); } catch { /* idem */ }
  }

  private finish(unexpected: boolean, reason: string) {
    if (this.closing || !this.port) return;
    this.closing = true;
    void this.release().then(() => this.onClose?.(unexpected, reason));
  }
}
