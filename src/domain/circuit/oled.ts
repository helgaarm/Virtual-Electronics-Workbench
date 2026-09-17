export interface OledDevice {
  id: string; controller: 'sh1106' | 'ssd1306'; address: number;
  pins: { gnd: string; vcc: string; scl: string; sda: string };
}
/** Controller RAM and addressing state; payload bytes, never an independent numeric display value. */
export interface OledState {
  ram: Uint8Array; page: number; column: number; enabled: boolean; inverted: boolean;
  mode: number; columnStart: number; columnEnd: number; pageStart: number; pageEnd: number;
  pendingCommand?: number; parameters: number[];
  control?: number; expectsControl: boolean;
}
