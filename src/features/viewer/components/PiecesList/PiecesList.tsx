import { useMemo, type ReactNode } from 'react';
import { Btn, Hint } from '@/ui';
import { plankCodes, type Plank } from '@/birdhouse/model';
import { GroupRow } from './GroupRow';
import { PlankCard } from './PlankCard';
import { cardScale, groupName } from './helpers';
import type { PiecesListProps } from './types';

/** Contenu du volet « Pièces » : chaque plaque à plat (ou ligne de groupe repliable), glisser-déposer, œil, renommer, dupliquer, supprimer. */
export function PiecesList(props: PiecesListProps) {
  const { sc, selected, groupSel, openGroups, dropOn, docOpen, confirmAll, removeAll } = props;
  const codes = useMemo(() => plankCodes(sc), [sc]); // code de chaque plaque découpée (T01…)
  if (!sc.planks.length) return <Hint>Aucune plaque.</Hint>;
  const scale = cardScale(sc.planks);
  const card = (p: Plank) => (
    <PlankCard key={p.id} p={p} code={codes.get(p.id)} planks={props.sc.planks} scale={scale} selectedId={props.selectedId} groupSel={groupSel} extra={props.extra} hidden={props.hidden} dropOn={dropOn} setDropOn={props.setDropOn} setHover={props.setHover}
      setDocOpen={props.setDocOpen} setGroupSel={props.setGroupSel} pick={props.pick} update={props.update} toggleHidden={props.toggleHidden} duplicate={props.duplicate} remove={props.remove} dropPlank={props.dropPlank} />
  );
  // les plaques liées sont rangées sous une seule ligne (boîte, groupe) qui se déplie
  const seen = new Set<string>();
  const rows: ReactNode[] = [];
  for (const p of sc.planks) {
    if (!p.group) { rows.push(card(p)); continue; }
    if (seen.has(p.group)) continue;
    seen.add(p.group);
    const g = p.group, members = sc.planks.filter((x) => x.group === g);
    rows.push(
      <GroupRow key={'g' + g} g={g} name={groupName(sc, g, members)} members={members} open={openGroups.has(g)} isSelected={selected?.group === g} groupSel={groupSel} docOpen={docOpen} hidden={props.hidden}
        dropOn={dropOn} setDropOn={props.setDropOn} setHover={props.setHover} setOpenGroups={props.setOpenGroups} setSelectedId={props.setSelectedId} setGroupSel={props.setGroupSel} setExtra={props.setExtra}
        setDocOpen={props.setDocOpen} commit={props.commit} toggleHidden={props.toggleHidden} duplicateGroup={props.duplicateGroup} removeGroup={props.removeGroup} dropPlank={props.dropPlank}>
        {members.map((m) => card(m))}
      </GroupRow>,
    );
  }
  return (
    <>
      <Btn variant={confirmAll ? 'danger' : 'secondary'} onClick={removeAll}>{confirmAll ? `Cliquer encore pour tout supprimer (${sc.planks.length})` : `Tout supprimer (${sc.planks.length})`}</Btn>
      {rows}
    </>
  );
}
