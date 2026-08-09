import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { ThreeEvent } from '@react-three/fiber';
import type { PlacedComponent } from '../../domain/components/types';
import type { SimulationResult } from '../../domain/circuit/types';
import type { InstrumentProbeMarker } from '../../state/instrumentSelectors';
import { ComponentMeshes } from '../components/ComponentMeshes';
import { ProbeMeshes } from '../components/ProbeMeshes';
import { BreadboardMesh } from './BreadboardMesh';
import { dragCandidateHoleId } from './dragPlacement';

interface Props {
  board: BreadboardDefinition;
  components: PlacedComponent[];
  result: SimulationResult;
  cameraPreset: '3d' | 'top';
  selectedComponentId?: string;
  selectedHoleId?: string;
  highlightedHoleIds: Set<string>;
  connectionGuideHoleIds?: Set<string>;
  occupiedHoleIds: Set<string>;
  probes?: readonly InstrumentProbeMarker[];
  selectedProbeId?: string;
  onSelectComponent: (id: string) => void;
  onSelectHole: (id: string) => void;
  onClearSelection: () => void;
  draggingComponentId?: string;
  onBeginDrag?: (id: string) => void;
  onDragCandidate?: (holeId: string | undefined) => void;
  onDropComponent?: (holeId: string | undefined) => void;
  onCancelDrag?: () => void;
}

function CameraRig({ preset, board }: { preset: '3d' | 'top'; board: BreadboardDefinition }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const position = preset === 'top'
      ? new THREE.Vector3(0, 125, 0.01)
      : new THREE.Vector3(board.widthMm * 0.68, 70, board.depthMm * 0.9);
    camera.position.copy(position);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controls && 'target' in controls) {
      (controls.target as THREE.Vector3).set(0, 0, 0);
      (controls as unknown as { update: () => void }).update();
    }
  }, [board.depthMm, board.widthMm, camera, controls, preset]);
  return null;
}

function PlacementPlane({ board, onCandidate, onDrop, dragOrigin, anchorOffset, activePointerId, onCancel }: {
  board: BreadboardDefinition;
  onCandidate: (holeId: string | undefined) => void;
  onDrop: (holeId: string | undefined) => void;
  dragOrigin?: THREE.Vector3;
  anchorOffset?: THREE.Vector3;
  activePointerId?: number;
  onCancel: () => void;
}) {
  const movedFarEnough = (event: ThreeEvent<PointerEvent>) =>
    !dragOrigin || Math.hypot(event.point.x - dragOrigin.x, event.point.z - dragOrigin.z) >= board.pitchMm * 0.45;
  const candidateAt = (event: ThreeEvent<PointerEvent>) =>
    dragCandidateHoleId(board, event.point, anchorOffset);
  const updateCandidate = (event: ThreeEvent<PointerEvent>) => {
    if (activePointerId !== undefined && event.pointerId !== activePointerId) return;
    event.stopPropagation();
    onCandidate(movedFarEnough(event) ? candidateAt(event) : undefined);
  };

  return (
    <mesh
      position={[0, 3.28, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={updateCandidate}
      onPointerUp={(event) => {
        if (activePointerId !== undefined && event.pointerId !== activePointerId) return;
        event.stopPropagation();
        if (movedFarEnough(event)) onDrop(candidateAt(event));
        else onCancel();
      }}
      onPointerOut={() => onCandidate(undefined)}
    >
      <planeGeometry args={[board.widthMm, board.depthMm]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function WorkbenchCanvas(props: Props) {
  const [dragOrigin, setDragOrigin] = useState<THREE.Vector3>();
  const [anchorOffset, setAnchorOffset] = useState<THREE.Vector3>();
  const [activePointerId, setActivePointerId] = useState<number>();
  const { draggingComponentId, onCancelDrag } = props;
  useEffect(() => {
    if (!draggingComponentId) return undefined;
    const cancel = (event: PointerEvent) => {
      if (activePointerId === undefined || event.pointerId === activePointerId) {
        setActivePointerId(undefined);
        onCancelDrag?.();
      }
    };
    const cancelOnBlur = () => {
      setActivePointerId(undefined);
      onCancelDrag?.();
    };
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancelOnBlur);
    };
  }, [activePointerId, draggingComponentId, onCancelDrag]);
  return (
    <Canvas
      camera={{ position: [65, 70, 70], fov: 38, near: 0.1, far: 600 }}
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={props.draggingComponentId ? props.onCancelDrag : props.onClearSelection}
    >
      <color attach="background" args={['#e8e5de']} />
      <fog attach="fog" args={['#e8e5de', 145, 260]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[40, 80, 35]} intensity={2.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Suspense fallback={null}>
        <BreadboardMesh
          board={props.board}
          selectedHoleId={props.selectedHoleId}
          highlightedHoleIds={props.highlightedHoleIds}
          connectionGuideHoleIds={props.connectionGuideHoleIds ?? new Set()}
          occupiedHoleIds={props.occupiedHoleIds}
          onHoleClick={props.onSelectHole}
        />
        <ComponentMeshes
          board={props.board}
          components={props.components}
          result={props.result}
          selectedComponentId={props.selectedComponentId}
          onSelect={props.onSelectComponent}
          onBeginDrag={props.onBeginDrag ? (id, hitPoint, pointerId) => {
            const component = props.components.find((candidate) => candidate.id === id);
            const anchorHoleId = component ? Object.values(component.terminalHoleIds)[0] : undefined;
            const anchorHole = props.board.holes.find((hole) => hole.id === anchorHoleId);
            setDragOrigin(hitPoint.clone());
            setAnchorOffset(anchorHole
              ? new THREE.Vector3(hitPoint.x - anchorHole.positionMm.x, 0, hitPoint.z - anchorHole.positionMm.z)
              : new THREE.Vector3());
            setActivePointerId(pointerId);
            props.onBeginDrag?.(id);
          } : undefined}
        />
        <ProbeMeshes
          board={props.board}
          probes={props.probes ?? []}
          selectedProbeId={props.selectedProbeId}
        />
        {props.draggingComponentId && props.onDragCandidate && props.onDropComponent && (
          <PlacementPlane
            board={props.board}
            dragOrigin={dragOrigin}
            anchorOffset={anchorOffset}
            activePointerId={activePointerId}
            onCandidate={props.onDragCandidate}
            onDrop={props.onDropComponent}
            onCancel={props.onCancelDrag ?? props.onClearSelection}
          />
        )}
        <ContactShadows position={[0, -3.25, 0]} opacity={0.28} scale={150} blur={2.4} far={16} />
      </Suspense>
      <OrbitControls makeDefault enabled={!props.draggingComponentId} enableDamping dampingFactor={0.08} minDistance={45} maxDistance={190} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig preset={props.cameraPreset} board={props.board} />
    </Canvas>
  );
}
