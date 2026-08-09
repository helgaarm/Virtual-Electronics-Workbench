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
  { kind: 'diode-1n4148', icon: '▷|' },
  { kind: 'bc547', icon: 'Q' },
  { kind: 'bc557', icon: 'Q' },
  { kind: '2n3904', icon: 'Q' },
  { kind: '2n3906', icon: 'Q' },
  { kind: 'potentiometer', icon: 'RV' },
  { kind: 'seven-segment', icon: '8.' },
  { kind: 'four-digit-seven-segment', icon: '88.8' },
  { kind: '74hc595', icon: '595' },
  { kind: 'attiny85', icon: 'AVR' },
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
