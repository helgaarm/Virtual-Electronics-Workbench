import type { PlacedComponent } from '../components/types';
import { NANO_PROGRAMS, type NanoProgramId } from '../components/arduinoNano';
import { nanoTerminalHoles } from '../physical/arduinoNano';
import { terminalHoleId } from '../physical/breadboard';
import { createEmptyProject, type WorkbenchProject } from '../project';

export function arduinoNanoProject(programId: NanoProgramId): WorkbenchProject {
  const project = createEmptyProject(`Arduino Nano ${NANO_PROGRAMS[programId].name}`);
  const hole = (row: Parameters<typeof terminalHoleId>[1], column: number) => terminalHoleId(project.board.id, row, column);
  const wire = (id: string, a: string, b: string, color: 'blue' | 'black' | 'red' = 'blue'): PlacedComponent => ({ id, label: id, kind: 'jumper-wire', rotation: 0, color, terminalHoleIds: { a, b } });
  const components: PlacedComponent[] = [
    { id: 'Nano1', label: 'Nano1', kind: 'arduino-nano', deviceId: 'arduino-nano', packageId: 'NANO-30', rotation: 0, programId, terminalHoleIds: nanoTerminalHoles(project.board.id, 3) },
    { id: 'R1', label: 'R1', kind: 'resistor', rotation: 0, resistanceOhms: 330, tolerancePercent: 5, terminalHoleIds: { a: hole('A', 21), b: hole('A', 25) } },
    { id: 'D1', label: 'D1', kind: 'led', rotation: 0, color: 'red', forwardVoltageV: 1.9, onResistanceOhms: 12, terminalHoleIds: { anode: hole('E', 25), cathode: hole('E', 26) } },
    wire('W-D13', hole('J', 17), hole('B', 21)),
    wire('W-GND', hole('A', 6), hole('B', 26), 'black'),
  ];
  if (programId === 'button-led') components.push(
    { id: 'S1', label: 'Button', kind: 'switch', rotation: 0, closed: false, terminalHoleIds: { a: hole('J', 22), b: hole('J', 25) } },
    wire('W-D2', hole('A', 7), hole('I', 22)), wire('W-button-GND', hole('C', 6), hole('I', 25), 'black'),
  );
  if (programId === 'analog-threshold') components.push(
    { id: 'RV1', label: 'Input', kind: 'potentiometer', rotation: 0, totalResistanceOhms: 10_000, wiperPosition: 0.25, terminalHoleIds: { a: hole('J', 22), wiper: hole('J', 23), b: hole('J', 24) } },
    wire('W-5V', hole('J', 6), hole('I', 22), 'red'), wire('W-A0', hole('J', 14), hole('I', 23)), wire('W-pot-GND', hole('C', 6), hole('I', 24), 'black'),
  );
  return { ...project, powerOn: true, components, simulation: { timeStepSeconds: 0.005, speed: 1 },
    probes: [{ id: 'probe-nano', label: 'D13 output', instrumentId: 'multimeter', positiveHoleId: hole('I', 17), referenceHoleId: hole('B', 6) }],
    analysis: { ...project.analysis, selectedProbeId: 'probe-nano' }, view: { ...project.view, cameraPreset: 'top' },
  };
}
