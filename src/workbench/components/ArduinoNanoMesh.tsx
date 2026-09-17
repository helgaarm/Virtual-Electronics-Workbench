import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ArduinoNanoComponent } from '../../domain/components/types';
import { NANO_PIN_NAMES } from '../../domain/components/arduinoNano';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import { nanoMounting, NANO_PACKAGE } from '../../domain/physical/arduinoNano';
import { NanoUsbPowerMesh } from './NanoUsbPowerMesh';

export function ArduinoNanoMesh({ component, board, selected, current, powerOn, onSelect, onBeginDrag }: {
  component: ArduinoNanoComponent; board: BreadboardDefinition; selected: boolean; current: number; powerOn: boolean;
  onSelect: () => void; onBeginDrag?: (point: THREE.Vector3, pointerId: number) => void;
}) {
  const marking = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 576;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8f7f6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 32px sans-serif';
    NANO_PIN_NAMES.forEach((name, i) => {
      const x = (22.5 + ((i < 15 ? i : 29 - i) - 7) * 2.54) * 32;
      ctx.save(); ctx.translate(x, (i < 15 ? 3.4 : 14.6) * 32); ctx.rotate(-Math.PI / 2);
      ctx.fillText(name.replace('/TX', '').replace('/RX', '').replace('RESET', 'RST'), 0, 0); ctx.restore();
    });
    ctx.font = 'bold 62px sans-serif'; ctx.fillText('NANO', 1020, 275);
    ctx.font = '28px sans-serif'; ctx.fillText('CLASSIC · 5V', 1020, 340);
    ctx.font = 'bold 20px sans-serif'; ctx.fillText('PWR', 352, 164);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => marking.dispose(), [marking]);
  const mounting = nanoMounting(board, component);
  if (!mounting) return null;
  const { pins: holes, centerMm: center } = mounting;
  const pcbY = center.y;
  const glow = Math.min(1, Math.max(0, current) / 0.003);
  return <>
    <NanoUsbPowerMesh board={board} centerMm={center} rotation={component.rotation} powerOn={powerOn} />
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerDown={(event) => { event.stopPropagation(); onSelect(); onBeginDrag?.(event.point, event.pointerId); }}>
    {holes.map((hole, i) => <mesh key={i} position={[hole!.positionMm.x, pcbY - 2, hole!.positionMm.z]}><boxGeometry args={[0.64, 5, 0.64]} /><meshStandardMaterial color="#cbb879" metalness={0.7} roughness={0.3} /></mesh>)}
    <group position={[center.x, pcbY, center.z]} rotation={[0, component.rotation * Math.PI / 180, 0]}>
      <mesh castShadow><boxGeometry args={[NANO_PACKAGE.lengthMm, 1.6, NANO_PACKAGE.widthMm]} /><meshStandardMaterial color={selected ? '#277d91' : '#086d79'} /></mesh>
      {[-7.62, 7.62].map((z) => <mesh key={z} position={[0, -1.9, z]}><boxGeometry args={[38.1, 2.2, 2.3]} /><meshStandardMaterial color="#22292c" /></mesh>)}
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[45, 18]} /><meshBasicMaterial map={marking} transparent depthWrite={false} /></mesh>
      <mesh position={[-18.3, 2.7, 0]} castShadow><boxGeometry args={[8, 3.8, 7.5]} /><meshStandardMaterial color="#b8c1c5" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[-22.36, 2.7, 0]}><boxGeometry args={[0.1, 2.3, 5.7]} /><meshStandardMaterial color="#263036" /></mesh>
      <mesh position={[-2, 1.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><boxGeometry args={[7, 1.4, 7]} /><meshStandardMaterial color="#252b30" /></mesh>
      <mesh position={[-11.5, 1.2, 2]}><boxGeometry args={[1.7, 0.7, 1]} /><meshStandardMaterial color={glow > 0.1 ? '#ffe07a' : '#665329'} emissive="#ffbf24" emissiveIntensity={glow * 2} /></mesh>
      <mesh position={[-11.5, 1.2, -2]}><boxGeometry args={[1.7, 0.7, 1]} /><meshStandardMaterial color={powerOn ? '#8fea9b' : '#34483c'} emissive="#58d475" emissiveIntensity={powerOn ? 1.4 : 0} /></mesh>
    </group>
  </group></>;
}
