import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Texture de chêne procédurale (une seule, partagée) : fond chêne clair, veines sinueuses plus sombres, grain fin, quelques maillures claires — dessinée dans un canvas. */
let oakTex: CanvasTexture | null = null;
export function oakTexture(): CanvasTexture {
  if (oakTex) return oakTex;
  const S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(S, S), d = img.data;
  const base = [196, 154, 96], dark = [132, 92, 48], light = [222, 190, 140];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ph = Array.from({ length: 6 }, () => rnd() * 6.28), amp = Array.from({ length: 6 }, () => 6 + rnd() * 10);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // veines le long de x : la position de la veine ondule avec x (sinus superposés), le long de y les veines se répètent tous les ~18 px avec un contraste variable
    // veines le long de x : leur position ondule (sinus superposés), leur ESPACEMENT varie le long de y (cernes serrés puis larges), lignes fines et sombres sur fond clair,
    // contraste qui change le long de x (la veine s'estompe par endroits), grain fin dans le sens du fil, quelques maillures claires
    const wobble = amp[0] * Math.sin(x * 0.008 + ph[0]) + amp[1] * 0.6 * Math.sin(x * 0.023 + ph[1]) + 3 * Math.sin(x * 0.07 + ph[2]);
    const v = y + wobble, u = v * 0.045 + 0.9 * Math.sin(v * 0.011 + ph[3]) + 0.3 * Math.sin(v * 0.037 + ph[4]);
    const line = Math.pow(0.5 + 0.5 * Math.sin(u * 6.283), 5); // 1 sur la veine (fine), 0 entre
    const fade = 0.55 + 0.45 * Math.sin(x * 0.014 + v * 0.02 + ph[5]); // la veine est plus ou moins marquée selon l'endroit
    const grain = (Math.sin(x * 0.5 + y * 1.9 + ph[4]) * 0.5 + 0.5) * 0.07 + (rnd() - 0.5) * 0.06;
    const ray = Math.max(0, Math.sin(y * 0.09 + x * 0.004 + ph[5]) - 0.95) * 8; // maillures claires, rares
    const t = Math.min(1, Math.max(0, line * fade * 0.9 + grain + 0.08 * Math.sin(v * 0.02) - ray));
    const i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(base[c] + (dark[c] - base[c]) * t + (light[c] - base[c]) * Math.max(0, ray - 0.1) * 0.5);
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  oakTex = new CanvasTexture(cv); oakTex.wrapS = oakTex.wrapT = RepeatWrapping; oakTex.colorSpace = SRGBColorSpace; oakTex.anisotropy = 8;
  return oakTex;
}
