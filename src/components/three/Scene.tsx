'use client';
import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WheelAssembly, HubAssembly } from './WheelAssembly';
import { SCALE, archCurve } from './geometry';
import { isKnown, VERDICT_COLOR, type ClearanceVerdict } from '@/engine/types';
import { ORIGINAL_FACES, faceById } from '@/data/faces';
import { useBuild, useAnalysis, type CameraPreset, type AxleAnalysis } from '@/store/build';
import type { CornerEnvelope } from '@/engine/collision';

/**
 * DEMONSTRATION CHASSIS PROPORTIONS.
 *
 * These place the wheels and draw a body silhouette so the studio has
 * something to look at. They are generic saloon proportions, NOT measured
 * from any vehicle, and nothing computed from them feeds a clearance
 * result — the engine takes its dimensions from the corner envelope
 * alone. Replacing this with a real asset is an asset-acquisition task.
 */
const DEMO = {
  wheelbaseMm: 2830,
  trackMm: 1530,
  hubHeightFactor: 1.0,
  bodyWidthMm: 1810,
  bodyLengthMm: 4910,
  sillHeightMm: 240,
  beltlineMm: 900,
  roofMm: 1400,
};

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  side: { pos: [0.4, 0.9, 6.2], target: [0, 0.6, 0] },
  front: { pos: [6.2, 1.1, 0.1], target: [0, 0.6, 0] },
  rear: { pos: [-6.2, 1.1, 0.1], target: [0, 0.6, 0] },
  front_three_quarter: { pos: [3.9, 1.7, 4.3], target: [0.4, 0.5, 0.2] },
  rear_three_quarter: { pos: [-3.9, 1.7, 4.3], target: [-0.4, 0.5, 0.2] },
  elevated: { pos: [3.2, 4.4, 4.0], target: [0, 0.3, 0] },
  wheel_close: { pos: [1.35, 0.52, 2.15], target: [0.35, 0.33, 1.41] },
};

function CameraRig({ preset }: { preset: CameraPreset }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
    camera.position.set(...p.pos);
    if (controls.current) {
      controls.current.target.set(...p.target);
      controls.current.update();
    }
  }, [preset, camera]);
  return <OrbitControls ref={controls} enableDamping dampingFactor={0.09}
    minDistance={0.6} maxDistance={16} maxPolarAngle={Math.PI / 2.02} makeDefault />;
}

/** Worst verdict for one component across every evaluated condition. */
function verdictFor(a: AxleAnalysis, componentIds: string[]): ClearanceVerdict {
  if (!a.clearance) return 'indeterminate';
  const sev: Record<ClearanceVerdict, number> = { clear: 0, indeterminate: 1, marginal: 2, interference: 3 };
  let out: ClearanceVerdict = 'clear';
  let seen = false;
  for (const r of a.clearance.results) {
    if (!componentIds.some(id => r.componentId === id || r.componentId.includes(id))) continue;
    seen = true;
    if (sev[r.verdict] > sev[out]) out = r.verdict;
  }
  return seen ? out : 'indeterminate';
}

/**
 * The fender arch, drawn at its measured radius and lateral position and
 * coloured by the arch verdict. An arch whose position is unknown draws
 * NOTHING: an invented lip would read as information.
 */
function FenderArch({
  envelope, dropMm, hub, mirror, verdict,
}: {
  envelope: CornerEnvelope | undefined;
  dropMm: number;
  hub: [number, number, number];
  mirror: boolean;
  verdict: ClearanceVerdict;
}) {
  const geom = useMemo(() => {
    if (!envelope || !isKnown(envelope.archRadiusMm) || !isKnown(envelope.archLateralMm)) return null;
    const curve = archCurve(envelope.archRadiusMm.value - dropMm, envelope.archLateralMm.value);
    return new THREE.TubeGeometry(curve, 48, 9 * SCALE, 8, false);
  }, [envelope, dropMm]);
  if (!geom) return null;
  const side = mirror ? -1 : 1;
  return (
    <group position={[hub[0] * side, hub[1], hub[2]]} scale={[side, 1, 1]}>
      <mesh geometry={geom}>
        <meshStandardMaterial
          color={VERDICT_COLOR[verdict]} metalness={0.3} roughness={0.5}
          emissive={VERDICT_COLOR[verdict]}
          emissiveIntensity={verdict === 'interference' ? 0.6 : verdict === 'marginal' ? 0.35 : 0.08}
        />
      </mesh>
    </group>
  );
}

