import { MM_PER_INCH, inToMm, mmToIn, round, camberX } from './units';
import type { EvidenceGrade } from './types';

export interface TireSize {
  /** Nominal section width, mm (the 225 in 225/45R17). */
  sectionMm: number;
  /** Aspect ratio, percent. */
  aspect: number;
  /** Rim diameter, inches. */
  diameterIn: number;
}

export const tireLabel = (t: TireSize): string =>
  `${t.sectionMm}/${t.aspect}R${t.diameterIn}`;

/**
 * Manufacturer data for a specific tyre, when we actually have it.
 * Supplied values always beat the derived ones below; the grade travels
 * with the result so the UI can say which it used.
 */
export interface TireData {
  measuringRimIn?: number;
  approvedRimRangeIn?: [number, number];
  /** Measured section width on the measuring rim, mm. */
  measuredSectionMm?: number;
  /** Measured overall diameter, mm. */
  measuredDiameterMm?: number;
  /** Measured rolling circumference, mm — the only honest speedo input. */
  rollingCircumferenceMm?: number;
  loadIndex?: number;
  speedRating?: string;
  grade?: EvidenceGrade;
  brand?: string;
  model?: string;
}

/**
 * Measuring ("design") rim width, inches, derived when not supplied.
 *
 * Lower aspect ratios are specified on proportionally wider rims, so the
 * coefficient is a function of aspect. Calibrated against published
 * measuring rims:
 *   185/70R13 -> 5.5   195/65R15 -> 6.0   205/55R16 -> 6.5
 *   225/45R17 -> 7.5   245/40R18 -> 8.5   275/35R19 -> 9.5
 * Graded `estimated`. A real tyre record overrides it.
 */
export function derivedMeasuringRimIn(t: TireSize): number {
  const k = t.aspect >= 65 ? 0.78 : t.aspect >= 55 ? 0.82 : t.aspect >= 45 ? 0.85 : 0.88;
  return Math.round((t.sectionMm / MM_PER_INCH) * k * 2) / 2;
}

export const measuringRimIn = (t: TireSize, d?: TireData): number =>
  d?.measuringRimIn ?? derivedMeasuringRimIn(t);

/** Inches of rim WIDER than the measuring rim. Positive = stretched. */
export const stretchIn = (t: TireSize, rimWidthIn: number, d?: TireData): number =>
  rimWidthIn - measuringRimIn(t, d);

export type SidewallClass = 'balloon' | 'full' | 'oem' | 'mild' | 'aggressive' | 'beyond_spec';

export interface SidewallAssessment {
  klass: SidewallClass;
  label: string;
  stretchIn: number;
  /** True only when the rim width sits inside the maker's approved range. */
  withinApprovedRange: boolean | null;
  note: string;
}

export function assessSidewall(
  t: TireSize, rimWidthIn: number, d?: TireData,
): SidewallAssessment {
  const s = stretchIn(t, rimWidthIn, d);
  const range = d?.approvedRimRangeIn;
  const withinApprovedRange = range
    ? rimWidthIn >= range[0] && rimWidthIn <= range[1]
    : null;

  let klass: SidewallClass, label: string, note: string;
  if (s <= -0.75) {
    klass = 'balloon'; label = 'Balloon sidewall';
    note = 'Rim narrower than the measuring rim. Soft ride, maximum kerb protection for a polished lip, vague turn-in. Period-correct on 13-15".';
  } else if (s <= -0.25) {
    klass = 'full'; label = 'Full sidewall';
    note = 'Sidewall stands slightly proud of the flange, which is what protects an expensive lip from kerbs.';
  } else if (s < 0.75) {
    klass = 'oem'; label = 'OEM / flush';
    note = 'Normal fitment. Sidewall roughly level with the rim flange.';
  } else if (s < 1.25) {
    klass = 'mild'; label = 'Mild stretch';
    note = 'Flange now stands proud of the sidewall, so the lip takes kerb strikes first.';
  } else if (s < 1.75) {
    klass = 'aggressive'; label = 'Aggressive stretch';
    note = 'Pinched bead. Requires elevated pressure. A pothole bends the lip or unseats the bead.';
  } else {
    klass = 'beyond_spec'; label = 'Beyond any published spec';
    note = 'No tyre maker approves this rim width for this section. The bead can unseat under cornering load.';
  }
  if (withinApprovedRange === false)
    note += ' Rim width is OUTSIDE the manufacturer approved range for this tyre.';
  return { klass, label, stretchIn: round(s, 2), withinApprovedRange, note };
}

