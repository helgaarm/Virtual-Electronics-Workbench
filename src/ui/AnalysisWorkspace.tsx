import type { BreadboardDefinition } from '../domain/physical/breadboard';
import { getHole } from '../domain/physical/breadboard';
import { MAX_PROJECT_PROBES, type ProbeTerminal, type WorkbenchProject } from '../domain/project';
import type { AnalysisInstrumentId } from '../domain/instruments/types';
import { measureComponent, measureProbeVoltage, type MeasurementValue } from '../measurement/dcMeasurements';
import type { ProjectSimulation } from '../simulation';
import {
  createMeasurementProbe,
  probeConnection,
  setProbeConnection,
  swapProbeConnections,
} from '../state/probeActions';
import {
  activeInstrumentMarkerId,
  instrumentProbeMarkers,
} from '../state/instrumentSelectors';
import type { TransientRuntimeController } from '../state/useTransientRuntime';
import { WorkbenchCanvas } from '../workbench/scene/WorkbenchCanvas';
import { breadboardHoleOptionGroups } from './breadboardHoleOptions';
import { formatCurrent, formatPower, formatVoltage } from './format';
import { FrequencyCounterPanel } from './FrequencyCounterPanel';
import { LogicAnalyserPanel } from './LogicAnalyserPanel';
import { OscilloscopePanel } from './OscilloscopePanel';
import { SignalGeneratorPanel } from './SignalGeneratorPanel';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  simulation: ProjectSimulation;
  transientRuntime: TransientRuntimeController;
  onEditProject: (updater: (current: WorkbenchProject) => WorkbenchProject) => void;
  onSwitchToBuild: () => void;
}

function voltageText(reading: MeasurementValue): string {
  return reading.status === 'valid' && reading.value !== undefined ? formatVoltage(reading.value) : '—';
}

function readingText(reading: MeasurementValue, formatter: (value: number) => string): string {
  return reading.status === 'valid' && reading.value !== undefined ? formatter(reading.value) : 'N/A';
}

function holeLabel(board: BreadboardDefinition, holeId: string | undefined): string {
  return holeId ? getHole(board, holeId)?.label ?? 'Unknown hole' : 'Not connected';
}

