import { Html } from '@react-three/drei';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import { getHole } from '../../domain/physical/breadboard';
import type { InstrumentProbeMarker } from '../../state/instrumentSelectors';

interface Props {
  board: BreadboardDefinition;
  probes: readonly InstrumentProbeMarker[];
  selectedProbeId?: string;
}

interface ProbeEnd {
  key: string;
  probe: InstrumentProbeMarker;
  terminal: 'positive' | 'reference';
  holeId: string;
}

function probeEnds(probes: readonly InstrumentProbeMarker[]): ProbeEnd[] {
  return probes.flatMap((probe) => [
    ...(probe.positiveHoleId
      ? [{ key: `${probe.id}:positive`, probe, terminal: 'positive' as const, holeId: probe.positiveHoleId }]
      : []),
    ...(probe.referenceHoleId
      ? [{ key: `${probe.id}:reference`, probe, terminal: 'reference' as const, holeId: probe.referenceHoleId }]
      : []),
  ]);
}

export function ProbeMeshes({ board, probes, selectedProbeId }: Props) {
  return probeEnds(probes).map(({ key, probe, terminal, holeId }, index) => {
    const hole = getHole(board, holeId);
    if (!hole) return null;
    const positive = terminal === 'positive';
    const color = positive ? probe.positiveColor : probe.referenceColor;
    const selected = probe.id === selectedProbeId;
    return (
      <group key={key} position={[hole.positionMm.x, hole.positionMm.y + 0.18, hole.positionMm.z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[selected ? 0.92 : 0.76, selected ? 0.18 : 0.13, 12, 32]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} />
        </mesh>
        <mesh position={[0, 1.15, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.12, 0.2, 2.3, 16]} />
          <meshStandardMaterial color={positive ? '#b8c4ca' : '#aeb4b2'} roughness={0.35} metalness={0.72} />
        </mesh>
        <mesh position={[0, 2.65, 0]} raycast={() => null}>
          <capsuleGeometry args={[0.38, 1.2, 6, 16]} />
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>
        <Html
          center
          position={[positive ? -0.3 : 0.3, 4.05 + (index % 3) * 0.28, 0]}
          distanceFactor={34}
          style={{ pointerEvents: 'none' }}
        >
          <span
            aria-hidden="true"
            className={`probe-marker-label probe-marker-${terminal}${selected ? ' is-selected' : ''}`}
          >
            <strong>{probe.label}</strong>
            <span>{positive ? probe.positiveLabel : probe.referenceLabel} {hole.label}</span>
          </span>
        </Html>
      </group>
    );
  });
}
