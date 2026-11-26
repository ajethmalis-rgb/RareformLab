import { MM_PER_INCH, inToMm, mmToIn, round } from './units';
import type { RimProfile, ConstructionType, MountStyle, BoltPattern } from './types';

/**
 * Physical flange width PER SIDE, in mm, by rim profile.
 *
 * The familiar "overall width = nominal width + 1 inch" shortcut assumes
 * 12.7 mm of flange per side, which is right for a J profile and wrong
 * for others. These are reference values graded `estimated`; a component
 * record carrying a measured flange width overrides them, which is the
 * whole reason this is a lookup and not a constant.
 */
export const FLANGE_MM: Record<RimProfile, number> = {
  J: 12.7,
  JJ: 13.5,
  K: 14.2,
  B: 11.5,
  custom: 12.7,
};

export interface WheelSpec {
  /** Nominal bead-seat width, inches (the "8" in 8J x 16). */
  widthIn: number;
  /** Nominal rim diameter, inches. */
  diameterIn: number;
  /** Stamped offset ET, mm. Positive = mounting face outboard of centre plane. */
  etMm: number;
  profile?: RimProfile;
  /** Measured flange width per side, mm. Overrides the profile lookup. */
  flangeOuterMm?: number;
  flangeInnerMm?: number;
  /** Spacer thickness, mm. Pushes the wheel outboard. */
  spacerMm?: number;
  boltPattern?: BoltPattern;
  centreBoreMm?: number;
  /** Mounting pad thickness, mm — the disc material between hub face and pad back. */
  padThicknessMm?: number;
}

export interface WheelGeometry {
  widthIn: number;
  diameterIn: number;
  /** Stamped offset as supplied. */
  etMm: number;
  spacerMm: number;
  /** Effective offset after spacers: ET_eff = ET - spacer. */
  etEffMm: number;
  /** Nominal bead-seat width in mm: 25.4 x widthIn. */
  nominalWidthMm: number;
  /** Physical flange-tip to flange-tip width, mm. */
  overallWidthMm: number;
  flangeOuterMm: number;
  flangeInnerMm: number;
  /** x of the wheel centre plane (negative for positive ET). */
  centrePlaneX: number;
  /** Depth INBOARD of the mounting plane to the inner bead seat, mm. */
  innerBeadSeatDistanceMm: number;
  /** Distance OUTBOARD of the mounting plane to the outer bead seat, mm. */
  outerBeadSeatDistanceMm: number;
  /** x of each physical edge, in the corner frame. */
  innerFlangeX: number;
  outerFlangeX: number;
  /** Backspacing: mounting plane to inner flange tip, from physical geometry. */
  backspacingMm: number;
  backspacingIn: number;
  /** Frontspacing: mounting plane to outer flange tip. */
  frontspacingMm: number;
  frontspacingIn: number;
  rimRadiusMm: number;
}

/**
 * Resolve a wheel spec into explicit geometry in the corner frame.
 *
 * Reference identity, for the J profile and zero spacer, this reproduces
 * the standard shop formula  BS(in) = (W + 1)/2 + ET/25.4  exactly,
 * because 2 x 12.7 mm = 1 inch of flange. Non-J profiles deliberately
 * depart from it.
 */
export function resolveWheel(spec: WheelSpec): WheelGeometry {
  const profile: RimProfile = spec.profile ?? 'J';
  const fallback = FLANGE_MM[profile] ?? FLANGE_MM.J;
  const flangeOuterMm = spec.flangeOuterMm ?? fallback;
  const flangeInnerMm = spec.flangeInnerMm ?? fallback;
  const spacerMm = spec.spacerMm ?? 0;
  const etEffMm = spec.etMm - spacerMm;

  const nominalWidthMm = inToMm(spec.widthIn);
  const half = nominalWidthMm / 2;

  const centrePlaneX = -etEffMm;
  const innerBeadSeatX = centrePlaneX - half;
  const outerBeadSeatX = centrePlaneX + half;
  const innerFlangeX = innerBeadSeatX - flangeInnerMm;
  const outerFlangeX = outerBeadSeatX + flangeOuterMm;

  const backspacingMm = Math.abs(innerFlangeX);
  const frontspacingMm = outerFlangeX;

  return {
    widthIn: spec.widthIn,
    diameterIn: spec.diameterIn,
    etMm: spec.etMm,
    spacerMm,
    etEffMm,
    nominalWidthMm,
    overallWidthMm: nominalWidthMm + flangeInnerMm + flangeOuterMm,
    flangeOuterMm,
    flangeInnerMm,
    centrePlaneX,
    innerBeadSeatDistanceMm: half + etEffMm,
    outerBeadSeatDistanceMm: half - etEffMm,
    innerFlangeX,
    outerFlangeX,
    backspacingMm,
    backspacingIn: mmToIn(backspacingMm),
    frontspacingMm,
    frontspacingIn: mmToIn(frontspacingMm),
    rimRadiusMm: inToMm(spec.diameterIn) / 2,
  };
}

