import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { Point3Mm } from '../../domain/physical/geometry';
import { SmoothTube } from '../scene/geometry';
import { nanoUsbPowerLayout, USB_CABLE_RADIUS_MM, USB_SUPPLY_SIZE_MM } from '../scene/nanoUsbPower';

export function NanoUsbPowerMesh({ board, centerMm, rotation, powerOn }: {
  board: BreadboardDefinition; centerMm: Point3Mm; rotation: number; powerOn: boolean;
}) {
  const label = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 192;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#dce9e6'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = 'bold 58px sans-serif'; context.fillText('USB', 192, 65);
    context.font = '40px sans-serif'; context.fillText('5 V DC', 192, 133);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => label.dispose(), [label]);
  const { sourceMm, cablePointsMm, direction } = nanoUsbPowerLayout(board, centerMm, rotation);
  return <group>
    <SmoothTube points={cablePointsMm.map(point => new THREE.Vector3(point.x, point.y, point.z))}
      radius={USB_CABLE_RADIUS_MM} color="#30383b" roughness={0.82} tubularSegments={48} />
    <group position={[sourceMm.x, sourceMm.y, sourceMm.z]}>
      <RoundedBox args={[USB_SUPPLY_SIZE_MM.x, USB_SUPPLY_SIZE_MM.y, USB_SUPPLY_SIZE_MM.z]} radius={1.2} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color="#35464b" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 4.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[17, 8.5]} /><meshBasicMaterial map={label} transparent depthWrite={false} />
      </mesh>
      <mesh position={[-7.5, 4.03, -5.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 12]} />
        <meshStandardMaterial color={powerOn ? '#8fea9b' : '#34483c'} emissive="#58d475" emissiveIntensity={powerOn ? 1.4 : 0} />
      </mesh>
      <mesh position={[direction * 11.9, 0, 0]}>
        <boxGeometry args={[0.5, 4.4, 11.5]} /><meshStandardMaterial color="#a6adb0" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[direction * 14, 0, 0]} castShadow>
        <boxGeometry args={[4, 4, 10]} /><meshStandardMaterial color="#293034" roughness={0.85} />
      </mesh>
    </group>
    <group position={[centerMm.x, centerMm.y + 2.7, centerMm.z]} rotation={[0, rotation * Math.PI / 180, 0]}>
      <mesh position={[-23.5, 0, 0]} castShadow>
        <boxGeometry args={[2.5, 2.2, 5.5]} /><meshStandardMaterial color="#bdc6c9" metalness={0.85} roughness={0.3} />
      </mesh>
      <RoundedBox args={[8, 4.4, 7]} position={[-28.5, 0, 0]} radius={0.7} smoothness={2} castShadow>
        <meshStandardMaterial color="#30383b" roughness={0.82} />
      </RoundedBox>
      <mesh position={[-34, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.65, 1.65, 3.5, 12]} /><meshStandardMaterial color="#30383b" roughness={0.85} />
      </mesh>
      {[0, 1, 2].map(index => <mesh key={index} position={[-33 - index, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.6, 0.15, 4, 12]} /><meshStandardMaterial color="#475055" roughness={0.9} />
      </mesh>)}
    </group>
  </group>;
}
