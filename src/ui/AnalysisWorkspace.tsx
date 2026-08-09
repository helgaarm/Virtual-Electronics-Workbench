import type { BreadboardDefinition } from '../domain/physical/breadboard';
import { getHole } from '../domain/physical/breadboard';
import { MAX_PROJECT_PROBES, type ProbeTerminal, type WorkbenchProject } from '../domain/project';
import { measureComponent, measureProbeVoltage, type MeasurementValue } from '../measurement/dcMeasurements';
import type { ProjectSimulation } from '../simulation';
import {
  createMeasurementProbe,
  probeConnection,
  setProbeConnection,
  swapProbeConnections,
} from '../state/probeActions';
import { WorkbenchCanvas } from '../workbench/scene/WorkbenchCanvas';
import { breadboardHoleOptionGroups } from './breadboardHoleOptions';
import { formatCurrent, formatPower, formatVoltage } from './format';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  simulation: ProjectSimulation;
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
  onEditProject,
  onSwitchToBuild,
}: Props) {
  const selectedProbe = project.probes.find((probe) => probe.id === project.analysis.selectedProbeId)
    ?? project.probes[0];
  const selectedProbeId = selectedProbe?.id;
  const activeTerminal = project.analysis.activeProbeTerminal;
  const activeHoleId = probeConnection(selectedProbe, activeTerminal);
  const probeVoltage = measureProbeVoltage(selectedProbe, simulation.extraction, simulation.result);
  const selectedEndpoints = new Set(
    selectedProbe
      ? [selectedProbe.positiveHoleId, selectedProbe.referenceHoleId].filter((id): id is string => Boolean(id))
      : [],
  );
  const occupiedHoleIds = new Set(
    project.components.flatMap((component) => Object.values(component.terminalHoleIds)),
  );
  const canAddProbe = project.probes.length < MAX_PROJECT_PROBES;
  const holeOptionGroups = breadboardHoleOptionGroups(board);

  const selectProbe = (probeId: string) => {
    onEditProject((current) => ({
      ...current,
      analysis: { ...current.analysis, selectedProbeId: probeId },
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
        <button className="instrument active" aria-pressed="true"><span>V</span><strong>Multimeter</strong><small>DC voltage</small></button>
        <button className="instrument future" disabled><span>⌑</span><strong>Oscilloscope</strong><small>Phase E</small></button>
        <button className="instrument future" disabled><span>∿</span><strong>Signal generator</strong><small>Phase E</small></button>
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
        <div className="meter-card" aria-live="polite">
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
        </section>

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
              <span>{selectedProbe ? `Attach ${activeTerminal === 'positive' ? '+' : 'COM'} lead` : 'Live board'}</span>
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
              probes={project.probes}
              selectedProbeId={selectedProbeId}
              onSelectComponent={() => undefined}
              onSelectHole={connectActiveTerminal}
              onClearSelection={() => undefined}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
