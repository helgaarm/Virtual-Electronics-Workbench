import type { Schematic, SchematicComponent } from '../domain/schematic/types';

interface Terminals { from: string; to: string }
export type CircuitBranch = Terminals & (
  | { kind: 'component'; component: SchematicComponent }
  | { kind: 'series' | 'parallel'; children: CircuitBranch[] }
);
export interface ConnectedCircuit {
  source: SchematicComponent;
  branch: CircuitBranch;
  ground?: SchematicComponent;
}

export function reverseBranch(branch: CircuitBranch): CircuitBranch {
  return { ...branch, from: branch.to, to: branch.from, ...(branch.kind === 'component' ? {}
    : { children: (branch.kind === 'series' ? [...branch.children].reverse() : branch.children).map(reverseBranch) }) };
}

function oriented(branch: CircuitBranch, from: string): CircuitBranch {
  return branch.from === from ? branch : reverseBranch(branch);
}

function combine(kind: 'series' | 'parallel', from: string, to: string, children: CircuitBranch[]): CircuitBranch {
  return { kind, from, to, children: children.flatMap((child) => child.kind === kind ? child.children : [child]) };
}

/** Bounded series/parallel graph reduction. It never changes, drops or invents nets.
 * Unsupported graphs use the explicit net-label view instead of a guessed circuit. */
export function connectedCircuit(schematic: Schematic): ConnectedCircuit | undefined {
  if (schematic.components.length > 24 || schematic.nets.length > 24) return undefined;
  if (schematic.components.some((component) => component.reference.length > 48 || component.value.length > 72)) return undefined;
  const sources = schematic.components.filter((component) => component.kind === 'voltage-source' || component.kind === 'signal-generator');
  const grounds = schematic.components.filter((component) => component.kind === 'ground');
  if (sources.length !== 1 || grounds.length > 1) return undefined;
  const source = sources[0];
  if (source.reference.length > 24) return undefined;
  const from = source.pins.find((pin) => pin.id === 'positive' || pin.id === 'output')?.netId;
  const to = source.pins.find((pin) => pin.id === 'negative' || pin.id === 'reference')?.netId;
  if (!from || !to || from === to || grounds.some((ground) => ground.pins[0]?.netId !== to)) return undefined;
  let branches: CircuitBranch[] = [];
  for (const component of schematic.components) {
    if (component === source || component.kind === 'ground') continue;
    if (!['resistor', 'capacitor', 'led', 'diode-1n4148', 'zener-1n4733a', 'switch'].includes(component.kind)) return undefined;
    if (component.pins.length !== 2) return undefined;
    const [first, last] = component.pins;
    if (!first.netId || !last.netId || first.netId === last.netId) return undefined;
    branches.push({ kind: 'component', component, from: first.netId, to: last.netId });
  }
  if (!branches.length) return undefined;
  // Each successful reduction removes at least one branch (at most 23 iterations).
  while (branches.length > 1) {
    let reduced = false;
    for (const branch of branches) {
      const parallel = branches.filter((other) => other.from === branch.from && other.to === branch.to
        || other.to === branch.from && other.from === branch.to);
      if (parallel.length < 2) continue;
      branches = [...branches.filter((other) => !parallel.includes(other)),
        combine('parallel', branch.from, branch.to, parallel.map((other) => oriented(other, branch.from)))];
      reduced = true;
      break;
    }
    if (reduced) continue;
    const nets = [...new Set(branches.flatMap((branch) => [branch.from, branch.to]))].sort();
    for (const net of nets) {
      if (net === from || net === to) continue;
      const incident = branches.filter((branch) => branch.from === net || branch.to === net);
      if (incident.length !== 2) continue;
      const first = oriented(incident[0], incident[0].from === net ? incident[0].to : incident[0].from);
      const last = oriented(incident[1], net);
      if (first.from === last.to) return undefined;
      branches = [...branches.filter((branch) => !incident.includes(branch)), combine('series', first.from, last.to, [first, last])];
      reduced = true;
      break;
    }
    if (!reduced) return undefined;
  }
  const branch = oriented(branches[0], from);
  if (branch.from !== from || branch.to !== to) return undefined;
  return { source, branch, ground: grounds[0] };
}
