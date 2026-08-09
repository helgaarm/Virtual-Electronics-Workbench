import { useMemo } from 'react';
import type { WorkbenchProject } from '../domain/project';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type {
  OscilloscopeChannelId,
  OscilloscopeChannelSettings,
  OscilloscopeTerminal,
} from '../domain/instruments/types';
import {
  OSCILLOSCOPE_TIME_DIVISIONS_SECONDS,
  OSCILLOSCOPE_VOLTS_PER_DIVISION,
} from '../domain/instruments/types';
import {
  decimateWaveform,
  latestThresholdCrossing,
  measureWaveform,
  oscilloscopeTrace,
  type OscilloscopeTrace,
} from '../measurement/oscilloscope';
import type { CircuitExtraction } from '../simulation/circuitBuilder';
import type { TransientRuntimeController } from '../state/useTransientRuntime';
import { breadboardHoleOptionGroups } from './breadboardHoleOptions';
import { formatVoltage } from './format';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  extraction: CircuitExtraction;
  runtime: TransientRuntimeController;
  onEditProject: (updater: (current: WorkbenchProject) => WorkbenchProject) => void;
}

function formatTime(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1e6).toFixed(0)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(seconds < 0.01 ? 1 : 0)} ms`;
  return `${seconds.toFixed(seconds < 10 ? 2 : 0)} s`;
}

function formatFrequency(frequencyHz: number | undefined): string {
  if (frequencyHz === undefined) return '—';
  if (frequencyHz >= 1_000) return `${(frequencyHz / 1_000).toFixed(2)} kHz`;
  return `${frequencyHz.toFixed(frequencyHz < 10 ? 2 : 1)} Hz`;
}

function chooseDivision(options: readonly number[], target: number): number {
  return options.find((option) => option >= target) ?? options.at(-1) ?? target;
}

function tracePath(
  trace: OscilloscopeTrace,
  startSeconds: number,
  durationSeconds: number,
  voltsPerDivisionV: number,
  offsetV: number,
): string {
  return decimateWaveform(trace.points, 1_600).map((point, index) => {
    const x = (point.timeSeconds - startSeconds) / durationSeconds * 1_000;
    const y = 200 - (point.voltageV - offsetV) / voltsPerDivisionV * 50;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

export function OscilloscopePanel({ project, board, extraction, runtime, onEditProject }: Props) {
  const scope = project.oscilloscope;
  const durationSeconds = scope.timePerDivisionSeconds * 10;
  const latestTimeSeconds = runtime.samples.at(-1)?.timeSeconds ?? runtime.clock.timeSeconds;
  const captureSpanSeconds = Math.max(
    durationSeconds * 3,
    latestTimeSeconds - (runtime.samples[0]?.timeSeconds ?? latestTimeSeconds),
  );
  const triggerChannel = scope.channels[scope.triggerSource];
  const triggerSearch = oscilloscopeTrace(
    triggerChannel,
    extraction,
    runtime.samples,
    latestTimeSeconds,
    captureSpanSeconds,
  );
  const crossing = latestThresholdCrossing(
    triggerSearch.points,
    scope.triggerLevelV,
    scope.triggerEdge,
    latestTimeSeconds - durationSeconds * 0.2,
  );
  const endTimeSeconds = crossing === undefined
    ? latestTimeSeconds
    : crossing + durationSeconds * 0.2;
  const startTimeSeconds = endTimeSeconds - durationSeconds;
  const traces = useMemo(() => ({
    ch1: oscilloscopeTrace(
      scope.channels.ch1,
      extraction,
      runtime.samples,
      endTimeSeconds,
      durationSeconds,
    ),
    ch2: oscilloscopeTrace(
      scope.channels.ch2,
      extraction,
      runtime.samples,
      endTimeSeconds,
      durationSeconds,
    ),
  }), [durationSeconds, endTimeSeconds, extraction, runtime.samples, scope.channels.ch1, scope.channels.ch2]);
  const measurementTraces = useMemo(() => ({
    ch1: oscilloscopeTrace(
      scope.channels.ch1,
      extraction,
      runtime.samples,
      latestTimeSeconds,
      captureSpanSeconds,
    ),
    ch2: oscilloscopeTrace(
      scope.channels.ch2,
      extraction,
      runtime.samples,
      latestTimeSeconds,
      captureSpanSeconds,
    ),
  }), [captureSpanSeconds, extraction, latestTimeSeconds, runtime.samples, scope.channels.ch1, scope.channels.ch2]);
  const measurements = useMemo(() => ({
    ch1: measureWaveform(measurementTraces.ch1.points),
    ch2: measureWaveform(measurementTraces.ch2.points),
  }), [measurementTraces]);
  const activeChannel = scope.channels[scope.activeChannel];
  const activeHoleId = scope.activeTerminal === 'positive'
    ? activeChannel.positiveHoleId
    : activeChannel.referenceHoleId;
  const holeOptionGroups = breadboardHoleOptionGroups(board);

  const editScope = (updater: (current: WorkbenchProject['oscilloscope']) => WorkbenchProject['oscilloscope']) => {
    onEditProject((current) => ({ ...current, oscilloscope: updater(current.oscilloscope) }));
  };

  const editChannel = (
    channelId: OscilloscopeChannelId,
    updater: (channel: OscilloscopeChannelSettings) => OscilloscopeChannelSettings,
  ) => editScope((current) => ({
    ...current,
    channels: { ...current.channels, [channelId]: updater(current.channels[channelId]) },
  }));

  const connectActiveTerminal = (holeId: string | undefined) => editChannel(
    scope.activeChannel,
    (channel) => {
      const next = { ...channel };
      const key = scope.activeTerminal === 'positive' ? 'positiveHoleId' : 'referenceHoleId';
      if (holeId) next[key] = holeId;
      else delete next[key];
      return next;
    },
  );

  const autoScale = () => {
    const firstMeasured = measurements[scope.triggerSource]
      ?? measurements.ch1
      ?? measurements.ch2;
    editScope((current) => ({
      ...current,
      timePerDivisionSeconds: chooseDivision(
        OSCILLOSCOPE_TIME_DIVISIONS_SECONDS,
        firstMeasured?.periodSeconds ? firstMeasured.periodSeconds / 2 : durationSeconds / 10,
      ),
      channels: {
        ch1: {
          ...current.channels.ch1,
          voltsPerDivisionV: chooseDivision(
            OSCILLOSCOPE_VOLTS_PER_DIVISION,
            Math.max(0.01, (measurements.ch1?.peakToPeakV ?? 1) / 6),
          ),
          verticalOffsetV: measurements.ch1?.meanV ?? current.channels.ch1.verticalOffsetV,
        },
        ch2: {
          ...current.channels.ch2,
          voltsPerDivisionV: chooseDivision(
            OSCILLOSCOPE_VOLTS_PER_DIVISION,
            Math.max(0.01, (measurements.ch2?.peakToPeakV ?? 1) / 6),
          ),
          verticalOffsetV: measurements.ch2?.meanV ?? current.channels.ch2.verticalOffsetV,
        },
      },
    }));
  };

  return (
    <section className="scope-panel panel" aria-labelledby="oscilloscope-title">
      <div className="scope-heading">
        <div><span className="eyebrow">Two-channel oscilloscope</span><h2 id="oscilloscope-title">Live transient capture</h2></div>
        <div className="scope-run-controls">
          <button className={runtime.clock.status === 'running' ? 'active' : ''} onClick={runtime.toggleRunning}>
            {runtime.clock.status === 'running' ? 'Stop' : 'Run'}
          </button>
          <button
            onClick={() => runtime.captureOnce(durationSeconds)}
            disabled={runtime.clock.status === 'running' || !runtime.hasTransientDevices}
            title="Clear the capture, acquire one screen span, then stop"
          >Single</button>
          <button onClick={autoScale}>Auto</button>
        </div>
      </div>
      <div className="scope-display-wrap">
        <svg className="scope-display" viewBox="0 0 1000 400" role="img" aria-label="Oscilloscope waveform display">
          <defs><clipPath id="scope-screen"><rect width="1000" height="400" rx="8" /></clipPath></defs>
          <rect width="1000" height="400" rx="8" className="scope-background" />
          {Array.from({ length: 11 }, (_, index) => (
            <line key={`v${index}`} x1={index * 100} x2={index * 100} y1="0" y2="400" className={index === 5 ? 'scope-axis' : 'scope-gridline'} />
          ))}
          {Array.from({ length: 9 }, (_, index) => (
            <line key={`h${index}`} x1="0" x2="1000" y1={index * 50} y2={index * 50} className={index === 4 ? 'scope-axis' : 'scope-gridline'} />
          ))}
          <line x1="800" x2="800" y1="0" y2="400" className="scope-trigger-line" />
          <g clipPath="url(#scope-screen)">
            {scope.channels.ch1.enabled && traces.ch1.points.length > 0 && (
              <path className="scope-trace scope-trace-ch1" d={tracePath(traces.ch1, startTimeSeconds, durationSeconds, scope.channels.ch1.voltsPerDivisionV, scope.channels.ch1.verticalOffsetV)} />
            )}
            {scope.channels.ch2.enabled && traces.ch2.points.length > 0 && (
              <path className="scope-trace scope-trace-ch2" d={tracePath(traces.ch2, startTimeSeconds, durationSeconds, scope.channels.ch2.voltsPerDivisionV, scope.channels.ch2.verticalOffsetV)} />
            )}
          </g>
          <text x="12" y="22" className="scope-screen-label">{formatTime(scope.timePerDivisionSeconds)}/div</text>
          <text x="988" y="22" textAnchor="end" className="scope-screen-label">{runtime.clock.status.toUpperCase()} · {runtime.samples.length} samples</text>
        </svg>
        {traces.ch1.status !== 'valid' && traces.ch2.status !== 'valid' && (
          <p className="scope-empty">{traces.ch1.reason ?? traces.ch2.reason}</p>
        )}
      </div>
      <div className="scope-measurements">
        {(['ch1', 'ch2'] as const).map((channelId) => {
          const channel = scope.channels[channelId];
          const reading = measurements[channelId];
          return (
            <article key={channelId} className={`scope-channel-card ${channelId}`}>
              <div className="scope-channel-title">
                <button onClick={() => editScope((current) => ({ ...current, activeChannel: channelId }))}>{channel.label}</button>
                <label><input type="checkbox" checked={channel.enabled} onChange={(event) => editChannel(channelId, (current) => ({ ...current, enabled: event.target.checked }))} /> Visible</label>
                <select aria-label={`${channel.label} volts per division`} value={channel.voltsPerDivisionV} onChange={(event) => editChannel(channelId, (current) => ({ ...current, voltsPerDivisionV: Number(event.target.value) }))}>
                  {OSCILLOSCOPE_VOLTS_PER_DIVISION.map((value) => <option key={value} value={value}>{formatVoltage(value)}/div</option>)}
                </select>
                <label className="scope-position">Center
                  <input aria-label={`${channel.label} vertical center voltage`} type="number" step="0.1" value={channel.verticalOffsetV} onChange={(event) => editChannel(channelId, (current) => ({ ...current, verticalOffsetV: Number(event.target.value) }))} />
                </label>
              </div>
              <dl>
                <div><dt>Vpp</dt><dd>{reading ? formatVoltage(reading.peakToPeakV) : '—'}</dd></div>
                <div><dt>Mean</dt><dd>{reading ? formatVoltage(reading.meanV) : '—'}</dd></div>
                <div><dt>RMS</dt><dd>{reading ? formatVoltage(reading.rmsV) : '—'}</dd></div>
                <div><dt>Frequency</dt><dd>{formatFrequency(reading?.frequencyHz)}</dd></div>
                <div><dt>Period</dt><dd>{reading?.periodSeconds ? formatTime(reading.periodSeconds) : '—'}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
      <div className="scope-settings">
        <label>Time / div
          <select value={scope.timePerDivisionSeconds} onChange={(event) => editScope((current) => ({ ...current, timePerDivisionSeconds: Number(event.target.value) }))}>
            {OSCILLOSCOPE_TIME_DIVISIONS_SECONDS.map((value) => <option key={value} value={value}>{formatTime(value)}</option>)}
          </select>
        </label>
        <label>Stabilize source
          <select value={scope.triggerSource} onChange={(event) => editScope((current) => ({ ...current, triggerSource: event.target.value as OscilloscopeChannelId }))}>
            <option value="ch1">CH1</option><option value="ch2">CH2</option>
          </select>
        </label>
        <label>Edge
          <select value={scope.triggerEdge} onChange={(event) => editScope((current) => ({ ...current, triggerEdge: event.target.value as 'rising' | 'falling' }))}>
            <option value="rising">Rising</option><option value="falling">Falling</option>
          </select>
        </label>
        <label>Stabilize level
          <input type="number" min="-1000" max="1000" step="0.1" value={scope.triggerLevelV} onChange={(event) => editScope((current) => ({ ...current, triggerLevelV: Number(event.target.value) }))} />
        </label>
        <div className="scope-channel-tabs" aria-label="Channel to connect">
          {(['ch1', 'ch2'] as const).map((channelId) => <button key={channelId} className={scope.activeChannel === channelId ? 'active' : ''} onClick={() => editScope((current) => ({ ...current, activeChannel: channelId }))}>{scope.channels[channelId].label}</button>)}
        </div>
        <div className="probe-terminal-tabs" aria-label="Oscilloscope lead to attach">
          {(['positive', 'reference'] as OscilloscopeTerminal[]).map((terminal) => <button key={terminal} className={scope.activeTerminal === terminal ? `active ${terminal}` : ''} onClick={() => editScope((current) => ({ ...current, activeTerminal: terminal }))}><i />{terminal === 'positive' ? 'Probe' : 'Ground'}</button>)}
        </div>
        <label>Connection
          <select value={activeHoleId ?? ''} onChange={(event) => connectActiveTerminal(event.target.value || undefined)}>
            <option value="">Not connected</option>
            {holeOptionGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.holes.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
    </section>
  );
}
