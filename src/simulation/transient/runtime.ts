import type {
  Circuit,
  TransientFrame,
  TransientSample,
  TransientState,
} from '../../domain/circuit/types';
import type { SimulationSettings } from '../../domain/project';
import { flattenCircuit, transientSimulationEngine } from '../index';
import {
  createSimulationClock,
  type SimulationClock,
} from '../clock';

export const MAX_CAPTURE_SAMPLES = 20_000;

export interface RuntimeState {
  clock: SimulationClock;
  frame?: TransientFrame;
  samples: TransientSample[];
}

export function containsCapacitor(circuit: Circuit): boolean {
  return flattenCircuit(circuit).components.some((component) => component.kind === 'capacitor');
}

export function containsTransientDevice(circuit: Circuit): boolean {
  const containsStatefulSubcircuit = (component: Circuit['components'][number]): boolean => (
    component.kind === 'subcircuit'
      && (component.definition.stateful === true
        || component.definition.components.some(containsStatefulSubcircuit))
  );
  return circuit.components.some(containsStatefulSubcircuit)
    || flattenCircuit(circuit).components.some(
    (component) => component.kind === 'capacitor' || component.kind === 'signal-source',
  );
}

export function requiresTimeline(circuit: Circuit, sampleNodeIds: readonly string[]): boolean {
  return containsTransientDevice(circuit) || sampleNodeIds.length > 0;
}

export function previewTransientFrame(
  circuit: Circuit,
  frameState: TransientState,
  timeStepSeconds: number,
): TransientFrame {
  const preview = transientSimulationEngine.step(
    circuit,
    frameState,
    Math.min(timeStepSeconds, 1e-9),
  );
  return { state: frameState, result: preview.result };
}

export function captureSample(frame: TransientFrame, nodeIds: readonly string[]): TransientSample {
  return {
    timeSeconds: frame.state.timeSeconds,
    nodeVoltages: Object.fromEntries(
      nodeIds.flatMap((nodeId) => {
        const voltage = frame.result.nodeVoltages[nodeId];
        return voltage === undefined ? [] : [[nodeId, voltage]];
      }),
    ),
    componentCurrents: {},
  };
}

function appendSamples(
  existing: readonly TransientSample[],
  additions: readonly TransientSample[],
): TransientSample[] {
  const combined = [...existing, ...additions];
  return combined.slice(Math.max(0, combined.length - MAX_CAPTURE_SAMPLES));
}

export interface RuntimeStepBatch {
  frame: TransientFrame;
  samples: TransientSample[];
  singleCaptureComplete: boolean;
}

export function runTransientRuntimeSteps(
  current: RuntimeState,
  circuit: Circuit,
  sampleNodeIds: readonly string[],
  stepCount: number,
  singleCaptureEndTimeSeconds?: number,
): RuntimeStepBatch {
  let frame = current.frame ?? previewTransientFrame(
    circuit,
    transientSimulationEngine.createState(circuit),
    current.clock.timeStepSeconds,
  );
  const samples: TransientSample[] = [];
  for (let index = 0; index < stepCount && frame.result.status !== 'error'; index += 1) {
    frame = transientSimulationEngine.step(circuit, frame.state, current.clock.timeStepSeconds);
    if (frame.result.status !== 'error') samples.push(captureSample(frame, sampleNodeIds));
    if (
      singleCaptureEndTimeSeconds !== undefined
      && frame.state.timeSeconds >= singleCaptureEndTimeSeconds
    ) break;
  }
  return {
    frame,
    samples,
    singleCaptureComplete: singleCaptureEndTimeSeconds !== undefined
      && frame.state.timeSeconds >= singleCaptureEndTimeSeconds,
  };
}