export interface MountedTire {
  size: TireSize;
  rimWidthIn: number;
  /** Section width as mounted, mm. */
  sectionMm: number;
  /** Overall diameter, mm. */
  diameterMm: number;
  radiusMm: number;
  sidewallMm: number;
  circumferenceMm: number;
  revsPerKm: number;
  treadWidthMm: number;
  sidewall: SidewallAssessment;
  /** Which inputs were measured vs derived. */
  sectionGrade: EvidenceGrade;
  diameterGrade: EvidenceGrade;
  circumferenceGrade: EvidenceGrade;
}

/**
 * Resolve a tyre as actually mounted on a given rim width.
 *
 * Section width moves ~5 mm per 0.5" of rim width away from the
 * measuring rim, the long-standing industry convention. Mounting wider
 * than the measuring rim also pulls the sidewall taut and drops overall
 * diameter slightly (~2 mm per 0.5"), applied as a second-order term.
 */
export function mountTire(
  size: TireSize, rimWidthIn: number, data?: TireData,
): MountedTire {
  const mrim = measuringRimIn(size, data);
  const baseSection = data?.measuredSectionMm ?? size.sectionMm;
  const sectionGrade: EvidenceGrade = data?.measuredSectionMm
    ? (data.grade ?? 'manufacturer_documented') : 'estimated';
  const widthDelta = (rimWidthIn - mrim) * 10;
  const sectionMm = baseSection + widthDelta;

  const sidewallMm = (size.sectionMm * size.aspect) / 100;
  let diameterMm: number;
  let diameterGrade: EvidenceGrade;
  if (data?.measuredDiameterMm) {
    diameterMm = data.measuredDiameterMm - (rimWidthIn - mrim) * 4;
    diameterGrade = data.grade ?? 'manufacturer_documented';
  } else {
    diameterMm = inToMm(size.diameterIn) + 2 * sidewallMm - (rimWidthIn - mrim) * 4;
    diameterGrade = 'estimated';
  }

  let circumferenceMm: number;
  let circumferenceGrade: EvidenceGrade;
  if (data?.rollingCircumferenceMm) {
    circumferenceMm = data.rollingCircumferenceMm;
    circumferenceGrade = data.grade ?? 'manufacturer_documented';
  } else {
    // Geometric circumference overstates the rolling distance because a
    // loaded tyre deflects. 0.97 is the conventional allowance and is an
    // estimate, not a measurement.
    circumferenceMm = Math.PI * diameterMm * 0.97;
    circumferenceGrade = 'estimated';
  }

  return {
    size, rimWidthIn, sectionMm,
    diameterMm, radiusMm: diameterMm / 2, sidewallMm,
    circumferenceMm,
    revsPerKm: 1_000_000 / circumferenceMm,
    treadWidthMm: sectionMm * 0.82,
    sidewall: assessSidewall(size, rimWidthIn, data),
    sectionGrade, diameterGrade, circumferenceGrade,
  };
}

/** Speedometer deviation, percent. Positive = reads slow (you are going faster). */
export function speedoDeviationPct(proposed: MountedTire, baseline: MountedTire): number {
  return (proposed.circumferenceMm / baseline.circumferenceMm - 1) * 100;
}