export function AnalysisWorkspace({
  project,
  board,
  simulation,
  transientRuntime,
  onEditProject,
  onSwitchToBuild,
}: Props) {
  const selectedProbe = project.probes.find((probe) => probe.id === project.analysis.selectedProbeId)
    ?? project.probes[0];
  const selectedProbeId = selectedProbe?.id;
  const activeTerminal = project.analysis.activeProbeTerminal;
  const multimeterActiveHoleId = probeConnection(selectedProbe, activeTerminal);
  const probeVoltage = measureProbeVoltage(selectedProbe, simulation.extraction, simulation.result);
  const activeScopeChannel = project.oscilloscope.channels[project.oscilloscope.activeChannel];
  const activeLogicChannel = project.logicAnalyser.channels[project.logicAnalyser.activeChannel];
  const activeHoleId = project.analysis.activeInstrument === 'multimeter'
    ? multimeterActiveHoleId
    : project.analysis.activeInstrument === 'oscilloscope'
      ? project.oscilloscope.activeTerminal === 'positive'
        ? activeScopeChannel.positiveHoleId
        : activeScopeChannel.referenceHoleId
      : project.analysis.activeInstrument === 'signal-generator'
        ? project.signalGenerator.activeTerminal === 'output'
          ? project.signalGenerator.outputHoleId
          : project.signalGenerator.referenceHoleId
        : project.analysis.activeInstrument === 'frequency-counter'
          ? project.frequencyCounter.activeTerminal === 'input'
            ? project.frequencyCounter.inputHoleId
            : project.frequencyCounter.referenceHoleId
          : project.logicAnalyser.activeTerminal === 'input'
            ? activeLogicChannel.inputHoleId
            : project.logicAnalyser.referenceHoleId;
  const selectedEndpoints = new Set(
    (project.analysis.activeInstrument === 'multimeter'
      ? selectedProbe ? [selectedProbe.positiveHoleId, selectedProbe.referenceHoleId] : []
      : project.analysis.activeInstrument === 'oscilloscope'
        ? [activeScopeChannel.positiveHoleId, activeScopeChannel.referenceHoleId]
        : project.analysis.activeInstrument === 'signal-generator'
          ? [project.signalGenerator.outputHoleId, project.signalGenerator.referenceHoleId]
          : project.analysis.activeInstrument === 'frequency-counter'
            ? [project.frequencyCounter.inputHoleId, project.frequencyCounter.referenceHoleId]
            : [activeLogicChannel.inputHoleId, project.logicAnalyser.referenceHoleId]
    ).filter((id): id is string => Boolean(id)),
  );
  const occupiedHoleIds = new Set(
    project.components.flatMap((component) => Object.values(component.terminalHoleIds)),
  );
  const canAddProbe = project.probes.length < MAX_PROJECT_PROBES;
  const holeOptionGroups = breadboardHoleOptionGroups(board);
  const probeMarkers = instrumentProbeMarkers(project);
  const selectedMarkerId = activeInstrumentMarkerId(project);

  const selectInstrument = (activeInstrument: AnalysisInstrumentId) => {
    onEditProject((current) => ({
      ...current,
      analysis: { ...current.analysis, activeInstrument },
    }));
  };

  const selectProbe = (probeId: string) => {
    onEditProject((current) => ({
      ...current,
      analysis: { ...current.analysis, activeInstrument: 'multimeter', selectedProbeId: probeId },
    }));
  };

  const addProbe = () => {
    if (!canAddProbe) return;
    onEditProject((current) => {
      const probe = createMeasurementProbe(current.probes);
      return {
        ...current,
        probes: [...current.probes, probe],
        analysis: {
          ...current.analysis,
          activeInstrument: 'multimeter',
          selectedProbeId: probe.id,
          activeProbeTerminal: 'positive',
        },
      };
    });
  };

  const editSelectedProbe = (updater: (probe: NonNullable<typeof selectedProbe>) => NonNullable<typeof selectedProbe>) => {
    if (!selectedProbeId) return;
    onEditProject((current) => ({
      ...current,
      probes: current.probes.map((probe) => probe.id === selectedProbeId ? updater(probe) : probe),
    }));
  };

  const setActiveTerminal = (terminal: ProbeTerminal) => {
    onEditProject((current) => ({
      ...current,
      analysis: { ...current.analysis, activeProbeTerminal: terminal },
    }));
  };

  const connectActiveTerminal = (holeId: string | undefined) => {
    editSelectedProbe((probe) => setProbeConnection(probe, activeTerminal, holeId));
  };

  const connectActiveInstrumentTerminal = (holeId: string | undefined) => {
    if (project.analysis.activeInstrument === 'multimeter') {
      connectActiveTerminal(holeId);
      return;
    }
    if (project.analysis.activeInstrument === 'oscilloscope') {
      onEditProject((current) => {
        const channelId = current.oscilloscope.activeChannel;
        const channel = { ...current.oscilloscope.channels[channelId] };
        const key = current.oscilloscope.activeTerminal === 'positive'
          ? 'positiveHoleId'
          : 'referenceHoleId';
        if (holeId) channel[key] = holeId;
        else delete channel[key];
        return {
          ...current,
          oscilloscope: {
            ...current.oscilloscope,
            channels: { ...current.oscilloscope.channels, [channelId]: channel },
          },
        };
      });
      return;
    }
    if (project.analysis.activeInstrument === 'signal-generator') {
      onEditProject((current) => {
        const signalGenerator = { ...current.signalGenerator };
        const key = signalGenerator.activeTerminal === 'output' ? 'outputHoleId' : 'referenceHoleId';
        if (holeId) signalGenerator[key] = holeId;
        else delete signalGenerator[key];
        return { ...current, signalGenerator };
      });
      return;
    }
    if (project.analysis.activeInstrument === 'frequency-counter') {
      onEditProject((current) => {
        const frequencyCounter = { ...current.frequencyCounter };
        const key = frequencyCounter.activeTerminal === 'input' ? 'inputHoleId' : 'referenceHoleId';
        if (holeId) frequencyCounter[key] = holeId;
        else delete frequencyCounter[key];
        return { ...current, frequencyCounter };
      });
      return;
    }
    onEditProject((current) => {
      const logicAnalyser = { ...current.logicAnalyser };
      if (logicAnalyser.activeTerminal === 'reference') {
        if (holeId) logicAnalyser.referenceHoleId = holeId;
        else delete logicAnalyser.referenceHoleId;
        return { ...current, logicAnalyser };
      }
      const channel = { ...logicAnalyser.channels[logicAnalyser.activeChannel] };
      if (holeId) channel.inputHoleId = holeId;
      else delete channel.inputHoleId;
      logicAnalyser.channels = {
        ...logicAnalyser.channels,
        [logicAnalyser.activeChannel]: channel,
      };
      return { ...current, logicAnalyser };
    });
  };

  const deleteSelectedProbe = () => {
    if (!selectedProbeId) return;
    onEditProject((current) => {
      const probes = current.probes.filter((probe) => probe.id !== selectedProbeId);
      return {
        ...current,
        probes,
        analysis: {
          activeInstrument: current.analysis.activeInstrument,
          activeProbeTerminal: current.analysis.activeProbeTerminal,
          ...(probes[0] ? { selectedProbeId: probes[0].id } : {}),
        },
      };
    });
  };

  return (
    <main className="analysis-layout">
      <aside className="panel instrument-rack">
        <div className="panel-heading"><span className="eyebrow">Instrument rack</span><h2>Test &amp; Analysis</h2></div>
        <button className={project.analysis.activeInstrument === 'multimeter' ? 'instrument active' : 'instrument'} aria-pressed={project.analysis.activeInstrument === 'multimeter'} onClick={() => selectInstrument('multimeter')}><span>V</span><strong>Multimeter</strong><small>DC voltage</small></button>
        <button className={project.analysis.activeInstrument === 'oscilloscope' ? 'instrument active' : 'instrument'} aria-pressed={project.analysis.activeInstrument === 'oscilloscope'} onClick={() => selectInstrument('oscilloscope')}><span>⌁</span><strong>Oscilloscope</strong><small>CH1 + CH2</small></button>
        <button className={project.analysis.activeInstrument === 'signal-generator' ? 'instrument active' : 'instrument'} aria-pressed={project.analysis.activeInstrument === 'signal-generator'} onClick={() => selectInstrument('signal-generator')}><span>∿</span><strong>Signal generator</strong><small>Square + sine</small></button>
        <button className={project.analysis.activeInstrument === 'frequency-counter' ? 'instrument active' : 'instrument'} aria-pressed={project.analysis.activeInstrument === 'frequency-counter'} onClick={() => selectInstrument('frequency-counter')}><span>Hz</span><strong>Frequency counter</strong><small>Frequency + period</small></button>
        <button className={project.analysis.activeInstrument === 'logic-analyser' ? 'instrument active' : 'instrument'} aria-pressed={project.analysis.activeInstrument === 'logic-analyser'} onClick={() => selectInstrument('logic-analyser')}><span>01</span><strong>Logic analyser</strong><small>8 digital channels</small></button>
        <div className="probe-rack">
          <div className="probe-rack-heading"><span>Saved readings</span><button onClick={addProbe} disabled={!canAddProbe}>+ Add</button></div>
          {project.probes.length === 0 && <p>No voltage probes yet.</p>}
          {project.probes.map((probe) => {
            const reading = measureProbeVoltage(probe, simulation.extraction, simulation.result);
            return (
              <button
                key={probe.id}
                className={probe.id === selectedProbeId ? 'probe-slot active' : 'probe-slot'}
                onClick={() => selectProbe(probe.id)}
                aria-pressed={probe.id === selectedProbeId}
              >
                <span><i />{probe.label}</span>
                <strong>{voltageText(reading)}</strong>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="analysis-main">
        {project.analysis.activeInstrument === 'multimeter' && <><div className="meter-card" aria-live="polite">
          <div className="meter-top">
            <span>DC VOLTAGE</span>
            <span className={`meter-status meter-${probeVoltage.status}`}>
              ● {probeVoltage.status === 'valid' ? 'LIVE' : probeVoltage.status.replace('-', ' ').toUpperCase()}
            </span>
          </div>
          <div className="meter-value" title={probeVoltage.reason}>{voltageText(probeVoltage)}</div>
          <div className="meter-probes">
            <span><i className="probe-dot blue" /> + {holeLabel(board, selectedProbe?.positiveHoleId)}</span>
            <span><i className="probe-dot black" /> COM {holeLabel(board, selectedProbe?.referenceHoleId)}</span>
          </div>
          {probeVoltage.reason && <p className="meter-reason">{probeVoltage.reason}</p>}
        </div>

        <section className="probe-workflow panel" aria-labelledby="probe-workflow-title">
          <div className="probe-workflow-heading">
            <div><span className="eyebrow">Probe workflow</span><h2 id="probe-workflow-title">Connect the multimeter</h2></div>
            <button className="add-probe-button" onClick={addProbe} disabled={!canAddProbe}>Add voltage probe</button>
          </div>
          {!selectedProbe ? (
            <div className="probe-empty"><strong>Add a voltage probe to begin.</strong><span>Then attach its + and COM leads to breadboard holes.</span></div>
          ) : (
            <div className="probe-controls">
              <label className="probe-name">
                <span>Reading name</span>
                <input
                  key={selectedProbe.id}
                  defaultValue={selectedProbe.label}
                  maxLength={80}
                  onBlur={(event) => {
                    const label = event.target.value.trim();
                    if (!label) {
                      event.target.value = selectedProbe.label;
                      return;
                    }
                    if (label !== selectedProbe.label) editSelectedProbe((probe) => ({ ...probe, label }));
                  }}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                />
              </label>
              <div className="probe-terminal-tabs" aria-label="Lead to attach">
                <button
                  className={activeTerminal === 'positive' ? 'active positive' : ''}
                  onClick={() => setActiveTerminal('positive')}
                  aria-pressed={activeTerminal === 'positive'}
                ><i />Positive (+)</button>
                <button
                  className={activeTerminal === 'reference' ? 'active reference' : ''}
                  onClick={() => setActiveTerminal('reference')}
                  aria-pressed={activeTerminal === 'reference'}
                ><i />Common (COM)</button>
              </div>
              <label className="probe-hole-select">
                <span>{activeTerminal === 'positive' ? 'Positive lead hole' : 'COM lead hole'}</span>
                <select value={activeHoleId ?? ''} onChange={(event) => connectActiveTerminal(event.target.value || undefined)}>
                  <option value="">Not connected</option>
                  {holeOptionGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.holes.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p className="probe-instruction">
                Select a lead above, then click a hole in the live board or choose its printed label. Probe leads do not occupy the hole.
              </p>
              <div className="probe-actions">
                <button onClick={() => editSelectedProbe(swapProbeConnections)}>Swap leads</button>
                <button onClick={() => connectActiveTerminal(undefined)} disabled={!activeHoleId}>Disconnect {activeTerminal === 'positive' ? '+' : 'COM'}</button>
                <button className="danger-quiet" onClick={deleteSelectedProbe}>Delete reading</button>
              </div>
            </div>
          )}
        </section></>}

        {project.analysis.activeInstrument === 'oscilloscope' && (
          <OscilloscopePanel
            project={project}
            board={board}
            extraction={simulation.extraction}
            runtime={transientRuntime}
            onEditProject={onEditProject}
          />
        )}

        {project.analysis.activeInstrument === 'signal-generator' && (
          <SignalGeneratorPanel
            project={project}
            board={board}
            runtime={transientRuntime}
            onEditProject={onEditProject}
          />
        )}

        {project.analysis.activeInstrument === 'frequency-counter' && (
          <FrequencyCounterPanel
            project={project}
            board={board}
            extraction={simulation.extraction}
            runtime={transientRuntime}
            onEditProject={onEditProject}
          />
        )}

        {project.analysis.activeInstrument === 'logic-analyser' && (
          <LogicAnalyserPanel
            project={project}
            board={board}
            extraction={simulation.extraction}
            runtime={transientRuntime}
            onEditProject={onEditProject}
          />
        )}

        <div className="analysis-grid">
          <section className="analysis-table panel">
            <div className="panel-heading"><span className="eyebrow">Circuit telemetry</span><h2>Component readings</h2></div>
            <div className="component-table-wrap">
              <table className="component-table">
                <thead><tr><th>Part</th><th>Type</th><th>Voltage</th><th>Current</th><th>Power</th></tr></thead>
                <tbody>
                  {project.components.map((component) => {
                    const reading = measureComponent(component, simulation.extraction, simulation.result);
                    return (
                      <tr key={component.id} title={reading.current.reason}>
                        <th scope="row">{component.label}</th>
                        <td>{component.kind.replace('-', ' ')}</td>
                        <td>{readingText(reading.voltage, formatVoltage)}</td>
                        <td>{readingText(reading.current, formatCurrent)}</td>
                        <td>{readingText(reading.power, formatPower)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="mini-board panel" aria-label="Live board view">
            <div className="mini-board-label">
              <span>{project.analysis.activeInstrument === 'multimeter'
                ? selectedProbe ? `Attach ${activeTerminal === 'positive' ? '+' : 'COM'} lead` : 'Live board'
                : project.analysis.activeInstrument === 'oscilloscope'
                  ? `Attach ${activeScopeChannel.label} ${project.oscilloscope.activeTerminal === 'positive' ? 'probe' : 'ground'}`
                  : project.analysis.activeInstrument === 'signal-generator'
                    ? `Attach generator ${project.signalGenerator.activeTerminal === 'output' ? 'output' : 'common'}`
                    : project.analysis.activeInstrument === 'frequency-counter'
                      ? `Attach counter ${project.frequencyCounter.activeTerminal}`
                      : `Attach ${activeLogicChannel.label} ${project.logicAnalyser.activeTerminal}`}</span>
              <button onClick={onSwitchToBuild}>Return to Build ↗</button>
            </div>
            <WorkbenchCanvas
              board={board}
              components={project.components}
              result={simulation.result}
              cameraPreset="3d"
              selectedHoleId={activeHoleId}
              highlightedHoleIds={selectedEndpoints}
              occupiedHoleIds={occupiedHoleIds}
              probes={probeMarkers}
              selectedProbeId={selectedMarkerId}
              onSelectComponent={() => undefined}
              onSelectHole={connectActiveInstrumentTerminal}
              onClearSelection={() => undefined}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