export function createTransientRuntimeState(
  circuit: Circuit,
  settings: SimulationSettings,
  running: boolean,
  sampleNodeIds: readonly string[] = [],
): RuntimeState {
  const hasTransientDevices = requiresTimeline(circuit, sampleNodeIds);
  const clock = createSimulationClock(
    settings,
    hasTransientDevices && running ? 'running' : 'paused',
  );
  if (!hasTransientDevices) return { clock, samples: [] };
  const frame = previewTransientFrame(
    circuit,
    transientSimulationEngine.createState(circuit),
    settings.timeStepSeconds,
  );
  return {
    clock: { ...clock, status: frame.result.status === 'error' ? 'paused' : clock.status },
    frame,
    samples: [captureSample(frame, sampleNodeIds)],
  };
}

export function reconcileTransientRuntimeState(
  current: RuntimeState,
  circuit: Circuit,
  settings: SimulationSettings,
  resetRequested: boolean,
  sampleNodeIds: readonly string[] = [],
  clearSamples = false,
  clearNodeVoltages = false,
): RuntimeState {
  if (!requiresTimeline(circuit, sampleNodeIds)) {
    return { clock: createSimulationClock(settings), samples: [] };
  }
  const previousState = resetRequested ? undefined : current.frame?.state;
  const stableInternalNodeVoltages = previousState?.nodeVoltages
    ? Object.fromEntries(Object.entries(previousState.nodeVoltages).filter(
      ([nodeId]) => nodeId.startsWith('@sub/'),
    ))
    : {};
  const retainedState = previousState && clearNodeVoltages
    ? {
      timeSeconds: previousState.timeSeconds,
      capacitorVoltages: previousState.capacitorVoltages,
      ...(Object.keys(stableInternalNodeVoltages).length > 0
        ? { nodeVoltages: stableInternalNodeVoltages }
        : {}),
    }
    : previousState;
  const state = transientSimulationEngine.createState(circuit, retainedState);
  const frame = previewTransientFrame(circuit, state, settings.timeStepSeconds);
  const requestedStatus = resetRequested || !current.frame ? 'running' : current.clock.status;
  return {
    frame,
    samples: resetRequested || clearSamples
      ? [captureSample(frame, sampleNodeIds)]
      : appendSamples(current.samples, [captureSample(frame, sampleNodeIds)]),
    clock: {
      ...current.clock,
      timeSeconds: state.timeSeconds,
      timeStepSeconds: settings.timeStepSeconds,
      speed: settings.speed,
      accumulatedSeconds: 0,
      status: frame.result.status === 'error' ? 'paused' : requestedStatus,
    },
  };
}

export function stepTransientRuntimeState(
  current: RuntimeState,
  circuit: Circuit,
  sampleNodeIds: readonly string[] = [],
): RuntimeState {
  if (!requiresTimeline(circuit, sampleNodeIds)) return current;
  const frame = transientSimulationEngine.step(
    circuit,
    current.frame?.state ?? transientSimulationEngine.createState(circuit),
    current.clock.timeStepSeconds,
  );
  return {
    frame,
    samples: appendSamples(current.samples, [captureSample(frame, sampleNodeIds)]),
    clock: {
      ...current.clock,
      timeSeconds: frame.state.timeSeconds,
      status: 'paused',
      accumulatedSeconds: 0,
    },
  };
}

export function hardResetCapacitorRuntimeState(
  current: RuntimeState,
  circuit: Circuit,
  settings: SimulationSettings,
  componentId: string,
  sampleNodeIds: readonly string[] = [],
): RuntimeState {
  const capacitor = circuit.components.find(
    (component) => component.kind === 'capacitor' && component.id === componentId,
  );
  if (!capacitor) return current;
  const previousState = transientSimulationEngine.createState(circuit, current.frame?.state);
  const state: TransientState = {
    ...previousState,
    capacitorVoltages: {
      ...previousState.capacitorVoltages,
      [componentId]: 0,
    },
  };
  const frame = previewTransientFrame(circuit, state, settings.timeStepSeconds);
  return {
    frame,
    samples: appendSamples(current.samples, [captureSample(frame, sampleNodeIds)]),
    clock: {
      ...current.clock,
      timeSeconds: state.timeSeconds,
      status: 'paused',
      accumulatedSeconds: 0,
    },
  };
}
