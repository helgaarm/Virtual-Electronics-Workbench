import type { PlacedComponent } from '../components/types';
import { DEFAULT_WIND_SETTINGS } from '../components/windSensor';
import { nanoTerminalHoles } from '../physical/arduinoNano';
import { terminalHoleId } from '../physical/breadboard';
import { createEmptyProject, type WorkbenchProject } from '../project';

export function windSensorProject(constantTemperature: boolean): WorkbenchProject {
  const project = createEmptyProject(constantTemperature ? 'Wind Sensor — Constant Temperature' : 'Wind Sensor — Constant Power');
  project.board.columns = 63;
  const hole = (row: Parameters<typeof terminalHoleId>[1], column: number) => terminalHoleId(project.board.id, row, column);
  const wire = (id: string, a: string, b: string, color: 'blue' | 'red' | 'black' = 'blue'): PlacedComponent => ({ id, label: id, kind: 'jumper-wire', rotation: 0, color, terminalHoleIds: { a, b } });
  const resistor = (id: string, resistanceOhms: number, a: string, b: string): PlacedComponent => ({ id, label: id, kind: 'resistor', rotation: 0, resistanceOhms, tolerancePercent: 1, terminalHoleIds: { a, b } });
  const components: PlacedComponent[] = [
    { id: 'Nano1', label: 'Nano1', kind: 'arduino-nano', deviceId: 'arduino-nano', packageId: 'NANO-30', rotation: 0,
      programId: constantTemperature ? 'wind-constant-temperature' : 'wind-constant-power', windSettings: { ...DEFAULT_WIND_SETTINGS, calibration: [] }, terminalHoleIds: nanoTerminalHoles(project.board.id, 3) },
    resistor('R-AIR', 10_000, hole('E', 23), hole('E', 28)),
    resistor('R-HOT', 10_000, hole('E', 31), hole('E', 36)),
    { id: 'NTC-AIR', label: 'Ambient NTC', kind: 'ntc-thermistor', rotation: 0, nominalResistanceOhms: 10_000, nominalTemperatureC: 25, betaK: 3950, terminalHoleIds: { a: hole('J', 24), b: hole('J', 25) } },
    { id: 'NTC-HOT', label: 'Heated NTC', kind: 'ntc-thermistor', rotation: 0, nominalResistanceOhms: 10_000, nominalTemperatureC: 25, betaK: 3950, heaterId: 'RH1', terminalHoleIds: { a: hole('H', 34), b: hole('H', 35) } },
    { id: 'RH1', label: '150 ohm heater', kind: 'heater-resistor', rotation: 0, resistanceOhms: 150, ratedPowerW: 0.5, terminalHoleIds: { a: hole('F', 33), b: hole('F', 37) } },
    { id: 'Q1', label: 'Heater driver', kind: '2n7000', deviceId: '2n7000', packageId: 'TO-92-inline', rotation: 0, terminalHoleIds: { source: hole('E', 40), gate: hole('E', 41), drain: hole('E', 42) } },
    resistor('R-GATE', 220, hole('A', 43), hole('A', 47)),
    resistor('R-PULLDOWN', 100_000, hole('J', 40), hole('J', 45)),
    { id: 'OLED1', label: 'Wind OLED', kind: 'oled-i2c', controller: 'sh1106', address: 60, rotation: 0,
      terminalHoleIds: { gnd: hole('A', 54), vcc: hole('A', 55), scl: hole('A', 56), sda: hole('A', 57) } },
    wire('W-5V-AIR', hole('J', 6), hole('D', 23), 'red'),
    wire('W-5V-HOT', hole('C', 23), hole('D', 31), 'red'),
    wire('W-5V-HEAT', hole('C', 31), hole('G', 33), 'red'),
    wire('W-5V-OLED', hole('I', 6), hole('B', 55), 'red'),
    wire('W-AIR', hole('D', 28), hole('I', 24)), wire('W-A0', hole('J', 14), hole('H', 24)),
    wire('W-HOT', hole('D', 36), hole('I', 34)), wire('W-A1', hole('J', 13), hole('J', 34)),
    wire('W-AIR-GND', hole('I', 25), hole('A', 6), 'black'),
    wire('W-HOT-GND', hole('I', 35), hole('H', 25), 'black'),
    wire('W-SOURCE-GND', hole('D', 40), hole('J', 35), 'black'),
    wire('W-HEAT-DRAIN', hole('G', 37), hole('D', 42)),
    wire('W-PWM', hole('A', 14), hole('B', 43)), wire('W-GATE', hole('B', 47), hole('D', 41)),
    wire('W-GATE-PD', hole('C', 41), hole('I', 40)), wire('W-PD-GND', hole('I', 45), hole('C', 40), 'black'),
    wire('W-OLED-GND', hole('B', 54), hole('B', 6), 'black'),
    wire('W-SDA', hole('J', 10), hole('B', 57)), wire('W-SCL', hole('J', 9), hole('B', 56)),
  ];
  return { ...project, components, powerOn: true, environment: { ...project.environment, temperatureC: 20, windSpeedMps: 0 },
    simulation: { timeStepSeconds: 0.01, speed: 4 }, view: { ...project.view, cameraPreset: 'top' },
    probes: [{ id: 'wind-hot-probe', label: 'Heated divider', instrumentId: 'multimeter', positiveHoleId: hole('C', 36), referenceHoleId: hole('C', 6) }],
    analysis: { ...project.analysis, selectedProbeId: 'wind-hot-probe' } };
}
