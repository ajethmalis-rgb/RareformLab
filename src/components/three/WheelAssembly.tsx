'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  SCALE, LATHE_ROTATION, tireProfile, barrelProfile, lipProfile,
  spokeBoxes, hardwarePositions, lugPositions,
} from './geometry';
import type { WheelGeometry } from '@/engine/wheel';
import type { MountedTire } from '@/engine/tire';
import { finishById } from '@/data/components';
import type { SpokeDesign } from '@/data/faces';
import type { ViewMode } from '@/store/build';

interface Props {
  wheel: WheelGeometry;
  tire: MountedTire;
  design: SpokeDesign;
  exposedLipMm: number;
  hardwareCount: number;
  boltCount: number;
  pcdMm: number;
  camberDeg: number;
  faceFinish: string;
  lipFinish: string;
  hardwareFinish: string;
  viewMode: ViewMode;
  tireVisible: boolean;
  /** Mounted at the hub: this is the hub position in scene metres. */
  hubPosition: [number, number, number];
  /** Mirror for the left-hand side of the car. */
  mirror?: boolean;
  transparent?: boolean;
  clipPlanes?: THREE.Plane[];
}

function useMetal(id: string, transparent: boolean, clipPlanes?: THREE.Plane[]) {
  const f = finishById(id);
  return useMemo(() => ({
    color: f.hex, metalness: f.metal, roughness: f.rough,
    transparent, opacity: transparent ? 0.55 : 1,
    clippingPlanes: clipPlanes ?? null,
    clipShadows: true,
  }), [f.hex, f.metal, f.rough, transparent, clipPlanes]);
}

/**
 * The wheel assembles AT THE HUB, at the position the engine computes.
 * It is never placed by eye: the group sits at the hub centre, camber
 * rotates it about that centre, and every lateral dimension inside the
 * group is measured from the hub mounting plane at local x = 0.
 */
export function WheelAssembly(props: Props) {
  const {
    wheel, tire, design, exposedLipMm, hardwareCount: hwCount,
    boltCount, pcdMm, camberDeg, viewMode, tireVisible, hubPosition,
    mirror = false, transparent = false, clipPlanes,
  } = props;

  const tirePts = useMemo(() => tireProfile(wheel, tire), [wheel, tire]);
  const barrelPts = useMemo(() => barrelProfile(wheel), [wheel]);
  const lipPts = useMemo(() => lipProfile(wheel, exposedLipMm), [wheel, exposedLipMm]);

  const faceX = wheel.outerFlangeX - Math.max(exposedLipMm, 0);
  const faceRadius = wheel.rimRadiusMm - 14;
  const padThickness = 11;
  const boxes = useMemo(
    () => spokeBoxes(design, faceRadius, faceX, padThickness),
    [design, faceRadius, faceX],
  );
  const hwPos = useMemo(
    () => hardwarePositions(hwCount, wheel.rimRadiusMm - 9, faceX - 1),
    [hwCount, wheel.rimRadiusMm, faceX],
  );
  const lugPos = useMemo(() => lugPositions(boltCount, pcdMm, faceX - 3), [boltCount, pcdMm, faceX]);

  const faceMat = useMetal(props.faceFinish, transparent, clipPlanes);
  const lipMat = useMetal(props.lipFinish, transparent, clipPlanes);
  const hwMat = useMetal(props.hardwareFinish, false, clipPlanes);

  // Exploded view separates the components along the spin axis so the
  // three pieces of a three-piece wheel can be seen as three pieces.
  const ex = viewMode === 'exploded' ? 1 : 0;
  // A negative scale mirrors the CHILDREN but leaves the group where its own
  // position puts it, so the lateral position has to be mirrored too or both
  // wheels of an axle land on the same side of the car.
  const side = mirror ? -1 : 1;
  const hub: [number, number, number] = [hubPosition[0] * side, hubPosition[1], hubPosition[2]];
  const showWheel = viewMode !== 'hub_only';
  const showTire = tireVisible && (viewMode === 'complete' || viewMode === 'wheel_with_tire' || ex === 1);

  return (
    <group position={hub} scale={[side, 1, 1]}>
      {/* camber rotates the assembly about the hub centre */}
      <group rotation={[0, 0, THREE.MathUtils.degToRad(-camberDeg)]}>
        {showTire && (
          <mesh rotation={LATHE_ROTATION} position={[ex * 0.09, 0, 0]} castShadow>
            <latheGeometry args={[tirePts, 72]} />
            <meshStandardMaterial
              color="#1b1e22" metalness={0.05} roughness={0.92}
              side={THREE.DoubleSide}
              transparent={transparent} opacity={transparent ? 0.4 : 1}
              clippingPlanes={clipPlanes ?? null}
            />
          </mesh>
        )}

        {showWheel && (
          <>
            {/* inner barrel + shell */}
            <mesh rotation={LATHE_ROTATION} position={[ex * -0.07, 0, 0]} castShadow>
              <latheGeometry args={[barrelPts, 72]} />
              <meshStandardMaterial {...lipMat} side={THREE.DoubleSide} />
            </mesh>

            {/* outer lip, so a polished lip reads separately from the face */}
            <mesh rotation={LATHE_ROTATION} position={[ex * 0.05, 0, 0]}>
              <latheGeometry args={[lipPts, 72]} />
              <meshStandardMaterial {...lipMat} side={THREE.DoubleSide} />
            </mesh>

            {/* centre disc */}
            <group position={[ex * -0.02, 0, 0]}>
              {/* hub pad */}
              <mesh rotation={[0, 0, Math.PI / 2]} position={[(faceX - padThickness / 2) * SCALE, 0, 0]}>
                <cylinderGeometry args={[
                  faceRadius * design.hubFraction * SCALE,
                  faceRadius * design.hubFraction * SCALE,
                  padThickness * SCALE, 40,
                ]} />
                <meshStandardMaterial {...faceMat} />
              </mesh>
              {/* outer ring where the face meets the shell */}
              <mesh rotation={[0, 0, Math.PI / 2]} position={[(faceX - padThickness / 2) * SCALE, 0, 0]}>
                <torusGeometry args={[faceRadius * SCALE, (padThickness / 2) * SCALE, 10, 56]} />
                <meshStandardMaterial {...faceMat} />
              </mesh>
              {/* spokes */}
              {boxes.map((b, i) => (
                <mesh key={i} position={b.position} rotation={b.rotation} castShadow>
                  <boxGeometry args={b.size} />
                  <meshStandardMaterial {...faceMat} />
                </mesh>
              ))}
              {/* assembly hardware */}
              {hwPos.map((p, i) => (
                <mesh key={`h${i}`} position={p} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[2.4 * SCALE, 2.4 * SCALE, 5 * SCALE, 6]} />
                  <meshStandardMaterial {...hwMat} />
                </mesh>
              ))}
              {/* lug bolts on the vehicle's bolt circle */}
              {lugPos.map((p, i) => (
                <mesh key={`l${i}`} position={p} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[8 * SCALE, 8 * SCALE, 7 * SCALE, 12]} />
                  <meshStandardMaterial color="#8b939b" metalness={0.85} roughness={0.35} />
                </mesh>
              ))}
            </group>
          </>
        )}
      </group>
    </group>
  );
}