/** Inner obstruction, drawn only where its position is recorded. */
function InnerObstruction({
  envelope, hub, mirror, verdict,
}: {
  envelope: CornerEnvelope | undefined;
  hub: [number, number, number];
  mirror: boolean;
  verdict: ClearanceVerdict;
}) {
  const ob = envelope?.inner[0];
  if (!ob || !isKnown(ob.radialMm) || !isKnown(ob.lateralDepthMm)) return null;
  const depth = ob.lateralDepthMm.value;
  const side = mirror ? -1 : 1;
  return (
    <group position={[hub[0] * side, hub[1], hub[2]]} scale={[side, 1, 1]}>
      <mesh position={[-depth * 0.5 * SCALE, ob.radialMm.value * 0.55 * SCALE, 0]}
        rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[34 * SCALE, 34 * SCALE, depth * SCALE, 18]} />
        <meshStandardMaterial
          color={VERDICT_COLOR[verdict]} metalness={0.4} roughness={0.55}
          emissive={VERDICT_COLOR[verdict]}
          emissiveIntensity={verdict === 'interference' ? 0.55 : verdict === 'marginal' ? 0.3 : 0.05}
        />
      </mesh>
    </group>
  );
}

/** Generic body silhouette, clearly demonstration geometry. */
function DemoBody({ transparent, dropMm, clipPlanes }: {
  transparent: boolean; dropMm: number; clipPlanes?: THREE.Plane[];
}) {
  const drop = dropMm * SCALE;
  const mat = {
    color: '#3b434c', metalness: 0.55, roughness: 0.42,
    transparent: true, opacity: transparent ? 0.17 : 0.92,
    side: THREE.DoubleSide, clippingPlanes: clipPlanes ?? null,
  };
  const L = DEMO.bodyLengthMm * SCALE, W = DEMO.bodyWidthMm * SCALE;
  const sill = DEMO.sillHeightMm * SCALE - drop;
  const belt = DEMO.beltlineMm * SCALE - drop;
  const roof = DEMO.roofMm * SCALE - drop;
  const wb = DEMO.wheelbaseMm * SCALE;
  return (
    <group>
      {/* centre section between the arches */}
      <mesh position={[0, (sill + belt) / 2, 0]}>
        <boxGeometry args={[wb * 0.62, belt - sill, W]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* nose and tail, outboard of the wheel openings */}
      <mesh position={[L * 0.37, (sill + belt * 0.92) / 2, 0]}>
        <boxGeometry args={[L * 0.26, belt * 0.92 - sill, W * 0.96]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[-L * 0.37, (sill + belt * 0.92) / 2, 0]}>
        <boxGeometry args={[L * 0.26, belt * 0.92 - sill, W * 0.96]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* roof */}
      <mesh position={[-0.18, (belt + roof) / 2, 0]}>
        <boxGeometry args={[L * 0.46, roof - belt, W * 0.84]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
}

function Corner({
  analysis, axle, zMm, dropMm, mirror, viewMode, tireVisible, transparent, clipPlanes, showDimensions,
}: {
  analysis: AxleAnalysis;
  axle: 'front' | 'rear';
  zMm: number;
  dropMm: number;
  mirror: boolean;
  viewMode: ReturnType<typeof useBuild.getState>['viewMode'];
  tireVisible: boolean;
  transparent: boolean;
  clipPlanes?: THREE.Plane[];
  showDimensions: boolean;
}) {
  const { vehicle } = useAnalysis();
  const envelope = axle === 'front' ? vehicle.front : vehicle.rear;
  const cfg = analysis.config;
  const face = faceById(cfg.faceId) ?? ORIGINAL_FACES[0]!;
  const design = face.design ?? ORIGINAL_FACES[0]!.design!;

  if (!analysis.wheel) return null;
  const hubX = (DEMO.trackMm / 2) * SCALE;
  // The wheel stays on the ground. Lowering moves the BODY down onto the wheel,
  // which is what shrinks the arch gap, so the hub height is simply the tyre
  // radius and the drop is applied to the body and the arch instead.
  const hubY = analysis.tire.radiusMm * SCALE;
  const hub: [number, number, number] = [hubX, hubY, zMm * SCALE];

  const archVerdict = verdictFor(analysis, ['fender_lip', 'well_ceiling']);
  const innerVerdict = verdictFor(analysis, ['strut', 'trailing_arm', 'measured_inner']);
  const caliperVerdict = verdictFor(analysis, ['caliper']);

  return (
    <>
      <WheelAssembly
        wheel={analysis.wheel}
        tire={analysis.tire}
        design={design}
        exposedLipMm={analysis.assembly.exposedLipIn * 25.4}
        hardwareCount={analysis.assembly.hardwareCount}
        boltCount={vehicle.bolt.count}
        pcdMm={vehicle.bolt.pcdMm}
        camberDeg={analysis.state.camberDeg}
        faceFinish={cfg.faceFinish}
        lipFinish={cfg.lipFinish}
        hardwareFinish={cfg.hardwareFinish}
        viewMode={viewMode}
        tireVisible={tireVisible}
        hubPosition={hub}
        mirror={mirror}
        transparent={transparent && viewMode === 'complete' ? false : false}
        clipPlanes={clipPlanes}
      />
      <HubAssembly
        rotorDiameterMm={envelope && isKnown(envelope.brake.rotorDiameterMm) ? envelope.brake.rotorDiameterMm.value : null}
        caliperRadialMm={envelope && isKnown(envelope.brake.caliperRadialMm) ? envelope.brake.caliperRadialMm.value : null}
        caliperAxialMm={envelope && isKnown(envelope.brake.caliperAxialMm) ? envelope.brake.caliperAxialMm.value : null}
        hubPosition={hub}
        mirror={mirror}
        highlight={caliperVerdict === 'interference' || caliperVerdict === 'marginal'
          ? VERDICT_COLOR[caliperVerdict] : undefined}
      />
      <FenderArch envelope={envelope} dropMm={dropMm} hub={hub} mirror={mirror} verdict={archVerdict} />
      <InnerObstruction envelope={envelope} hub={hub} mirror={mirror} verdict={innerVerdict} />
      {showDimensions && !mirror && analysis.clearance && (
        <Html position={[hubX + 0.18, hubY + analysis.tire.radiusMm * SCALE * 0.55, zMm * SCALE]}
          center distanceFactor={3.2} zIndexRange={[5, 0]}>
          <div style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 10, lineHeight: 1.45,
            background: 'rgba(16,19,22,.88)', color: '#e7eaed', padding: '5px 8px',
            borderRadius: 4, border: '1px solid #3b434c', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            <div style={{ color: '#c9a063', fontWeight: 600 }}>
              {axle === 'front' ? 'FRONT' : 'REAR'} {analysis.assembly.achievedWidthIn.toFixed(1)}J&times;{cfg.diameterIn} ET{analysis.assembly.achievedEtMm.toFixed(0)}
            </div>
            <div>{cfg.tire.sectionMm}/{cfg.tire.aspect}R{cfg.tire.diameterIn}</div>
            <div style={{ color: VERDICT_COLOR[analysis.clearance.overall] }}>
              {analysis.clearance.binding
                ? `min ${analysis.clearance.binding.minDistanceMm} mm · ${analysis.clearance.binding.label}`
                : 'no evaluable clearance'}
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

export function Scene() {
  const s = useBuild();
  const { front, rear } = useAnalysis();

  const clipPlanes = useMemo(
    () => (s.sectionPlane ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 1.55)] : undefined),
    [s.sectionPlane],
  );

  const frontZ = DEMO.wheelbaseMm / 2;
  const rearZ = -DEMO.wheelbaseMm / 2;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_PRESETS.front_three_quarter.pos, fov: 38, near: 0.05, far: 100 }}
      gl={{ localClippingEnabled: true, antialias: true }}
      onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
    >
      <color attach="background" args={['#101316']} />
      <fog attach="fog" args={['#101316', 11, 30]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 7, 4]} intensity={1.5} castShadow
        shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, -4]} intensity={0.5} />
      <pointLight position={[2, 1.2, 3]} intensity={18} distance={7} color="#dfe7f0" />
      <pointLight position={[-2, 1.0, -2]} intensity={10} distance={6} color="#c9a063" />

      <Suspense fallback={null}>
        {s.viewMode === 'complete' && (
          <DemoBody
            transparent={s.transparentBody}
            dropMm={Math.max(s.suspension.dropFrontMm, s.suspension.dropRearMm)}
            clipPlanes={clipPlanes}
          />
        )}

        <Corner analysis={front} axle="front" zMm={frontZ} dropMm={s.suspension.dropFrontMm}
          mirror={false} viewMode={s.viewMode} tireVisible={s.tireVisible}
          transparent={s.transparentBody} clipPlanes={clipPlanes} showDimensions={s.showDimensions} />
        <Corner analysis={front} axle="front" zMm={frontZ} dropMm={s.suspension.dropFrontMm}
          mirror viewMode={s.viewMode} tireVisible={s.tireVisible}
          transparent={s.transparentBody} clipPlanes={clipPlanes} showDimensions={false} />
        <Corner analysis={rear} axle="rear" zMm={rearZ} dropMm={s.suspension.dropRearMm}
          mirror={false} viewMode={s.viewMode} tireVisible={s.tireVisible}
          transparent={s.transparentBody} clipPlanes={clipPlanes} showDimensions={s.showDimensions} />
        <Corner analysis={rear} axle="rear" zMm={rearZ} dropMm={s.suspension.dropRearMm}
          mirror viewMode={s.viewMode} tireVisible={s.tireVisible}
          transparent={s.transparentBody} clipPlanes={clipPlanes} showDimensions={false} />

        <ContactShadows position={[0, 0.001, 0]} opacity={0.5} scale={9} blur={2.4} far={1.6} />
        <Grid position={[0, 0, 0]} args={[20, 20]} cellSize={0.25} cellThickness={0.5}
          cellColor="#272d33" sectionSize={1} sectionThickness={0.9} sectionColor="#39424b"
          fadeDistance={17} fadeStrength={1.3} infiniteGrid />
      </Suspense>

      <CameraRig preset={s.cameraPreset} />
    </Canvas>
  );
}
