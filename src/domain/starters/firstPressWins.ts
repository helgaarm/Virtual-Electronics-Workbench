import type { PlacedComponent, WireColor } from '../components/types';
import { terminalEntries } from '../components/types';
import { createBreadboardDefinition, railHoleId, terminalHoleId, type TerminalRow } from '../physical/breadboard';
import { createEmptyProject, type WorkbenchProject } from '../project';

/** Six discrete transistors form two regenerative latches and mutual inhibition.
 * Net names below only generate physical jumper wires; extraction uses holes. */
export function firstPressWinsProject(): WorkbenchProject {
  const project = createEmptyProject('First to Press Wins');
  project.board.columns = 64;
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const holes = new Map(board.holes.map((hole) => [hole.id, hole]));
  const h = (row: TerminalRow, column: number) => terminalHoleId(board.id, row, column);
  const components: PlacedComponent[] = [];
  const occupied = new Set<string>();
  const netByStrip = new Map<string, string>();
  const stripsByNet = new Map<string, Set<string>>();
  const add = (component: PlacedComponent, nets: Record<string, string>) => {
    for (const [terminal, holeId] of terminalEntries(component)) {
      const stripId = holes.get(holeId)?.stripId;
      const net = nets[terminal];
      if (!stripId || !net || occupied.has(holeId)) throw new Error(`Invalid starter terminal: ${component.id}.${terminal}`);
      const existing = netByStrip.get(stripId);
      if (existing && existing !== net) throw new Error(`Starter strip shorts ${existing} to ${net}`);
      occupied.add(holeId);
      netByStrip.set(stripId, net);
      const strips = stripsByNet.get(net) ?? new Set<string>();
      strips.add(stripId);
      stripsByNet.set(net, strips);
    }
    components.push(component);
  };
  const resistor = (id: string, label: string, resistanceOhms: number, a: string, b: string, netA: string, netB: string) =>
    add({ id, label, kind: 'resistor', rotation: 0, resistanceOhms, tolerancePercent: 5, terminalHoleIds: { a, b } }, { a: netA, b: netB });

  add({ id: 'V1', label: '5 V supply', kind: 'voltage-source', rotation: 0, voltageV: 5,
    terminalHoleIds: { positive: railHoleId(board.id, 'top', 'positive', 1), negative: railHoleId(board.id, 'top', 'negative', 1) } }, { positive: 'raw', negative: 'gnd' });
  add({ id: 'GND1', label: 'Ground', kind: 'ground', rotation: 0,
    terminalHoleIds: { ground: railHoleId(board.id, 'top', 'negative', 4) } }, { ground: 'gnd' });
  // Two 220-ohm, quarter-watt resistors safely limit current while Reset is held.
  resistor('RSUPPLY1', 'Reset current limit A', 220, h('A', 28), h('A', 32), 'raw', 'vcc');
  resistor('RSUPPLY2', 'Reset current limit B', 220, h('C', 28), h('C', 32), 'raw', 'vcc');
  add({ id: 'SRESET', label: 'Reset (close, then open)', kind: 'switch', rotation: 0, closed: false,
    terminalHoleIds: { a: h('J', 30), b: h('J', 34) } }, { a: 'vcc', b: 'gnd' });

  for (const player of [1, 2] as const) {
    const prefix = `P${player}`;
    const other = `P${3 - player}`;
    const color = player === 1 ? 'red' : 'green';
    const offset = player === 1 ? 0 : 32;
    const transistorStarts = player === 1 ? [4, 12, 20] : [44, 52, 60];
    const transistor = (suffix: string, index: number, kind: 'bc547' | 'bc557', collector: string, base: string, emitter: string) => {
      const column = transistorStarts[index];
      add({ id: `${prefix}-${suffix}`, label: `${color} ${suffix}`, kind, deviceId: kind, packageId: 'TO-92-inline',
        polarity: kind === 'bc547' ? 'npn' : 'pnp', rotation: 0,
        terminalHoleIds: { collector: h('A', column), base: h('A', column + 1), emitter: h('A', column + 2) } }, { collector, base, emitter });
    };
    transistor('QP', 0, 'bc557', `${prefix}-out`, `${prefix}-pb`, 'vcc');
    transistor('QN', 1, 'bc547', `${prefix}-nc`, `${prefix}-nb`, 'gnd');
    transistor('INHIBIT', 2, 'bc547', `${prefix}-nb`, `${prefix}-ib`, 'gnd');
    const resistors = [
      ['RP', 'PNP off bias', 47_000, 'vcc', `${prefix}-pb`],
      ['RC', 'PNP base limit', 1_000, `${prefix}-pb`, `${prefix}-nc`],
      ['RF', 'Latch feedback', 10_000, `${prefix}-out`, `${prefix}-nb`],
      ['RN', 'NPN off bias', 47_000, `${prefix}-nb`, 'gnd'],
      ['RI', 'Opponent lockout', 10_000, `${other}-out`, `${prefix}-ib`],
      ['RS', 'Button current limit', 10_000, `${prefix}-button`, `${prefix}-nb`],
      ['RO', 'Output discharge', 100_000, `${prefix}-out`, 'gnd'],
      ['RLED', 'LED current limit', 330, `${prefix}-out`, `${prefix}-led`],
    ] as const;
    resistors.forEach(([id, label, value, a, b], index) => {
      const column = offset + 3 + index * 4;
      resistor(`${prefix}-${id}`, `${color} ${label}`, value, h('D', column), h('G', column), a, b);
    });
    const capacitorColumn = player === 1 ? 4 : 60;
    add({ id: `${prefix}-C`, label: `${color} latch stabilizer`, kind: 'capacitor', rotation: 0,
      capacitanceFarads: 1e-6, ratedVoltageV: 16,
      terminalHoleIds: { positive: h('J', capacitorColumn), negative: h('J', capacitorColumn + 1) } }, { positive: `${prefix}-out`, negative: 'gnd' });
    const ledColumn = player === 1 ? 12 : 52;
    add({ id: `${prefix}-LED`, label: `${color} wins`, kind: 'led', rotation: 0, color,
      forwardVoltageV: player === 1 ? 1.9 : 2.1, onResistanceOhms: 20,
      terminalHoleIds: { anode: h('J', ledColumn), cathode: h('J', ledColumn + 1) } }, { anode: `${prefix}-led`, cathode: 'gnd' });
    const buttonColumn = player === 1 ? 20 : 44;
    add({ id: `${prefix}-BUTTON`, label: `${color} player (close to press)`, kind: 'switch', rotation: 0, closed: false,
      terminalHoleIds: { a: h('J', buttonColumn), b: h('J', buttonColumn + 4) } }, { a: 'vcc', b: `${prefix}-button` });
  }

  const freeHole = (stripId: string) => {
    const hole = board.holes.find((candidate) => candidate.stripId === stripId && !occupied.has(candidate.id));
    if (!hole) throw new Error(`No free starter hole on ${stripId}`);
    occupied.add(hole.id);
    return hole.id;
  };
  for (const [net, stripSet] of stripsByNet) {
    const stripPosition = (stripId: string) => board.holes.find((hole) => hole.stripId === stripId)!.positionMm;
    const strips = [...stripSet].sort((a, b) => {
      const first = stripPosition(a);
      const second = stripPosition(b);
      return first.x - second.x || first.z - second.z;
    });
    const color: WireColor = net === 'gnd' ? 'black' : net === 'raw' || net === 'vcc' ? 'red'
      : net.startsWith('P1') ? 'orange' : 'green';
    // A chain leaves spare holes on each strip, even for high-fanout supply nets.
    for (let index = 1; index < strips.length; index += 1) {
      components.push({ id: `W-${net}-${index}`, label: `${net} link ${index}`, kind: 'jumper-wire', color, rotation: 0,
        terminalHoleIds: { a: freeHole(strips[index - 1]), b: freeHole(strips[index]) } });
    }
  }
  const referenceHoleId = railHoleId(board.id, 'top', 'negative', 5);
  const redOutputHoleId = h('B', 4);
  const greenOutputHoleId = h('B', 44);
  return { ...project, components, powerOn: true, simulation: { timeStepSeconds: 0.001, speed: 1 },
    probes: [{ id: 'probe-red-winner', label: 'Red latch output', instrumentId: 'multimeter', positiveHoleId: redOutputHoleId, referenceHoleId },
      { id: 'probe-green-winner', label: 'Green latch output', instrumentId: 'multimeter', positiveHoleId: greenOutputHoleId, referenceHoleId }],
    analysis: { ...project.analysis, selectedProbeId: 'probe-red-winner' },
    oscilloscope: { ...project.oscilloscope, timePerDivisionSeconds: 0.1, triggerLevelV: 1.5,
      channels: {
        ch1: { ...project.oscilloscope.channels.ch1, positiveHoleId: redOutputHoleId, referenceHoleId },
        ch2: { ...project.oscilloscope.channels.ch2, positiveHoleId: greenOutputHoleId, referenceHoleId },
      } },
    view: { ...project.view, cameraPreset: 'top' },
  };
}
