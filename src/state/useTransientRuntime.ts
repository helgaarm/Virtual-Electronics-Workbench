import { useEffect, useRef, useState } from 'react';
import type { Circuit, TransientSample } from '../domain/circuit/types';
import type { SimulationSettings } from '../domain/project';
import { advanceSimulationClock } from '../simulation/clock';
import {
  captureSample,
  containsCapacitor,
  createTransientRuntimeState,
  hardResetCapacitorRuntimeState,
  MAX_CAPTURE_SAMPLES,
  previewTransientFrame,
  reconcileTransientRuntimeState,
  requiresTimeline,
  runTransientRuntimeSteps,
  stepTransientRuntimeState,
  type RuntimeState,
} from '../simulation/transient/runtime';
import { transientSimulationEngine } from '../simulation';
import type { TransientWorkerRequest, TransientWorkerResponse } from '../simulation/transient/runtime.worker';
import { CircularBuffer } from './CircularBuffer';

export interface TransientRuntimeController extends RuntimeState {
  hasCapacitors: boolean;
  hasTransientDevices: boolean;
  toggleRunning: () => void;
  reset: () => void;
  hardResetCapacitor: (componentId: string) => void;
  stepOnce: () => void;
  captureOnce: (durationSeconds: number) => void;
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
  const workerRef = useRef<Worker | undefined>(undefined);
  const workerBusyRef = useRef(false);
  const workerRequestIdRef = useRef(0);
  const [runtime, setRuntime] = useState<RuntimeState>(
    () => createTransientRuntimeState(circuit, settings, true, sampleNodeIds),
  );
  const captureBufferRef = useRef(new CircularBuffer<TransientSample>(
    MAX_CAPTURE_SAMPLES,
    runtime.samples,
  ));

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;
    const worker = new Worker(new URL('../simulation/transient/runtime.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<TransientWorkerResponse>) => {
      workerBusyRef.current = false;
      if (event.data.id !== workerRequestIdRef.current) return;
      const { batch } = event.data;
      setRuntime((current) => {
        if (batch.singleCaptureComplete) singleCaptureEndRef.current = undefined;
        captureBufferRef.current.pushMany(batch.samples);
        return {
          frame: batch.frame,
          samples: captureBufferRef.current.toArray(),
          clock: {
            ...current.clock,
            timeSeconds: batch.frame.state.timeSeconds,
            status: batch.frame.result.status === 'error' || batch.singleCaptureComplete
              ? 'paused'
              : current.clock.status,
            accumulatedSeconds: batch.singleCaptureComplete ? 0 : current.clock.accumulatedSeconds,
          },
        };
      });
    };
    worker.onerror = () => {
      workerBusyRef.current = false;
      worker.terminate();
      workerRef.current = undefined;
    };
    return () => {
      worker.terminate();
      workerRef.current = undefined;
      workerBusyRef.current = false;
    };
  }, []);

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
    workerRequestIdRef.current += 1;
    setRuntime((current) => {
      const next = reconcileTransientRuntimeState(
        current,
        circuitRef.current,
        settings,
        resetRequested,
        sampleNodeIdsRef.current,
        topologyChanged || sampleNodesChanged,
        topologyChanged,
      );
      captureBufferRef.current.replace(next.samples);
      return next;
    });
  }, [circuitKey, resetKey, sampleNodeKey, settings, topologyKey]);

  useEffect(() => {
    if (!hasTransientDevices || runtime.clock.status !== 'running') return undefined;
    let previousTime = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.min(0.1, Math.max(0, (now - previousTime) / 1_000));
      previousTime = now;
      setRuntime((current) => {
        if (workerBusyRef.current) return current;
        const advance = advanceSimulationClock(elapsedSeconds, current.clock, 4_000);
        if (advance.stepCount === 0) return { ...current, clock: advance.clock };
        if (workerRef.current) {
          workerBusyRef.current = true;
          const request: TransientWorkerRequest = {
            id: ++workerRequestIdRef.current,
            current: { ...current, clock: advance.clock },
            circuit: circuitRef.current,
            sampleNodeIds: [...sampleNodeIdsRef.current],
            stepCount: advance.stepCount,
            singleCaptureEndTimeSeconds: singleCaptureEndRef.current,
          };
          workerRef.current.postMessage(request);
          return { ...current, clock: advance.clock };
        }
        const batch = runTransientRuntimeSteps(
          current,
          circuitRef.current,
          sampleNodeIdsRef.current,
          advance.stepCount,
          singleCaptureEndRef.current,
        );
        const { frame, samples, singleCaptureComplete } = batch;
        if (singleCaptureComplete) singleCaptureEndRef.current = undefined;
        captureBufferRef.current.pushMany(samples);
        return {
          frame,
          samples: captureBufferRef.current.toArray(),
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
    }, 100);
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
    workerRequestIdRef.current += 1;
    const next = createTransientRuntimeState(
      circuitRef.current,
      settings,
      false,
      sampleNodeIdsRef.current,
    );
    captureBufferRef.current.replace(next.samples);
    setRuntime(next);
  };

  const hardResetCapacitor = (componentId: string) => {
    singleCaptureEndRef.current = undefined;
    workerRequestIdRef.current += 1;
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
    workerRequestIdRef.current += 1;
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
    workerRequestIdRef.current += 1;
    const initialSample = captureSample(frame, sampleNodeIdsRef.current);
    captureBufferRef.current.replace([initialSample]);
    return {
      ...current,
      frame,
      samples: [initialSample],
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
