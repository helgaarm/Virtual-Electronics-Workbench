import { memo, Suspense, useEffect, useMemo, useState } from 'react';
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
  const { camera, controls, invalidate } = useThree();
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
    invalidate();
  }, [board.depthMm, board.widthMm, camera, controls, invalidate, preset]);
  return null;
}

/** A subtle, procedural bench surface keeps the scene grounded without an image asset. */
function WorkSurface() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    context.fillStyle = '#c9c2b4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 2) {
      const warmth = 183 + Math.round(7 * Math.sin(y * 0.11) + 3 * Math.sin(y * 0.037));
      context.fillStyle = `rgba(${warmth + 12}, ${warmth + 7}, ${warmth}, 0.12)`;
      context.fillRect(0, y, canvas.width, 1);
    }
    // Fixed values make the material deterministic while breaking up the synthetic flat colour.
    for (let index = 0; index < 180; index += 1) {
      const x = (index * 73) % canvas.width;
      const y = (index * 151) % canvas.height;
      context.fillStyle = index % 3 === 0 ? 'rgba(255,255,255,.055)' : 'rgba(70,59,43,.035)';
      context.fillRect(x, y, 1 + index % 5, 1);
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.RepeatWrapping;
    result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(3, 3);
    return result;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh position={[0, -3.48, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
      <planeGeometry args={[360, 260]} />
      <meshStandardMaterial map={texture} color="#d8d1c4" roughness={0.88} metalness={0} />
    </mesh>
  );
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

function WorkbenchCanvasView(props: Props) {
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
      frameloop="demand"
      camera={{ position: [65, 70, 70], fov: 38, near: 0.1, far: 600 }}
      shadows
      dpr={[1, 1.35]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={props.draggingComponentId ? props.onCancelDrag : props.onClearSelection}
    >
      <color attach="background" args={['#d8d2c7']} />
      <fog attach="fog" args={['#d8d2c7', 155, 285]} />
      <hemisphereLight args={['#f8f4ea', '#6f6556', 1.15]} />
      <directionalLight
        position={[-42, 78, 34]}
        intensity={2.25}
        color="#fff4df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={65}
        shadow-camera-bottom={-65}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[55, 32, -45]} intensity={0.55} color="#c9dcf1" />
      <Suspense fallback={null}>
        <WorkSurface />
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
        <ContactShadows position={[0, -3.43, 0]} opacity={0.38} scale={150} blur={2.5} far={18} frames={1} resolution={1024} color="#51483d" />
      </Suspense>
      <OrbitControls makeDefault enabled={!props.draggingComponentId} enableDamping dampingFactor={0.08} minDistance={45} maxDistance={190} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig preset={props.cameraPreset} board={props.board} />
    </Canvas>
  );
}

/** Keeps the expensive scene reconciler behind a stable component boundary. */
function sameVisibleCurrents(previous: Props, next: Props): boolean {
  return next.components.every((component) => component.kind !== 'led' || (
    Math.round((previous.result.componentCurrents[component.id] ?? 0) * 4_000)
      === Math.round((next.result.componentCurrents[component.id] ?? 0) * 4_000)
  ));
}

export const WorkbenchCanvas = memo(WorkbenchCanvasView, (previous, next) => (
  previous.board === next.board
  && previous.components === next.components
  && previous.cameraPreset === next.cameraPreset
  && previous.selectedComponentId === next.selectedComponentId
  && previous.selectedHoleId === next.selectedHoleId
  && previous.highlightedHoleIds === next.highlightedHoleIds
  && previous.connectionGuideHoleIds === next.connectionGuideHoleIds
  && previous.occupiedHoleIds === next.occupiedHoleIds
  && previous.probes === next.probes
  && previous.selectedProbeId === next.selectedProbeId
  && previous.draggingComponentId === next.draggingComponentId
  && sameVisibleCurrents(previous, next)
));
