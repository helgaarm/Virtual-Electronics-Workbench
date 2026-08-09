import type { PcbFootprint } from './types';

const roundPad = (number: string, terminalId: string, xMm: number, yMm: number, drillDiameterMm = 0.8) => ({
  number, terminalId, positionMm: { xMm, yMm }, sizeMm: { widthMm: 1.8, heightMm: 1.8 },
  drillDiameterMm, plated: true, shape: number === '1' ? 'rect' as const : 'circle' as const,
});

export const PCB_FOOTPRINTS: Readonly<Record<string, PcbFootprint>> = {
  'TerminalBlock-2-P5.08': { id: 'TerminalBlock-2-P5.08', name: '2-pin power terminal, 5.08 mm', compatibleKinds: ['voltage-source'], bodySizeMm: { widthMm: 10.2, heightMm: 8.5 }, courtyardMarginMm: 1, pads: [roundPad('1', 'positive', -2.54, 0, 1.1), roundPad('2', 'negative', 2.54, 0, 1.1)], verified: true, source: 'Common 5.08 mm terminal-block pitch; selected hardware must be checked.' },
  'Axial-10mm': { id: 'Axial-10mm', name: 'Axial THT, 10 mm pitch', compatibleKinds: ['resistor'], bodySizeMm: { widthMm: 6.3, heightMm: 2.5 }, courtyardMarginMm: 1, pads: [roundPad('1', 'a', -5, 0), roundPad('2', 'b', 5, 0)], verified: true, source: 'IEC-style DIN0207 axial body; conservative 10 mm mounting pitch.' },
  'LED-D5.0mm': { id: 'LED-D5.0mm', name: 'LED, 5 mm THT', compatibleKinds: ['led'], bodySizeMm: { widthMm: 5, heightMm: 5 }, courtyardMarginMm: 1, pads: [roundPad('1', 'cathode', -1.27, 0), roundPad('2', 'anode', 1.27, 0)], verified: true, source: 'Standard 2.54 mm lead pitch; cathode is pad 1.' },
  'CP-Radial-D5-P2.0': { id: 'CP-Radial-D5-P2.0', name: 'Radial capacitor, 5 mm', compatibleKinds: ['capacitor'], bodySizeMm: { widthMm: 5, heightMm: 5 }, courtyardMarginMm: 1, pads: [roundPad('1', 'positive', -1, 0), roundPad('2', 'negative', 1, 0)], verified: true, source: 'Generic 5 mm radial body with 2.0 mm lead pitch; verify against selected part.', pin1Marked: true },
  'DIP-8-W7.62': { id: 'DIP-8-W7.62', name: 'DIP-8, 7.62 mm row spacing', compatibleKinds: ['ne555'], bodySizeMm: { widthMm: 10.2, heightMm: 9.8 }, courtyardMarginMm: 1, pads: Array.from({ length: 8 }, (_, index) => {
    const left = index < 4; const row = left ? index : 7 - index;
    return roundPad(String(index + 1), `pin${index + 1}`, left ? -3.81 : 3.81, (row - 1.5) * 2.54);
  }), verified: true, source: 'JEDEC PDIP, 7.62 mm row spacing and 2.54 mm pitch.', pin1Marked: true },
};

export function footprintForKind(kind: string): PcbFootprint | undefined {
  return Object.values(PCB_FOOTPRINTS).find((footprint) => footprint.compatibleKinds.includes(kind));
}
