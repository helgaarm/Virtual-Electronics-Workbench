import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { SimulationResult } from '../domain/circuit/types';
import { formatCurrent, formatResistance, formatVoltage } from './format';

interface Props {
  component?: PlacedComponent;
  board: BreadboardDefinition;
  result: SimulationResult;
  terminalNodes?: Record<string, string>;
  onUpdate: (component: PlacedComponent) => void;
  onRotate: () => void;
  onDelete: () => void;
}

function selectedVoltage(
  component: PlacedComponent,
  terminalNodes: Record<string, string> | undefined,
  result: SimulationResult,
): number {
  const entries = terminalEntries(component);
  if (!terminalNodes || entries.length < 2) return 0;
  return (
    (result.nodeVoltages[terminalNodes[entries[0][0]]] ?? 0) -
    (result.nodeVoltages[terminalNodes[entries[1][0]]] ?? 0)
  );
}

export function Inspector({ component, board, result, terminalNodes, onUpdate, onRotate, onDelete }: Props) {
  if (!component) {
    return (
      <aside className="panel inspector empty-inspector" aria-label="Inspector">
        <div className="panel-heading"><span className="eyebrow">Inspector</span><h2>No selection</h2></div>
        <div className="empty-symbol">⌁</div>
        <p>Select a component to inspect its placement and live electrical values.</p>
      </aside>
    );
  }

  const voltage = selectedVoltage(component, terminalNodes, result);
  const current = result.componentCurrents[component.id] ?? 0;
  const allHoles = [...board.holes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const updateTerminal = (terminal: string, holeId: string) => {
    onUpdate({
      ...component,
      terminalHoleIds: { ...component.terminalHoleIds, [terminal]: holeId },
    } as PlacedComponent);
  };

  return (
    <aside className="panel inspector" aria-label={`${component.label} inspector`}>
      <div className="panel-heading inspector-title">
        <div><span className="eyebrow">Selected component</span><h2>{component.label}</h2></div>
        <span className="kind-badge">{component.kind.replace('-', ' ')}</span>
      </div>

      {component.kind === 'resistor' && (
        <section className="inspector-section">
          <label htmlFor="resistance">Resistance</label>
          <div className="input-with-unit">
            <input id="resistance" type="number" min="1" step="10" value={component.resistanceOhms}
              onChange={(event) => onUpdate({ ...component, resistanceOhms: Math.max(1, Number(event.target.value)) })} />
            <span>Ω</span>
          </div>
          <small>{formatResistance(component.resistanceOhms)} · {component.tolerancePercent}% tolerance</small>
        </section>
      )}

      {component.kind === 'voltage-source' && (
        <section className="inspector-section">
          <label htmlFor="voltage-source">Output voltage</label>
          <div className="input-with-unit">
            <input id="voltage-source" type="number" min="0" max="24" step="0.1" value={component.voltageV}
              onChange={(event) => onUpdate({ ...component, voltageV: Math.max(0, Number(event.target.value)) })} />
            <span>V</span>
          </div>
        </section>
      )}

      {component.kind === 'switch' && (
        <section className="inspector-section switch-control">
          <span>Contact</span>
          <button className={component.closed ? 'state-button is-on' : 'state-button'} onClick={() => onUpdate({ ...component, closed: !component.closed })}>
            {component.closed ? 'Closed · conducting' : 'Open · no current'}
          </button>
        </section>
      )}

      <section className="inspector-section">
        <div className="section-label">Breadboard connections</div>
        <div className="terminal-list">
          {terminalEntries(component).map(([terminal, holeId]) => (
            <label key={terminal}>
              <span>{terminal}</span>
              <select value={holeId} onChange={(event) => updateTerminal(terminal, event.target.value)}>
                {allHoles.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="inspector-section measurements">
        <div className="section-label">Live simulation</div>
        <dl>
          <div><dt>Voltage drop</dt><dd>{formatVoltage(voltage)}</dd></div>
          <div><dt>Current</dt><dd>{formatCurrent(current)}</dd></div>
          <div><dt>Power</dt><dd>{Math.abs((result.componentPowers[component.id] ?? 0) * 1_000).toFixed(2)} mW</dd></div>
        </dl>
      </section>

      <div className="inspector-actions">
        <button onClick={onRotate} title="Rotate 90 degrees">↻ Rotate</button>
        <button className="danger-quiet" onClick={onDelete}>Delete</button>
      </div>
    </aside>
  );
}
