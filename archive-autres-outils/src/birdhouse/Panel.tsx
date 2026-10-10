import { useMemo, useRef, useState } from 'react';
import { CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import Slider from '@/ui/Slider';
import { Btn, Chip, Hint, Section } from '@/ui/kit';
import { toolUrl } from '@/tools';
import { pieceSvg, RIM_INSET, type Piece } from './model';
import { boltHeights, capBoltXs, capPieces, PANEL_DEFAULTS, panelDims, panelLayout, panelPieces, panelSvg, wallDims, wallFrames, wallPieces, type PanelParams } from './panelModel';
import { block, pieceMesh, saveSvg, Sheet2D, useThreeView, WOOL, type Cut } from './Birdhouse';

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

/**
 * Un panneau sandwich dans son repère : x = longueur, y = hauteur, z = 0 (face intérieure) → T (face extérieure).
 * `pieces` = ses 6 pièces dans l'ordre plaque extérieure, plaque intérieure, bord bas, bord haut, bord de début, bord de fin ;
 * la plaque extérieure est décalée de (`dxOuter`, `dyOuter`) (−T, −T pour un mur : elle dépasse au début et couvre plancher et toit) et écartée de `open` (panneau ouvert).
 */
function buildSandwich(p: PanelParams, pieces: Piece[], dxOuter: number, dyOuter: number, cav: { c0: number; cavW: number; hgt: number }, open: number, showWool: boolean): Group {
  const g = new Group();
  const { T, i0 } = panelDims(p);
  const t = p.t;
  const [outerP, innerP, bottom, top, start, end] = pieces;
  const inner = pieceMesh(innerP, t);
  const outer = pieceMesh(outerP, t);
  outer.position.set(dxOuter, dyOuter, T - t + open); // pas collée : s'enlève pour poser la laine et serrer les écrous
  g.add(inner, outer);
  const rim = (piece: Piece, bx: Vector3, by_: Vector3, x: number, y: number) => {
    const m = pieceMesh(piece, t);
    m.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(bx, by_, bx.clone().cross(by_))); // base directe : l'épaisseur du bord suit Z = X × Y
    m.position.set(x, y, t);
    g.add(m);
  };
  rim(bottom, X, Z, cav.c0, i0 + t); // bas : occupe y ∈ [i0, i0 + t]
  rim(top, X, Z, cav.c0, cav.hgt - i0); // haut : y ∈ [hgt − i0 − t, hgt − i0]
  rim(start, Y, Z, cav.c0, i0 + t); // début : x ∈ [c0, c0 + t]
  rim(end, Y, Z, cav.c0 + cav.cavW - t, i0 + t); // fin : x ∈ [c1 − t, c1]
  if (showWool) {
    const hole = innerP.hole;
    const wool = block(cav.cavW - 2 * t, cav.hgt - 2 * i0 - 2 * t, p.ins, WOOL, 1, hole && { x: hole.cx - (cav.c0 + cav.cavW / 2), y: hole.cy - cav.hgt / 2, r: hole.r });
    wool.position.set(cav.c0 + cav.cavW / 2, cav.hgt / 2, T / 2);
    g.add(wool);
  }
  return g;
}