/**
 * Outboard half-width of the wheel-and-tyre assembly at radius rho from
 * the spin axis. This is the single profile function the collision solver
 * and the 3D mesh generator both read, so the picture always agrees with
 * the verdict.
 *
 *   rho <  rim radius .......... rim flange, overallWidth/2
 *   rho at the bead ............ rim flange
 *   rho ~ 45% up the sidewall .. maximum section width
 *   rho =  tyre radius ......... tread half-width
 *
 * Two behaviours fall out of this that a flat "section width" model
 * misses. The widest part of the assembly sits partway up the SIDEWALL,
 * which is exactly the radius a lowered car's fender lip descends to —
 * that is the mechanism of rubbing. And on a stretched fitment the
 * section half-width is less than the flange, so the FLANGE becomes the
 * outermost point, which is why stretched wheels are the bent ones.
 */
export function assemblyHalfWidth(
  rho: number, tire: MountedTire, rimRadiusMm: number, overallWidthMm: number,
): number {
  const a = Math.abs(rho);
  const flange = overallWidthMm / 2;
  if (a <= rimRadiusMm) return flange;
  const sh = tire.radiusMm - rimRadiusMm;
  if (sh <= 0) return flange;
  const u = Math.min((a - rimRadiusMm) / sh, 1);
  const maxHalf = tire.sectionMm / 2;
  const treadHalf = tire.treadWidthMm / 2;
  const PEAK = 0.45;
  if (u <= PEAK) return flange + (maxHalf - flange) * Math.sin((u / PEAK) * (Math.PI / 2));
  const k = (u - PEAK) / (1 - PEAK);
  return maxHalf - (maxHalf - treadHalf) * Math.sin(k * (Math.PI / 2)) ** 1.6;
}

/** Widest point of the assembly and the radius it occurs at. */
export function widestPoint(
  tire: MountedTire, rimRadiusMm: number, overallWidthMm: number,
): { halfWidthMm: number; rhoMm: number } {
  let best = -Infinity, at = 0;
  const N = 80;
  for (let i = 0; i <= N; i++) {
    const rho = tire.radiusMm * (i / N);
    const w = assemblyHalfWidth(rho, tire, rimRadiusMm, overallWidthMm);
    if (w > best) { best = w; at = rho; }
  }
  return { halfWidthMm: best, rhoMm: at };
}

/** Candidate size search over sizes that are actually manufactured. */
export const SECTIONS = [
  155, 165, 175, 185, 195, 205, 215, 225, 235, 245,
  255, 265, 275, 285, 295, 305, 315, 325, 335, 345,
] as const;
export const ASPECTS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80] as const;

export interface TireCandidate {
  size: TireSize;
  mounted: MountedTire;
  /** Percent difference in rolling circumference vs the baseline. */
  deviationPct: number;
  score: number;
}

export function findTireSizes(opts: {
  diameterIn: number;
  rimWidthIn: number;
  baseline: MountedTire;
  tolerancePct: number;
  wantClass?: SidewallClass | 'any';
  /** Reject anything a maker would not approve for this rim width. */
  approvedOnly?: boolean;
  limit?: number;
}): TireCandidate[] {
  const out: TireCandidate[] = [];
  for (const sectionMm of SECTIONS) {
    for (const aspect of ASPECTS) {
      const size: TireSize = { sectionMm, aspect, diameterIn: opts.diameterIn };
      const mrim = derivedMeasuringRimIn(size);
      if (Math.abs(opts.rimWidthIn - mrim) > 2.0) continue;
      const mounted = mountTire(size, opts.rimWidthIn);
      const deviationPct = speedoDeviationPct(mounted, opts.baseline);
      if (Math.abs(deviationPct) > opts.tolerancePct) continue;
      if (opts.wantClass && opts.wantClass !== 'any' && mounted.sidewall.klass !== opts.wantClass) continue;
      if (opts.approvedOnly && (mounted.sidewall.klass === 'beyond_spec' || mounted.sidewall.klass === 'aggressive')) continue;
      out.push({
        size, mounted, deviationPct,
        score: Math.abs(deviationPct) * 1.6 + Math.abs(mounted.sidewall.stretchIn) * 0.4,
      });
    }
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, opts.limit ?? 12);
}

export { camberX, mmToIn, inToMm };