// ----------------------------------------------------------------------
// Multipiece assembly
// ----------------------------------------------------------------------

export interface BarrelComponent {
  id: string;
  kind: 'inner_barrel' | 'outer_lip' | 'complete_shell';
  diameterIn: number;
  /** Bead-seat width this piece contributes, inches. */
  widthIn: number;
  profile: RimProfile;
  /** Measured flange width, mm, where known. */
  flangeMm?: number;
  /**
   * Mating allowance, mm. The amount of bead-seat width LOST to the
   * overlap where the two halves bolt together. Advertised lip width
   * plus advertised barrel width does not equal finished bead-seat
   * width, and this is why.
   */
  mateAllowanceMm?: number;
  supplier?: string;
  partNumber?: string;
}

export interface DiscComponent {
  id: string;
  name: string;
  /** How deep the disc face sits inboard of the outer flange plane, inches. */
  padDepthIn: number;
  padThicknessMm: number;
  mount: MountStyle;
  boltPattern: BoltPattern;
  centreBoreMm: number;
  faceDiameterIn: number;
  /** Bolt-circle diameter of the ASSEMBLY hardware, mm. */
  assemblyFlangeDiaMm?: number;
}

export interface AssemblyRequest {
  construction: ConstructionType;
  diameterIn: number;
  outerLip?: BarrelComponent;
  innerBarrel?: BarrelComponent;
  completeShell?: BarrelComponent;
  disc: DiscComponent;
  spacerMm?: number;
  /** What the builder is aiming at, for the target-vs-achieved readout. */
  targetEtMm?: number;
}

export interface AssemblyResult {
  ok: boolean;
  problems: string[];
  /** Null when the request does not describe a buildable assembly. */
  geometry: WheelGeometry | null;
  achievedWidthIn: number;
  achievedEtMm: number;
  targetEtMm: number | null;
  /** achieved - target. Positive means the build sits further inboard than intended. */
  etErrorMm: number | null;
  exposedLipIn: number;
  innerBarrelExposedIn: number;
  hardwareCount: number;
  naiveWidthIn: number;
  mateAllowanceMm: number;
}

/**
 * Hardware count for a bolt-together assembly. Reference convention by
 * diameter and width; a real component record overrides it.
 */
export function hardwareCount(diameterIn: number, widthIn: number): number {
  if (diameterIn <= 15) return widthIn >= 9 ? 24 : 18;
  if (diameterIn <= 17) return widthIn >= 9 ? 30 : 24;
  if (diameterIn <= 19) return widthIn >= 10 ? 36 : 30;
  return widthIn >= 11 ? 40 : 36;
}

/**
 * Assemble a multipiece wheel from real components and compute the TRUE
 * finished dimensions from the mating geometry.
 *
 * Offset is an OUTPUT here, not an input: where the disc sits in the
 * shell is what determines it. This is the inversion the whole product
 * rests on — you pick the lip you want and find out what offset you get,
 * rather than picking an offset and hoping a lip exists.
 */