/**
 * Hub, rotor and caliper, drawn from the corner envelope. Anything whose
 * dimension is unknown is simply not drawn: an invented caliper would be
 * worse than an absent one, because it would look like information.
 */
export function HubAssembly({
  rotorDiameterMm, caliperRadialMm, caliperAxialMm, hubPosition,
  mirror = false, highlight,
}: {
  rotorDiameterMm: number | null;
  caliperRadialMm: number | null;
  caliperAxialMm: number | null;
  hubPosition: [number, number, number];
  mirror?: boolean;
  highlight?: string;
}) {
  const side = mirror ? -1 : 1;
  const hub: [number, number, number] = [hubPosition[0] * side, hubPosition[1], hubPosition[2]];
  return (
    <group position={hub} scale={[side, 1, 1]}>
      {/* hub spigot: always present, it is what the wheel seats on */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[4 * SCALE, 0, 0]}>
        <cylinderGeometry args={[28 * SCALE, 28 * SCALE, 16 * SCALE, 24]} />
        <meshStandardMaterial color="#6e767e" metalness={0.8} roughness={0.45} />
      </mesh>
      {rotorDiameterMm !== null && (
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-6 * SCALE, 0, 0]}>
          <cylinderGeometry args={[
            (rotorDiameterMm / 2) * SCALE, (rotorDiameterMm / 2) * SCALE, 22 * SCALE, 48,
          ]} />
          <meshStandardMaterial color="#54595f" metalness={0.6} roughness={0.7} />
        </mesh>
      )}
      {caliperRadialMm !== null && caliperAxialMm !== null && (
        <mesh position={[
          (caliperAxialMm / 2 - 20) * SCALE,
          caliperRadialMm * 0.55 * SCALE,
          -caliperRadialMm * 0.5 * SCALE,
        ]}>
          <boxGeometry args={[(caliperAxialMm + 30) * SCALE, 90 * SCALE, 56 * SCALE]} />
          <meshStandardMaterial
            color={highlight ?? '#8c3a2c'} metalness={0.5} roughness={0.5}
            emissive={highlight ?? '#000000'} emissiveIntensity={highlight ? 0.45 : 0}
          />
        </mesh>
      )}
    </group>
  );
}
