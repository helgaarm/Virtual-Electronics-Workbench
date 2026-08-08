import type { PlacedComponent } from '../domain/components/types';
import { isComponentAnchored, terminalEntries } from '../domain/components/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import type { ComponentMeasurement, MeasurementValue } from '../measurement/dcMeasurements';
import { formatCurrent, formatResistance, formatVoltage } from './format';

interface Props {
  component?: PlacedComponent;
  board: BreadboardDefinition;
  measurement?: ComponentMeasurement;
  onUpdate: (component: PlacedComponent) => void;
  onRotate: () => void;
  onDelete: () => void;
}

function reading(value: MeasurementValue | undefined, formatter: (number: number) => string): string {
  return value?.status === 'valid' && value.value !== undefined ? formatter(value.value) : 'N/A';
}

export function Inspector({ component, board, measurement, onUpdate, onRotate, onDelete }: Props) {
  if (!component) {
    return (
      <aside className="panel inspector empty-inspector" aria-label="Inspector">
        <div className="panel-heading"><span className="eyebrow">Inspector</span><h2>No selection</h2></div>
        <div className="empty-symbol">⌁</div>
        <p>Select a component to inspect its placement and live electrical values.</p>
      </aside>
    );
  }

  const allHoles = [...board.holes].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const anchored = isComponentAnchored(component);

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
            <input id="resistance" type="number" min="0.1" step="0.1" value={component.resistanceOhms}
              onChange={(event) => onUpdate({ ...component, resistanceOhms: Math.max(0.1, Number(event.target.value)) })} />
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

      <section className="inspector-section placement-lock">
        <div className="section-label">Placement</div>
        <button
          className={anchored ? 'state-button is-anchored' : 'state-button is-movable'}
          onClick={() => onUpdate({ ...component, anchored: !anchored })}
          aria-pressed={anchored}
        >
          {anchored ? 'Anchored — unanchor to move' : 'Movable — anchor in place'}
        </button>
        <small>
          {anchored
            ? 'Selecting this component will not move it.'
            : 'Drag the component in the workbench, then anchor it when positioned.'}
        </small>
      </section>

      <section className="inspector-section">
        <div className="section-label">Breadboard connections</div>
        <div className="terminal-list">
          {terminalEntries(component).map(([terminal, holeId]) => (
            <label key={terminal}>
              <span>{terminal}</span>
              <select disabled={anchored} value={holeId} onChange={(event) => updateTerminal(terminal, event.target.value)}>
                {allHoles.map((hole) => <option key={hole.id} value={hole.id}>{hole.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="inspector-section measurements">
        <div className="section-label">Live simulation</div>
        <dl>
          <div title={measurement?.voltage.reason}><dt>Voltage drop</dt><dd>{reading(measurement?.voltage, formatVoltage)}</dd></div>
          <div title={measurement?.current.reason}><dt>Current</dt><dd>{reading(measurement?.current, formatCurrent)}</dd></div>
          <div title={measurement?.power.reason}><dt>Power</dt><dd>{reading(measurement?.power, (value) => `${Math.abs(value * 1_000).toFixed(2)} mW`)}</dd></div>
        </dl>
        {measurement && measurement.current.status !== 'valid' && (
          <p className="measurement-note">{measurement.current.reason}</p>
        )}
      </section>

      <div className="inspector-actions">
        <button disabled={anchored} onClick={onRotate} title={anchored ? 'Unanchor before rotating' : 'Rotate 90 degrees'}>↻ Rotate</button>
        <button className="danger-quiet" onClick={onDelete}>Delete</button>
      </div>
    </aside>
  );
}
