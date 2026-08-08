import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createSmoothTubeGeometry } from './smoothTubeGeometry';

interface CylinderBetweenProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
}

interface SmoothTubeProps {
  points: THREE.Vector3[];
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
  tubularSegments?: number;
}

export function CylinderBetween({
  start,
  end,
  radius,
  color,
  roughness = 0.55,
  metalness = 0,
}: CylinderBetweenProps) {
  const transform = useMemo(() => {
    const direction = end.clone().sub(start);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    return { midpoint, quaternion, length: direction.length() };
  }, [start, end]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, transform.length, 28]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

export function SmoothTube({
  points,
  radius,
  color,
  roughness = 0.55,
  metalness = 0,
  tubularSegments = 40,
}: SmoothTubeProps) {
  const pointSignature = points.map((point) => `${point.x},${point.y},${point.z}`).join(';');
  const geometry = useMemo(() => {
    const stablePoints = pointSignature.split(';').map((entry) => {
      const [x, y, z] = entry.split(',').map(Number);
      return new THREE.Vector3(x, y, z);
    });
    return createSmoothTubeGeometry(stablePoints, radius, tubularSegments);
  }, [pointSignature, radius, tubularSegments]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}
