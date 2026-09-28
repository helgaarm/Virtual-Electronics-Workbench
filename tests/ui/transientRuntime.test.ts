// @vitest-environment jsdom
import { act, createElement, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import type { SimulationSettings } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { runTransientRuntimeSteps } from '../../src/simulation/transient/runtime';
import type { TransientWorkerRequest, TransientWorkerResponse } from '../../src/simulation/transient/runtime.worker';
import { useTransientRuntime, type TransientRuntimeController } from '../../src/state/useTransientRuntime';

class SimulationWorker {
  static instances: SimulationWorker[] = [];
  onmessage?: (event: MessageEvent<TransientWorkerResponse>) => void;
  onerror?: () => void;
  requests: TransientWorkerRequest[] = [];
  constructor() { SimulationWorker.instances.push(this); }
  postMessage(request: TransientWorkerRequest) { this.requests.push(structuredClone(request)); }
  terminate() { /* No background process in this controlled worker transport. */ }
  complete(request: TransientWorkerRequest) {
    const batch = runTransientRuntimeSteps(request.current, request.circuit, request.sampleNodeIds,
      request.stepCount, request.singleCaptureEndTimeSeconds);
    this.onmessage?.({ data: { id: request.id, batch } } as MessageEvent<TransientWorkerResponse>);
  }
}

let root: Root;
let container: HTMLDivElement;
let controller: TransientRuntimeController;
const project = createStarterProject('wind-constant-power');
const circuit = extractCircuit(project).circuit;
const settings = project.simulation;

function Harness(props: { circuit: Circuit; settings: SimulationSettings; circuitKey: string; resetKey?: number }) {
  const runtime = useTransientRuntime(props.circuit, props.circuitKey, props.settings, props.resetKey ?? 0);
  useEffect(() => { controller = runtime; }, [runtime]);
  return null;
}

async function render(nextCircuit = circuit, nextSettings = settings, circuitKey = 'initial', resetKey = 0) {
  await act(async () => root.render(createElement(StrictMode, null,
    createElement(Harness, { circuit: nextCircuit, settings: nextSettings, circuitKey, resetKey }))));
}

function worker() { return SimulationWorker.instances.at(-1)!; }

async function tick() {
  const count = worker().requests.length;
  await act(async () => { vi.advanceTimersByTime(100); });
  expect(worker().requests).toHaveLength(count + 1);
  return worker().requests.at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('Worker', SimulationWorker);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  SimulationWorker.instances = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('simulation scheduling through the React controller', () => {
  it.each([1, 4])('advances the wind starter at %sx speed while keeping fixed electrical steps', async speed => {
    await render(circuit, { ...settings, speed });
    for (let index = 0; index < 10; index++) {
      const request = await tick();
      await act(async () => worker().complete(request));
    }
    expect(controller.clock.timeSeconds).toBeCloseTo(speed, 8);
    expect(controller.frame?.state.sensorTemperaturesC?.['NTC-HOT']).toBeGreaterThan(20);
    expect(controller.frame?.state.digital?.nanos.Nano1.wind?.speedMps).toBeUndefined();
    const sampleTimes = controller.samples.filter(sample => sample.timeSeconds > 0).map(sample => sample.timeSeconds);
    expect(new Set(sampleTimes).size).toBe(sampleTimes.length);
    expect(worker().requests.every(request => request.current.samples.length === 0)).toBe(true);
  });

  it('discards an in-flight batch when paused and resumes from the displayed time', async () => {
    await render();
    const pending = await tick();
    await act(async () => controller.toggleRunning());
    const pausedTime = controller.clock.timeSeconds;
    await act(async () => worker().complete(pending));
    expect(controller.clock.status).toBe('paused');
    expect(controller.clock.timeSeconds).toBe(pausedTime);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(worker().requests).toHaveLength(1);
    await act(async () => controller.toggleRunning());
    const next = await tick();
    await act(async () => worker().complete(next));
    expect(controller.clock.timeSeconds).toBeCloseTo(pausedTime + 0.4, 8);
  });

  it('keeps thermal state across environment edits and rejects results from the old environment', async () => {
    await render();
    const first = await tick();
    await act(async () => worker().complete(first));
    const temperatures = controller.frame?.state.sensorTemperaturesC;
    const time = controller.clock.timeSeconds;
    const stale = await tick();
    const changedCircuit = extractCircuit({ ...project,
      environment: { ...project.environment, temperatureC: 25, windSpeedMps: 10.4 } }).circuit;
    await render(changedCircuit, settings, 'changed environment');
    await act(async () => worker().complete(stale));
    expect(controller.clock.timeSeconds).toBe(time);
    expect(controller.frame?.state.sensorTemperaturesC).toEqual(temperatures);
    expect(controller.clock.status).toBe('running');
    const next = await tick();
    expect(next.circuit.thermal).toMatchObject({ ambientTemperatureC: 25, windSpeedMps: 10.4 });
    await act(async () => worker().complete(next));
    expect(controller.frame?.state.sensorTemperaturesC?.['NTC-AIR']).toBeGreaterThan(temperatures!['NTC-AIR']);
  });

  it('does not let a pending batch restore time after reset', async () => {
    await render();
    const pending = await tick();
    await act(async () => controller.reset());
    await act(async () => worker().complete(pending));
    expect(controller.clock.timeSeconds).toBe(0);
    expect(controller.clock.status).toBe('paused');
  });

  it('keeps one request in flight and bounds catch-up after a stalled worker', async () => {
    await render();
    const pending = await tick();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(worker().requests).toHaveLength(1);
    await act(async () => worker().complete(pending));
    const resumed = await tick();
    expect(resumed.stepCount * settings.timeStepSeconds).toBeLessThanOrEqual(1);
    await act(async () => worker().complete(resumed));
    const normal = await tick();
    expect(normal.stepCount * settings.timeStepSeconds).toBeCloseTo(0.4, 8);
  });

  it('completes a single capture at its requested time instead of the end of the batch', async () => {
    await render();
    await act(async () => controller.captureOnce(0.15));
    const request = await tick();
    await act(async () => worker().complete(request));
    expect(controller.clock.status).toBe('paused');
    expect(controller.clock.timeSeconds).toBeCloseTo(0.15, 8);
  });

  it('also advances a wind starter when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    await render();
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(controller.clock.timeSeconds).toBeCloseTo(0.4, 8);
    expect(controller.frame?.state.sensorTemperaturesC?.['NTC-HOT']).toBeGreaterThan(20);
  });
});
