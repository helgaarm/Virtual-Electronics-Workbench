import { useEffect, useRef, useState } from 'react';
import type { Circuit, TransientFrame, TransientState } from '../domain/circuit/types';
import type { SimulationSettings } from '../domain/project';
import { transientSimulationEngine } from '../simulation';
import {
  advanceSimulationClock,
  createSimulationClock,
  type SimulationClock,
} from '../simulation/clock';

export interface RuntimeState {
  clock: SimulationClock;
  frame?: TransientFrame;
}

export interface TransientRuntimeController extends RuntimeState {
  hasCapacitors: boolean;
  toggleRunning: () => void;
  reset: () => void;
  stepOnce: () => void;
}

function containsCapacitor(circuit: Circuit): boolean {
  return circuit.components.some((component) => component.kind === 'capacitor');
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

export function createTransientRuntimeState(
  circuit: Circuit,
  settings: SimulationSettings,
  running: boolean,
): RuntimeState {
  const hasCapacitors = containsCapacitor(circuit);
  const clock = createSimulationClock(settings, hasCapacitors && running ? 'running' : 'paused');
  if (!hasCapacitors) return { clock };
  const frame = previewTransientFrame(
    circuit,
    transientSimulationEngine.createState(circuit),
    settings.timeStepSeconds,
  );
  return {
    clock: { ...clock, status: frame.result.status === 'error' ? 'paused' : clock.status },
    frame,
  };
}

export function reconcileTransientRuntimeState(
  current: RuntimeState,
  circuit: Circuit,
  settings: SimulationSettings,
  resetRequested: boolean,
): RuntimeState {
  if (!containsCapacitor(circuit)) return { clock: createSimulationClock(settings) };
  const state = transientSimulationEngine.createState(
    circuit,
    resetRequested ? undefined : current.frame?.state,
  );
  const frame = previewTransientFrame(circuit, state, settings.timeStepSeconds);
  const requestedStatus = resetRequested || !current.frame ? 'running' : current.clock.status;
  return {
    frame,
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
): RuntimeState {
  if (!containsCapacitor(circuit)) return current;
  const frame = transientSimulationEngine.step(
    circuit,
    current.frame?.state ?? transientSimulationEngine.createState(circuit),
    current.clock.timeStepSeconds,
  );
  return {
    frame,
    clock: {
      ...current.clock,
      timeSeconds: frame.state.timeSeconds,
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
): TransientRuntimeController {
  const circuitRef = useRef(circuit);
  const hasCapacitors = containsCapacitor(circuit);
  const resetKeyRef = useRef(resetKey);
  const [runtime, setRuntime] = useState<RuntimeState>(
    () => createTransientRuntimeState(circuit, settings, true),
  );

  useEffect(() => {
    circuitRef.current = circuit;
  }, [circuit]);

  useEffect(() => {
    const resetRequested = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;
    setRuntime((current) => reconcileTransientRuntimeState(
      current,
      circuitRef.current,
      settings,
      resetRequested,
    ));
  }, [circuitKey, resetKey, settings]);

  useEffect(() => {
    if (!hasCapacitors || runtime.clock.status !== 'running') return undefined;
    let previousTime = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min(0.1, Math.max(0, (now - previousTime) / 1_000));
      previousTime = now;
      setRuntime((current) => {
        const advance = advanceSimulationClock(elapsedSeconds, current.clock);
        if (advance.stepCount === 0) return { ...current, clock: advance.clock };
        let frame = current.frame ?? previewTransientFrame(
          circuitRef.current,
          transientSimulationEngine.createState(circuitRef.current),
          current.clock.timeStepSeconds,
        );
        for (let index = 0; index < advance.stepCount && frame.result.status !== 'error'; index += 1) {
          frame = transientSimulationEngine.step(
            circuitRef.current,
            frame.state,
            current.clock.timeStepSeconds,
          );
        }
        return {
          frame,
          clock: {
            ...advance.clock,
            timeSeconds: frame.state.timeSeconds,
            status: frame.result.status === 'error' ? 'paused' : current.clock.status,
          },
        };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [hasCapacitors, runtime.clock.status]);

  const toggleRunning = () => setRuntime((current) => ({
    ...current,
    clock: {
      ...current.clock,
      status: current.clock.status === 'running' ? 'paused' : 'running',
    },
  }));

  const reset = () => setRuntime(createTransientRuntimeState(circuitRef.current, settings, false));

  const stepOnce = () => setRuntime((current) => stepTransientRuntimeState(
    current,
    circuitRef.current,
  ));

  return { ...runtime, hasCapacitors, toggleRunning, reset, stepOnce };
}
