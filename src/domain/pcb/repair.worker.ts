/// <reference lib="webworker" />

import { autoRepairPcb } from './repair';
import type { PcbRepairWorkerRequest, PcbRepairWorkerResponse } from './repairWorkerProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<PcbRepairWorkerRequest>) => {
  const { requestId, pcb } = event.data;
  try {
    const response: PcbRepairWorkerResponse = { requestId, result: autoRepairPcb(pcb) };
    scope.postMessage(response);
  } catch (error) {
    const response: PcbRepairWorkerResponse = {
      requestId,
      error: error instanceof Error ? error.message : 'PCB repair failed unexpectedly.',
    };
    scope.postMessage(response);
  }
};

export {};
