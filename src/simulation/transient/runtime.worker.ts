/// <reference lib="webworker" />
import type { Circuit } from '../../domain/circuit/types';
import { runTransientRuntimeSteps, type RuntimeState } from './runtime';

export interface TransientWorkerRequest {
  id: number;
  current: RuntimeState;
  circuit: Circuit;
  sampleNodeIds: string[];
  stepCount: number;
  singleCaptureEndTimeSeconds?: number;
}

export interface TransientWorkerResponse {
  id: number;
  batch: ReturnType<typeof runTransientRuntimeSteps>;
}

globalThis.onmessage = (event: MessageEvent<TransientWorkerRequest>) => {
  const request = event.data;
  const response: TransientWorkerResponse = {
    id: request.id,
    batch: runTransientRuntimeSteps(
      request.current,
      request.circuit,
      request.sampleNodeIds,
      request.stepCount,
      request.singleCaptureEndTimeSeconds,
    ),
  };
  globalThis.postMessage(response);
};
