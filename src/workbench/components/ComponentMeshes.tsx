import { useMemo } from 'react';
import * as THREE from 'three';
import type { PlacedComponent } from '../../domain/components/types';
import { RESISTOR_BAND_HEX, resistorColorBands } from '../../domain/components/resistorBands';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { SimulationResult } from '../../domain/circuit/types';
import { CylinderBetween } from '../scene/geometry';

interface Props {
  board: BreadboardDefinition;
  components: PlacedComponent[];
  result: SimulationResult;
  selectedComponentId?: string;
  onSelect: (id: string) => void;
}

function point(board: BreadboardDefinition, holeId: string, yOffset = 0): THREE.Vector3 {
  const hole = board.holes.find((candidate) => candidate.id === holeId);
  return hole
    ? new THREE.Vector3(hole.positionMm.x, hole.positionMm.y + yOffset, hole.positionMm.z)
    : new THREE.Vector3();
}

function AxialResistor({
  component,
  board,
  selected,
  onSelect,
}: {
  component: Extract<PlacedComponent, { kind: 'resistor' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const start = point(board, component.terminalHoleIds.a, 0.4);
  const end = point(board, component.terminalHoleIds.b, 0.4);
  const transform = useMemo(() => {
    const direction = end.clone().sub(start);
    const length = direction.length();
    return {
      position: start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3(0, 3.7, 0)),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(direction.x, 0, direction.z).normalize(),
      ),
      bodyLength: Math.min(9.2, Math.max(6.4, length - 3)),
    };
  }, [end, start]);
  const bands = resistorColorBands(component.resistanceOhms, component.tolerancePercent);
  const raisedStart = start.clone().add(new THREE.Vector3(0, 3.7, 0));
  const raisedEnd = end.clone().add(new THREE.Vector3(0, 3.7, 0));

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <CylinderBetween start={start} end={raisedStart} radius={0.28} color="#b9bec0" metalness={0.75} />
      <CylinderBetween start={raisedStart} end={raisedEnd} radius={0.28} color="#b9bec0" metalness={0.75} />
      <CylinderBetween start={raisedEnd} end={end} radius={0.28} color="#b9bec0" metalness={0.75} />
      <group position={transform.position} quaternion={transform.quaternion}>
        <mesh castShadow>
          <capsuleGeometry args={[1.25, transform.bodyLength - 2.5, 6, 16]} />
          <meshStandardMaterial color={selected ? '#ead69d' : '#d7bf82'} roughness={0.66} emissive={selected ? '#3478c7' : '#000000'} emissiveIntensity={selected ? 0.12 : 0} />
        </mesh>
        {bands.map((band, index) => (
          <mesh key={`${band}-${index}`} position={[0, -transform.bodyLength / 2 + 1.35 + index * 1.25, 0]}>
            <cylinderGeometry args={[1.31, 1.31, 0.54, 18]} />
            <meshStandardMaterial color={RESISTOR_BAND_HEX[band]} roughness={0.62} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function LedMesh({
  component,
  board,
  current,
  selected,
  onSelect,
}: {
  component: Extract<PlacedComponent, { kind: 'led' }>;
  board: BreadboardDefinition;
  current: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const anode = point(board, component.terminalHoleIds.anode, 0.3);
  const cathode = point(board, component.terminalHoleIds.cathode, 0.3);
  const midpoint = anode.clone().add(cathode).multiplyScalar(0.5);
  const body = midpoint.clone().add(new THREE.Vector3(0, 5.7, 0));
  const active = current > 0.0005;
  const ledColors: Record<typeof component.color, string> = {
    red: '#d93232', green: '#49a858', yellow: '#e9bf32', blue: '#397ed4', white: '#eceee9',
  };
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <CylinderBetween start={anode} end={body.clone().add(new THREE.Vector3(-0.72, -1.4, 0))} radius={0.22} color="#b8bec0" metalness={0.72} />
      <CylinderBetween start={cathode} end={body.clone().add(new THREE.Vector3(0.72, -1.9, 0))} radius={0.22} color="#b8bec0" metalness={0.72} />
      <mesh position={body} castShadow>
        <capsuleGeometry args={[2.35, 2.4, 8, 20]} />
        <meshPhysicalMaterial
          color={ledColors[component.color]}
          transparent
          opacity={0.78}
          roughness={0.24}
          transmission={0.2}
          emissive={active ? ledColors[component.color] : selected ? '#3478c7' : '#000000'}
          emissiveIntensity={active ? 0.9 : selected ? 0.18 : 0}
        />
      </mesh>
    </group>
  );
}

function WireMesh({ component, board, selected, onSelect }: {
  component: Extract<PlacedComponent, { kind: 'jumper-wire' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const geometry = useMemo(() => {
    const start = point(board, component.terminalHoleIds.a, 0.2);
    const end = point(board, component.terminalHoleIds.b, 0.2);
    const distance = start.distanceTo(end);
    const rise = Math.min(14, 5 + distance * 0.16);
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().add(new THREE.Vector3(0, rise, 0)),
      start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3(0, rise + 1, 0)),
      end.clone().add(new THREE.Vector3(0, rise, 0)),
      end,
    ]);
    return new THREE.TubeGeometry(curve, 32, selected ? 0.58 : 0.48, 8, false);
  }, [board, component, selected]);
  return (
    <mesh geometry={geometry} onClick={(event) => { event.stopPropagation(); onSelect(); }} castShadow>
      <meshStandardMaterial color={component.color} roughness={0.68} emissive={selected ? '#2e76d0' : '#000000'} emissiveIntensity={0.2} />
    </mesh>
  );
}

function SimpleComponent({ component, board, selected, onSelect }: {
  component: Exclude<PlacedComponent, { kind: 'resistor' | 'led' | 'jumper-wire' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const entries = Object.values(component.terminalHoleIds);
  const start = point(board, entries[0], 0.3);
  const end = point(board, entries[1] ?? entries[0], 0.3);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  if (component.kind === 'ground') {
    return (
      <group position={[midpoint.x, midpoint.y + 2.1, midpoint.z]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
        <mesh><cylinderGeometry args={[0.3, 0.3, 3.4, 10]} /><meshStandardMaterial color="#aeb4b6" metalness={0.7} /></mesh>
        <mesh position={[0, 2, 0]}><coneGeometry args={[2, 2.2, 3]} /><meshStandardMaterial color={selected ? '#3478c7' : '#4b5252'} /></mesh>
      </group>
    );
  }
  const isPower = component.kind === 'voltage-source';
  const height = isPower ? 5.2 : component.closed ? 3.4 : 4.6;
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <CylinderBetween start={start} end={start.clone().add(new THREE.Vector3(0, height, 0))} radius={0.25} color="#afb5b7" metalness={0.7} />
      <CylinderBetween start={end} end={end.clone().add(new THREE.Vector3(0, height, 0))} radius={0.25} color="#afb5b7" metalness={0.7} />
      <mesh position={[midpoint.x, midpoint.y + height, midpoint.z]} castShadow>
        <boxGeometry args={[isPower ? 8 : 6.5, isPower ? 4.8 : 3.2, isPower ? 5 : 5]} />
        <meshStandardMaterial color={selected ? '#7fa9d4' : isPower ? '#5d7187' : '#32383b'} roughness={0.55} />
      </mesh>
      {component.kind === 'switch' && (
        <mesh position={[midpoint.x, midpoint.y + height + 2.3, midpoint.z]}>
          <cylinderGeometry args={[1.55, 1.55, component.closed ? 1.2 : 2.1, 18]} />
          <meshStandardMaterial color={component.closed ? '#4eaa69' : '#949b9d'} />
        </mesh>
      )}
    </group>
  );
}

export function ComponentMeshes({ board, components, result, selectedComponentId, onSelect }: Props) {
  return (
    <>
      {components.map((component) => {
        const common = { board, selected: component.id === selectedComponentId, onSelect: () => onSelect(component.id) };
        if (component.kind === 'resistor') return <AxialResistor key={component.id} component={component} {...common} />;
        if (component.kind === 'led') return <LedMesh key={component.id} component={component} current={result.componentCurrents[component.id] ?? 0} {...common} />;
        if (component.kind === 'jumper-wire') return <WireMesh key={component.id} component={component} {...common} />;
        return <SimpleComponent key={component.id} component={component} {...common} />;
      })}
    </>
  );
}
