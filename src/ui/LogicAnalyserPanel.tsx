import { useMemo } from 'react';
import type {
  LogicAnalyserChannelId,
  LogicAnalyserChannelSettings,
  LogicAnalyserTerminal,
} from '../domain/instruments/types';
import {
  LOGIC_ANALYSER_SAMPLE_RATES_HZ,
  LOGIC_ANALYSER_TIME_DIVISIONS_SECONDS,
} from '../domain/instruments/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { WorkbenchProject } from '../domain/project';
import {
  latestDigitalTrigger,
  logicAnalyserTrace,
  type DigitalTrace,
} from '../measurement/logicAnalyser';
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

const CHANNEL_IDS = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'] as const;

function timeText(seconds: number): string {
  if (seconds < 1e-3) return `${seconds * 1e6} µs`;
  if (seconds < 1) return `${seconds * 1e3} ms`;
  return `${seconds} s`;
}

function rateText(rateHz: number): string {
  return rateHz >= 1_000 ? `${rateHz / 1_000} kS/s` : `${rateHz} S/s`;
}

function tracePath(
  trace: DigitalTrace,
  row: number,
  startSeconds: number,
  durationSeconds: number,
): string {
  const baseY = 31 + row * 43;
  return trace.points.map((point, index) => {
    const x = Math.max(0, Math.min(1000, (point.timeSeconds - startSeconds) / durationSeconds * 1000));
    const y = baseY + (point.level === 'high' ? -11 : point.level === 'low' ? 11 : 0);
    if (index === 0) return `M${x.toFixed(2)} ${y}`;
    return `H${x.toFixed(2)} V${y}`;
  }).join(' ');
}

