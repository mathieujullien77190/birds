/** Fichier à ranger dans une archive ZIP : nom (UTF-8) et contenu (texte ou octets). */
export interface ZipFile { name: string; data: string | Uint8Array }

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** Somme de contrôle CRC-32 (celle de ZIP, de PNG, de gzip). */
export const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Archive ZIP SANS compression (méthode « stockée », lisible partout) : les SVG sont du texte, 1 à 2 Mo en tout, la compression n'apporte rien ici. */
export function makeZip(files: ZipFile[], date: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const entries = files.map((f) => { const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; return { name: enc.encode(f.name), data, crc: crc32(data) }; });
  const size = entries.reduce((a, e) => a + 30 + e.name.length + e.data.length + 46 + e.name.length, 22);
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  let o = 0;
  const u16 = (x: number) => { v.setUint16(o, x, true); o += 2; };
  const u32 = (x: number) => { v.setUint32(o, x, true); o += 4; };
  const put = (b: Uint8Array) => { out.set(b, o); o += b.length; };
  const offsets: number[] = [];
  for (const e of entries) { // en-tête local puis contenu
    offsets.push(o);
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate); u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); put(e.name); put(e.data);
  }
  const cd = o;
  entries.forEach((e, i) => { // répertoire central
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate); u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]); put(e.name);
  });
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(o - cd); u32(cd); u16(0);
  return out;
}

/** Télécharge une archive ZIP faite de ces fichiers. */
export const saveZip = (files: ZipFile[], name: string) => {
  const url = URL.createObjectURL(new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};
