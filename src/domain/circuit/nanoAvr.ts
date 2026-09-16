/** Volatile, structured-cloneable snapshots. Nothing here is stored in project documents. */
export interface NanoAvrSnapshot {
  data: Uint8Array;
  pc: number;
  cycles: number;
  nextInputCycle: number;
  pendingInterrupts: Array<{ address: number; enableRegister: number; enableMask: number; flagRegister: number; flagMask: number; constant?: boolean; inverseFlag?: boolean } | null>;
  nextInterrupt: number;
  maxInterrupt: number;
  peripherals: Array<Record<string, number | boolean | string>>;
  clockEvents: Array<{ id: string; cycles: number }>;
  adcResult: number;
  eeprom: Uint8Array;
  serialOutput: string;
  outputStates: number[];
}