export function LogicAnalyserPanel({ project, board, extraction, runtime, onEditProject }: Props) {
  const settings = project.logicAnalyser;
  const latestTime = runtime.samples.at(-1)?.timeSeconds ?? runtime.clock.timeSeconds;
  const duration = settings.timePerDivisionSeconds * 10;
  const fullStart = runtime.samples[0]?.timeSeconds ?? latestTime;
  const triggerChannel = settings.channels[settings.triggerSource];
  const triggerTrace = useMemo(() => logicAnalyserTrace(
    triggerChannel,
    settings.referenceHoleId,
    extraction,
    runtime.samples,
    fullStart,
    latestTime,
    settings.sampleRateHz,
    settings.lowThresholdV,
    settings.highThresholdV,
  ), [extraction, fullStart, latestTime, runtime.samples, settings.highThresholdV, settings.lowThresholdV, settings.referenceHoleId, settings.sampleRateHz, triggerChannel]);
  const triggerTime = settings.triggerEnabled
    ? latestDigitalTrigger(triggerTrace.points, settings.triggerEdge, latestTime - duration * 0.2)
    : undefined;
  const endTime = triggerTime === undefined ? latestTime : triggerTime + duration * 0.2;
  const startTime = endTime - duration;
  const traces = useMemo(() => Object.fromEntries(CHANNEL_IDS.map((channelId) => [
    channelId,
    logicAnalyserTrace(
      settings.channels[channelId],
      settings.referenceHoleId,
      extraction,
      runtime.samples,
      startTime,
      endTime,
      settings.sampleRateHz,
      settings.lowThresholdV,
      settings.highThresholdV,
    ),
  ])) as Record<LogicAnalyserChannelId, DigitalTrace>, [endTime, extraction, runtime.samples, settings.channels, settings.highThresholdV, settings.lowThresholdV, settings.referenceHoleId, settings.sampleRateHz, startTime]);
  const activeChannel = settings.channels[settings.activeChannel];
  const activeHoleId = settings.activeTerminal === 'input'
    ? activeChannel.inputHoleId
    : settings.referenceHoleId;
  const holeGroups = breadboardHoleOptionGroups(board);

  const editAnalyser = (
    updater: (current: WorkbenchProject['logicAnalyser']) => WorkbenchProject['logicAnalyser'],
  ) => onEditProject((current) => ({
    ...current,
    logicAnalyser: updater(current.logicAnalyser),
  }));
  const editChannel = (
    channelId: LogicAnalyserChannelId,
    updater: (channel: LogicAnalyserChannelSettings) => LogicAnalyserChannelSettings,
  ) => editAnalyser((current) => ({
    ...current,
    channels: { ...current.channels, [channelId]: updater(current.channels[channelId]) },
  }));
  const connect = (holeId: string | undefined) => editAnalyser((current) => {
    if (current.activeTerminal === 'reference') {
      const next = { ...current };
      if (holeId) next.referenceHoleId = holeId;
      else delete next.referenceHoleId;
      return next;
    }
    const channel = { ...current.channels[current.activeChannel] };
    if (holeId) channel.inputHoleId = holeId;
    else delete channel.inputHoleId;
    return {
      ...current,
      channels: { ...current.channels, [current.activeChannel]: channel },
    };
  });
  const invalidThresholds = settings.lowThresholdV >= settings.highThresholdV;

  return (
    <section className="logic-panel panel" aria-labelledby="logic-analyser-title">
      <div className="scope-heading">
        <div><span className="eyebrow">Eight-channel digital measurement</span><h2 id="logic-analyser-title">Logic analyser</h2></div>
        <div className="scope-run-controls">
          <button className={runtime.clock.status === 'running' ? 'active' : ''} onClick={runtime.toggleRunning}>{runtime.clock.status === 'running' ? 'Stop' : 'Run'}</button>
          <button onClick={() => runtime.captureOnce(duration)} disabled={runtime.clock.status === 'running'}>Single</button>
        </div>
      </div>
      <div className="logic-display-wrap">
        <svg className="logic-display" viewBox="0 0 1000 360" role="img" aria-label="Eight-channel logic trace display">
          <rect width="1000" height="360" rx="8" className="scope-background" />
          {Array.from({ length: 11 }, (_, index) => <line key={index} x1={index * 100} x2={index * 100} y1="0" y2="360" className="scope-gridline" />)}
          {CHANNEL_IDS.map((channelId, index) => {
            const channel = settings.channels[channelId];
            return channel.enabled && <g key={channelId}>
              <line x1="0" x2="1000" y1={43 + index * 43} y2={43 + index * 43} className="logic-row-line" />
              <text x="9" y={35 + index * 43} className="logic-label">{channel.label}</text>
              <path d={tracePath(traces[channelId], index, startTime, duration)} className={`logic-trace logic-trace-${(index % 4) + 1}`} />
            </g>;
          })}
          {triggerTime !== undefined && <line x1="800" x2="800" y1="0" y2="360" className="scope-trigger-line" />}
          <text x="988" y="18" textAnchor="end" className="scope-screen-label">{rateText(settings.sampleRateHz)} · {runtime.clock.status.toUpperCase()}</text>
        </svg>
        {invalidThresholds && <p className="scope-empty">HIGH threshold must be above LOW threshold.</p>}
      </div>
      <div className="logic-channel-tabs" aria-label="Logic channel to configure">
        {CHANNEL_IDS.map((channelId) => {
          const channel = settings.channels[channelId];
          return <button key={channelId} className={settings.activeChannel === channelId ? 'active' : ''} onClick={() => editAnalyser((current) => ({ ...current, activeChannel: channelId }))}>{channel.label}</button>;
        })}
      </div>
      <div className="logic-controls">
        <label className="logic-visible"><input type="checkbox" checked={activeChannel.enabled} onChange={(event) => editChannel(activeChannel.id, (channel) => ({ ...channel, enabled: event.target.checked }))} /> Show {activeChannel.label}</label>
        <label>Channel label<input maxLength={20} value={activeChannel.label} onChange={(event) => editChannel(activeChannel.id, (channel) => ({ ...channel, label: event.target.value }))} /></label>
        <div className="probe-terminal-tabs" aria-label="Logic analyser lead to attach">
          {(['input', 'reference'] as LogicAnalyserTerminal[]).map((terminal) => <button key={terminal} className={settings.activeTerminal === terminal ? `active ${terminal === 'input' ? 'positive' : 'reference'}` : ''} onClick={() => editAnalyser((current) => ({ ...current, activeTerminal: terminal }))}><i />{terminal === 'input' ? activeChannel.label : 'Reference'}</button>)}
        </div>
        <label>Connection<select value={activeHoleId ?? ''} onChange={(event) => connect(event.target.value || undefined)}><option value="">Not connected</option>{holeGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.holes.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}</optgroup>)}</select></label>
        <label>Sample rate<select value={settings.sampleRateHz} onChange={(event) => editAnalyser((current) => ({ ...current, sampleRateHz: Number(event.target.value) }))}>{LOGIC_ANALYSER_SAMPLE_RATES_HZ.map((rate) => <option key={rate} value={rate}>{rateText(rate)}</option>)}</select></label>
        <label>Zoom<select value={settings.timePerDivisionSeconds} onChange={(event) => editAnalyser((current) => ({ ...current, timePerDivisionSeconds: Number(event.target.value) }))}>{LOGIC_ANALYSER_TIME_DIVISIONS_SECONDS.map((value) => <option key={value} value={value}>{timeText(value)}/div</option>)}</select></label>
        <label>LOW below<input type="number" min="-1000" max="999.99" step="0.1" value={settings.lowThresholdV} onChange={(event) => editAnalyser((current) => ({ ...current, lowThresholdV: Math.max(-1_000, Math.min(Number(event.target.value), current.highThresholdV - 0.01)) }))} /></label>
        <label>HIGH above<input type="number" min="-999.99" max="1000" step="0.1" value={settings.highThresholdV} onChange={(event) => editAnalyser((current) => ({ ...current, highThresholdV: Math.min(1_000, Math.max(Number(event.target.value), current.lowThresholdV + 0.01)) }))} /></label>
        <label className="logic-visible"><input type="checkbox" checked={settings.triggerEnabled} onChange={(event) => editAnalyser((current) => ({ ...current, triggerEnabled: event.target.checked }))} /> Trigger</label>
        <label>Source<select value={settings.triggerSource} onChange={(event) => editAnalyser((current) => ({ ...current, triggerSource: event.target.value as LogicAnalyserChannelId }))}>{CHANNEL_IDS.map((id) => <option key={id} value={id}>{settings.channels[id].label}</option>)}</select></label>
        <label>Edge<select value={settings.triggerEdge} onChange={(event) => editAnalyser((current) => ({ ...current, triggerEdge: event.target.value as 'rising' | 'falling' }))}><option value="rising">Rising</option><option value="falling">Falling</option></select></label>
      </div>
      <p className="logic-legend"><span>HIGH &gt; {settings.highThresholdV} V</span><span>LOW &lt; {settings.lowThresholdV} V</span><span>Between thresholds: undefined</span></p>
    </section>
  );
}
