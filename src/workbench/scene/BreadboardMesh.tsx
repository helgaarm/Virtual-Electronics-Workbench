import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import { connectionGuideSegment } from './connectionGuide';

interface BreadboardMeshProps {
  board: BreadboardDefinition;
  selectedHoleId?: string;
  highlightedHoleIds: Set<string>;
  connectionGuideHoleIds: Set<string>;
  occupiedHoleIds: Set<string>;
  onHoleClick: (holeId: string) => void;
}

function BoardMarkings({ board }: { board: BreadboardDefinition }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3072;
    canvas.height = 2048;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const pixelsPerMm = (canvas.width / board.widthMm + canvas.height / board.depthMm) / 2;
    const toCanvas = (x: number, z: number) => ({
      x: (x / board.widthMm + 0.5) * canvas.width,
      y: (z / board.depthMm + 0.5) * canvas.height,
    });
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const setFont = (heightMm: number, weight = 650) => {
      context.font = `${weight} ${Math.round(heightMm * pixelsPerMm)}px Arial, Helvetica, sans-serif`;
    };
    context.fillStyle = '#5f625d';
    setFont(1.18);
    for (let column = 5; column <= board.columns; column += 5) {
      const hole = board.holes.find((candidate) => candidate.label === `A${column}`);
      if (!hole) continue;
      for (const z of [-16.7, 16.7]) {
        const position = toCanvas(hole.positionMm.x, z);
        context.fillText(String(column), position.x, position.y);
      }
    }
    setFont(1.12, 700);
    for (const row of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      const hole = board.holes.find((candidate) => candidate.label === `${row}1`);
      if (!hole) continue;
      for (const x of [-board.widthMm / 2 + 2.2, board.widthMm / 2 - 2.2]) {
        const position = toCanvas(x, hole.positionMm.z);
        context.fillText(row, position.x, position.y);
      }
    }
    setFont(1.45, 750);
    for (const [symbol, z, color] of [
      ['+', -24.13, '#b74646'], ['\u2212', -20.32, '#3f6795'],
      ['\u2212', 20.32, '#3f6795'], ['+', 24.13, '#b74646'],
    ] as const) {
      context.fillStyle = color;
      for (const x of [-board.widthMm / 2 + 2.2, board.widthMm / 2 - 2.2]) {
        const position = toCanvas(x, z);
        context.fillText(symbol, position.x, position.y);
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 16;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.generateMipmaps = true;
    result.premultiplyAlpha = true;
    return result;
  }, [board]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <mesh position={[0, 3.235, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[board.widthMm, board.depthMm]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function BreadboardMesh({
  board,
  selectedHoleId,
  highlightedHoleIds,
  connectionGuideHoleIds,
  occupiedHoleIds,
  onHoleClick,
}: BreadboardMeshProps) {
  const instanceRef = useRef<THREE.InstancedMesh>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const guide = useMemo(
    () => connectionGuideSegment(board, connectionGuideHoleIds),
    [board, connectionGuideHoleIds],
  );

  useEffect(() => {
    const mesh = instanceRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    board.holes.forEach((hole, index) => {
      matrix.makeTranslation(hole.positionMm.x, hole.positionMm.y + 0.05, hole.positionMm.z);
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
      <RoundedBox
        args={[board.widthMm, board.heightMm, board.depthMm]}
        radius={1.8}
        smoothness={8}
        bevelSegments={6}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color="#f2f0e8" roughness={0.72} />
      </RoundedBox>
      <RoundedBox
        args={[board.widthMm - 4, 0.32, 3]}
        radius={0.16}
        smoothness={4}
        position={[0, 3.22, 0]}
      >
        <meshStandardMaterial color="#d9d7d0" roughness={0.8} />
      </RoundedBox>
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
      {Array.from({ length: Math.floor((board.columns - 1) / 15) }, (_, index) => {
        const leftColumn = (index + 1) * 15;
        const x = (leftColumn + 0.5 - (board.columns + 1) / 2) * board.pitchMm;
        return [-22.22, -18.42, 18.42, 22.22].map((z) => (
          <mesh key={`${leftColumn}-${z}`} position={[x, 3.225, z]}>
            <boxGeometry args={[1.5, 0.14, 0.72]} />
            <meshBasicMaterial color="#f2f0e8" />
          </mesh>
        ));
      })}
      <instancedMesh
        ref={instanceRef}
        args={[undefined, undefined, board.holes.length]}
        onClick={handleClick}
        castShadow
      >
        <cylinderGeometry args={[0.38, 0.68, 0.18, 24]} />
        <meshStandardMaterial vertexColors roughness={0.5} metalness={0.08} />
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
      {guide && (
        <mesh
          position={[guide.centerX, 3.34, guide.centerZ]}
          rotation={[0, guide.rotationY, 0]}
          raycast={() => null}
          renderOrder={2}
        >
          <boxGeometry args={[guide.length, 0.035, 0.22]} />
          <meshBasicMaterial
            color="#267bc0"
            transparent
            opacity={0.3}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <BoardMarkings board={board} />
    </group>
  );
}
