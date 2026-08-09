import { describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
import {
  extractCircuit,
  SIGNAL_GENERATOR_COMPONENT_ID,
} from '../../src/simulation/circuitBuilder';
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

  it('uses an explicit implicit-ground warning and sets powered-off sources to zero volts', () => {
    const project = createLedExampleProject();
    const withoutGround = {
      ...project,
      powerOn: false,
      components: project.components.filter((component) => component.kind !== 'ground'),
    };
    const extraction = extractCircuit(withoutGround);
    expect(extraction.warnings).toContainEqual(expect.objectContaining({ code: 'IMPLICIT_GROUND' }));
    expect(extraction.circuit.components).toContainEqual(expect.objectContaining({
      kind: 'voltage-source',
      voltageV: 0,
    }));
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

  it('extracts capacitor polarity and capacitance at the domain boundary', () => {
    const project = createStarterProject('rc-charge-discharge');
    const extraction = extractCircuit(project);
    const capacitor = extraction.circuit.components.find((component) => component.id === 'C1');
    expect(capacitor).toEqual({
      id: 'C1',
      kind: 'capacitor',
      positiveNodeId: extraction.componentTerminalNodes.C1.positive,
      negativeNodeId: extraction.componentTerminalNodes.C1.negative,
      capacitanceFarads: 100e-6,
    });

    const invalid = {
      ...project,
      components: project.components.map((component) => component.kind === 'capacitor'
        ? { ...component, capacitanceFarads: 0 }
        : component),
    };
    expect(extractCircuit(invalid).errors).toContainEqual(expect.objectContaining({
      code: 'INVALID_CAPACITANCE',
      componentId: 'C1',
    }));
  });

  it('extracts the connected signal generator as a real time-dependent source', () => {
    const project = createStarterProject('rc-charge-discharge');
    const extraction = extractCircuit(project);
    expect(extraction.circuit.components).toContainEqual({
      id: SIGNAL_GENERATOR_COMPONENT_ID,
      kind: 'signal-source',
      positiveNodeId: extraction.holeToNodeId[project.signalGenerator.outputHoleId!],
      negativeNodeId: extraction.holeToNodeId[project.signalGenerator.referenceHoleId!],
      waveform: 'square',
      frequencyHz: 0.25,
      amplitudeVpp: 5,
      offsetV: 2.5,
    });
  });

  it('maps every physical NE555 pin into a reusable internal subcircuit', () => {
    const project = createStarterProject('ne555-astable');
    const extraction = extractCircuit(project);
    const timer = extraction.circuit.components.find((component) => component.id === 'U1');
    expect(timer).toMatchObject({
      id: 'U1',
      kind: 'subcircuit',
      externalNodes: {
        gnd: extraction.componentTerminalNodes.U1.pin1,
        trigger: extraction.componentTerminalNodes.U1.pin2,
        output: extraction.componentTerminalNodes.U1.pin3,
        reset: extraction.componentTerminalNodes.U1.pin4,
        control: extraction.componentTerminalNodes.U1.pin5,
        threshold: extraction.componentTerminalNodes.U1.pin6,
        discharge: extraction.componentTerminalNodes.U1.pin7,
        vcc: extraction.componentTerminalNodes.U1.pin8,
      },
    });
  });
});
