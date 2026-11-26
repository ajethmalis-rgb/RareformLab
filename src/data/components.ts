import type { BarrelComponent, DiscComponent } from '@/engine/wheel';
import type { RimProfile } from '@/engine/types';

/**
 * COMPONENT CATALOGUE
 *
 * Generic rebuild stock in the increments multipiece barrels are actually
 * made in. Supplier and part-number fields are deliberately EMPTY: real
 * supplier part numbers, prices and availability have to be imported from
 * a supplier, and inventing them would make the bill of materials a work
 * of fiction. The dimensional increments themselves are the standard
 * trade sizes.
 *
 * `mateAllowanceMm` is the bead-seat width lost in the overlap where the
 * halves bolt together. It is 6.35 mm (0.25") per half as a reference
 * value, which is why advertised lip plus advertised barrel does not add
 * up to finished width. A real component record overrides it.
 *
 * Cross-supplier compatibility is NOT assumed. Nothing here asserts that
 * one maker's lip mates to another's barrel.
 */

const MATE_MM = 6.35;

const LIP_WIDTHS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] as const;
const BARREL_WIDTHS = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0] as const;
export const DIAMETERS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;

function lip(diameterIn: number, widthIn: number, profile: RimProfile = 'J'): BarrelComponent {
  return {
    id: `GEN-OL-${diameterIn}-${widthIn.toFixed(1)}`,
    kind: 'outer_lip', diameterIn, widthIn, profile,
    mateAllowanceMm: MATE_MM,
    supplier: '', partNumber: '',
  };
}
function barrel(diameterIn: number, widthIn: number, profile: RimProfile = 'J'): BarrelComponent {
  return {
    id: `GEN-IB-${diameterIn}-${widthIn.toFixed(1)}`,
    kind: 'inner_barrel', diameterIn, widthIn, profile,
    mateAllowanceMm: MATE_MM,
    supplier: '', partNumber: '',
  };
}
function shell(diameterIn: number, widthIn: number, profile: RimProfile = 'J'): BarrelComponent {
  return {
    id: `GEN-CS-${diameterIn}-${widthIn.toFixed(1)}`,
    kind: 'complete_shell', diameterIn, widthIn, profile,
    mateAllowanceMm: 0,
    supplier: '', partNumber: '',
  };
}

export const OUTER_LIPS: BarrelComponent[] =
  DIAMETERS.flatMap(d => LIP_WIDTHS.map(w => lip(d, w)));
export const INNER_BARRELS: BarrelComponent[] =
  DIAMETERS.flatMap(d => BARREL_WIDTHS.map(w => barrel(d, w)));
export const COMPLETE_SHELLS: BarrelComponent[] =
  DIAMETERS.flatMap(d => [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11].map(w => shell(d, w)));

export const lipsFor = (d: number) => OUTER_LIPS.filter(x => x.diameterIn === d);
export const barrelsFor = (d: number) => INNER_BARRELS.filter(x => x.diameterIn === d);
export const shellsFor = (d: number) => COMPLETE_SHELLS.filter(x => x.diameterIn === d);

/** Pad depths in the range real multipiece discs are machined to. */
export const PAD_DEPTHS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] as const;

export function discVariants(opts: {
  faceId: string;
  faceName: string;
  diameterIn: number;
  boltCount: number;
  pcdMm: number;
  centreBoreMm: number;
  padThicknessMm?: number;
  mount?: DiscComponent['mount'];
}): DiscComponent[] {
  return PAD_DEPTHS.map(pd => ({
    id: `${opts.faceId}-D${opts.diameterIn}-PD${pd.toFixed(1)}-${opts.boltCount}x${opts.pcdMm}`,
    name: `${opts.faceName} ${opts.diameterIn}" — ${pd.toFixed(1)}" pad depth`,
    padDepthIn: pd,
    padThicknessMm: opts.padThicknessMm ?? 11,
    mount: opts.mount ?? 'front_mount',
    boltPattern: { count: opts.boltCount, pcdMm: opts.pcdMm },
    centreBoreMm: opts.centreBoreMm,
    faceDiameterIn: opts.diameterIn,
  }));
}

export interface HardwareKit {
  id: string;
  label: string;
  material: 'stainless' | 'steel_zinc' | 'titanium';
  finish: 'polished' | 'gold' | 'black' | 'silver';
  note: string;
}

export const HARDWARE: HardwareKit[] = [
  { id: 'hw-ss-pol', label: 'Stainless, polished', material: 'stainless', finish: 'polished', note: 'The default for a rebuild. Load rating is a supplier datum and is not asserted here.' },
  { id: 'hw-ss-gold', label: 'Stainless, gold', material: 'stainless', finish: 'gold', note: 'Period-correct against a soft gold face.' },
  { id: 'hw-ss-black', label: 'Stainless, black', material: 'stainless', finish: 'black', note: 'Disappears against a dark face.' },
  { id: 'hw-ti', label: 'Titanium', material: 'titanium', finish: 'silver', note: 'Weight saving only. Torque and rating must come from the supplier; none is published here.' },
];

export const FINISHES = [
  { id: 'polished-al', label: 'Polished aluminium', hex: '#cfd6dd', metal: 0.95, rough: 0.06 },
  { id: 'brushed-al', label: 'Brushed aluminium', hex: '#b7bfc7', metal: 0.9, rough: 0.3 },
  { id: 'silver', label: 'Silver', hex: '#c3c8cd', metal: 0.75, rough: 0.28 },
  { id: 'champagne', label: 'Champagne gold', hex: '#cdae78', metal: 0.82, rough: 0.26 },
  { id: 'soft-gold', label: 'Soft gold', hex: '#c9a063', metal: 0.8, rough: 0.3 },
  { id: 'bronze', label: 'Bronze', hex: '#9c7b4e', metal: 0.8, rough: 0.33 },
  { id: 'gunmetal', label: 'Gunmetal', hex: '#5b636b', metal: 0.7, rough: 0.35 },
  { id: 'satin-black', label: 'Satin black', hex: '#24282c', metal: 0.4, rough: 0.5 },
  { id: 'gloss-black', label: 'Gloss black', hex: '#15181b', metal: 0.5, rough: 0.12 },
  { id: 'white', label: 'Motorsport white', hex: '#e8eaec', metal: 0.2, rough: 0.4 },
] as const;

export type FinishId = typeof FINISHES[number]['id'];
export const finishById = (id: string) => FINISHES.find(f => f.id === id) ?? FINISHES[0];

/** Spacer stock. Offered only when the user allows spacers. */
export const SPACERS_MM = [0, 3, 5, 8, 10, 12, 15, 20] as const;