export function assembleWheel(req: AssemblyRequest): AssemblyResult {
  const problems: string[] = [];
  const spacerMm = req.spacerMm ?? 0;

  let widthIn = 0;
  let mateAllowanceMm = 0;
  let flangeOuterMm = FLANGE_MM.J;
  let flangeInnerMm = FLANGE_MM.J;
  let naiveWidthIn = 0;

  if (req.construction === 'monoblock') {
    problems.push('A monoblock has no separable barrel; width and offset are fixed by the casting.');
  }

  if (req.construction === 'two_piece') {
    const shell = req.completeShell;
    if (!shell) {
      problems.push('Two-piece build needs a complete rim shell. A lip alone does not define one.');
    } else {
      if (shell.kind !== 'complete_shell')
        problems.push(`Component ${shell.id} is a ${shell.kind}, not a complete shell.`);
      if (shell.diameterIn !== req.diameterIn)
        problems.push(`Shell is ${shell.diameterIn}" but the build calls for ${req.diameterIn}".`);
      widthIn = shell.widthIn;
      naiveWidthIn = shell.widthIn;
      flangeOuterMm = shell.flangeMm ?? FLANGE_MM[shell.profile] ?? FLANGE_MM.J;
      flangeInnerMm = flangeOuterMm;
    }
  }

  if (req.construction === 'three_piece' || req.construction === 'three_piece_reverse') {
    const lip = req.outerLip, barrel = req.innerBarrel;
    if (!lip) problems.push('Three-piece build needs an outer lip.');
    if (!barrel) problems.push('Three-piece build needs an inner barrel.');
    if (lip && barrel) {
      if (lip.diameterIn !== barrel.diameterIn)
        problems.push(`Lip is ${lip.diameterIn}" and barrel is ${barrel.diameterIn}". Halves must share a diameter.`);
      if (lip.diameterIn !== req.diameterIn)
        problems.push(`Halves are ${lip.diameterIn}" but the build calls for ${req.diameterIn}".`);
      mateAllowanceMm = (lip.mateAllowanceMm ?? 0) + (barrel.mateAllowanceMm ?? 0);
      naiveWidthIn = lip.widthIn + barrel.widthIn;
      widthIn = naiveWidthIn - mmToIn(mateAllowanceMm);
      flangeOuterMm = lip.flangeMm ?? FLANGE_MM[lip.profile] ?? FLANGE_MM.J;
      flangeInnerMm = barrel.flangeMm ?? FLANGE_MM[barrel.profile] ?? FLANGE_MM.J;
    }
  }

  if (widthIn <= 0) {
    return {
      ok: false, problems, geometry: null,
      achievedWidthIn: 0, achievedEtMm: Number.NaN,
      targetEtMm: req.targetEtMm ?? null, etErrorMm: null,
      exposedLipIn: 0, innerBarrelExposedIn: 0,
      hardwareCount: 0, naiveWidthIn, mateAllowanceMm,
    };
  }

  /*
   * Offset from the mating geometry.
   *
   * The disc's mounting pad sits padDepthIn inboard of the OUTER FLANGE
   * PLANE. The hub face is that pad's outboard surface. So, measuring
   * from the outer flange tip inboard:
   *
   *   frontspacing = padDepth                    (hub face to outer flange tip)
   *   frontspacing = W/2 + flangeOuter - ET_eff  (identity from the frame)
   *   =>  ET_eff = W/2 + flangeOuter - padDepth
   */
  const halfMm = inToMm(widthIn) / 2;
  const padDepthMm = inToMm(req.disc.padDepthIn);
  const etEff = halfMm + flangeOuterMm - padDepthMm;
  const achievedEtMm = etEff + spacerMm; // report the stamped-equivalent ET

  const geometry = resolveWheel({
    widthIn,
    diameterIn: req.diameterIn,
    etMm: achievedEtMm,
    spacerMm,
    flangeOuterMm,
    flangeInnerMm,
    boltPattern: req.disc.boltPattern,
    centreBoreMm: req.disc.centreBoreMm,
    padThicknessMm: req.disc.padThicknessMm,
  });

  /*
   * Exposed lip: the barrel wall standing outboard of the disc FACE.
   * By construction of etEff the frontspacing equals padDepth, so the
   * visible lip is padDepth less the pad's own thickness. A reverse-mount
   * disc bolts to the inboard side of the shell and shows no outer lip
   * at the face at all.
   */
  const exposedLipIn = req.disc.mount === 'reverse_mount'
    ? 0
    : Math.max(0, req.disc.padDepthIn - mmToIn(req.disc.padThicknessMm));

  const targetEtMm = req.targetEtMm ?? null;

  if (req.disc.faceDiameterIn > req.diameterIn)
    problems.push(`Disc face is ${req.disc.faceDiameterIn}" but the shell is ${req.diameterIn}".`);

  return {
    ok: problems.length === 0,
    problems,
    geometry,
    achievedWidthIn: round(widthIn, 3),
    achievedEtMm: round(achievedEtMm, 1),
    targetEtMm,
    etErrorMm: targetEtMm === null ? null : round(achievedEtMm - targetEtMm, 1),
    exposedLipIn: round(exposedLipIn, 3),
    innerBarrelExposedIn: round(geometry.backspacingIn - mmToIn(req.disc.padThicknessMm), 3),
    hardwareCount: hardwareCount(req.diameterIn, widthIn),
    naiveWidthIn: round(naiveWidthIn, 3),
    mateAllowanceMm: round(mateAllowanceMm, 2),
  };
}

/** Inverse: the disc pad depth needed to land a given offset. */
export function padDepthForTargetEt(
  widthIn: number, flangeOuterMm: number, targetEtMm: number,
): number {
  return mmToIn(inToMm(widthIn) / 2 + flangeOuterMm - targetEtMm);
}

export { MM_PER_INCH, inToMm, mmToIn };
