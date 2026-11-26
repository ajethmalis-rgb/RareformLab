import * as THREE from 'three';
import { assemblyHalfWidth, type MountedTire } from '@/engine/tire';
import type { WheelGeometry } from '@/engine/wheel';
import type { SpokeDesign } from '@/data/faces';

/**
 * Procedural wheel geometry.
 *
 * Every profile here is generated from the engine's own numbers. The
 * tyre surface in particular is sampled from `assemblyHalfWidth`, the
 * exact function the collision solver walks, so the drawing and the
 * verdict cannot disagree: if the picture shows the sidewall touching
 * the arch, the solver has already said so.
 *
 * Scene units are METRES; engine units are millimetres. SCALE converts.
 */
export const SCALE = 0.001;

/** Lathe profiles revolve about the lathe's Y axis; this puts it on +X. */
export const LATHE_ROTATION: [number, number, number] = [0, 0, -Math.PI / 2];

/**
 * Tyre cross-section, revolved. Walks up the inboard sidewall, across
 * the tread and back down the outboard sidewall.
 */
export function tireProfile(wheel: WheelGeometry, tire: MountedTire, samples = 26): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const r0 = wheel.rimRadiusMm;
  const r1 = tire.radiusMm;
  const cx = wheel.centrePlaneX;
  const treadHalf = tire.treadWidthMm / 2;

  // inboard bead to tread
  for (let i = 0; i <= samples; i++) {
    const rho = r0 + (r1 - r0) * (i / samples);
    const half = assemblyHalfWidth(rho, tire, r0, wheel.overallWidthMm);
    pts.push(new THREE.Vector2(rho * SCALE, (cx - half) * SCALE));
  }
  // across the tread
  pts.push(new THREE.Vector2(r1 * SCALE, (cx - treadHalf) * SCALE));
  pts.push(new THREE.Vector2(r1 * SCALE, (cx + treadHalf) * SCALE));
  // tread back down to the outboard bead
  for (let i = samples; i >= 0; i--) {
    const rho = r0 + (r1 - r0) * (i / samples);
    const half = assemblyHalfWidth(rho, tire, r0, wheel.overallWidthMm);
    pts.push(new THREE.Vector2(rho * SCALE, (cx + half) * SCALE));
  }
  return pts;
}

/**
 * Rim barrel: inner flange tip, inner bead seat, drop centre, outer bead
 * seat, outer flange tip. Flange tips and bead-seat positions come
 * straight from the resolved wheel, so the lip you see is the lip the
 * build spec quotes.
 */
export function barrelProfile(wheel: WheelGeometry): THREE.Vector2[] {
  const R = wheel.rimRadiusMm;
  const flangeR = R + 4;          // the bead flange stands slightly proud
  const dropR = R - 20;           // drop centre depth
  const innerBead = wheel.innerFlangeX + wheel.flangeInnerMm;
  const outerBead = wheel.outerFlangeX - wheel.flangeOuterMm;
  const p = (r: number, x: number) => new THREE.Vector2(r * SCALE, x * SCALE);
  return [
    p(flangeR, wheel.innerFlangeX),
    p(R, wheel.innerFlangeX + 1),
    p(R, innerBead),
    p(dropR, innerBead + 10),
    p(dropR, outerBead - 14),
    p(R, outerBead),
    p(R, wheel.outerFlangeX - 1),
    p(flangeR, wheel.outerFlangeX),
  ];
}

/** Outer lip highlighted separately, so a polished lip can take its own finish. */
export function lipProfile(wheel: WheelGeometry, exposedLipMm: number): THREE.Vector2[] {
  const R = wheel.rimRadiusMm;
  const flangeR = R + 4;
  const faceX = wheel.outerFlangeX - Math.max(exposedLipMm, 0);
  const p = (r: number, x: number) => new THREE.Vector2(r * SCALE, x * SCALE);
  return [
    p(R - 2, faceX),
    p(R, faceX),
    p(R, wheel.outerFlangeX - 1),
    p(flangeR, wheel.outerFlangeX),
  ];
}

export interface SpokeBox {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
}

/**
 * Spoke layout for a face archetype.
 *
 * This is a VISUAL approximation driven by the face's design parameters.
 * It is not the real spoke geometry of any wheel, and it is never used
 * for a clearance result — spoke-to-caliper analysis requires a measured
 * spoke-back profile, which the engine demands as a separate input.
 */
export function spokeBoxes(
  design: SpokeDesign, faceRadiusMm: number, faceXMm: number, thicknessMm: number,
): SpokeBox[] {
  const out: SpokeBox[] = [];
  const hubR = faceRadiusMm * design.hubFraction;
  const len = faceRadiusMm - hubR;
  const mid = hubR + len / 2;
  const x = faceXMm - thicknessMm / 2;

  const push = (count: number, widthMm: number, angleOffset = 0, twist = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + angleOffset;
      out.push({
        position: [x * SCALE, Math.sin(a) * mid * SCALE, Math.cos(a) * mid * SCALE],
        rotation: [-a + twist, 0, 0],
        size: [thicknessMm * SCALE, len * SCALE, widthMm * SCALE],
      });
    }
  };

  switch (design.archetype) {
    case 'five_spoke':
      push(design.spokeCount, faceRadiusMm * 0.30 * design.taper);
      break;
    case 'split_spoke': {
      const n = Math.max(2, Math.round(design.spokeCount / 2));
      const w = faceRadiusMm * 0.10 * design.taper;
      push(n, w, 0.1);
      push(n, w, -0.1);
      break;
    }
    case 'multi_spoke':
      push(design.spokeCount, faceRadiusMm * 0.055 * design.taper);
      break;
    case 'turbine':
      push(design.spokeCount, faceRadiusMm * 0.22, 0, 0.42);
      break;
    case 'mesh': {
      const n = Math.max(4, Math.round(design.spokeCount / 2));
      const w = faceRadiusMm * 0.045;
      push(n, w, 0, 0.55);
      push(n, w, Math.PI / n, -0.55);
      break;
    }
    case 'honeycomb': {
      const n = design.spokeCount;
      const w = faceRadiusMm * 0.05;
      push(n, w, 0, 0.3);
      push(n, w, Math.PI / n, -0.3);
      break;
    }
    case 'dish':
      break;
  }
  return out;
}

/** Assembly hardware ring: bolt positions around the flange circle. */
export function hardwarePositions(
  count: number, radiusMm: number, xMm: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push([xMm * SCALE, Math.sin(a) * radiusMm * SCALE, Math.cos(a) * radiusMm * SCALE]);
  }
  return out;
}

/** Lug positions on the bolt circle. */
export function lugPositions(
  count: number, pcdMm: number, xMm: number,
): [number, number, number][] {
  return hardwarePositions(count, pcdMm / 2, xMm);
}

/**
 * Fender arch: a tube swept along the arc of the wheel opening, with the
 * lip at its measured lateral position. Drawn only when the arch position
 * is actually known — an unknown arch renders nothing rather than a
 * plausible guess.
 */
export function archCurve(
  archRadiusMm: number, lipXMm: number, spanDeg = 190,
): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const span = (spanDeg * Math.PI) / 180;
  for (let i = 0; i <= 40; i++) {
    const a = -span / 2 + span * (i / 40);
    pts.push(new THREE.Vector3(
      lipXMm * SCALE,
      Math.cos(a) * archRadiusMm * SCALE,
      Math.sin(a) * archRadiusMm * SCALE,
    ));
  }
  return new THREE.CatmullRomCurve3(pts);
}
