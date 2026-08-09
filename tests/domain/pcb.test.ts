import { describe, expect, it } from 'vitest';
import { convertBreadboardToPcb } from '../../src/domain/pcb/converter';
import { pointForViewedSide, rotatePoint } from '../../src/domain/pcb/geometry';
import { routeRemainingConnections } from '../../src/domain/pcb/router';
import { runPcbDrc } from '../../src/domain/pcb/drc';
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