/** Boulon + écrou, le long de z : tête en z = z0 (extérieur), tige jusqu'à z1, écrou juste avant z1. */
function bolt(d: number, z0: number, z1: number): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color: '#8d9299', metalness: 0.8, roughness: 0.35 });
  const shaft = new Mesh(new CylinderGeometry(d / 2, d / 2, z0 - z1, 16), mat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = (z0 + z1) / 2;
  const head = new Mesh(new CylinderGeometry(d, d, 2.5, 24), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = z0 + 1.25;
  const nut = new Mesh(new CylinderGeometry(d * 0.95, d * 0.95, 0.8 * d, 6), mat);
  nut.rotation.x = Math.PI / 2;
  nut.position.z = z1 + 0.4 * d + 1;
  g.add(shaft, head, nut);
  return g;
}

/** Le pavé : 4 murs placés par `wallFrames`, plancher dessous, toit dessus, boulons d'angle et boulons verticaux. */
function buildBox(p: PanelParams, open: number, showWool: boolean, roofOn: boolean): Group {
  const { T, h } = panelDims(p);
  const g = new Group();
  const nutZ = -(RIM_INSET + p.t) - 1.2 * p.boltD - 2; // profondeur de l'écrou derrière le bord percé
  for (const f of wallFrames(p)) {
    const { c0, cavW, boltX } = wallDims(p, f.spec.L);
    const wall = buildSandwich(p, wallPieces(p, f.spec), -T, -T, { c0, cavW, hgt: h }, open, showWool);
    for (const y of boltHeights(p)) { // boulons d'angle : ce mur reçoit le suivant dans sa zone de fin
      const b = bolt(p.boltD, T + open, nutZ);
      b.position.set(boltX, y, 0);
      wall.add(b);
    }
    const u = new Vector3(...f.u), n = new Vector3(...f.n);
    wall.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(u, Y, n));
    wall.position.set(...f.C).addScaledVector(u, T).addScaledVector(n, -T); // l'origine locale est à T du coin le long du mur et à T vers l'intérieur
    g.add(wall);
  }
  // plancher et toit : panneaux rentrés de t entre les plaques extérieures des murs ; repère X = x + T − t, Y = T − t − z (0 devant), Z = épaisseur vers l'extérieur
  const { capW, capD } = panelDims(p);
  const cap = (name: string, mirror: boolean) => buildSandwich(p, capPieces(p, name, mirror), 0, 0, { c0: RIM_INSET, cavW: capW - 2 * RIM_INSET, hgt: capD }, open, showWool);
  if (roofOn) {
    const roof = cap('Toit', false);
    roof.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, new Vector3(0, 0, -1), Y)); // X → x, Y → −z, Z → +y
    roof.position.set(-T + p.t, h, T - p.t);
    g.add(roof);
  }
  const floor = cap('Plancher', true);
  floor.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0))); // X → −x (miroir), Y → −z, Z → −y
  floor.position.set(p.w - T - p.t, 0, T - p.t);
  g.add(floor);
  // boulons verticaux : à travers le toit (tête dessus) et le plancher (tête dessous), au droit des bords haut / bas des murs
  for (const f of wallFrames(p)) for (const x of capBoltXs(p, f.spec.L)) {
    const u = new Vector3(...f.u), n = new Vector3(...f.n);
    const at = new Vector3(...f.C).addScaledVector(u, x + T).addScaledVector(n, -T / 2); // milieu de l'épaisseur du mur
    if (roofOn) {
      const b = bolt(p.boltD, T + open, nutZ);
      b.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, new Vector3(0, 0, -1), Y)); // z du boulon → +y
      b.position.set(at.x, h, at.z);
      g.add(b);
    }
    const b = bolt(p.boltD, T + open, nutZ);
    b.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Z, new Vector3(0, -1, 0))); // z du boulon → −y
    b.position.set(at.x, 0, at.z);
    g.add(b);
  }
  g.position.set(-p.w / 2 + T, -T, -T + p.d / 2); // le pavé centré, posé sur y = −T… son dessous à y = −2T : on recentre sur le milieu de la hauteur plus bas
  g.position.y = -(p.H / 2) + T;
  return g;
}

