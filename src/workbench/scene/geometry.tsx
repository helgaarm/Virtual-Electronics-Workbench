import { useMemo } from 'react';
import * as THREE from 'three';

interface CylinderBetweenProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
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
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius, radius, transform.length, 12]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}
