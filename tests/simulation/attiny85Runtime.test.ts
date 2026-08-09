import { describe, expect, it } from 'vitest';
import { createAttiny85Runtime, parseIntelHex, quantizeAdc, runAttiny85Cycles } from '../../src/simulation/microcontroller/attiny85Runtime';

const PROGRAM_HEX = ':0600000001E808BBFECF81\n:00000001FF'; // LDI r16,0x81; OUT PORTB,r16; RJMP -2

describe('ATtiny85 runtime adapter', () => {
  it('loads checksummed Intel HEX and rejects corruption', () => {
    expect([...parseIntelHex(PROGRAM_HEX).slice(0, 6)]).toEqual([1, 232, 8, 187, 254, 207]);
    expect(() => parseIntelHex(PROGRAM_HEX.replace('81', '82'))).toThrow(/checksum/u);
  });

  it('executes real AVR opcodes deterministically and bridges GPIO electrically', () => {
    const driven = new Map<number, string>();
    const bridge = {
      readPinVoltageV: () => 0,
      drivePin: (pin: number, level: 'low' | 'high' | 'high-impedance') => { driven.set(pin, level); },
      supplyVoltageV: () => 5,
    };
    const result = runAttiny85Cycles(createAttiny85Runtime(PROGRAM_HEX), bridge, 8);
    expect(result.halted).toBe(false);
    expect(result.cycles).toBeGreaterThanOrEqual(8);
    expect(driven.get(0)).toBe('high');
    expect(driven.get(1)).toBe('low');
  });

  it('quantizes actual input voltage to the 10-bit ADC range', () => {
    expect(quantizeAdc(0.734, 5)).toBe(150);
    expect(quantizeAdc(5, 5)).toBe(1023);
  });
});
