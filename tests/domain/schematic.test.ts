import { describe, expect, it } from 'vitest';
import type { ComponentKind, PlacedComponent } from '../../src/domain/components/types';
import { PHYSICAL_PACKAGES } from '../../src/domain/physical/packages';
import { createBreadboardDefinition, railHoleId, terminalHoleId } from '../../src/domain/physical/breadboard';
import { physicalHoleNets } from '../../src/domain/physical/connectivity';
import { createEmptyProject } from '../../src/domain/project';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import { createStarterProject, STARTER_PROJECTS } from '../../src/domain/starterProjects';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createPlacedComponent } from '../../src/state/workbenchActions';
import { renderSchematicSvg } from '../../src/schematic/renderSvg';
import { drawSymbol } from '../../src/schematic/symbols';

describe('breadboard schematic connectivity', () => {
  it.each(STARTER_PROJECTS)('agrees with the circuit extractor for $name while retaining switches', ({ id }) => {
    const project = createStarterProject(id);
    const model = buildSchematic(project);
    const extraction = extractCircuit({
      ...project,
      components: project.components.map((component) => component.kind === 'switch' ? { ...component, closed: false } : component),
    });
    const schematicToSolver = new Map<string, string>();
    const solverToSchematic = new Map<string, string>();
    for (const component of model.components) {
      for (const pin of component.pins) {
        expect(pin.netId).toBeDefined();
        const solverNode = extraction.holeToNodeId[pin.holeId!];
        expect(solverNode).toBeDefined();
        if (schematicToSolver.has(pin.netId!)) expect(schematicToSolver.get(pin.netId!)).toBe(solverNode);
        if (solverToSchematic.has(solverNode)) expect(solverToSchematic.get(solverNode)).toBe(pin.netId);
        schematicToSolver.set(pin.netId!, solverNode);
        solverToSchematic.set(solverNode, pin.netId!);
      }
    }
    expect(model.components.filter((component) => component.kind === 'switch')).toHaveLength(project.components.filter((component) => component.kind === 'switch').length);
    expect(model.jumperCount).toBe(project.components.filter((component) => component.kind === 'jumper-wire').length);
  });

  it('keeps split rails and opposing terminal strips separate until a real jumper joins them', () => {
    const project = createEmptyProject();
    const near = railHoleId('main', 'top', 'positive', 15);
    const far = railHoleId('main', 'top', 'positive', 16);
    const before = physicalHoleNets(project);
    expect(before[near]).not.toBe(before[far]);
    expect(before[terminalHoleId('main', 'A', 5)]).toBe(before[terminalHoleId('main', 'E', 5)]);
    expect(before[terminalHoleId('main', 'E', 5)]).not.toBe(before[terminalHoleId('main', 'F', 5)]);
    project.components.push({ id: 'W1', label: 'W1', kind: 'jumper-wire', rotation: 0, color: 'red', terminalHoleIds: { a: near, b: far } });
    const after = physicalHoleNets(project);
    expect(after[near]).toBe(after[far]);
  });

  it('keeps physical net IDs and switch terminals stable when the switch or power changes', () => {
    const project = createStarterProject('switched-led');
    const before = buildSchematic(project);
    const after = buildSchematic({ ...project, powerOn: false, components: project.components.map((component) => component.kind === 'switch' ? { ...component, closed: !component.closed } : component) });
    expect(after.nets).toEqual(before.nets);
    const beforeSwitch = before.components.find((component) => component.kind === 'switch')!;
    const afterSwitch = after.components.find((component) => component.kind === 'switch')!;
    expect(afterSwitch.pins).toEqual(beforeSwitch.pins);
    expect(beforeSwitch.pins[0].netId).not.toBe(beforeSwitch.pins[1].netId);
    expect(afterSwitch.closed).toBe(!beforeSwitch.closed);
    expect(after.components.find((component) => component.kind === 'voltage-source')?.value).toContain('(off)');
  });

  it('does not invent a ground connection when no marker was placed', () => {
    const project = createStarterProject('voltage-divider');
    project.components = project.components.filter((component) => component.kind !== 'ground');
    expect(buildSchematic(project).nets.every((net) => net.name !== 'GND')).toBe(true);
  });

  it('supports every existing part and keeps all external pins of complex devices', () => {
    const board = createBreadboardDefinition();
    for (const kind of Object.keys(PHYSICAL_PACKAGES) as ComponentKind[]) {
      const component = createPlacedComponent(kind, board, []);
      expect(component, kind).toBeDefined();
      const model = buildSchematic({ ...createEmptyProject(), components: [component!] });
      if (kind === 'jumper-wire') expect(model.components).toHaveLength(0);
      else {
        expect(model.components[0].pins).toHaveLength(Object.keys(component!.terminalHoleIds).length);
        expect(renderSchematicSvg(model).svg).toContain(component!.id);
      }
    }
  });

  it('labels IC pins, uses actual component values, and updates after board edits', () => {
    const project = createStarterProject('ne555-astable');
    const before = buildSchematic(project);
    const timer = before.components.find((component) => component.kind === 'ne555')!;
    expect(timer.pins.find((pin) => pin.id === 'pin3')?.name).toBe('3 OUTPUT');
    const resistor = project.components.find((component) => component.kind === 'resistor')!;
    const after = buildSchematic({ ...project, components: project.components.map((component) => component.id === resistor.id && component.kind === 'resistor' ? { ...component, resistanceOhms: 1234 } : component) });
    expect(after.components.find((component) => component.id === resistor.id)?.value).toContain('1.234 kΩ');
    expect(project.components.find((component) => component.id === resistor.id)).toEqual(resistor);
  });

  it('preserves diode and capacitor polarity even if serialized terminal properties are reordered', () => {
    const board = createBreadboardDefinition();
    for (const kind of ['led', 'diode-1n4148', 'zener-1n4733a', 'capacitor', 'voltage-source'] as const) {
      const component = createPlacedComponent(kind, board, [])!;
      const model = buildSchematic({ ...createEmptyProject(), components: [component] }).components[0];
      const normal = drawSymbol(model);
      const reordered = drawSymbol({ ...model, pins: [...model.pins].reverse() });
      expect(reordered.pins).toEqual(normal.pins);
      expect(reordered.body).toBe(normal.body);
    }
  });

  it('shows attached generator leads, including an unconnected reference, without phantom nets', () => {
    const project = createEmptyProject();
    project.signalGenerator = { ...project.signalGenerator, enabled: true, outputHoleId: terminalHoleId('main', 'A', 3) };
    const model = buildSchematic(project);
    expect(model.components[0].kind).toBe('signal-generator');
    expect(model.components[0].pins[1].netId).toBeUndefined();
    expect(model.nets).toHaveLength(1);
    expect(model.warnings[0]).toContain('unconnected');
    expect(renderSchematicSvg(model).svg).toContain('NC');
  });

  it('reports invalid holes and never joins real nets through an invalid jumper endpoint', () => {
    const project = createStarterProject('voltage-divider');
    project.components.push(
      { id: 'bad1', label: 'Bad wire 1', kind: 'jumper-wire', color: 'red', rotation: 0, terminalHoleIds: { a: 'missing', b: terminalHoleId('main', 'A', 25) } },
      { id: 'bad2', label: 'Bad wire 2', kind: 'jumper-wire', color: 'red', rotation: 0, terminalHoleIds: { a: 'missing', b: terminalHoleId('main', 'A', 26) } },
    );
    const nets = physicalHoleNets(project);
    expect(nets[terminalHoleId('main', 'A', 25)]).not.toBe(nets[terminalHoleId('main', 'A', 26)]);
    expect(buildSchematic(project).warnings).toHaveLength(2);
  });

  it('has deterministic net IDs regardless of jumper order and falls back to labels for large projects', () => {
    const project = createStarterProject('ne555-astable');
    expect(physicalHoleNets({ ...project, components: [...project.components].reverse() })).toEqual(physicalHoleNets(project));
    const resistor = project.components.find((component) => component.kind === 'resistor')!;
    const components: PlacedComponent[] = Array.from({ length: 100 }, (_, index) => ({ ...resistor, id: `R${index}`, label: `R${index}` }));
    const model = buildSchematic({ ...project, components });
    const drawing = renderSchematicSvg(model);
    expect(drawing.layout).toBe('labels');
    expect(drawing.svg).toBe(renderSchematicSvg(model).svg);
    expect(drawing.width).toBeLessThanOrEqual(1240);
    expect(drawing.height).toBeLessThan(10_000);
  });
});
