/** Original AVR firmware image builder. No application-temperature input exists at runtime.
 * ADC3 -> flash lookup -> MSB-first serial GPIO -> two 74HC595s -> multiplexed LEDs.
 * Table assumes the starter's regulated 5 V ADC reference; resolution is ~0.49 C.
 */
const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const TABLE_ADDRESS = 4096;

export function thermometerGlyphs(adc: number): number[] {
  const tenths = Math.round((adc * 5 / 1023 - 0.5) * 1000);
  const absolute = Math.abs(tenths);
  const text = ((tenths < 0 ? '-' : '') + String(absolute).padStart(2, '0')).padStart(4, ' ');
  return [...text].map((character, index) => (character === '-' ? 0x40 : character === ' ' ? 0 : DIGITS[Number(character)]) | (index === 2 ? 0x80 : 0));
}

export function buildThermometerHex(): string {
  const words: number[] = [];
  const emit = (word: number) => { words.push(word); };
  const ldi = (r: number, k: number) => emit(0xe000 | ((k & 0xf0) << 4) | ((r - 16) << 4) | (k & 15));
  const out = (a: number, r: number) => emit(0xb800 | ((a & 0x30) << 5) | (r << 4) | (a & 15));
  const input = (r: number, a: number) => emit(0xb000 | ((a & 0x30) << 5) | (r << 4) | (a & 15));
  const pair = (op: number, d: number, r: number) => emit(op | (d << 4) | (r & 15) | ((r & 16) << 5));
  const delay = (count: number) => {
    ldi(20, count);
    emit(0x940a | (20 << 4)); // DEC
    emit(0xf401 | ((-2 & 127) << 3)); // BRNE
  };
  const serialByte = (register: number) => {
    for (let bit = 7; bit >= 0; bit -= 1) {
      ldi(18, 16); // Keep OE high throughout serial transfer.
      emit(0xfc00 | (register << 4) | bit); // SBRC
      ldi(18, 17);
      out(0x18, 18);
      emit(0x6000 | ((18 - 16) << 4) | 2); // ORI clock high
      out(0x18, 18);
      emit(0x7000 | (0xf0 << 4) | ((18 - 16) << 4) | 0xd); // ANDI clock low
      out(0x18, 18);
    }
  };
  ldi(16, 0x17); out(0x17, 16); // PB0 SER, PB1 SRCLK, PB2 RCLK, PB4 OE outputs
  ldi(16, 3); out(7, 16); // ADC3, VCC reference
  ldi(17, 0);
  const frame = words.length;
  ldi(16, 0xc3); out(6, 16); // Enable and start ADC, /8 prescaler
  input(30, 4); input(31, 5);
  pair(0x0c00, 30, 30); pair(0x1c00, 31, 31);
  pair(0x0c00, 30, 30); pair(0x1c00, 31, 31); // Z = ADC * 4
  ldi(16, TABLE_ADDRESS >> 8); pair(0x0c00, 31, 16);
  for (let digit = 0; digit < 4; digit += 1) {
    // Tri-state outputs before changing segment data to prevent ghosting.
    ldi(18, 16); out(0x18, 18);
    ldi(19, 1 << digit); serialByte(19);
    emit(0x9005 | (19 << 4)); // LPM r19, Z+
    serialByte(19);
    ldi(18, 20); out(0x18, 18); ldi(18, 16); out(0x18, 18);
    ldi(18, 0); out(0x18, 18); // Enable newly latched digit.
    delay(255); delay(255); // ~1.5 ms dwell at 1 MHz
  }
  emit(0xc000 | ((frame - words.length - 1) & 0xfff));
  if (words.length * 2 > TABLE_ADDRESS) throw new Error('Thermometer firmware overlaps lookup table.');
  const bytes = new Uint8Array(TABLE_ADDRESS + 4096).fill(0xff);
  words.forEach((word, i) => { bytes[i * 2] = word & 255; bytes[i * 2 + 1] = word >> 8; });
  for (let adc = 0; adc < 1024; adc += 1) bytes.set(thermometerGlyphs(adc), TABLE_ADDRESS + adc * 4);
  const records: string[] = [];
  for (let address = 0; address < bytes.length; address += 16) {
    const record = [16, address >> 8, address & 255, 0, ...bytes.slice(address, address + 16)];
    record.push((-record.reduce((sum, byte) => sum + byte, 0)) & 255);
    records.push(':' + record.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  return records.join('\n') + '\n:00000001FF';
}

export const THERMOMETER_HEX = buildThermometerHex();
