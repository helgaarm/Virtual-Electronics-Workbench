import type { ComponentKind } from '../domain/components/types';
import { componentDisplayName } from '../domain/components/types';
import { paletteDescription } from '../state/workbenchActions';

const KINDS: Array<{ kind: ComponentKind; icon: string }> = [
  { kind: 'voltage-source', icon: 'DC' },
  { kind: 'ground', icon: 'GND' },
  { kind: 'resistor', icon: 'R' },
  { kind: 'led', icon: 'LED' },
  { kind: 'capacitor', icon: 'C' },
  { kind: 'switch', icon: 'SW' },
  { kind: 'jumper-wire', icon: 'WIRE' },
  { kind: 'ne555', icon: '555' },
  { kind: 'tmp36', icon: '°C' },
];

export function Palette({ onAdd }: { onAdd: (kind: ComponentKind) => void }) {
  return (
    <aside className="panel palette" aria-label="Component palette">
      <div className="panel-heading">
        <span className="eyebrow">Parts drawer</span>
        <h2>Components</h2>
      </div>
      <div className="palette-list">
        {KINDS.map(({ kind, icon }) => (
          <button className="part-card" key={kind} onClick={() => onAdd(kind)} title={`Add ${componentDisplayName(kind)}`}>
            <span className={`part-icon part-icon-${kind}`}>{icon}</span>
            <span>
              <strong>{componentDisplayName(kind)}</strong>
              <small>{paletteDescription(kind)}</small>
            </span>
            <span className="add-mark" aria-hidden="true">+</span>
          </button>
        ))}
      </div>
      <p className="palette-hint">Add a part, then choose its breadboard holes in the inspector.</p>
    </aside>
  );
}
