import { useEffect, useRef, useState } from 'react';
import type {
  Circuit,
  TransientFrame,
  TransientSample,
  TransientState,
} from '../domain/circuit/types';
import type { SimulationSettings } from '../domain/project';
import { flattenCircuit, transientSimulationEngine } from '../simulation';
import {
  advanceSimulationClock,
  createSimulationClock,
  type SimulationClock,
} from '../simulation/clock';

const MAX_CAPTURE_SAMPLES = 20_000;

export interface RuntimeState {
  clock: SimulationClock;
  frame?: TransientFrame;
  samples: TransientSample[];
}

export interface TransientRuntimeController extends RuntimeState {
  hasCapacitors: boolean;
  hasTransientDevices: boolean;
  toggleRunning: () => void;
  reset: () => void;
  hardResetCapacitor: (componentId: string) => void;
  stepOnce: () => void;
  captureOnce: (durationSeconds: number) => void;
}

function containsCapacitor(circuit: Circuit): boolean {
  return flattenCircuit(circuit).components.some((component) => component.kind === 'capacitor');
}

function containsTransientDevice(circuit: Circuit): boolean {
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

function requiresTimeline(circuit: Circuit, sampleNodeIds: readonly string[]): boolean {
  return containsTransientDevice(circuit) || sampleNodeIds.length > 0;
}

function previewTransientFrame(
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

function captureSample(frame: TransientFrame, nodeIds: readonly string[]): TransientSample {
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
  return [...existing, ...additions].slice(-MAX_CAPTURE_SAMPLES);
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

export function useTransientRuntime(
  circuit: Circuit,
  circuitKey: string,
  settings: SimulationSettings,
  resetKey: number,
  sampleNodeIds: readonly string[] = [],
  topologyKey = '',
): TransientRuntimeController {
  const circuitRef = useRef(circuit);
  const sampleNodeIdsRef = useRef(sampleNodeIds);
  const hasCapacitors = containsCapacitor(circuit);
  const hasTransientDevices = requiresTimeline(circuit, sampleNodeIds);
  const resetKeyRef = useRef(resetKey);
  const topologyKeyRef = useRef(topologyKey);
  const sampleNodeKey = sampleNodeIds.join('|');
  const sampleNodeKeyRef = useRef(sampleNodeKey);
  const singleCaptureEndRef = useRef<number | undefined>(undefined);
  const [runtime, setRuntime] = useState<RuntimeState>(
    () => createTransientRuntimeState(circuit, settings, true, sampleNodeIds),
  );

  useEffect(() => {
    circuitRef.current = circuit;
  }, [circuit]);

  useEffect(() => {
    sampleNodeIdsRef.current = sampleNodeIds;
  }, [sampleNodeIds]);

  useEffect(() => {
    const resetRequested = resetKeyRef.current !== resetKey;
    const topologyChanged = topologyKeyRef.current !== topologyKey;
    const sampleNodesChanged = sampleNodeKeyRef.current !== sampleNodeKey;
    resetKeyRef.current = resetKey;
    topologyKeyRef.current = topologyKey;
    sampleNodeKeyRef.current = sampleNodeKey;
    singleCaptureEndRef.current = undefined;
    setRuntime((current) => reconcileTransientRuntimeState(
      current,
      circuitRef.current,
      settings,
      resetRequested,
      sampleNodeIdsRef.current,
      topologyChanged || sampleNodesChanged,
      topologyChanged,
    ));
  }, [circuitKey, resetKey, sampleNodeKey, settings, topologyKey]);

  useEffect(() => {
    if (!hasTransientDevices || runtime.clock.status !== 'running') return undefined;
    let previousTime = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min(0.1, Math.max(0, (now - previousTime) / 1_000));
      previousTime = now;
      setRuntime((current) => {
        const advance = advanceSimulationClock(elapsedSeconds, current.clock, 4_000);
        if (advance.stepCount === 0) return { ...current, clock: advance.clock };
        const batch = runTransientRuntimeSteps(
          current,
          circuitRef.current,
          sampleNodeIdsRef.current,
          advance.stepCount,
          singleCaptureEndRef.current,
        );
        const { frame, samples, singleCaptureComplete } = batch;
        if (singleCaptureComplete) singleCaptureEndRef.current = undefined;
        return {
          frame,
          samples: appendSamples(current.samples, samples),
          clock: {
            ...advance.clock,
            timeSeconds: frame.state.timeSeconds,
            status: frame.result.status === 'error' || singleCaptureComplete
              ? 'paused'
              : current.clock.status,
            accumulatedSeconds: singleCaptureComplete ? 0 : advance.clock.accumulatedSeconds,
          },
        };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [hasTransientDevices, runtime.clock.status]);

  const toggleRunning = () => {
    singleCaptureEndRef.current = undefined;
    setRuntime((current) => ({
      ...current,
      clock: {
        ...current.clock,
        status: current.clock.status === 'running' ? 'paused' : 'running',
      },
    }));
  };

  const reset = () => {
    singleCaptureEndRef.current = undefined;
    setRuntime(createTransientRuntimeState(
      circuitRef.current,
      settings,
      false,
      sampleNodeIdsRef.current,
    ));
  };

  const hardResetCapacitor = (componentId: string) => {
    singleCaptureEndRef.current = undefined;
    setRuntime((current) => (
      hardResetCapacitorRuntimeState(
        current,
        circuitRef.current,
        settings,
        componentId,
        sampleNodeIdsRef.current,
      )
    ));
  };

  const stepOnce = () => {
    singleCaptureEndRef.current = undefined;
    setRuntime((current) => stepTransientRuntimeState(
      current,
      circuitRef.current,
      sampleNodeIdsRef.current,
    ));
  };

  const captureOnce = (durationSeconds: number) => setRuntime((current) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !hasTransientDevices) {
      return current;
    }
    const frame = current.frame ?? previewTransientFrame(
      circuitRef.current,
      transientSimulationEngine.createState(circuitRef.current),
      current.clock.timeStepSeconds,
    );
    if (frame.result.status === 'error') return current;
    singleCaptureEndRef.current = frame.state.timeSeconds + durationSeconds;
    return {
      ...current,
      frame,
      samples: [captureSample(frame, sampleNodeIdsRef.current)],
      clock: { ...current.clock, status: 'running', accumulatedSeconds: 0 },
    };
  });

  return {
    ...runtime,
    hasCapacitors,
    hasTransientDevices,
    toggleRunning,
    reset,
    hardResetCapacitor,
    stepOnce,
    captureOnce,
  };
}
