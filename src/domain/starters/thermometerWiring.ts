import type { PlacedComponent, WireColor } from '../components/types';
import { terminalEntries } from '../components/types';
import { createBreadboardDefinition, terminalHoleId } from '../physical/breadboard';
import { validateOccupancy, validatePackageOverlaps } from '../physical/occupancy';
import type { WorkbenchProject } from '../project';

/** Named nets generate actual jumper endpoints. They never enter circuit extraction. */
export function wireThermometer(project: WorkbenchProject): WorkbenchProject {
  project.board.columns = 64;
  const board = createBreadboardDefinition(project.board.id, 64);
  const holes = new Map(board.holes.map((hole) => [hole.id, hole]));
  const occupied = new Set<string>();
  const netByStrip = new Map<string, string>();
  const components: PlacedComponent[] = [];
  const netMaps: Record<string, Record<string, string>> = {
    V1: { positive: 'vcc', negative: 'gnd' }, GND1: { ground: 'gnd' },
    TMP1: { vs: 'vcc', vout: 'sensor', gnd: 'gnd' },
    MCU1: { pin1: 'reset', pin2: 'sensor', pin3: 'blank', pin4: 'gnd', pin5: 'serial', pin6: 'clock', pin7: 'latch', pin8: 'vcc' },
    DISPLAY1: { digit1: 'digit1', digit2: 'digit2', digit3: 'digit3', digit4: 'digit4',
      a: 'led-a', b: 'led-b', c: 'led-c', d: 'led-d', e: 'led-e', f: 'led-f', g: 'led-g', dp: 'led-dp' },
    RRESET: { a: 'vcc', b: 'reset' },
  };
  const outputPins = [15, 1, 2, 3, 4, 5, 6, 7];
  const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
  for (const [index, id] of ['SR1', 'SR2'].entries()) {
    netMaps[id] = { pin8: 'gnd', pin16: 'vcc', pin14: index === 0 ? 'serial' : 'cascade',
      pin13: 'blank', pin12: 'latch', pin11: 'clock', pin10: 'vcc', pin9: index === 0 ? 'cascade' : 'unused-cascade' };
    outputPins.forEach((pin, i) => { netMaps[id][`pin${pin}`] = index === 0 ? `segment-${segments[i]}` : `select${i + 1}`; });
  }
  segments.forEach((segment, i) => { netMaps[`RSEG${i + 1}`] = { a: `segment-${segment}`, b: `led-${segment}` }; });
  for (let digit = 1; digit <= 4; digit += 1) {
    netMaps[`Q${digit}`] = { collector: `digit${digit}`, base: `base${digit}`, emitter: 'gnd' };
    netMaps[`RBASE${digit}`] = { a: `select${digit}`, b: `base${digit}` };
    // Off-state bias also prevents floating transistor bases when OE/power is disconnected.
    netMaps[`RBIAS${digit}`] = { a: `base${digit}`, b: 'gnd' };
  }
  for (let i = 1; i <= 3; i += 1) netMaps[`CDECOUPLE${i}`] = { positive: 'vcc', negative: 'gnd' };
  const canPlace = (part: PlacedComponent) => terminalEntries(part).every(([terminal, holeId]) => {
    const strip = holes.get(holeId)?.stripId;
    return strip && !occupied.has(holeId) && (!netByStrip.has(strip) || netByStrip.get(strip) === netMaps[part.id][terminal]);
  });
  const add = (part: PlacedComponent) => {
    if (!canPlace(part)) throw new Error(`Thermometer net conflict: ${part.id}`);
    for (const [terminal, holeId] of terminalEntries(part)) {
      occupied.add(holeId);
      netByStrip.set(holes.get(holeId)!.stripId, netMaps[part.id][terminal]);
    }
    components.push(part);
  };
  const passives = project.components.filter((part) => part.kind === 'resistor' || part.kind === 'capacitor');
  project.components.filter((part) => part.kind !== 'resistor' && part.kind !== 'capacitor').forEach((part) => {
    if (part.kind === 'bc547' || part.kind === '2n3904') {
      const start = 49 + (Number(part.id.slice(1)) - 1) * 4;
      const names = part.kind === 'bc547' ? ['collector', 'base', 'emitter'] : ['emitter', 'base', 'collector'];
      add({ ...part, terminalHoleIds: Object.fromEntries(names.map((name, i) => [name, terminalHoleId(board.id, 'J', start + i)])) } as PlacedComponent);
    } else add(part);
  });
  for (let i = 1; i <= 4; i += 1) {
    for (const [prefix, resistanceOhms] of [['RBASE', 2200], ['RBIAS', 100_000]] as const) {
      passives.push({ id: `${prefix}${i}`, label: `${prefix === 'RBASE' ? 'Digit base' : 'Digit off bias'} ${i}`,
        kind: 'resistor', resistanceOhms, tolerancePercent: 5, rotation: 0, terminalHoleIds: { a: '', b: '' } });
    }
  }
  for (const part of passives) {
    const terminals = terminalEntries(part).map(([terminal]) => terminal);
    const candidates: PlacedComponent[] = [];
    for (const row of ['A', 'J', 'C', 'H', 'D', 'G'] as const) for (let col = 1; col <= 64; col += 1) {
      for (const endRow of [row, ...(part.kind === 'resistor' ? ['A', 'J', 'D', 'G'] as const : [])]) {
        for (const span of (part.kind === 'capacitor' ? [1] : [3, -3, 0, 1, -1, 4, -4])) {
          if (col + span < 1 || col + span > 64) continue;
          candidates.push({ ...part, terminalHoleIds: Object.fromEntries([
            [terminals[0], terminalHoleId(board.id, row, col)],
            [terminals[1], terminalHoleId(board.id, endRow, col + span)],
          ]) } as PlacedComponent);
        }
      }
    }
    const reusedStrips = (candidate: PlacedComponent) => terminalEntries(candidate).filter(([, hole]) => netByStrip.has(holes.get(hole)!.stripId)).length;
    candidates.sort((a, b) => reusedStrips(b) - reusedStrips(a));
    const placed = candidates.find((candidate) => canPlace(candidate)
      && validateOccupancy(board, [candidate]).length === 0
      && validatePackageOverlaps(board, [...components, candidate]).length === 0);
    if (!placed) throw new Error(`No room for thermometer ${part.id}`);
    add(placed);
  }
  const stripsByNet = new Map<string, string[]>();
  for (const [strip, net] of netByStrip) stripsByNet.set(net, [...(stripsByNet.get(net) ?? []), strip]);
  const freeHole = (strip: string) => {
    const hole = board.holes.find((candidate) => candidate.stripId === strip && !occupied.has(candidate.id));
    if (!hole) throw new Error(`No free wiring hole on ${strip}`);
    occupied.add(hole.id);
    return hole.id;
  };
  for (const [net, strips] of stripsByNet) {
    strips.sort((a, b) => {
      const left = board.holes.find((hole) => hole.stripId === a)!.positionMm;
      const right = board.holes.find((hole) => hole.stripId === b)!.positionMm;
      return left.x - right.x || left.z - right.z;
    });
    const color: WireColor = net === 'vcc' ? 'red' : net === 'gnd' ? 'black'
      : net === 'clock' || net === 'latch' ? 'blue' : net === 'sensor' ? 'green' : 'orange';
    for (let i = 1; i < strips.length; i += 1) components.push({ id: `W-${net}-${i}`, label: `${net} link ${i}`,
      kind: 'jumper-wire', color, rotation: 0, terminalHoleIds: { a: freeHole(strips[i - 1]), b: freeHole(strips[i]) } });
  }
  return { ...project, components, powerOn: true, simulation: { timeStepSeconds: 0.001, speed: 1 } };
}
