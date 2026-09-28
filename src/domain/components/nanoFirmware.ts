export const NANO_FLASH_BYTES = 32_768;
export const MAX_NANO_HEX_CHARACTERS = 196_608;
export interface NanoFirmware { name: string; hex: string }
export type FirmwareParseResult = { ok: true; bytes: Uint8Array; byteCount: number } | { ok: false; error: string };

/** Strict, bounded Intel HEX input validation shared by the file picker, persistence and runtime. */
export function parseNanoHex(source: string): FirmwareParseResult {
  const fail = (error: string): FirmwareParseResult => ({ ok: false, error });
  if (source.length > MAX_NANO_HEX_CHARACTERS) return fail('Firmware file is too large. Export a classic Nano ATmega328P sketch.');
  const lines = source.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length > 8_192) return fail('Firmware has too many HEX records.');
  const bytes = new Uint8Array(NANO_FLASH_BYTES).fill(0xff);
  const written = new Uint8Array(NANO_FLASH_BYTES);
  let base = 0; let ended = false; let byteCount = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const error = (message: string) => fail(`HEX line ${index + 1}: ${message}`);
    if (ended) return error('data after the end-of-file record.');
    if (!/^:(?:[\da-fA-F]{2}){5,260}$/.test(line)) return error('invalid Intel HEX record.');
    const record = Uint8Array.from(line.slice(1).match(/../g)!.map((value) => parseInt(value, 16)));
    const count = record[0]; const address = record[1] * 256 + record[2]; const type = record[3];
    if (record.length !== count + 5 || record.reduce((sum, value) => sum + value, 0) % 256 !== 0) return error('invalid length or checksum.');
    if (type === 0) {
      if (!count || base + address + count > NANO_FLASH_BYTES) return error('data is outside the Nano’s 32 KB flash.');
      for (let i = 0; i < count; i++) {
        const at = base + address + i;
        if (written[at]) return error('overlapping data records.');
        bytes[at] = record[4 + i]; written[at] = 1; byteCount++;
      }
    } else if (type === 1) {
      if (count || address) return error('invalid end-of-file record.');
      ended = true;
    } else if (type === 2 || type === 4) {
      if (count !== 2 || address) return error('invalid extended address.');
      base = (record[4] * 256 + record[5]) * (type === 2 ? 16 : 65_536);
    } else if (type === 3 || type === 5) {
      if (count !== 4 || address || record.slice(4, 8).some((value) => value !== 0)) return error('the Nano must start at reset address zero.');
    } else return error(`unsupported record type ${type}.`);
  }
  if (!ended || !written[0] || !written[1]) return fail('Firmware needs a reset vector at address zero and an end-of-file record.');
  return { ok: true, bytes, byteCount };
}
