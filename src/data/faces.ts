/**
 * WHEEL FACE CATALOGUE
 *
 * Two kinds of entry, and the difference is a legal one, not a cosmetic
 * one.
 *
 * `original` faces are generic designs defined by their own parameters
 * here — spoke count, spoke geometry, mesh density, dish — and rendered
 * procedurally. They are configurable and buildable in the studio.
 *
 * `reference` entries name a real OEM or aftermarket wheel so a user can
 * say what they are after and so the library's shape is visible. They
 * carry NO geometry and NO asset, and they are not configurable. Removing
 * a logo does not resolve design or trademark rights in a wheel face, and
 * copying a recognisable proprietary face would not become lawful by
 * being procedural. Using one of these requires an authorised reference
 * or a licensed asset, which is an acquisition task, not a code task.
 *
 * Nothing here implies affiliation with or endorsement by any
 * manufacturer.
 */

export type FaceKind = 'original' | 'reference';

export interface SpokeDesign {
  /** Rendering archetype. Drives the procedural face generator. */
  archetype: 'mesh' | 'five_spoke' | 'split_spoke' | 'multi_spoke' | 'turbine' | 'dish' | 'honeycomb';
  spokeCount: number;
  /** 0 = flat face, 1 = deeply concave. Visual only. */
  concavity: number;
  /** Fraction of face diameter the centre hub cap covers. */
  hubFraction: number;
  /** Spoke taper: 1 = parallel, <1 = narrows outward. */
  taper: number;
  /** Window rounding, 0-1. */
  windowRadius: number;
}

export interface WheelFace {
  id: string;
  name: string;
  kind: FaceKind;
  /** Only meaningful for `reference` entries. */
  referencedMaker?: string;
  era: string;
  construction: ('monoblock' | 'two_piece' | 'three_piece')[];
  diametersIn: number[];
  design?: SpokeDesign;
  /** Rights position, stated plainly. */
  rights: string;
  configurable: boolean;
  note: string;
}

