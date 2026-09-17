import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { NtcThermistorComponent, HeaterResistorComponent, OledComponent } from '../../domain/components/types';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import { PHYSICAL_PACKAGES } from '../../domain/physical/packages';
import { OLED_PACKAGE, oledMounting } from '../../domain/physical/oled';
import { CylinderBetween } from '../scene/geometry';

interface CommonProps { board: BreadboardDefinition; selected: boolean; onSelect: () => void; onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void }
export function ThermalPartMesh({ component, board, selected, onSelect, onBeginDrag }: CommonProps & { component: NtcThermistorComponent | HeaterResistorComponent }) {
  const holes = Object.values(component.terminalHoleIds).map(id => board.holes.find(h => h.id === id));
  if (holes.some(h => !h)) return null;
  const positions = holes.map(h => h!.positionMm);
  const physical = PHYSICAL_PACKAGES[component.kind];
  const center = { x: (positions[0].x + positions[1].x) / 2, y: positions[0].y + physical.mountingHeightMm, z: (positions[0].z + positions[1].z) / 2 };
  const heater = component.kind === 'heater-resistor';
  const axis = new THREE.Vector3(positions[1].x - positions[0].x, 0, positions[1].z - positions[0].z).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  return <group onClick={e => { e.stopPropagation(); onSelect(); }} onPointerDown={e => { e.stopPropagation(); onSelect(); onBeginDrag?.(e.point, e.pointerId); }}>
    {positions.map((p, i) => {
      const shoulder = new THREE.Vector3(p.x, p.y + physical.leadDiameterMm, p.z);
      const contact = new THREE.Vector3(center.x + axis.x * (i ? 1 : -1) * (heater ? 3.25 : 1.27), center.y, center.z + axis.z * (i ? 1 : -1) * (heater ? 3.25 : 1.27));
      return <group key={i}>
        <CylinderBetween start={new THREE.Vector3(p.x, p.y - 0.65, p.z)} end={shoulder} radius={physical.leadDiameterMm / 2} color="#b9bec0" />
        <CylinderBetween start={shoulder} end={contact} radius={physical.leadDiameterMm / 2} color="#b9bec0" />
      </group>;
    })}
    <mesh position={[center.x, center.y, center.z]} quaternion={heater ? quaternion : undefined} scale={heater ? undefined : [1, 6 / 3.8, 3 / 3.8]} castShadow>
      {heater ? <cylinderGeometry args={[1.25, 1.25, 6.5, 12]} /> : <sphereGeometry args={[1.9, 12, 10]} />}
      <meshStandardMaterial color={selected ? '#518cab' : heater ? '#e5ddd0' : '#405365'} roughness={0.7} />
    </mesh>
    {!heater && <mesh position={[center.x, center.y + 1.8, center.z]}><sphereGeometry args={[0.45, 8, 8]} /><meshStandardMaterial color="#62b5ed" /></mesh>}
  </group>;
}

export function OledMesh({ component, board, selected, onSelect, onBeginDrag, pixels }: CommonProps & { component: OledComponent; pixels?: Uint8Array }) {
  const texture = useMemo(() => {
    const rgba = new Uint8Array(128 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const on = Boolean((pixels?.[Math.floor(y / 8) * 128 + x] ?? 0) & (1 << (y % 8)));
      const p = (y * 128 + x) * 4;
      rgba[p] = on ? 150 : 8; rgba[p + 1] = on ? 240 : 15; rgba[p + 2] = on ? 255 : 20; rgba[p + 3] = 255;
    }
    const value = new THREE.DataTexture(rgba, 128, 64); value.flipY = true; value.magFilter = THREE.NearestFilter; value.minFilter = THREE.NearestFilter; value.needsUpdate = true; value.colorSpace = THREE.SRGBColorSpace; return value;
  }, [pixels]);
  useEffect(() => () => texture.dispose(), [texture]);
  const mounting = oledMounting(board, component);
  if (!mounting) return null;
  const { pcbCenterMm: center, headerCenterMm: header, pins, feet } = mounting;
  return <group onClick={e => { e.stopPropagation(); onSelect(); }} onPointerDown={e => { e.stopPropagation(); onSelect(); onBeginDrag?.(e.point, e.pointerId); }}>
    <mesh position={[header.x, header.y, header.z]} castShadow><boxGeometry args={[mounting.headerWidthMm, OLED_PACKAGE.headerHeightMm, board.pitchMm]} /><meshStandardMaterial color="#24282a" roughness={0.75} /></mesh>
    {pins.map(({ terminal, bottomMm, topMm }) => <group key={terminal}>
      <mesh position={[topMm.x, (topMm.y + bottomMm.y) / 2, topMm.z]} castShadow><boxGeometry args={[OLED_PACKAGE.pinWidthMm, topMm.y - bottomMm.y, OLED_PACKAGE.pinWidthMm]} /><meshStandardMaterial color="#c4b578" metalness={0.75} roughness={0.3} /></mesh>
      <mesh position={[topMm.x, center.y + OLED_PACKAGE.pcbThicknessMm / 2 + 0.06, topMm.z]}><cylinderGeometry args={[0.8, 0.8, 0.12, 16]} /><meshStandardMaterial color="#d3c38b" metalness={0.65} roughness={0.35} /></mesh>
    </group>)}
    {feet.map((foot, i) => <mesh key={i} position={[foot.x, foot.y, foot.z]} castShadow><cylinderGeometry args={[OLED_PACKAGE.footRadiusMm, OLED_PACKAGE.footRadiusMm, foot.heightMm, 16]} /><meshStandardMaterial color="#535b61" roughness={0.85} /></mesh>)}
    <group position={[center.x, center.y, center.z]} rotation={[0, component.rotation * Math.PI / 180, 0]}>
      <mesh castShadow receiveShadow><boxGeometry args={[OLED_PACKAGE.widthMm, OLED_PACKAGE.pcbThicknessMm, OLED_PACKAGE.depthMm]} /><meshStandardMaterial color={selected ? '#226b95' : '#184975'} /></mesh>
      <mesh position={[0, 1.5, 1]}><boxGeometry args={[31, 1.4, 22]} /><meshStandardMaterial color="#10161b" /></mesh>
      <mesh position={[0, 2.22, 1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[29.42, 14.7]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    </group>
  </group>;
}
