/**
 * RAREFORM FITMENT LAB — units and coordinate convention.
 *
 * ============================ UNITS ============================
 * Every length inside the engine is MILLIMETRES. Every angle in the
 * public API is DEGREES (converted to radians at the point of use).
 * Inches exist only at the UI boundary and in wheel/tyre designations
 * that are conventionally imperial (diameter, bead-seat width).
 *
 * ====================== COORDINATE FRAME =======================
 * One right-handed frame per CORNER, defined for the RIGHT-HAND side
 * of the vehicle and mirrored in X for the left.
 *
 *   ORIGIN  the intersection of the HUB MOUNTING PLANE with the
 *           WHEEL SPIN AXIS. Everything is measured from the face the
 *           wheel actually bolts to, because that is the one plane a
 *           user can reach with a tape measure.
 *   +X      OUTBOARD, away from the vehicle centreline.
 *   +Y      UP, against gravity.
 *   +Z      FORWARD, the vehicle's direction of travel.
 *
 * ========================= THE PLANES ==========================
 * MOUNTING PLANE      x = 0. The hub face. Wheel pad seats here.
 * WHEEL CENTRE PLANE  x = -ET_eff. Midway between the bead seats.
 *                     Positive offset puts the mounting plane OUTBOARD
 *                     of the centre plane, so the centre plane sits at
 *                     negative x.
 * INNER BEAD SEAT     x = -ET_eff - W/2
 * OUTER BEAD SEAT     x = -ET_eff + W/2
 * INNER FLANGE TIP    x = -ET_eff - W/2 - flangeInner
 * OUTER FLANGE TIP    x = -ET_eff + W/2 + flangeOuter
 *
 * Backspacing is the distance from the mounting plane to the INNER
 * FLANGE TIP, i.e. |inner flange tip|. It is derived from physical
 * flange geometry, never from nominal width alone.
 *
 * ========================== SIGNS ==============================
 * SPACERS push the wheel outboard, which is arithmetically identical
 * to reducing offset:  ET_eff = ET - spacerThickness.
 * CAMBER is negative when the top of the wheel leans toward the
 * vehicle centreline (the usual performance direction).
 * TOE is positive when the leading edge points toward the centreline.
 */

export const MM_PER_INCH = 25.4;

export const inToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToIn = (mm: number): number => mm / MM_PER_INCH;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Round to a fixed number of decimals without string round-tripping. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export interface Vec3 { x: number; y: number; z: number }

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Rotate a point about the wheel SPIN AXIS origin to apply camber.
 * Camber tilts the wheel in the X-Y plane; Z is untouched.
 *
 * The rotation is taken about the HUB CENTRE, not the contact patch.
 * That is the correct frame for clearance work: the suspension fixes
 * the hub centre at a given ride height and the wheel tilts around it,
 * which is precisely why camber changes track width at the contact
 * patch rather than at the hub. It also means a point's radius from
 * the spin axis is invariant under camber — only its lateral position
 * moves — which the collision solver relies on.
 */
export function applyCamber(x: number, y: number, camberDeg: number): { x: number; y: number } {
  const t = degToRad(camberDeg);
  const c = Math.cos(t), s = Math.sin(t);
  return { x: x * c + y * s, y: -x * s + y * c };
}

/** Lateral position only, for the common case where y is already known. */
export function camberX(x: number, y: number, camberDeg: number): number {
  const t = degToRad(camberDeg);
  return x * Math.cos(t) + y * Math.sin(t);
}
