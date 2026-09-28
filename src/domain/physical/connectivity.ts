import type { WorkbenchProject } from '../project';
import { UnionFind } from '../graph/unionFind';
import { createBreadboardDefinition } from './breadboard';

/** Permanent board strips, jumpers and explicit ground markers, excluding device conduction. */
export function physicalHoleNets(project: Pick<WorkbenchProject, 'board' | 'components'>): Record<string, string> {
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const union = new UnionFind();
  const validHoles = new Set(board.holes.map((hole) => hole.id));
  const firstByStrip = new Map<string, string>();
  for (const hole of board.holes) {
    union.add(hole.id);
    const first = firstByStrip.get(hole.stripId);
    if (first) union.union(first, hole.id);
    else firstByStrip.set(hole.stripId, hole.id);
  }
  for (const component of project.components) {
    if (component.kind === 'arduino-nano') {
      for (const [a, b] of [['pin4', 'pin29'], ['pin3', 'pin28']]) {
        const first = component.terminalHoleIds[a as `pin${number}`];
        const second = component.terminalHoleIds[b as `pin${number}`];
        if (validHoles.has(first) && validHoles.has(second)) union.union(first, second);
      }
    }
    if (component.kind === 'jumper-wire') {
      const { a, b } = component.terminalHoleIds;
      if (validHoles.has(a) && validHoles.has(b)) union.union(a, b);
    }
  }
  const groundHoles = project.components
    .filter((component) => component.kind === 'ground')
    .map((component) => component.terminalHoleIds.ground)
    .filter((hole) => validHoles.has(hole));
  for (const hole of groundHoles.slice(1)) union.union(groundHoles[0], hole);
  const minimumHoleByRoot = new Map<string, string>();
  for (const hole of board.holes) {
    const root = union.find(hole.id);
    const minimum = minimumHoleByRoot.get(root);
    if (!minimum || hole.id < minimum) minimumHoleByRoot.set(root, hole.id);
  }
  // Preserve the stable IDs used by saved PCB conversions.
  return Object.fromEntries(board.holes.map((hole) => [hole.id, `pcb-net-${minimumHoleByRoot.get(union.find(hole.id))!}`]));
}
