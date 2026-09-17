import type { ComponentKind } from '../components/types';

export interface SchematicPin {
  id: string;
  name: string;
  holeId?: string;
  netId?: string;
}

export interface SchematicComponent {
  id: string;
  reference: string;
  kind: Exclude<ComponentKind, 'jumper-wire'> | 'signal-generator';
  value: string;
  pins: SchematicPin[];
  closed?: boolean;
}

export interface Schematic {
  title: string;
  components: SchematicComponent[];
  nets: Array<{ id: string; name: string; terminalCount: number }>;
  warnings: string[];
  jumperCount: number;
}
