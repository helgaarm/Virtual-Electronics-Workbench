export type ResistorBandColor =
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'grey'
  | 'white'
  | 'gold'
  | 'silver';

const DIGIT_COLORS: ResistorBandColor[] = [
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'grey',
  'white',
];

function toleranceColor(tolerancePercent: number): ResistorBandColor {
  if (tolerancePercent <= 1) return 'brown';
  if (tolerancePercent <= 2) return 'red';
  if (tolerancePercent <= 5) return 'gold';
  return 'silver';
}

export function resistorColorBands(
  resistanceOhms: number,
  tolerancePercent = 5,
): [ResistorBandColor, ResistorBandColor, ResistorBandColor, ResistorBandColor] {
  if (!Number.isFinite(resistanceOhms) || resistanceOhms <= 0) {
    throw new Error('Resistance must be a positive finite number.');
  }

  const exponent = Math.floor(Math.log10(resistanceOhms)) - 1;
  const normalized = Math.round(resistanceOhms / 10 ** exponent);
  const twoDigits = Math.min(99, Math.max(10, normalized));
  const multiplierIndex = Math.max(0, Math.min(9, exponent));

  return [
    DIGIT_COLORS[Math.floor(twoDigits / 10)],
    DIGIT_COLORS[twoDigits % 10],
    DIGIT_COLORS[multiplierIndex],
    toleranceColor(tolerancePercent),
  ];
}

export const RESISTOR_BAND_HEX: Record<ResistorBandColor, string> = {
  black: '#171716',
  brown: '#6f4025',
  red: '#c83b2f',
  orange: '#ed8426',
  yellow: '#e7c93b',
  green: '#4c8b5a',
  blue: '#376fbd',
  violet: '#7654a7',
  grey: '#7e8588',
  white: '#ecebe4',
  gold: '#b89a45',
  silver: '#a9afb0',
};
