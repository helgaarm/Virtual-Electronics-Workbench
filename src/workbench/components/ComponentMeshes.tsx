import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { isComponentAnchored, type PlacedComponent } from '../../domain/components/types';
import { RESISTOR_BAND_HEX, resistorColorBands } from '../../domain/components/resistorBands';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import { PHYSICAL_PACKAGES } from '../../domain/physical/packages';
import type { SimulationResult } from '../../domain/circuit/types';
import { routeJumperWires } from '../../domain/physical/wireRouting';
import type { Point3Mm } from '../../domain/physical/geometry';
import { CylinderBetween, SmoothTube } from '../scene/geometry';
import { createJumperCurve } from '../scene/wireGeometry';
import { DIP_8_PACKAGE } from '../../domain/physical/dipPackages';

interface Props {
  board: BreadboardDefinition;
  components: PlacedComponent[];
  result: SimulationResult;
  selectedComponentId?: string;
  onSelect: (id: string) => void;
  onBeginDrag?: (id: string, point: THREE.Vector3, pointerId: number) => void;
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
  onBeginDrag,
}: {
  component: Extract<PlacedComponent, { kind: 'resistor' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.resistor;
  const start = point(board, component.terminalHoleIds.a, 0.4);
  const end = point(board, component.terminalHoleIds.b, 0.4);
  const transform = useMemo(() => {
    const direction = end.clone().sub(start);
    return {
      position: start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0)),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(direction.x, 0, direction.z).normalize(),
      ),
    };
  }, [end, physicalPackage.mountingHeightMm, start]);
  const bands = resistorColorBands(component.resistanceOhms, component.tolerancePercent);
  const bodyLength = physicalPackage.dimensionsMm.x;
  const bodyRadius = physicalPackage.dimensionsMm.y / 2;
  const bodyDirection = new THREE.Vector3(end.x - start.x, 0, end.z - start.z).normalize();
  const bodyStart = transform.position.clone().addScaledVector(bodyDirection, -bodyLength / 2);
  const bodyEnd = transform.position.clone().addScaledVector(bodyDirection, bodyLength / 2);
  const startShoulder = start.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm * 0.58, 0));
  const endShoulder = end.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm * 0.58, 0));

  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      <SmoothTube points={[start, startShoulder, bodyStart]} radius={physicalPackage.leadDiameterMm / 2} color="#b9bec0" metalness={0.75} />
      <SmoothTube points={[end, endShoulder, bodyEnd]} radius={physicalPackage.leadDiameterMm / 2} color="#b9bec0" metalness={0.75} />
      <group position={transform.position} quaternion={transform.quaternion}>
        <mesh castShadow>
          <capsuleGeometry args={[bodyRadius, bodyLength - bodyRadius * 2, 6, 16]} />
          <meshStandardMaterial color={selected ? '#ead69d' : '#d7bf82'} roughness={0.66} emissive={selected ? '#3478c7' : '#000000'} emissiveIntensity={selected ? 0.12 : 0} />
        </mesh>
        {bands.map((band, index) => (
          <mesh key={`${band}-${index}`} position={[0, -bodyLength / 2 + 1.05 + index * 1.05, 0]}>
            <cylinderGeometry args={[bodyRadius + 0.06, bodyRadius + 0.06, 0.5, 18]} />
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
  onBeginDrag,
}: {
  component: Extract<PlacedComponent, { kind: 'led' }>;
  board: BreadboardDefinition;
  current: number;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.led;
  const anode = point(board, component.terminalHoleIds.anode, 0.3);
  const cathode = point(board, component.terminalHoleIds.cathode, 0.3);
  const midpoint = anode.clone().add(cathode).multiplyScalar(0.5);
  const body = midpoint.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0));
  const terminalDirection = cathode.clone().sub(anode);
  const horizontal = new THREE.Vector3(terminalDirection.x, 0, terminalDirection.z).normalize();
  const anodeContact = body.clone().addScaledVector(horizontal, -0.72).add(new THREE.Vector3(0, -1.45, 0));
  const cathodeContact = body.clone().addScaledVector(horizontal, 0.72).add(new THREE.Vector3(0, -1.75, 0));
  const rotationY = -Math.atan2(terminalDirection.z, terminalDirection.x);
  const brightness = THREE.MathUtils.clamp(current / 0.008, 0, 1);
  const active = brightness > 0.02;
  const ledColors: Record<typeof component.color, string> = {
    red: '#d93232', green: '#49a858', yellow: '#e9bf32', blue: '#397ed4', white: '#eceee9',
  };
  const lightColors: Record<typeof component.color, string> = {
    red: '#ff2c20', green: '#4dff72', yellow: '#ffd83d', blue: '#3f8cff', white: '#f4fbff',
  };
  const lensColor = ledColors[component.color];
  const lightColor = lightColors[component.color];
  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      <SmoothTube points={[anode, anode.clone().add(new THREE.Vector3(0, 1.35, 0)), anodeContact]} radius={physicalPackage.leadDiameterMm / 2} color="#b8bec0" metalness={0.82} />
      <SmoothTube points={[cathode, cathode.clone().add(new THREE.Vector3(0, 1.35, 0)), cathodeContact]} radius={physicalPackage.leadDiameterMm / 2} color="#b8bec0" metalness={0.82} />

      <group position={body} rotation={[0, rotationY, 0]}>
        <mesh position={[0, -1.65, 0]} castShadow>
          <cylinderGeometry args={[2.72, 2.72, 0.5, 40]} />
          <meshPhysicalMaterial
            color={lensColor}
            transparent
            opacity={0.68}
            roughness={0.16}
            clearcoat={0.9}
            clearcoatRoughness={0.08}
            transmission={0.16}
            emissive={active ? lightColor : selected ? '#3478c7' : '#000000'}
            emissiveIntensity={active ? 0.5 + brightness * 1.5 : selected ? 0.2 : 0}
          />
        </mesh>

        <mesh castShadow>
          <cylinderGeometry args={[2.46, 2.46, 3.6, 40]} />
          <meshPhysicalMaterial
            color={lensColor}
            transparent
            opacity={0.58}
            roughness={0.12}
            clearcoat={1}
            clearcoatRoughness={0.06}
            transmission={0.28}
            thickness={0.8}
            ior={1.48}
            emissive={active ? lightColor : selected ? '#3478c7' : '#000000'}
            emissiveIntensity={active ? 0.45 + brightness * 1.35 : selected ? 0.18 : 0}
          />
        </mesh>

        <mesh position={[0, 1.8, 0]} castShadow>
          <sphereGeometry args={[2.46, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial
            color={lensColor}
            transparent
            opacity={0.56}
            roughness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.05}
            transmission={0.32}
            thickness={0.9}
            ior={1.48}
            emissive={active ? lightColor : selected ? '#3478c7' : '#000000'}
            emissiveIntensity={active ? 0.55 + brightness * 1.5 : selected ? 0.18 : 0}
          />
        </mesh>

        <mesh position={[-0.72, -0.72, 0]}>
          <boxGeometry args={[0.28, 1.85, 0.4]} />
          <meshStandardMaterial color="#b7bcbd" roughness={0.28} metalness={0.86} />
        </mesh>
        <mesh position={[0.72, -0.6, 0]}>
          <boxGeometry args={[0.38, 2.1, 0.55]} />
          <meshStandardMaterial color="#c3c7c7" roughness={0.25} metalness={0.9} />
        </mesh>
        <mesh position={[0.45, 0.12, 0]}>
          <cylinderGeometry args={[0.6, 0.92, 0.85, 24]} />
          <meshStandardMaterial color="#c7cbca" roughness={0.22} metalness={0.88} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.68, 0.28, 0.68]} />
          <meshBasicMaterial
            color={active ? lightColor : '#5d6060'}
            toneMapped={false}
          />
        </mesh>

        <mesh position={[2.38, -0.35, 0]}>
          <boxGeometry args={[0.14, 2.5, 2.1]} />
          <meshStandardMaterial color="#b8bec0" transparent opacity={0.2} roughness={0.4} />
        </mesh>

        {active && (
          <>
            <mesh position={[0, 1.65, 0]}>
              <sphereGeometry args={[3.15, 30, 20]} />
              <meshBasicMaterial
                color={lightColor}
                transparent
                opacity={0.08 + brightness * 0.13}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <pointLight
              position={[0, 2.1, 0]}
              color={lightColor}
              intensity={12 + brightness * 24}
              distance={24}
              decay={2}
            />
          </>
        )}
      </group>
    </group>
  );
}