export const ORIGINAL_FACES: WheelFace[] = [
  {
    id: 'rf-classic-mesh',
    name: 'Classic Mesh',
    kind: 'original',
    era: '1970s-1980s idiom',
    construction: ['three_piece', 'two_piece'],
    diametersIn: [15, 16, 17, 18, 19],
    design: { archetype: 'mesh', spokeCount: 24, concavity: 0.12, hubFraction: 0.26, taper: 0.9, windowRadius: 0.2 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Dense cross-lattice. Reads period-correct on a 1980s saloon and hides a deep lip well.',
  },
  {
    id: 'rf-heritage-five',
    name: 'Heritage Five-Spoke',
    kind: 'original',
    era: '1960s-1970s idiom',
    construction: ['three_piece', 'two_piece', 'monoblock'],
    diametersIn: [14, 15, 16, 17, 18],
    design: { archetype: 'five_spoke', spokeCount: 5, concavity: 0.3, hubFraction: 0.3, taper: 0.72, windowRadius: 0.35 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Broad flat spokes with large windows. Shows brake hardware, so caliper finish matters.',
  },
  {
    id: 'rf-split-spoke',
    name: 'Split-Spoke',
    kind: 'original',
    era: '1990s idiom',
    construction: ['three_piece', 'monoblock'],
    diametersIn: [16, 17, 18, 19, 20],
    design: { archetype: 'split_spoke', spokeCount: 10, concavity: 0.42, hubFraction: 0.24, taper: 0.66, windowRadius: 0.3 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Paired spokes reading as five from a distance. Carries a concave face without looking modern.',
  },
  {
    id: 'rf-touring-twenty',
    name: 'Touring Twenty-Spoke',
    kind: 'original',
    era: '1980s idiom',
    construction: ['three_piece', 'two_piece'],
    diametersIn: [15, 16, 17, 18],
    design: { archetype: 'multi_spoke', spokeCount: 20, concavity: 0.08, hubFraction: 0.28, taper: 0.85, windowRadius: 0.45 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Thin radial spokes, nearly flat face. The quietest option against a polished lip.',
  },
  {
    id: 'rf-turbine',
    name: 'Turbine',
    kind: 'original',
    era: '1970s idiom',
    construction: ['monoblock', 'two_piece'],
    diametersIn: [14, 15, 16, 17],
    design: { archetype: 'turbine', spokeCount: 12, concavity: 0.18, hubFraction: 0.34, taper: 1.0, windowRadius: 0.12 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Swept vanes, small windows. Nearly closed, so brake cooling is worth checking.',
  },
  {
    id: 'rf-classic-forged',
    name: 'Classic Forged',
    kind: 'original',
    era: 'Timeless',
    construction: ['three_piece', 'monoblock'],
    diametersIn: [16, 17, 18, 19, 20],
    design: { archetype: 'five_spoke', spokeCount: 5, concavity: 0.55, hubFraction: 0.22, taper: 0.6, windowRadius: 0.28 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Deeply concave five-spoke. Needs a shallow pad depth, which pushes offset low — check inner clearance first.',
  },
  {
    id: 'rf-modular-motorsport',
    name: 'Modular Motorsport',
    kind: 'original',
    era: 'Motorsport idiom',
    construction: ['three_piece'],
    diametersIn: [15, 16, 17, 18],
    design: { archetype: 'honeycomb', spokeCount: 18, concavity: 0.05, hubFraction: 0.2, taper: 1.0, windowRadius: 0.1 },
    rights: 'Original design, created here. Free to configure and build.',
    configurable: true,
    note: 'Flat perforated face over a visible assembly flange. Intentionally utilitarian.',
  },
];

const ref = (
  id: string, name: string, referencedMaker: string, era: string,
  diametersIn: number[], construction: WheelFace['construction'], note: string,
): WheelFace => ({
  id, name, kind: 'reference', referencedMaker, era, construction, diametersIn,
  rights: 'Reference entry only. No asset and no geometry. Requires an authorised reference or a licensed asset before it can be configured or rendered.',
  configurable: false,
  note,
});

/**
 * Named so a user can state the target and so the catalogue's intended
 * shape is visible. None of these can be configured or rendered.
 */
export const REFERENCE_FACES: WheelFace[] = [
  ref('ref-bmw-style-5', 'Style 5', 'BMW', '1990s', [16, 17, 18], ['two_piece'], 'Twenty-spoke two-piece. Frequently rebuilt, so a conversion path is plausible subject to specialist evaluation.'),
  ref('ref-bmw-style-19', 'Style 19', 'BMW', '1990s', [17], ['two_piece'], 'Also known as a basketweave-descendant mesh.'),
  ref('ref-bmw-style-20', 'Style 20 Turbine', 'BMW', '1990s', [17], ['monoblock'], 'Turbine vane face.'),
  ref('ref-bmw-style-21', 'Style 21 Throwing Star', 'BMW', '1990s', [17], ['monoblock'], 'Five twin-tip spokes.'),
  ref('ref-bmw-style-32', 'Style 32', 'BMW', '1990s', [17], ['monoblock'], ''),
  ref('ref-bmw-style-37', 'Style 37 M Parallel', 'BMW', '1990s', [17, 18], ['two_piece'], 'Parallel-spoke two-piece.'),
  ref('ref-bmw-style-42', 'Style 42', 'BMW', '1990s', [17, 18], ['monoblock'], ''),
  ref('ref-bmw-style-65', 'Style 65', 'BMW', '1990s', [17], ['monoblock'], ''),
  ref('ref-bmw-style-66', 'Style 66', 'BMW', '1990s', [16, 17], ['monoblock'], ''),
  ref('ref-bmw-style-67', 'Style 67', 'BMW', '1990s', [18], ['two_piece'], ''),
  ref('ref-bmw-style-95', 'Style 95', 'BMW', '2000s', [18], ['monoblock'], ''),
  ref('ref-mb-bundt', 'Bundt', 'Mercedes-Benz', '1960s-1980s', [14, 15], ['monoblock'], 'The defining classic Mercedes face.'),
  ref('ref-mb-8hole', '8-hole', 'Mercedes-Benz', '1980s', [15, 16], ['monoblock'], ''),
  ref('ref-mb-15hole', '15-hole', 'Mercedes-Benz', '1980s-1990s', [15, 16], ['monoblock'], ''),
  ref('ref-mb-amg-mono', 'AMG Monoblock', 'AMG', '1990s', [17, 18], ['monoblock'], ''),
  ref('ref-mb-aero', 'Aero I / II', 'AMG', '1990s', [17, 18], ['two_piece'], ''),
  ref('ref-por-fuchs', 'Fuchs', 'Porsche', '1960s-1980s', [15, 16, 17], ['monoblock'], 'Forged five-leaf. Factory offsets are distinctive and vary by width.'),
  ref('ref-por-cookie', 'Cookie Cutter', 'Porsche', '1970s-1980s', [15, 16], ['monoblock'], ''),
  ref('ref-por-phonedial', 'Phone Dial', 'Porsche', '1980s', [15, 16], ['monoblock'], ''),
  ref('ref-por-d90', 'Design 90', 'Porsche', '1980s-1990s', [16, 17], ['monoblock'], ''),
  ref('ref-por-cup', 'Cup I / II', 'Porsche', '1990s', [17, 18], ['monoblock'], ''),
  ref('ref-por-twist', 'Turbo Twist', 'Porsche', '1990s-2000s', [17, 18], ['monoblock'], ''),
  ref('ref-bbs-rs', 'RS', 'BBS', '1980s-1990s', [15, 16, 17, 18], ['three_piece'], 'The reference rebuildable three-piece. A real RS centre plus new barrels is an existing rebuildable multipiece, not a conversion.'),
  ref('ref-bbs-rf', 'RF', 'BBS', '1990s', [16, 17, 18], ['three_piece'], ''),
  ref('ref-bbs-lm', 'LM', 'BBS', '1990s-2000s', [17, 18, 19], ['three_piece'], ''),
  ref('ref-oz-futura', 'Futura', 'OZ', '1980s-1990s', [15, 16, 17], ['three_piece'], ''),
  ref('ref-oz-mito', 'Mito', 'OZ', '1990s', [16, 17], ['three_piece'], ''),
  ref('ref-oz-pegasus', 'Pegasus', 'OZ', '1990s', [17, 18], ['three_piece'], ''),
  ref('ref-hartge-c', 'Type C', 'Hartge', '1980s-1990s', [16, 17], ['three_piece'], ''),
  ref('ref-alpina', 'Classic 20-spoke', 'Alpina', '1980s-1990s', [16, 17], ['three_piece', 'two_piece'], ''),
  ref('ref-acs-1', 'Type I', 'AC Schnitzer', '1980s', [15, 16], ['three_piece'], ''),
  ref('ref-acs-2', 'Type II', 'AC Schnitzer', '1980s-1990s', [16, 17], ['three_piece'], ''),
  ref('ref-acs-3', 'Type III', 'AC Schnitzer', '1990s', [17, 18], ['three_piece'], ''),
  ref('ref-breyton', 'Classic', 'Breyton', '1990s', [17, 18], ['three_piece'], ''),
  ref('ref-ronal', 'Turbo', 'Ronal', '1980s', [15, 16], ['monoblock'], ''),
  ref('ref-speedline', 'Classic', 'Speedline', '1980s-1990s', [15, 16, 17], ['monoblock', 'three_piece'], ''),
  ref('ref-hre', '500 series', 'HRE', '2000s', [18, 19, 20], ['three_piece'], ''),
  ref('ref-kinesis', 'K58', 'Kinesis', '1990s-2000s', [17, 18, 19], ['three_piece'], ''),
  ref('ref-fikse', 'Profil', 'Fikse', '1990s-2000s', [17, 18], ['three_piece'], ''),
];

export const ALL_FACES: WheelFace[] = [...ORIGINAL_FACES, ...REFERENCE_FACES];
export const faceById = (id: string) => ALL_FACES.find(f => f.id === id);

/**
 * OEM-to-multipiece conversion classification. Visualising a conversion
 * does not establish that it can be built: no machining procedure,
 * torque figure, material rating or load capacity is produced anywhere
 * in this product.
 */
export type ConversionClass =
  | 'existing_rebuildable'
  | 'documented_conversion'
  | 'specialist_evaluation_required'
  | 'insufficient_data'
  | 'incompatible';

export const CONVERSION_LABEL: Record<ConversionClass, string> = {
  existing_rebuildable: 'Existing rebuildable multipiece',
  documented_conversion: 'Documented engineered conversion',
  specialist_evaluation_required: 'Specialist evaluation required',
  insufficient_data: 'Insufficient data',
  incompatible: 'Incompatible',
};

export const CONVERSION_NOTE: Record<ConversionClass, string> = {
  existing_rebuildable: 'Already a bolt-together assembly. New barrels are a rebuild, not a conversion.',
  documented_conversion: 'A specific engineered conversion is documented for this face. The documentation, not this tool, is the authority.',
  specialist_evaluation_required: 'Geometrically conceivable. Whether the centre can carry the load in this configuration is a question for a builder with the part in hand.',
  insufficient_data: 'Not enough is recorded about this face to classify it.',
  incompatible: 'The face architecture does not admit a separable barrel.',
};

export function classifyConversion(face: WheelFace): ConversionClass {
  if (!face.design && face.kind === 'reference') return 'insufficient_data';
  if (face.construction.includes('three_piece')) return 'existing_rebuildable';
  if (face.construction.includes('two_piece')) return 'specialist_evaluation_required';
  return 'incompatible';
}
