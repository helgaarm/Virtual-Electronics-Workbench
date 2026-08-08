import type { WorkbenchProject } from '../domain/project';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { ProjectSimulation } from '../simulation';
import { formatCurrent, formatVoltage } from './format';
import { WorkbenchCanvas } from '../workbench/scene/WorkbenchCanvas';

interface Props {
  project: WorkbenchProject;
  board: BreadboardDefinition;
  simulation: ProjectSimulation;
  cameraResetKey: number;
  onSwitchToBuild: () => void;
}

export function AnalysisWorkspace({ project, board, simulation, onSwitchToBuild }: Props) {
  const probe = project.probes[0];
  const positiveNode = probe ? simulation.extraction.holeToNodeId[probe.positiveHoleId] : undefined;
  const referenceNode = probe ? simulation.extraction.holeToNodeId[probe.referenceHoleId] : undefined;
  const probeVoltage = positiveNode && referenceNode
    ? (simulation.result.nodeVoltages[positiveNode] ?? 0) - (simulation.result.nodeVoltages[referenceNode] ?? 0)
    : 0;

  return (
    <main className="analysis-layout">
      <aside className="panel instrument-rack">
        <div className="panel-heading"><span className="eyebrow">Instrument rack</span><h2>DC analysis</h2></div>
        <button className="instrument active"><span>V</span><strong>Multimeter</strong><small>DC voltage</small></button>
        <button className="instrument future" disabled><span>⌁</span><strong>Oscilloscope</strong><small>Phase E</small></button>
        <button className="instrument future" disabled><span>∿</span><strong>Signal generator</strong><small>Phase E</small></button>
      </aside>
      <section className="analysis-main">
        <div className="meter-card">
          <div className="meter-top"><span>DC VOLTAGE</span><span className="meter-status">● LIVE</span></div>
          <div className="meter-value">{formatVoltage(probeVoltage)}</div>
          <div className="meter-probes">
            <span><i className="probe-dot blue" /> + {probe?.positiveHoleId.split(':').at(-1) ?? 'Not connected'}</span>
            <span><i className="probe-dot black" /> COM {probe?.referenceHoleId.split(':').at(-1) ?? 'Not connected'}</span>
          </div>
        </div>
        <div className="analysis-grid">
          <section className="analysis-table panel">
            <div className="panel-heading"><span className="eyebrow">Circuit telemetry</span><h2>Component readings</h2></div>
            <div className="reading-table" role="table">
              {project.components.filter((component) => simulation.result.componentCurrents[component.id] !== undefined).map((component) => (
                <div className="reading-row" role="row" key={component.id}>
                  <strong>{component.label}</strong>
                  <span>{component.kind.replace('-', ' ')}</span>
                  <b>{formatCurrent(simulation.result.componentCurrents[component.id])}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="mini-board panel" aria-label="Live board view">
            <div className="mini-board-label"><span>Live board</span><button onClick={onSwitchToBuild}>Return to Build ↗</button></div>
            <WorkbenchCanvas
              board={board}
              components={project.components}
              result={simulation.result}
              cameraPreset="3d"
              highlightedHoleIds={new Set()}
              occupiedHoleIds={new Set(project.components.flatMap((component) => Object.values(component.terminalHoleIds)))}
              onSelectComponent={() => undefined}
              onSelectHole={() => undefined}
              onClearSelection={() => undefined}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
