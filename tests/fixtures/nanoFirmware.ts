/** Original small AVR programs; no Arduino core binary is redistributed. */
export function hexRecord(address: number, type: number, data: number[]): string {
  const record = [data.length, address >> 8, address & 255, type, ...data];
  record.push((-record.reduce((sum, byte) => sum + byte, 0)) & 255);
  return ':' + record.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function firmwareHex(words: number[]): string {
  const bytes = words.flatMap((word) => [word & 255, word >> 8]);
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) lines.push(hexRecord(offset, 0, bytes.slice(offset, offset + 16)));
  return [...lines, hexRecord(0, 1, [])].join('\n');
}
const ldi = (value: number) => 0xe000 | ((value & 0xf0) << 4) | (value & 15); // R16
const out = (address: number) => 0xb800 | ((address & 0x30) << 5) | (16 << 4) | (address & 15);
const write = (address: number, value: number) => [ldi(value), 0x9300, address]; // STS address,R16

export const GPIO_SERIAL_ADC_HEX = firmwareHex([
  ldi(0x20), out(4), out(5), // PB5 / D13 = OUTPUT HIGH
  ...write(0xc1, 8), ...write(0xc6, 65), // USART TX enabled, transmit A
  ...write(0x7c, 0x40), ...write(0x7a, 0xc7), // AVCC reference, ADC0 single conversion
  0xcfff,
]);

// Reset skips the vectors; Timer0 overflow vector jumps to a counter ISR.
const timerWords = new Array<number>(0x34).fill(0);
timerWords[0] = 0xc033;
timerWords[0x20] = 0xc001;
timerWords[0x22] = 0x9543; // INC R20
timerWords[0x23] = 0x9518; // RETI
timerWords.push(ldi(0x40), out(0x0a), ...write(0x47, 128), ...write(0x44, 0x83), ...write(0x45, 3), ...write(0x6e, 1), 0x9478, 0xcfff);
export const TIMER_PWM_HEX = firmwareHex(timerWords);
export const UNSUPPORTED_SPI_HEX = firmwareHex([...write(0x4c, 0x50), 0xcfff]);

// Read EEPROM[0], increment (erased 0xff becomes 0), then start an erase/write.
export const EEPROM_COUNTER_HEX = firmwareHex([
  ldi(0), out(0x21), out(0x22), ldi(1), out(0x1f),
  0xb500, 0x9503, out(0x20), // IN R16,EEDR; INC R16; OUT EEDR,R16
  ldi(4), out(0x1f), ldi(2), out(0x1f), 0xcfff,
]);
