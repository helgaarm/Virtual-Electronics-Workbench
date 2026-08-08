import { describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { simulateProject } from '../../src/simulation';

describe('physical circuit extraction', () => {
  it('collapses closed switches and keeps open switches electrically separate', () => {
    const closedProject = createLedExampleProject();
    const closed = extractCircuit(closedProject);
    const switchComponent = closedProject.components.find((component) => component.kind === 'switch');
    if (!switchComponent || switchComponent.kind !== 'switch') throw new Error('Starter switch is missing.');
    expect(closed.componentTerminalNodes[switchComponent.id].a)
      .toBe(closed.componentTerminalNodes[switchComponent.id].b);

    const openProject = {
      ...closedProject,
      components: closedProject.components.map((component) =>
        component.kind === 'switch' ? { ...component, closed: false } : component),
    };
    const open = extractCircuit(openProject);
    expect(open.componentTerminalNodes[switchComponent.id].a)
      .not.toBe(open.componentTerminalNodes[switchComponent.id].b);
  });

  it('uses an explicit implicit-ground warning and omits powered sources when output is off', () => {
    const project = createLedExampleProject();
    const withoutGround = {
      ...project,
      powerOn: false,
      components: project.components.filter((component) => component.kind !== 'ground'),
    };
    const extraction = extractCircuit(withoutGround);
    expect(extraction.warnings).toContainEqual(expect.objectContaining({ code: 'IMPLICIT_GROUND' }));
    expect(extraction.circuit.components.some((component) => component.kind === 'voltage-source')).toBe(false);
  });

  it('routes solving through the SimulationEngine interface', () => {
    const project = createLedExampleProject();
    const solveDC = vi.fn(() => ({
      status: 'ok' as const,
      nodeVoltages: {},
      componentCurrents: {},
      componentPowers: {},
      warnings: [],
      errors: [],
      iterations: 1,
    }));
    const simulation = simulateProject(project, { solveDC });
    expect(solveDC).toHaveBeenCalledOnce();
    expect(solveDC).toHaveBeenCalledWith(simulation.extraction.circuit);
  });
});