export default function Panel() {
  const [params, setParams] = useState<PanelParams>(PANEL_DEFAULTS);
  const [view2d, setView2d] = useState(false);
  const [cut, setCut] = useState<Cut>({ on: false, axis: 'x', offset: 0, flip: false });
  const [open, setOpen] = useState(0); // écartement des plaques extérieures dans la vue 3D
  const [showWool, setShowWool] = useState(true); // laine affichée ou cachée (pour voir les cadres et les boulons)
  const [roofOn, setRoofOn] = useState(true); // toit posé ou enlevé (pour voir dedans)
  const host = useRef<HTMLDivElement>(null);
  const centre = useMemo(() => new Vector3(0, 0, 0), []);
  const key = useMemo(() => ({ params, open, showWool, roofOn }), [params, open, showWool, roofOn]);
  useThreeView(host, () => buildBox(params, open, showWool, roofOn), key, cut, centre, new Vector3(420, 330, 560));
  const set = (patch: Partial<PanelParams>) => setParams((p) => ({ ...p, ...patch }));
  const list = useMemo(() => panelPieces(params), [params]);
  const { height } = useMemo(() => panelLayout(params), [params]);
  const svg = useMemo(() => panelSvg(params), [params]);
  const dims = panelDims(params);
  const rEq = Math.round((2 * params.t / 0.13 + params.ins / 0.04) * 0.13); // bois massif équivalent
  const tooSmall = Math.min(dims.innerW, dims.innerD, dims.innerH) < 40;
  const boltLen = Math.ceil((dims.T + RIM_INSET + params.t + 1.2 * params.boltD + 3) / 5) * 5; // longueur de boulon utile, arrondie aux 5 mm
  const nBolts = 4 * params.bolts + 2 * 4 * params.capBolts;
  const cutAxis = cut.on ? cut.axis : 'off';

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-emerald-900">Pavé isolé</h1>
            <p className="text-[11px] text-stone-500">6 panneaux sandwich (contreplaqué {params.t} + laine {params.ins} + contreplaqué {params.t}), angles lisses, boulonnés.</p>
          </div>
          <a href={toolUrl('menu')} className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-stone-100">← Menu</a>
        </header>

        {/* 1. le pavé */}
        <Section title="Pavé" defaultOpen note={`${params.w} × ${params.d} × ${params.H} mm`}>
          <Slider label="Largeur (façade)" value={params.w} min={120} max={400} step={1} unit=" mm" onChange={(v) => set({ w: v })} />
          <Slider label="Profondeur" value={params.d} min={120} max={400} step={1} unit=" mm" onChange={(v) => set({ d: v })} />
          <Slider label="Hauteur" value={params.H} min={120} max={500} step={1} unit=" mm" onChange={(v) => set({ H: v })} />
          <Slider label="Laine de bois (isolant)" value={params.ins} min={10} max={100} step={1} unit=" mm" onChange={(v) => set({ ins: v })} />
          <Hint>Dimensions extérieures. Panneaux de {dims.T} mm ; intérieur {dims.innerW} × {dims.innerD} × {dims.innerH} mm. Chaque face isole comme ~{rEq} mm de bois massif.</Hint>
          {tooSmall && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">Pavé trop petit pour l'épaisseur des panneaux : agrandis-le ou réduis la laine.</p>}
        </Section>

        {/* 2. le trou */}
        <Section title="Trou d'envol (façade)" defaultOpen={false} note={params.hole ? `Ø ${params.hole} mm` : 'aucun'}>
          <Slider label="Diamètre (0 = pas de trou)" value={params.hole} min={0} max={50} step={1} unit=" mm" onChange={(v) => set({ hole: v })} />
          {params.hole > 0 && <Slider label="Hauteur du centre depuis le plancher" value={params.holeHeight} min={20} max={380} step={1} unit=" mm" onChange={(v) => set({ holeHeight: v })} />}
        </Section>

        {/* 3. l'assemblage */}
        <Section title="Boulons" defaultOpen note={`${nBolts} × M${params.boltD} × ${boltLen}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Diamètre
            {[3, 4, 5].map((d) => <Chip key={d} active={params.boltD === d} onClick={() => set({ boltD: d })}>M{d}</Chip>)}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Par angle
            {[2, 3, 4].map((n) => <Chip key={n} active={params.bolts === n} onClick={() => set({ bolts: n })}>{n}</Chip>)}
            <span className="ml-2">Par mur, plancher et toit</span>
            {[1, 2, 3].map((n) => <Chip key={n} active={params.capBolts === n} onClick={() => set({ capBolts: n })}>{n}</Chip>)}
          </div>
          <Hint>Trous de Ø {params.boltD + 0.5} mm. Angles : le boulon traverse le mur qui reçoit (plaques + laine) puis le bord de début du mur suivant. Plancher et toit : boulons verticaux à travers le panneau puis le bord bas ou haut du mur. Dans tous les cas l'écrou se serre dans la cavité du mur, mur ouvert, puis on referme. {nBolts} boulons M{params.boltD} × {boltLen}, rondelles.</Hint>
        </Section>

        {/* 4. comment on regarde */}
        <Section title="Vue 3D" defaultOpen>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Panneaux
            <Chip active={open === 0} onClick={() => setOpen(0)}>Fermés</Chip>
            <Chip active={open > 0} onClick={() => setOpen(90)}>Ouverts</Chip>
            <span className="ml-2">Toit</span>
            <Chip active={roofOn} onClick={() => setRoofOn(true)}>Posé</Chip>
            <Chip active={!roofOn} onClick={() => setRoofOn(false)}>Enlevé</Chip>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Laine
            <Chip active={showWool} onClick={() => setShowWool(true)}>Visible</Chip>
            <Chip active={!showWool} onClick={() => setShowWool(false)}>Cachée</Chip>
            <span className="ml-2">Coupe</span>
            <Chip active={cutAxis === 'off'} onClick={() => setCut({ ...cut, on: false })}>Non</Chip>
            {(['x', 'y', 'z'] as const).map((ax) => (
              <Chip key={ax} active={cutAxis === ax} onClick={() => setCut({ ...cut, axis: ax, on: true })}>{{ x: 'X', y: 'Y', z: 'Z' }[ax]}</Chip>
            ))}
          </div>
          {cut.on && (
            <>
              <Slider label="Position du plan de coupe" value={cut.offset} min={-250} max={250} step={1} unit=" mm" onChange={(v) => setCut({ ...cut, offset: v })} />
              <Btn block={false} onClick={() => setCut({ ...cut, flip: !cut.flip })}>Garder l'autre côté</Btn>
            </>
          )}
        </Section>

        {/* 5. la découpe */}
        <Section title="Découpe laser" defaultOpen>
          <Btn variant="primary" onClick={() => saveSvg(svg, `pave-isole-${params.w}x${params.d}x${params.H}-laine${params.ins}-${params.t}mm.svg`)}>Télécharger le SVG ({params.sheet} × {Math.round(height)} mm)</Btn>
          <Hint>Noir = coupe, bleu = nom des pièces. Plaque intérieure collée sur le cadre, plaque extérieure emboîtée sans colle (elle s'enlève pour la laine et les écrous). Dehors : les plaques extérieures des murs font toute la hauteur et recouvrent la tranche du mur précédent ainsi que les chants du plancher et du toit — six plaques pleines, un trait de {params.t} mm aux arêtes.</Hint>
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-semibold text-stone-600 select-none">Réglages avancés</summary>
            <div className="mt-2 space-y-2.5">
              <Slider label="Épaisseur du contreplaqué" value={params.t} min={2} max={6} step={0.5} unit=" mm" onChange={(v) => set({ t: v })} />
              <Slider label="Jeu des fentes (le laser mange ~0,1–0,2 mm)" value={params.fit} min={0} max={0.5} step={0.05} unit=" mm" onChange={(v) => set({ fit: v })} />
              <Slider label="Largeur de la planche" value={params.sheet} min={200} max={1200} step={10} unit=" mm" onChange={(v) => set({ sheet: v })} />
            </div>
          </details>
        </Section>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div ref={host} className="h-full w-full" />
        {view2d && <Sheet2D svg={svg} width={params.sheet} height={height} />}
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <Chip active={!view2d} onClick={() => setView2d(false)}>3D</Chip>
          <Chip active={view2d} onClick={() => setView2d(true)}>Planche à plat</Chip>
        </div>
        {!view2d && <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-stone-500">Clic gauche ou molette : tourner · clic droit : déplacer · roulette : zoom</div>}
      </main>

      {/* à droite : chaque pièce à plat, seule, à la même échelle */}
      <aside className="flex h-full w-[19rem] shrink-0 flex-col gap-2 overflow-y-auto border-l border-stone-200 bg-stone-50 p-3">
        <header>
          <h2 className="text-sm font-semibold text-emerald-900">Pièces ({list.length})</h2>
          <p className="text-[11px] text-stone-500">Contreplaqué {params.t} mm. Noir = coupe, brun = fentes.</p>
        </header>
        {(() => {
          const widest = Math.max(...list.map((x) => x.w + 8));
          const scale = Math.min(1.2, 264 / widest);
          return list.map((piece, k) => (
            <div key={k} className="rounded-lg border border-stone-200 bg-white p-2">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                <span className="font-semibold text-stone-800">{piece.name}</span>
                <span className="text-stone-500">{Math.round(piece.w)} × {Math.round(piece.h)} mm</span>
              </div>
              <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: pieceSvg(piece, scale) }} />
            </div>
          ));
        })()}
      </aside>
    </div>
  );
}
