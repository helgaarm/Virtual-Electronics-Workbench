import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { PlacedComponent } from '../../domain/components/types';
import type { SimulationResult } from '../../domain/circuit/types';
import { ComponentMeshes } from '../components/ComponentMeshes';
import { BreadboardMesh } from './BreadboardMesh';

interface Props {
  board: BreadboardDefinition;
  components: PlacedComponent[];
  result: SimulationResult;
  cameraPreset: '3d' | 'top';
  selectedComponentId?: string;
  selectedHoleId?: string;
  highlightedHoleIds: Set<string>;
  occupiedHoleIds: Set<string>;
  onSelectComponent: (id: string) => void;
  onSelectHole: (id: string) => void;
  onClearSelection: () => void;
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

export function WorkbenchCanvas(props: Props) {
  return (
    <Canvas
      camera={{ position: [65, 70, 70], fov: 38, near: 0.1, far: 600 }}
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={props.onClearSelection}
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
          occupiedHoleIds={props.occupiedHoleIds}
          onHoleClick={props.onSelectHole}
        />
        <ComponentMeshes
          board={props.board}
          components={props.components}
          result={props.result}
          selectedComponentId={props.selectedComponentId}
          onSelect={props.onSelectComponent}
        />
        <ContactShadows position={[0, -3.25, 0]} opacity={0.28} scale={150} blur={2.4} far={16} />
      </Suspense>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={45} maxDistance={190} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig preset={props.cameraPreset} board={props.board} />
    </Canvas>
  );
}
