import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';

interface BreadboardMeshProps {
  board: BreadboardDefinition;
  selectedHoleId?: string;
  highlightedHoleIds: Set<string>;
  occupiedHoleIds: Set<string>;
  onHoleClick: (holeId: string) => void;
}

export function BreadboardMesh({
  board,
  selectedHoleId,
  highlightedHoleIds,
  occupiedHoleIds,
  onHoleClick,
}: BreadboardMeshProps) {
  const instanceRef = useRef<THREE.InstancedMesh>(null);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = instanceRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    board.holes.forEach((hole, index) => {
      matrix.makeTranslation(hole.positionMm.x, hole.positionMm.y, hole.positionMm.z);
      mesh.setMatrixAt(index, matrix);
      const value =
        hole.id === selectedHoleId
          ? '#2e76d0'
          : highlightedHoleIds.has(hole.id)
            ? '#58a6e7'
            : occupiedHoleIds.has(hole.id)
              ? '#22272b'
              : '#3f4548';
      mesh.setColorAt(index, color.set(value));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [board, color, highlightedHoleIds, occupiedHoleIds, selectedHoleId]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId !== undefined) onHoleClick(board.holes[event.instanceId].id);
  };

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[board.widthMm, board.heightMm, board.depthMm]} />
        <meshStandardMaterial color="#f2f0e8" roughness={0.72} />
      </mesh>
      <mesh position={[0, 3.22, 0]}>
        <boxGeometry args={[board.widthMm - 4, 0.32, 3]} />
        <meshStandardMaterial color="#d9d7d0" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.22, -22.22]}>
        <boxGeometry args={[board.widthMm - 7, 0.12, 0.42]} />
        <meshBasicMaterial color="#d45d5d" />
      </mesh>
      <mesh position={[0, 3.22, -18.42]}>
        <boxGeometry args={[board.widthMm - 7, 0.12, 0.42]} />
        <meshBasicMaterial color="#5a85bd" />
      </mesh>
      <mesh position={[0, 3.22, 22.22]}>
        <boxGeometry args={[board.widthMm - 7, 0.12, 0.42]} />
        <meshBasicMaterial color="#d45d5d" />
      </mesh>
      <mesh position={[0, 3.22, 18.42]}>
        <boxGeometry args={[board.widthMm - 7, 0.12, 0.42]} />
        <meshBasicMaterial color="#5a85bd" />
      </mesh>
      <instancedMesh
        ref={instanceRef}
        args={[undefined, undefined, board.holes.length]}
        onClick={handleClick}
        castShadow
      >
        <cylinderGeometry args={[0.66, 0.58, 1.05, 12]} />
        <meshStandardMaterial vertexColors roughness={0.5} />
      </instancedMesh>
      {Array.from({ length: Math.ceil(board.columns / 5) }, (_, index) => {
        const column = Math.min(board.columns, (index + 1) * 5);
        const x = (column - (board.columns + 1) / 2) * board.pitchMm;
        return (
          <group key={column} position={[x, 3.25, 0]}>
            <mesh position={[0, 0, -16.55]}>
              <boxGeometry args={[0.28, 0.08, 1.1]} />
              <meshBasicMaterial color="#9d9a91" />
            </mesh>
            <mesh position={[0, 0, 16.55]}>
              <boxGeometry args={[0.28, 0.08, 1.1]} />
              <meshBasicMaterial color="#9d9a91" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
