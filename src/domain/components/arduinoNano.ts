/** Classic Nano header order, viewed from above with USB at the left. */
export const NANO_PIN_NAMES = [
  'D1/TX', 'D0/RX', 'RESET', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12',
  'D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET', 'GND', 'VIN',
] as const;

export const NANO_PROGRAM_IDS = ['blink', 'button-led', 'analog-threshold', 'wind-constant-power', 'wind-constant-temperature'] as const;
export type NanoProgramId = typeof NANO_PROGRAM_IDS[number];
export const NANO_PROGRAMS: Record<NanoProgramId, { name: string; description: string; sketch: string }> = {
  'wind-constant-power': { name: 'Wind sensor · constant power', description: 'A0/A1 thermistors, A4/A5 OLED. Calibrate measured temperature difference; no wind estimate is invented.', sketch: '// Complete, configurable sketch: examples/WindSensor/WindSensor.ino\n// Set CONSTANT_TEMPERATURE = false; see docs/wind-sensor.md.' },
  'wind-constant-temperature': { name: 'Wind sensor · constant temperature', description: 'Maintain hot sensor above ambient using D9 and a heater driver. Calibrate mean heater power after settling.', sketch: '// Complete, configurable sketch: examples/WindSensor/WindSensor.ino\n// Set CONSTANT_TEMPERATURE = true; see docs/wind-sensor.md.' },
  blink: {
    name: 'Blink', description: 'D13 turns on for one second, then off for one second. Connect an LED through a 330 Ω resistor from D13 to GND.',
    sketch: 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}',
  },
  'button-led': {
    name: 'Button → LED', description: 'Connect a switch between D2 and GND. The internal pull-up holds D2 high; closing the switch lights D13.',
    sketch: 'void setup() {\n  pinMode(2, INPUT_PULLUP);\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, digitalRead(2) == LOW);\n  delay(1);\n}',
  },
  'analog-threshold': {
    name: 'Analog input → LED', description: 'Connect a potentiometer between 5V and GND, with its wiper on A0. D13 lights when the 10-bit reading reaches 512 (about 2.5 V).',
    sketch: 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, analogRead(A0) >= 512);\n  delay(1);\n}',
  },
};
