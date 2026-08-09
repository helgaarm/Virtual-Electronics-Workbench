import { NE555_PIN_NAMES } from './types';

export interface ElectronicDeviceMetadata {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  packageId: string;
  pins: Array<{ number: number; id: keyof typeof NE555_PIN_NAMES; name: string }>;
  supportedSupplyRangeV: { minimum: number; maximum: number };
  simulationModels: Array<{
    id: string;
    level: 'detailed' | 'hybrid' | 'behavioural';
    description: string;
  }>;
  limitations: string[];
  sourceDocumentIds: string[];
  testedExamples: string[];
}

export const NE555N_METADATA: ElectronicDeviceMetadata = {
  id: 'ne555n',
  name: 'NE555N Timer',
  category: 'Integrated Circuits',
  subcategory: 'Timers',
  description: 'Classic bipolar timer with threshold, trigger, reset, discharge, and push-pull output stages.',
  packageId: 'DIP-8',
  pins: Object.entries(NE555_PIN_NAMES).map(([id, name], index) => ({
    number: index + 1,
    id: id as keyof typeof NE555_PIN_NAMES,
    name,
  })),
  supportedSupplyRangeV: { minimum: 4.5, maximum: 16 },
  simulationModels: [{
    id: 'hybrid-analogue-subcircuit',
    level: 'hybrid',
    description: 'Resistor-divider, smooth analogue comparator/latch, and finite output-stage subcircuit.',
  }],
  limitations: [
    'Educational hybrid analogue network; it is not a manufacturer die-level transistor model.',
    'Junction capacitances and semiconductor temperature drift are not yet modelled.',
  ],
  sourceDocumentIds: ['ti-ne555-rev-k-2026', 'ti-pdip-8-p-package'],
  testedExamples: ['NE555 astable oscillator'],
};

export const ELECTRONIC_DEVICE_CATALOG = { ne555n: NE555N_METADATA } as const;