function RadialCapacitorMesh({ component, board, selected, onSelect, onBeginDrag }: {
  component: Extract<PlacedComponent, { kind: 'capacitor' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.capacitor;
  const positive = point(board, component.terminalHoleIds.positive, 0.25);
  const negative = point(board, component.terminalHoleIds.negative, 0.25);
  const midpoint = positive.clone().add(negative).multiplyScalar(0.5);
  const direction = negative.clone().sub(positive);
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const bodyCenter = midpoint.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0));
  const bodyBottomY = bodyCenter.y - physicalPackage.dimensionsMm.y / 2;
  const positiveContact = midpoint.clone().addScaledVector(horizontal, -0.62);
  const negativeContact = midpoint.clone().addScaledVector(horizontal, 0.62);
  positiveContact.y = bodyBottomY;
  negativeContact.y = bodyBottomY;
  const positiveShoulder = positive.clone().add(new THREE.Vector3(0, 1.45, 0));
  const negativeShoulder = negative.clone().add(new THREE.Vector3(0, 1.15, 0));
  const rotationY = -Math.atan2(direction.z, direction.x);
  const radius = physicalPackage.dimensionsMm.x / 2;

  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      <SmoothTube points={[positive, positiveShoulder, positiveContact]} radius={physicalPackage.leadDiameterMm / 2} color="#b8bec0" metalness={0.82} />
      <SmoothTube points={[negative, negativeShoulder, negativeContact]} radius={physicalPackage.leadDiameterMm / 2} color="#aeb4b6" metalness={0.82} />
      <group position={bodyCenter} rotation={[0, rotationY, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[radius, radius, physicalPackage.dimensionsMm.y, 40]} />
          <meshStandardMaterial
            color={selected ? '#315f87' : '#243e59'}
            roughness={0.56}
            metalness={0.08}
            emissive={selected ? '#3478c7' : '#000000'}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
        <mesh position={[0, physicalPackage.dimensionsMm.y / 2 + 0.04, 0]}>
          <cylinderGeometry args={[radius * 0.94, radius, 0.22, 40]} />
          <meshStandardMaterial color="#1c2e40" roughness={0.42} metalness={0.18} />
        </mesh>
        <mesh position={[0, -physicalPackage.dimensionsMm.y / 2 - 0.04, 0]}>
          <cylinderGeometry args={[radius * 0.9, radius * 0.94, 0.2, 40]} />
          <meshStandardMaterial color="#2b3031" roughness={0.72} />
        </mesh>
        <RoundedBox
          args={[0.52, physicalPackage.dimensionsMm.y - 1.4, 2.75]}
          radius={0.12}
          smoothness={4}
          position={[radius - 0.09, 0, 0]}
        >
          <meshStandardMaterial color="#d8dcda" roughness={0.62} />
        </RoundedBox>
        {[-3, 0, 3].map((y) => (
          <mesh key={y} position={[radius + 0.2, y, 0]}>
            <boxGeometry args={[0.09, 0.2, 1.2]} />
            <meshBasicMaterial color="#4c5758" />
          </mesh>
        ))}
        <mesh position={[-1.1, physicalPackage.dimensionsMm.y / 2 + 0.18, 0]}>
          <torusGeometry args={[0.46, 0.1, 10, 28]} />
          <meshStandardMaterial color="#aeb9ba" roughness={0.35} metalness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

function WireMesh({ component, route, selected, onSelect, onBeginDrag }: {
  component: Extract<PlacedComponent, { kind: 'jumper-wire' }>;
  route: Point3Mm[];
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const routeSignature = route.map((routePoint) => `${routePoint.x},${routePoint.y},${routePoint.z}`).join(';');
  const geometry = useMemo(() => {
    const stableRoute = routeSignature.split(';').filter(Boolean).map((entry) => {
      const [x, y, z] = entry.split(',').map(Number);
      return { x, y, z };
    });
    const curve = createJumperCurve(stableRoute);
    return curve
      ? new THREE.TubeGeometry(curve, Math.max(72, stableRoute.length * 18), selected ? 0.58 : 0.48, 16, false)
      : undefined;
  }, [routeSignature, selected]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
      castShadow
    >
      <meshStandardMaterial color={component.color} roughness={0.68} emissive={selected ? '#2e76d0' : '#000000'} emissiveIntensity={0.2} />
    </mesh>
  );
}

function TactileSwitchMesh({ component, board, selected, onSelect, onBeginDrag }: {
  component: Extract<PlacedComponent, { kind: 'switch' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.switch;
  const start = point(board, component.terminalHoleIds.a, 0.25);
  const end = point(board, component.terminalHoleIds.b, 0.25);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start);
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const bodyCenter = midpoint.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0));
  const halfBody = physicalPackage.dimensionsMm.x / 2;
  const bodyBottomY = bodyCenter.y - physicalPackage.dimensionsMm.y / 2;
  const leftShoulder = start.clone().add(new THREE.Vector3(0, 1.15, 0));
  const rightShoulder = end.clone().add(new THREE.Vector3(0, 1.15, 0));
  const leftContact = bodyCenter.clone().addScaledVector(horizontal, -halfBody - 0.15);
  const rightContact = bodyCenter.clone().addScaledVector(horizontal, halfBody + 0.15);
  leftContact.y = bodyBottomY + 0.5;
  rightContact.y = bodyBottomY + 0.5;
  const rotationY = -Math.atan2(direction.z, direction.x);
  const actuatorHeight = component.closed ? 0.72 : 1.28;
  const actuatorY = physicalPackage.dimensionsMm.y / 2 + 0.52 + actuatorHeight / 2;
  const detailPositions = [
    [-2.05, -2.05], [-2.05, 2.05], [2.05, -2.05], [2.05, 2.05],
  ] as const;

  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      <SmoothTube points={[start, leftShoulder, leftContact]} radius={physicalPackage.leadDiameterMm / 2} color="#aeb4b5" metalness={0.92} />
      <SmoothTube points={[end, rightShoulder, rightContact]} radius={physicalPackage.leadDiameterMm / 2} color="#aeb4b5" metalness={0.92} />

      <group position={bodyCenter} rotation={[0, rotationY, 0]}>
        <RoundedBox
          args={[
            physicalPackage.dimensionsMm.x,
            physicalPackage.dimensionsMm.y,
            physicalPackage.dimensionsMm.z,
          ]}
          radius={0.48}
          smoothness={8}
          bevelSegments={5}
          castShadow
        >
          <meshStandardMaterial
            color={selected ? '#394d59' : '#202527'}
            roughness={0.48}
            metalness={0.08}
            emissive={selected ? '#3478c7' : '#000000'}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </RoundedBox>

        <RoundedBox
          args={[5.35, 0.46, 5.35]}
          radius={0.34}
          smoothness={6}
          bevelSegments={4}
          position={[0, physicalPackage.dimensionsMm.y / 2 + 0.16, 0]}
          castShadow
        >
          <meshStandardMaterial color="#a8acad" roughness={0.3} metalness={0.78} />
        </RoundedBox>

        <mesh position={[0, physicalPackage.dimensionsMm.y / 2 + 0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.55, 0.18, 12, 40]} />
          <meshStandardMaterial color="#6f7475" roughness={0.34} metalness={0.72} />
        </mesh>

        <mesh position={[0, actuatorY, 0]} castShadow>
          <cylinderGeometry args={[1.32, 1.4, actuatorHeight, 36]} />
          <meshStandardMaterial color="#34393a" roughness={0.4} metalness={0.12} />
        </mesh>

        {detailPositions.map(([x, z]) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, physicalPackage.dimensionsMm.y / 2 + 0.43, z]}
          >
            <cylinderGeometry args={[0.16, 0.16, 0.09, 16]} />
            <meshStandardMaterial color="#d1d3d2" roughness={0.25} metalness={0.9} />
          </mesh>
        ))}

        {[-1, 1].map((side) => (
          <RoundedBox
            key={side}
            args={[2.25, 0.6, 0.36]}
            radius={0.12}
            smoothness={3}
            position={[0, 0.45, side * (physicalPackage.dimensionsMm.z / 2 + 0.08)]}
          >
            <meshStandardMaterial color="#989d9e" roughness={0.32} metalness={0.82} />
          </RoundedBox>
        ))}
      </group>
    </group>
  );
}

