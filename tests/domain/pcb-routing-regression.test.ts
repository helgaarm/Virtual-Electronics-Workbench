import { describe, expect, it } from 'vitest';
import { convertBreadboardToPcb } from '../../src/domain/pcb/converter';
import { runPcbDrc } from '../../src/domain/pcb/drc';
import { exportKicadPcb } from '../../src/domain/pcb/exporters';
import { routeRemainingConnections } from '../../src/domain/pcb/router';
import { DEFAULT_PCB_RULES, type PcbProject, type PcbTrace } from '../../src/domain/pcb/types';
import { createStarterProject } from '../../src/domain/starterProjects';

function synthetic(traces: PcbTrace[]): PcbProject {
  return {
    version: 1, sourceCircuitFingerprint: 'test', board: { widthMm: 30, heightMm: 30, title: 'Geometry test' },
    components: [
      { id: 'a', sourceComponentId: 'a', reference: 'A', value: 'R', footprintId: 'Axial-10mm', positionMm: { xMm: 8, yMm: 8 }, rotationDegrees: 90, locked: false },
      { id: 'b', sourceComponentId: 'b', reference: 'B', value: 'R', footprintId: 'Axial-10mm', positionMm: { xMm: 22, yMm: 22 }, rotationDegrees: 90, locked: false },
    ],
    nets: [
      { id: 'n1', name: 'N1', pads: [{ componentId: 'a', padNumber: '1', terminalId: 'a', sourceHoleId: 'h1' }, { componentId: 'a', padNumber: '2', terminalId: 'b', sourceHoleId: 'h2' }] },
      { id: 'n2', name: 'N2', pads: [{ componentId: 'b', padNumber: '1', terminalId: 'a', sourceHoleId: 'h3' }, { componentId: 'b', padNumber: '2', terminalId: 'b', sourceHoleId: 'h4' }] },
    ], traces, jumpers: [], mountingHoles: [], rules: DEFAULT_PCB_RULES,
  };
}

const trace = (id: string, netId: string, points: Array<{ xMm: number; yMm: number }>): PcbTrace => ({ id, netId, widthMm: 0.4, layer: 'B.Cu', ownership: 'manual', pointsMm: points });

describe('PCB physical netlist and copper regression coverage', () => {
  it('keeps the open and closed switch physical netlists identical and never merges its pads', () => {
    const open = createStarterProject('switched-led');
    open.components = open.components.map((component) => component.kind === 'switch' ? { ...component, closed: false } : component);
    const closed = { ...open, components: open.components.map((component) => component.kind === 'switch' ? { ...component, closed: true } : component) };
    const openPcb = convertBreadboardToPcb(open).pcb!; const closedPcb = convertBreadboardToPcb(closed).pcb!;
    expect(openPcb.nets).toEqual(closedPcb.nets);
    const switchPads = openPcb.nets.flatMap((net) => net.pads.filter((pad) => pad.componentId === 'pcb-S1').map(() => net.id));
    expect(new Set(switchPads).size).toBe(2);
    const routed = routeRemainingConnections(openPcb).pcb;
    expect(routed.traces.some((candidate) => candidate.pointsMm[0] && candidate.pointsMm.at(-1)
      && candidate.pointsMm[0].xMm === candidate.pointsMm.at(-1)!.xMm
      && candidate.pointsMm[0].yMm === candidate.pointsMm.at(-1)!.yMm)).toBe(false);
  });

  it('detects crossing and collinearly overlapping foreign-net copper', () => {
    const crossing = synthetic([trace('x', 'n1', [{ xMm: 5, yMm: 15 }, { xMm: 25, yMm: 15 }]), trace('y', 'n2', [{ xMm: 15, yMm: 5 }, { xMm: 15, yMm: 25 }])]);
    expect(runPcbDrc(crossing).issues.map((issue) => issue.code)).toContain('TRACK_TO_TRACK_CLEARANCE');
    const overlap = synthetic([trace('x', 'n1', [{ xMm: 5, yMm: 15 }, { xMm: 20, yMm: 15 }]), trace('y', 'n2', [{ xMm: 10, yMm: 15 }, { xMm: 25, yMm: 15 }])]);
    expect(runPcbDrc(overlap).issues.map((issue) => issue.code)).toContain('TRACK_TO_TRACK_CLEARANCE');
  });

  it('detects a trace through a foreign pad but permits same-net copper joins', () => {
    const foreign = synthetic([trace('foreign', 'n1', [{ xMm: 22, yMm: 12 }, { xMm: 22, yMm: 22 }])]);
    expect(runPcbDrc(foreign).issues.map((issue) => issue.code)).toContain('TRACK_TO_PAD_CLEARANCE');
    const same = synthetic([trace('same-a', 'n1', [{ xMm: 8, yMm: 3 }, { xMm: 8, yMm: 15 }]), trace('same-b', 'n1', [{ xMm: 4, yMm: 10 }, { xMm: 12, yMm: 10 }])]);
    expect(runPcbDrc(same).issues.some((issue) => issue.code === 'TRACK_TO_TRACK_CLEARANCE')).toBe(false);
  });

  it('routes deterministically, retains multi-pad geometry in export, and reports impossible layouts', () => {
    const initial = convertBreadboardToPcb(createStarterProject('voltage-divider')).pcb!;
    const first = routeRemainingConnections(initial); const second = routeRemainingConnections(initial);
    expect(first.pcb.traces).toEqual(second.pcb.traces);
    const multi = synthetic([]);
    multi.nets[0].pads.push(multi.nets[1].pads.shift()!);
    const multiResult = routeRemainingConnections(multi);
    expect(multiResult.pcb.traces.length).toBeGreaterThanOrEqual(2);
    expect(runPcbDrc(multiResult.pcb).routedConnections).toBeGreaterThanOrEqual(2);
    const output = exportKicadPcb(first.pcb);
    for (const routedTrace of first.pcb.traces) expect(output).toContain(`(width ${routedTrace.widthMm}) (layer "B.Cu")`);
    const impossible = { ...initial, board: { ...initial.board, widthMm: 3, heightMm: 3 } };
    const result = routeRemainingConnections(impossible);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(runPcbDrc(result.pcb).status).toBe('not-ready');
  });
});
