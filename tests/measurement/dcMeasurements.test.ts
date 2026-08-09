import { describe, expect, it } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { measureComponent, measureProbeVoltage } from '../../src/measurement/dcMeasurements';
import { simulateProject } from '../../src/simulation';

describe('DC measurement layer', () => {
  it('reports typed values for solved components and probes', () => {
    const project = createLedExampleProject();
    const simulation = simulateProject(project);
    const resistor = project.components.find((component) => component.kind === 'resistor');
    if (!resistor) throw new Error('Starter resistor is missing.');
    const measurement = measureComponent(resistor, simulation.extraction, simulation.result);
    expect(measurement.current.status).toBe('valid');
    expect(measurement.current.value).toBeGreaterThan(0);
    expect(measurement.voltage.status).toBe('valid');
    expect(measurement.power.status).toBe('valid');

    const probe = measureProbeVoltage(project.probes[0], simulation.extraction, simulation.result);
    expect(probe.status).toBe('valid');
    expect(probe.value).toBeGreaterThan(0);
  });

  it('does not present missing ideal-connector current as zero', () => {
    const project = createLedExampleProject();
    const simulation = simulateProject(project);
    const connector = project.components.find((component) => component.kind === 'switch');
    if (!connector) throw new Error('Starter switch is missing.');
    const measurement = measureComponent(connector, simulation.extraction, simulation.result);
    expect(measurement.current).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('not calculated'),
    });
    expect(measurement.current.value).toBeUndefined();
  });

  it('propagates simulation errors and disconnected probe state', () => {
    const project = createLedExampleProject();
    const simulation = simulateProject(project);
    const result = {
      ...simulation.result,
      status: 'error' as const,
      errors: [{ code: 'TEST', message: 'Solver failed.' }],
    };
    const resistor = project.components.find((component) => component.kind === 'resistor');
    if (!resistor) throw new Error('Starter resistor is missing.');
    expect(measureComponent(resistor, simulation.extraction, result).current)
      .toMatchObject({ status: 'simulation-error', reason: 'Solver failed.' });
    expect(measureProbeVoltage(undefined, simulation.extraction, simulation.result))
      .toMatchObject({ status: 'disconnected' });
  });

  it('explains which lead is missing from a partially connected probe', () => {
    const project = createLedExampleProject();
    const simulation = simulateProject(project);
    const probe = project.probes[0];
    expect(measureProbeVoltage(
      { ...probe, referenceHoleId: undefined },
      simulation.extraction,
      simulation.result,
    )).toMatchObject({ status: 'disconnected', reason: expect.stringContaining('COM') });
    expect(measureProbeVoltage(
      { ...probe, positiveHoleId: undefined },
      simulation.extraction,
      simulation.result,
    )).toMatchObject({ status: 'disconnected', reason: expect.stringContaining('positive') });
  });
});