function useDipMarkingTexture(): THREE.CanvasTexture | undefined {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#c8cbca';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 66px ui-monospace, monospace';
    context.fillText('NE555N', canvas.width / 2, 62);
    context.fillStyle = '#8c9291';
    context.font = '500 31px ui-monospace, monospace';
    context.fillText('TIMER', canvas.width / 2, 125);
    const created = new THREE.CanvasTexture(canvas);
    created.colorSpace = THREE.SRGBColorSpace;
    created.needsUpdate = true;
    return created;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/** Reusable procedural DIP package. Pin locations come entirely from the placed component. */
function Dip8Mesh({ component, board, selected, onSelect, onBeginDrag }: {
  component: Extract<PlacedComponent, { kind: 'ne555' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.ne555;
  const pinPoints = Object.values(component.terminalHoleIds).map((holeId) => point(board, holeId, 0.25));
  const center = pinPoints.reduce((sum, pin) => sum.add(pin), new THREE.Vector3())
    .multiplyScalar(1 / pinPoints.length);
  const pin1 = point(board, component.terminalHoleIds.pin1);
  const pin4 = point(board, component.terminalHoleIds.pin4);
  const packageAxis = pin4.clone().sub(pin1);
  const rotationY = -Math.atan2(packageAxis.z, packageAxis.x);
  const bodyCenter = center.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0));
  const bodyBottomY = bodyCenter.y - DIP_8_PACKAGE.bodyDimensionsMm.y / 2;
  const texture = useDipMarkingTexture();

  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      {pinPoints.map((pin, index) => {
        const inward = center.clone().sub(pin).setY(0).normalize();
        const lowerBend = pin.clone().setY(bodyBottomY - 0.72);
        const packageEdge = pin.clone().addScaledVector(inward, 0.54).setY(bodyBottomY + 0.22);
        const embeddedContact = pin.clone()
          .addScaledVector(inward, 1.18)
          .setY(bodyBottomY + 0.72);
        return (
          <group key={index}>
            <SmoothTube
              points={[pin, lowerBend, packageEdge, embeddedContact]}
              radius={DIP_8_PACKAGE.leadWidthMm / 2}
              color="#b9bec0"
              roughness={0.3}
              metalness={0.92}
              tubularSegments={64}
            />
            <CylinderBetween
              start={packageEdge}
              end={embeddedContact}
              radius={DIP_8_PACKAGE.leadWidthMm * 0.58}
              color="#c3c8c9"
              roughness={0.26}
              metalness={0.94}
            />
          </group>
        );
      })}
      <group position={bodyCenter} rotation={[0, rotationY, 0]}>
        <RoundedBox
          args={[
            DIP_8_PACKAGE.bodyDimensionsMm.x,
            DIP_8_PACKAGE.bodyDimensionsMm.y,
            DIP_8_PACKAGE.bodyDimensionsMm.z,
          ]}
          radius={0.42}
          smoothness={7}
          bevelSegments={5}
          castShadow
        >
          <meshStandardMaterial
            color={selected ? '#263643' : '#15191b'}
            roughness={0.58}
            metalness={0.04}
            emissive={selected ? '#3478c7' : '#000000'}
            emissiveIntensity={selected ? 0.15 : 0}
          />
        </RoundedBox>
        <mesh position={[-DIP_8_PACKAGE.bodyDimensionsMm.x / 2 + 0.28, DIP_8_PACKAGE.bodyDimensionsMm.y / 2 + 0.015, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 0.08, 32, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#090b0c" roughness={0.74} />
        </mesh>
        <mesh position={[-3.05, DIP_8_PACKAGE.bodyDimensionsMm.y / 2 + 0.06, -2.05]}>
          <cylinderGeometry args={[0.3, 0.3, 0.11, 24]} />
          <meshStandardMaterial color="#737978" roughness={0.58} />
        </mesh>
        {texture && (
          <mesh position={[0.55, DIP_8_PACKAGE.bodyDimensionsMm.y / 2 + 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[6.8, 2.15]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Tmp36Mesh({ component, board, selected, onSelect, onBeginDrag }: {
  component: Extract<PlacedComponent, { kind: 'tmp36' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES.tmp36;
  const pins = Object.values(component.terminalHoleIds).map((holeId) => point(board, holeId, 0.25));
  const center = pins.reduce((sum, pin) => sum.add(pin), new THREE.Vector3()).multiplyScalar(1 / pins.length);
  const axis = pins[2].clone().sub(pins[0]);
  const rotationY = -Math.atan2(axis.z, axis.x);
  const bodyCenter = center.clone().add(new THREE.Vector3(0, physicalPackage.mountingHeightMm, 0));
  const bodyBottomY = bodyCenter.y - physicalPackage.dimensionsMm.y / 2;
  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      {pins.map((pin, index) => (
        <SmoothTube
          key={index}
          points={[pin, pin.clone().setY(bodyBottomY - 0.5), center.clone().lerp(pin, 0.72).setY(bodyBottomY + 0.35)]}
          radius={physicalPackage.leadDiameterMm / 2}
          color="#b9bec0"
          metalness={0.9}
        />
      ))}
      <group position={bodyCenter} rotation={[0, rotationY, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[physicalPackage.dimensionsMm.x / 2, physicalPackage.dimensionsMm.x / 2, physicalPackage.dimensionsMm.y, 24, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color={selected ? '#314b5e' : '#202426'} roughness={0.62} emissive={selected ? '#3478c7' : '#000'} emissiveIntensity={0.16} />
        </mesh>
        <mesh position={[0, 0, physicalPackage.dimensionsMm.z / 2 - 0.15]}>
          <boxGeometry args={[physicalPackage.dimensionsMm.x, physicalPackage.dimensionsMm.y, 0.3]} />
          <meshStandardMaterial color={selected ? '#314b5e' : '#202426'} roughness={0.62} />
        </mesh>
      </group>
    </group>
  );
}

function SimpleComponent({ component, board, selected, onSelect, onBeginDrag }: {
  component: Exclude<PlacedComponent, { kind: 'resistor' | 'led' | 'capacitor' | 'jumper-wire' | 'switch' | 'ne555' | 'tmp36' }>;
  board: BreadboardDefinition;
  selected: boolean;
  onSelect: () => void;
  onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const physicalPackage = PHYSICAL_PACKAGES[component.kind];
  const entries = Object.values(component.terminalHoleIds);
  const terminalPoints = entries.map((holeId) => point(board, holeId, 0.3));
  const start = terminalPoints[0];
  const end = terminalPoints[1] ?? start;
  const midpoint = terminalPoints.reduce(
    (sum, terminalPoint) => sum.add(terminalPoint),
    new THREE.Vector3(),
  ).multiplyScalar(1 / terminalPoints.length);
  if (component.kind === 'ground') {
    return (
      <group
        position={[midpoint.x, midpoint.y + physicalPackage.mountingHeightMm, midpoint.z]}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
      >
        <mesh castShadow><cylinderGeometry args={[physicalPackage.leadDiameterMm / 2, physicalPackage.leadDiameterMm / 2, 3.4, 28]} /><meshStandardMaterial color="#aeb4b6" metalness={0.7} /></mesh>
        <mesh position={[0, 2, 0]}><coneGeometry args={[2, 2.2, 3]} /><meshStandardMaterial color={selected ? '#3478c7' : '#4b5252'} /></mesh>
      </group>
    );
  }
  const isPower = component.kind === 'voltage-source';
  const height = physicalPackage.mountingHeightMm;
  const direction = end.clone().sub(start);
  const rotationY = -Math.atan2(direction.z, direction.x);
  const bodyBottomY = midpoint.y + height - physicalPackage.dimensionsMm.y / 2;
  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}
    >
      {terminalPoints.map((terminalPoint, index) => (
        <CylinderBetween
          key={`${entries[index]}-${index}`}
          start={terminalPoint}
          end={terminalPoint.clone().setY(bodyBottomY + 0.35)}
          radius={physicalPackage.leadDiameterMm / 2}
          color="#afb5b7"
          roughness={0.3}
          metalness={0.86}
        />
      ))}
      <RoundedBox
        args={[physicalPackage.dimensionsMm.x, physicalPackage.dimensionsMm.y, physicalPackage.dimensionsMm.z]}
        radius={isPower ? 0.85 : 0.5}
        smoothness={6}
        bevelSegments={4}
        position={[midpoint.x, midpoint.y + height, midpoint.z]}
        rotation={[0, rotationY, 0]}
        castShadow
      >
        <meshStandardMaterial color={selected ? '#7fa9d4' : isPower ? '#5d7187' : '#32383b'} roughness={0.55} />
      </RoundedBox>
    </group>
  );
}

export function ComponentMeshes({ board, components, result, selectedComponentId, onSelect, onBeginDrag }: Props) {
  const jumperRoutes = useMemo(() => routeJumperWires(board, components), [board, components]);
  return (
    <>
      {components.map((component) => {
        const common = {
          board,
          selected: component.id === selectedComponentId,
          onSelect: () => onSelect(component.id),
          onBeginDrag: onBeginDrag && !isComponentAnchored(component)
            ? (point: THREE.Vector3, pointerId: number) => onBeginDrag(component.id, point, pointerId)
            : undefined,
        };
        if (component.kind === 'resistor') return <AxialResistor key={component.id} component={component} {...common} />;
        if (component.kind === 'led') return <LedMesh key={component.id} component={component} current={result.componentCurrents[component.id] ?? 0} {...common} />;
        if (component.kind === 'capacitor') return <RadialCapacitorMesh key={component.id} component={component} {...common} />;
        if (component.kind === 'jumper-wire') return (
          <WireMesh
            key={component.id}
            component={component}
            route={jumperRoutes.get(component.id) ?? []}
            {...common}
          />
        );
        if (component.kind === 'switch') return <TactileSwitchMesh key={component.id} component={component} {...common} />;
        if (component.kind === 'ne555') return <Dip8Mesh key={component.id} component={component} {...common} />;
        if (component.kind === 'tmp36') return <Tmp36Mesh key={component.id} component={component} {...common} />;
        return <SimpleComponent key={component.id} component={component} {...common} />;
      })}
    </>
  );
}
