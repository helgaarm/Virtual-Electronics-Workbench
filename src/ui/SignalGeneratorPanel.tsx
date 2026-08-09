import { signalSourceVoltageAtTime } from '../domain/circuit/types';
import type { SignalGeneratorTerminal } from '../domain/instruments/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { WorkbenchProject } from '../domain/project';
import type { TransientRuntimeController } from '../state/useTransientRuntime';
import { breadboardHoleOptionGroups } from './breadboardHoleOptions';
import { formatVoltage } from './format';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  runtime: TransientRuntimeController;
  onEditProject: (updater: (current: WorkbenchProject) => WorkbenchProject) => void;
}

export function SignalGeneratorPanel({ project, board, runtime, onEditProject }: Props) {
  const generator = project.signalGenerator;
  const holeOptionGroups = breadboardHoleOptionGroups(board);
  const activeHoleId = generator.activeTerminal === 'output'
    ? generator.outputHoleId
    : generator.referenceHoleId;
  const instantaneousVoltageV = generator.enabled
    ? signalSourceVoltageAtTime(generator, runtime.clock.timeSeconds)
    : 0;
  const samplesPerCycle = 1 / (generator.frequencyHz * project.simulation.timeStepSeconds);

  const editGenerator = (
    updater: (current: WorkbenchProject['signalGenerator']) => WorkbenchProject['signalGenerator'],
  ) => onEditProject((current) => ({
    ...current,
    signalGenerator: updater(current.signalGenerator),
  }));

  const connectActiveTerminal = (holeId: string | undefined) => editGenerator((current) => {
    const next = { ...current };
    const key = current.activeTerminal === 'output' ? 'outputHoleId' : 'referenceHoleId';
    if (holeId) next[key] = holeId;
    else delete next[key];
    return next;
  });

  return (
    <section className="generator-panel panel" aria-labelledby="signal-generator-title">
      <div className="generator-heading">
        <div><span className="eyebrow">Function generator</span><h2 id="signal-generator-title">Breadboard signal source</h2></div>
        <button
          className={generator.enabled ? 'generator-output active' : 'generator-output'}
          onClick={() => editGenerator((current) => ({ ...current, enabled: !current.enabled }))}
          aria-pressed={generator.enabled}
        >Output {generator.enabled ? 'ON' : 'OFF'}</button>
      </div>
      <div className="generator-readout" aria-live="polite">
        <span>{generator.waveform.toUpperCase()}</span>
        <strong>{formatVoltage(instantaneousVoltageV)}</strong>
        <small>instantaneous output at {runtime.clock.timeSeconds.toFixed(4)} s</small>
      </div>
      <div className="generator-controls">
        <label>Waveform
          <select value={generator.waveform} onChange={(event) => editGenerator((current) => ({ ...current, waveform: event.target.value as 'square' | 'sine' }))}>
            <option value="square">Square</option>
            <option value="sine">Sine</option>
          </select>
        </label>
        <label>Frequency (Hz)
          <input type="number" min="0.01" max="1000" step="0.01" value={generator.frequencyHz} onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= 0.01 && value <= 1_000) editGenerator((current) => ({ ...current, frequencyHz: value }));
          }} />
        </label>
        <label>Amplitude (Vpp)
          <input type="number" min="0" max="200" step="0.1" value={generator.amplitudeVpp} onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= 0 && value <= 200) editGenerator((current) => ({ ...current, amplitudeVpp: value }));
          }} />
        </label>
        <label>Offset (V)
          <input type="number" min="-100" max="100" step="0.1" value={generator.offsetV} onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= -100 && value <= 100) editGenerator((current) => ({ ...current, offsetV: value }));
          }} />
        </label>
      </div>
      {samplesPerCycle < 20 && (
        <p className="generator-warning">Increase simulation resolution: this frequency has only {samplesPerCycle.toFixed(1)} samples per cycle. Choose a smaller Step value in the footer.</p>
      )}
      <div className="generator-connections">
        <div className="probe-terminal-tabs" aria-label="Signal-generator lead to attach">
          {(['output', 'reference'] as SignalGeneratorTerminal[]).map((terminal) => (
            <button key={terminal} className={generator.activeTerminal === terminal ? `active ${terminal === 'output' ? 'positive' : 'reference'}` : ''} onClick={() => editGenerator((current) => ({ ...current, activeTerminal: terminal }))}>
              <i />{terminal === 'output' ? 'Output' : 'Common'}
            </button>
          ))}
        </div>
        <label>{generator.activeTerminal === 'output' ? 'Output hole' : 'Common hole'}
          <select value={activeHoleId ?? ''} onChange={(event) => connectActiveTerminal(event.target.value || undefined)}>
            <option value="">Not connected</option>
            {holeOptionGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.holes.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
      <p className="generator-note">The output is an ideal voltage source connected to these physical breadboard holes. Its waveform is solved by MNA at every transient timestep.</p>
    </section>
  );
}
