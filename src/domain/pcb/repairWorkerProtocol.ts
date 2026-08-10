import type { AutoRepairResult } from './repair';
import type { PcbProject } from './types';

export interface PcbRepairWorkerRequest {
  requestId: number;
  pcb: PcbProject;
}

export type PcbRepairWorkerResponse = {
  requestId: number;
  result: AutoRepairResult;
} | {
  requestId: number;
  error: string;
};
