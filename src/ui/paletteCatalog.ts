import type { ComponentKind } from '../domain/components/types';
import { componentDisplayName } from '../domain/components/types';
import { paletteDescription } from '../state/workbenchActions';

export const PALETTE_FOLDERS = [
  { id: 'power', name: 'Power & wiring' },
  { id: 'passive', name: 'Passive components' },
  { id: 'displays', name: 'LEDs & displays' },
  { id: 'diodes', name: 'Diodes' },
  { id: 'transistors', name: 'Transistors' },
  { id: 'ics', name: 'Integrated circuits' },
  { id: 'inputs', name: 'Switches & sensors' },
] as const;

export type PaletteFolderId = (typeof PALETTE_FOLDERS)[number]['id'];

// An exhaustive record makes a folder and icon required for every new component kind.
const PARTS: Record<ComponentKind, { folderId: PaletteFolderId; icon: string }> = {
  'ntc-thermistor': { folderId: 'inputs', icon: 'NTC' },
  'heater-resistor': { folderId: 'passive', icon: 'HEAT' },
  'oled-i2c': { folderId: 'displays', icon: 'OLED' },
  'voltage-source': { folderId: 'power', icon: 'DC' },
  ground: { folderId: 'power', icon: 'GND' },
  'jumper-wire': { folderId: 'power', icon: 'WIRE' },
  resistor: { folderId: 'passive', icon: 'R' },
  capacitor: { folderId: 'passive', icon: 'C' },
  potentiometer: { folderId: 'passive', icon: 'RV' },
  led: { folderId: 'displays', icon: 'LED' },
  'seven-segment': { folderId: 'displays', icon: '8.' },
  'four-digit-seven-segment': { folderId: 'displays', icon: '88.8' },
  'diode-1n4148': { folderId: 'diodes', icon: '▷|' },
  'zener-1n4733a': { folderId: 'diodes', icon: 'Z' },
  bc547: { folderId: 'transistors', icon: 'Q' },
  bc557: { folderId: 'transistors', icon: 'Q' },
  '2n3904': { folderId: 'transistors', icon: 'Q' },
  '2n3906': { folderId: 'transistors', icon: 'Q' },
  '2n7000': { folderId: 'transistors', icon: 'M' },
  ne555: { folderId: 'ics', icon: '555' },
  '74hc595': { folderId: 'ics', icon: '595' },
  attiny85: { folderId: 'ics', icon: 'AVR' },
  'arduino-nano': { folderId: 'ics', icon: 'NANO' },
  lm358: { folderId: 'ics', icon: 'OP' },
  '74hc00': { folderId: 'ics', icon: 'NAND' },
  switch: { folderId: 'inputs', icon: 'SW' },
  tmp36: { folderId: 'inputs', icon: '°C' },
};

const COMPONENT_PARTS = (Object.keys(PARTS) as ComponentKind[]).map((kind) => ({
  kind,
  ...PARTS[kind],
  name: componentDisplayName(kind),
  description: paletteDescription(kind),
}));

export function getPaletteFolders(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return PALETTE_FOLDERS.map((folder) => ({
    ...folder,
    parts: COMPONENT_PARTS.filter((part) => {
      if (part.folderId !== folder.id) return false;
      const searchableText = `${folder.name} ${part.name} ${part.kind} ${part.description}`.toLowerCase();
      return terms.every((term) => searchableText.includes(term));
    }),
  })).filter((folder) => folder.parts.length > 0);
}
