import { describe, expect, it } from 'vitest';
import { convertBreadboardToPcb } from '../../src/domain/pcb/converter';
import { pointForViewedSide, rotatePoint } from '../../src/domain/pcb/geometry';
import { routeRemainingConnections } from '../../src/domain/pcb/router';
import { runPcbDrc } from '../../src/domain/pcb/drc';
import { autoRepairPcb } from '../../src/domain/pcb/repair';
import { exportBomCsv, exportKicadPcb } from '../../src/domain/pcb/exporters';
import { createStarterProject } from '../../src/domain/starterProjects';

describe('single-sided PCB workflow', () => {
  it('rotates and physically flips coordinates without changing millimetres', () => {
    expect(rotatePoint({ xMm: 2.54, yMm: 1 }, 90)).toEqual({ xMm: -1, yMm: 2.54 });
    expect(pointForViewedSide({ xMm: 10, yMm: 4 }, 60, 'bottom')).toEqual({ xMm: 50, yMm: 4 });
  });

  it('converts authoritative breadboard nets and routes only bottom copper', () => {
    const conversion = convertBreadboardToPcb(createStarterProject('voltage-divider'));
    expect(conversion.missing).toEqual([]);
    const pcb = routeRemainingConnections(conversion.pcb!).pcb;
    expect(pcb.nets.length).toBeGreaterThan(0);
    expect(pcb.traces.every((trace) => trace.layer === 'B.Cu')).toBe(true);
    expect(runPcbDrc(pcb).routedConnections).toBe(runPcbDrc(pcb).totalConnections);
  });

  it('opens the PCB workflow for the default switched LED project', () => {
    const conversion = convertBreadboardToPcb(createStarterProject('switched-led'));

    expect(conversion.missing).toEqual([]);
    expect(conversion.pcb?.components.find((component) => component.sourceComponentId === 'S1'))
      .toMatchObject({ footprintId: 'SW-Push-P5.08', value: 'Normally open switch (closed)' });
  });

  it('automatically produces a DRC-clean board for the NE555 starter circuit', () => {
    const initial = convertBreadboardToPcb(createStarterProject('ne555-astable')).pcb!;

    const repaired = autoRepairPcb(initial);

    expect(repaired.changed).toBe(true);
    expect(repaired.pcb.board.layerMode).toBe('double');
    expect(repaired.appliedActions.map((action) => action.code)).toContain('CHANGED_TO_TWO_LAYER');
    expect(repaired.remainingProblems).toEqual([]);
    expect(runPcbDrc(repaired.pcb).status).toBe('manufacturing-checks-passed');
  });

  it('repairs only genuinely disconnected nets and remains idempotent', () => {
    const initial = convertBreadboardToPcb(createStarterProject('voltage-divider')).pcb!;
    const routed = routeRemainingConnections(initial).pcb;
    const missingNetId = routed.traces[0].netId;
    const retainedTrace = routed.traces.find((trace) => trace.netId !== missingNetId)!;
    const partiallyRouted = {
      ...routed,
      traces: [
        ...routed.traces.filter((trace) => trace.netId !== missingNetId),
        { ...retainedTrace, id: `${retainedTrace.id}-duplicate` },
      ],
    };

    expect(runPcbDrc(partiallyRouted).issues.map((issue) => issue.code)).toContain('UNROUTED_CONNECTIONS');

    const repaired = routeRemainingConnections(partiallyRouted).pcb;
    expect(runPcbDrc(repaired).status).toBe('manufacturing-checks-passed');
    expect(routeRemainingConnections(repaired).pcb.traces).toEqual(repaired.traces);
  });

  it('replaces stale automatic tracks after a footprint is rotated', () => {
    const routed = routeRemainingConnections(
      convertBreadboardToPcb(createStarterProject('voltage-divider')).pcb!,
    ).pcb;
    const rotated = {
      ...routed,
      components: routed.components.map((component, index) => index === 0
        ? { ...component, rotationDegrees: 90 as const }
        : component),
    };

    expect(runPcbDrc(rotated).issues.map((issue) => issue.code)).toContain('UNROUTED_CONNECTIONS');
    expect(runPcbDrc(routeRemainingConnections(rotated).pcb).status).toBe('manufacturing-checks-passed');
  });

  it('exports deterministic KiCad geometry, nets, bottom copper and BOM', () => {
    const pcb = routeRemainingConnections(convertBreadboardToPcb(createStarterProject('voltage-divider')).pcb!).pcb;
    const output = exportKicadPcb(pcb);
    expect(output).toContain('(kicad_pcb (version 20240108)');
    expect(output).toContain('(layer "B.Cu")');
    expect(output).toContain('(layer "Edge.Cuts")');
    expect(exportBomCsv(pcb)).toContain('Axial THT');
    expect(exportKicadPcb(pcb)).toBe(output);
  });
});
