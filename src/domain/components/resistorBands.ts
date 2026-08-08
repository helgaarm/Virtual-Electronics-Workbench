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

const MULTIPLIER_COLORS: Record<number, ResistorBandColor> = {
  [-2]: 'silver',
  [-1]: 'gold',
  0: 'black',
  1: 'brown',
  2: 'red',
  3: 'orange',
  4: 'yellow',
  5: 'green',
  6: 'blue',
  7: 'violet',
  8: 'grey',
  9: 'white',
};

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

  let exponent = Math.floor(Math.log10(resistanceOhms)) - 1;
  let twoDigits = Math.round(resistanceOhms / 10 ** exponent);
  if (twoDigits === 100) {
    twoDigits = 10;
    exponent += 1;
  }
  const multiplier = MULTIPLIER_COLORS[exponent];
  if (!multiplier || twoDigits < 10 || twoDigits > 99) {
    throw new Error('Resistance is outside the supported four-band range (0.1 Ω to 99 GΩ).');
  }

  return [
    DIGIT_COLORS[Math.floor(twoDigits / 10)],
    DIGIT_COLORS[twoDigits % 10],
    multiplier,
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
