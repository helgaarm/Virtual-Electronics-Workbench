import { NE555_PIN_NAMES } from './types';

export interface ElectronicDeviceMetadata {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  packageId: string;
  manufacturerReference: string;
  pins: Array<{ number: number; id: string; name: string }>;
  supportedSupplyRangeV?: { minimum: number; maximum: number };
  simulationModels: Array<{
    id: string;
    level: 'detailed' | 'hybrid' | 'behavioural';
    description: string;
  }>;
  limitations: string[];
  sourceDocumentIds: string[];
  datasheetUrls: string[];
  testedExamples: string[];
}

export const NE555N_METADATA: ElectronicDeviceMetadata = {
  id: 'ne555n',
  name: 'NE555N Timer',
  category: 'Integrated Circuits',
  subcategory: 'Timers',
  description: 'Classic bipolar timer with threshold, trigger, reset, discharge, and push-pull output stages.',
  manufacturerReference: 'Texas Instruments NE555P',
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
  datasheetUrls: ['https://www.ti.com/lit/ds/symlink/ne555.pdf'],
  testedExamples: ['NE555 astable oscillator'],
};

function device(metadata: ElectronicDeviceMetadata): ElectronicDeviceMetadata { return metadata; }

const transistor = (
  id: string,
  name: string,
  polarity: 'NPN' | 'PNP',
  manufacturerReference: string,
  pinNames: readonly [string, string, string],
  datasheetUrl: string,
) => device({
  id, name, category: 'Semiconductors', subcategory: 'Transistors', packageId: 'TO-92-inline',
  manufacturerReference,
  description: `${polarity} general-purpose bipolar transistor.`,
  pins: pinNames.map((name, index) => ({ number: index + 1, id: `pin${index + 1}`, name })),
  simulationModels: [{ id: 'ebers-moll-bjt', level: 'detailed', description: 'Existing nonlinear Ebers-Moll junction model.' }],
  limitations: ['Typical educational model parameters; capacitances, breakdown, and self-heating are omitted.'],
  sourceDocumentIds: [`${id}-manufacturer-datasheet`], datasheetUrls: [datasheetUrl], testedExamples: [],
});

export const STANDARD_DEVICE_CATALOG = {
  '1n4148': device({
    id: '1n4148', name: '1N4148', category: 'Semiconductors', subcategory: 'Diodes',
    description: 'Glass axial high-speed switching diode.', packageId: 'DO-35', manufacturerReference: 'Nexperia 1N4148',
    pins: [{ number: 1, id: 'anode', name: 'Anode' }, { number: 2, id: 'cathode', name: 'Cathode' }],
    simulationModels: [{ id: 'shockley-diode', level: 'detailed', description: 'Existing nonlinear Shockley junction.' }],
    limitations: ['Junction capacitance and reverse-recovery are omitted.'], sourceDocumentIds: ['nexperia-1n4148'],
    datasheetUrls: ['https://assets.nexperia.com/documents/data-sheet/1N4148_1N4448.pdf'], testedExamples: [],
  }),
  bc547: transistor('bc547', 'BC547', 'NPN', 'onsemi BC547B', ['Collector', 'Base', 'Emitter'], 'https://www.onsemi.com/pdf/datasheet/bc550-d.pdf'),
  bc557: transistor('bc557', 'BC557', 'PNP', 'onsemi BC557B', ['Collector', 'Base', 'Emitter'], 'https://www.onsemi.com/pdf/datasheet/bc556b-d.pdf'),
  '2n3904': transistor('2n3904', '2N3904', 'NPN', 'onsemi 2N3904', ['Emitter', 'Base', 'Collector'], 'https://www.onsemi.com/pdf/datasheet/2n3903-d.pdf'),
  '2n3906': transistor('2n3906', '2N3906', 'PNP', 'onsemi 2N3906', ['Emitter', 'Base', 'Collector'], 'https://www.onsemi.com/pdf/datasheet/2n3906-d.pdf'),
  tmp36: device({
    id: 'tmp36', name: 'TMP36', category: 'Sensors', subcategory: 'Temperature', packageId: 'TO-92-inline',
    manufacturerReference: 'Analog Devices TMP36GT9Z', description: 'Low-voltage analogue Celsius temperature sensor.',
    pins: [{ number: 1, id: 'vs', name: '+VS' }, { number: 2, id: 'vout', name: 'VOUT' }, { number: 3, id: 'gnd', name: 'GND' }],
    supportedSupplyRangeV: { minimum: 2.7, maximum: 5.5 }, simulationModels: [{ id: 'temperature-controlled-source', level: 'behavioural', description: '500 mV offset plus 10 mV/°C nominal transfer.' }],
    limitations: ['Ideal nominal transfer without accuracy tolerance, output impedance, noise, or thermal lag.'], sourceDocumentIds: ['adi-tmp35-36-37-rev-h'],
    datasheetUrls: ['https://www.analog.com/media/en/technical-documentation/data-sheets/TMP35_36_37.pdf'], testedExamples: ['Digital Breadboard Thermometer'],
  }),
  '74hc595': device({
    id: '74hc595', name: '74HC595', category: 'Integrated Circuits', subcategory: 'Logic', packageId: 'DIP-16',
    manufacturerReference: 'Texas Instruments SN74HC595N', description: '8-bit serial-in, parallel-out shift register with output latch.',
    pins: ['QB','QC','QD','QE','QF','QG','QH','GND','QH′','SRCLR','SRCLK','RCLK','OE','SER','QA','VCC'].map((name, index) => ({ number: index + 1, id: `pin${index + 1}`, name })),
    supportedSupplyRangeV: { minimum: 2, maximum: 6 }, simulationModels: [{ id: 'edge-triggered-digital', level: 'behavioural', description: 'Voltage-threshold inputs and finite-resistance tri-state outputs.' }],
    limitations: ['Propagation delay is deterministic but simplified.'], sourceDocumentIds: ['ti-sn74hc595-rev-j'], datasheetUrls: ['https://www.ti.com/lit/ds/symlink/sn74hc595.pdf'], testedExamples: ['Digital Breadboard Thermometer'],
  }),
  attiny85: device({
    id: 'attiny85', name: 'ATtiny85', category: 'Integrated Circuits', subcategory: 'Microcontrollers', packageId: 'DIP-8',
    manufacturerReference: 'Microchip ATtiny85-20PU', description: '8-bit AVR microcontroller with GPIO and 10-bit ADC.',
    pins: ['PB5/RESET/ADC0','PB3/ADC3','PB4/ADC2','GND','PB0','PB1','PB2/ADC1','VCC'].map((name, index) => ({ number: index + 1, id: `pin${index + 1}`, name })),
    supportedSupplyRangeV: { minimum: 2.7, maximum: 5.5 }, simulationModels: [{ id: 'avr-runtime', level: 'behavioural', description: 'Deterministic AVR instruction adapter with mixed-signal GPIO and ADC.' }],
    limitations: ['The incremental AVR core currently implements only the documented starter-firmware opcode subset.'], sourceDocumentIds: ['microchip-attiny25-45-85-rev-2586q'], datasheetUrls: ['https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf'], testedExamples: ['Digital Breadboard Thermometer'],
  }),
} as const;

export const ELECTRONIC_DEVICE_CATALOG = { ne555n: NE555N_METADATA, ...STANDARD_DEVICE_CATALOG } as const;
