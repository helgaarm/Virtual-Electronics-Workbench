import type { WorkbenchProject } from '../domain/project';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { FrequencyCounterTerminal } from '../domain/instruments/types';
import { measureFrequencyCounter } from '../measurement/frequencyCounter';
import type { CircuitExtraction } from '../simulation/circuitBuilder';
import type { TransientRuntimeController } from '../state/useTransientRuntime';
import { breadboardHoleOptionGroups } from './breadboardHoleOptions';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  extraction: CircuitExtraction;
  runtime: TransientRuntimeController;
  onEditProject: (updater: (current: WorkbenchProject) => WorkbenchProject) => void;
}

function frequencyText(frequencyHz: number | undefined): string {
  if (frequencyHz === undefined) return '—';
  if (frequencyHz >= 1e6) return `${(frequencyHz / 1e6).toFixed(5)} MHz`;
  if (frequencyHz >= 1e3) return `${(frequencyHz / 1e3).toFixed(5)} kHz`;
  return `${frequencyHz.toFixed(frequencyHz < 10 ? 5 : 3)} Hz`;
}

function periodText(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(2)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(3)} ms`;
  return `${seconds.toFixed(5)} s`;
}

export function FrequencyCounterPanel({ project, board, extraction, runtime, onEditProject }: Props) {
  const settings = project.frequencyCounter;
  const reading = measureFrequencyCounter(settings, extraction, runtime.samples);
  const activeHoleId = settings.activeTerminal === 'input'
    ? settings.inputHoleId
    : settings.referenceHoleId;
  const holeGroups = breadboardHoleOptionGroups(board);
  const editCounter = (
    updater: (current: WorkbenchProject['frequencyCounter']) => WorkbenchProject['frequencyCounter'],
  ) => onEditProject((current) => ({
    ...current,
    frequencyCounter: updater(current.frequencyCounter),
  }));
  const connect = (holeId: string | undefined) => editCounter((current) => {
    const next = { ...current };
    const key = current.activeTerminal === 'input' ? 'inputHoleId' : 'referenceHoleId';
    if (holeId) next[key] = holeId;
    else delete next[key];
    return next;
  });

  return (
    <section className="counter-panel panel" aria-labelledby="frequency-counter-title">
      <div className="scope-heading">
        <div><span className="eyebrow">Shared waveform measurement</span><h2 id="frequency-counter-title">Frequency counter</h2></div>
        <div className="scope-run-controls">
          <button className={runtime.clock.status === 'running' ? 'active' : ''} onClick={runtime.toggleRunning}>
            {runtime.clock.status === 'running' ? 'Stop' : 'Run'}
          </button>
          <button onClick={runtime.reset}>Clear capture</button>
        </div>
      </div>
      <div className={`counter-display counter-${reading.status}`} aria-live="polite">
        <span>FREQUENCY</span>
        <strong>{frequencyText(reading.frequencyHz)}</strong>
        <dl>
          <div><dt>Period</dt><dd>{periodText(reading.periodSeconds)}</dd></div>
          <div><dt>{settings.triggerEdge === 'rising' ? 'Rising' : 'Falling'} edges</dt><dd>{reading.pulseCount}</dd></div>
        </dl>
        {reading.reason && <p>{reading.reason}</p>}
      </div>
      <div className="scope-settings counter-settings">
        <label>Edge
          <select value={settings.triggerEdge} onChange={(event) => editCounter((current) => ({ ...current, triggerEdge: event.target.value as 'rising' | 'falling' }))}>
            <option value="rising">Rising</option><option value="falling">Falling</option>
          </select>
        </label>
        <label>Threshold
          <input type="number" min="-1000" max="1000" step="0.1" value={settings.triggerLevelV} onChange={(event) => editCounter((current) => ({ ...current, triggerLevelV: Number(event.target.value) }))} />
        </label>
        <div className="probe-terminal-tabs" aria-label="Frequency counter lead to attach">
          {(['input', 'reference'] as FrequencyCounterTerminal[]).map((terminal) => (
            <button key={terminal} className={settings.activeTerminal === terminal ? `active ${terminal === 'input' ? 'positive' : 'reference'}` : ''} onClick={() => editCounter((current) => ({ ...current, activeTerminal: terminal }))}>
              <i />{terminal === 'input' ? 'Input' : 'Reference'}
            </button>
          ))}
        </div>
        <label>Connection
          <select value={activeHoleId ?? ''} onChange={(event) => connect(event.target.value || undefined)}>
            <option value="">Not connected</option>
            {holeGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.holes.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
    </section>
  );
}
