'use client';
import { create } from 'zustand';
import {
  resolveWheel, assembleWheel, mountTire, resolveCornerState,
  analyseClearance, compareToBaseline,
  type WheelGeometry, type MountedTire, type ClearanceReport,
  type FitmentDelta, type AssemblyResult, type CornerState,
  type ConstructionType, type ArchModification, type SuspensionPackage,
  type TireSize, type MountStyle,
} from '@/engine';
import { VEHICLES, byId, type VehicleVariant } from '@/data/vehicles';
import { useSubmissions, variantKey } from '@/store/submissions';
import {
  aggregateVariant, envelopeFromConsensus, camberOverrideFrom, travelOverrideFrom,
  type VariantConsensus,
} from '@/engine/aggregate';
import { lipsFor, barrelsFor, shellsFor, discVariants, type FinishId } from '@/data/components';
import { ORIGINAL_FACES, faceById } from '@/data/faces';

export type Axle = 'front' | 'rear';

export interface AxleConfig {
  faceId: string;
  construction: ConstructionType;
  diameterIn: number;
  outerLipId: string;
  innerBarrelId: string;
  completeShellId: string;
  padDepthIn: number;
  mount: MountStyle;
  spacerMm: number;
  tire: TireSize;
  targetEtMm: number | null;
  faceFinish: FinishId;
  lipFinish: FinishId;
  hardwareFinish: FinishId;
}

export interface SuspensionConfig {
  package: SuspensionPackage;
  dropFrontMm: number;
  dropRearMm: number;
  camberFrontDeg: number | null;
  camberRearDeg: number | null;
  compressionMm: number;
  steeringDeg: number;
  archMod: ArchModification;
}

export interface MeasuredOverrides {
  archRadiusMm: number | null;
  archLateralMm: number | null;
  innerDepthMm: number | null;
  travelMm: number | null;
}

export type ViewMode =
  | 'complete' | 'wheel_with_tire' | 'wheel_bare' | 'hub_only' | 'exploded';
export type CameraPreset =
  | 'side' | 'front' | 'rear' | 'front_three_quarter' | 'rear_three_quarter'
  | 'elevated' | 'wheel_close';

export interface SavedBuild {
  id: string;
  name: string;
  savedAt: string;
  /** Pinned so a saved build keeps meaning if the catalogue changes. */
  engineVersion: string;
  vehicleId: string;
  front: AxleConfig;
  rear: AxleConfig;
  suspension: SuspensionConfig;
  measuredFront: MeasuredOverrides;
  measuredRear: MeasuredOverrides;
}

export const ENGINE_VERSION = '0.1.0';
const STORAGE_KEY = 'rareform.builds.v1';

function defaultAxle(diameterIn: number, tire: TireSize): AxleConfig {
  const d = diameterIn;
  return {
    faceId: ORIGINAL_FACES[0]!.id,
    construction: 'three_piece',
    diameterIn: d,
    outerLipId: `GEN-OL-${d}-3.0`,
    innerBarrelId: `GEN-IB-${d}-5.0`,
    completeShellId: `GEN-CS-${d}-8.0`,
    padDepthIn: 3.5,
    mount: 'front_mount',
    spacerMm: 0,
    tire,
    targetEtMm: 20,
    faceFinish: 'soft-gold',
    lipFinish: 'polished-al',
    hardwareFinish: 'champagne',
  };
}

const noMeasure = (): MeasuredOverrides =>
  ({ archRadiusMm: null, archLateralMm: null, innerDepthMm: null, travelMm: null });

interface State {
  vehicleId: string;
  axle: Axle;
  front: AxleConfig;
  rear: AxleConfig;
  suspension: SuspensionConfig;
  measuredFront: MeasuredOverrides;
  measuredRear: MeasuredOverrides;
  viewMode: ViewMode;
  cameraPreset: CameraPreset;
  transparentBody: boolean;
  showDimensions: boolean;
  sectionPlane: boolean;
  tireVisible: boolean;
  saved: SavedBuild[];

  setVehicle: (id: string) => void;
  setAxle: (a: Axle) => void;
  patchAxle: (a: Axle, p: Partial<AxleConfig>) => void;
  patchBothAxles: (p: Partial<AxleConfig>) => void;
  patchSuspension: (p: Partial<SuspensionConfig>) => void;
  patchMeasured: (a: Axle, p: Partial<MeasuredOverrides>) => void;
  setView: (p: Partial<Pick<State,
    'viewMode' | 'cameraPreset' | 'transparentBody' | 'showDimensions' | 'sectionPlane' | 'tireVisible'>>) => void;
  loadFactoryPackage: (index: number) => void;
  hydrate: () => void;
  saveBuild: (name: string) => void;
  loadBuild: (id: string) => void;
  deleteBuild: (id: string) => void;
  duplicateBuild: (id: string) => void;
}

const DEFAULT_TIRE: TireSize = { sectionMm: 225, aspect: 50, diameterIn: 17 };

export const useBuild = create<State>((set, get) => ({
  vehicleId: 'bmw-e32-735i-1990',
  axle: 'front',
  front: defaultAxle(17, DEFAULT_TIRE),
  rear: defaultAxle(17, DEFAULT_TIRE),
  suspension: {
    package: 'factory',
    dropFrontMm: 0, dropRearMm: 0,
    camberFrontDeg: null, camberRearDeg: null,
    compressionMm: 0, steeringDeg: 0,
    archMod: 'untouched',
  },
  measuredFront: noMeasure(),
  measuredRear: noMeasure(),
  viewMode: 'complete',
  cameraPreset: 'front_three_quarter',
  transparentBody: true,
  showDimensions: true,
  sectionPlane: false,
  tireVisible: true,
  saved: [],

  setVehicle: id => set({ vehicleId: id, measuredFront: noMeasure(), measuredRear: noMeasure() }),
  setAxle: a => set({ axle: a }),
  patchAxle: (a, p) => set(s => ({ [a]: { ...s[a], ...p } } as Partial<State>)),
  patchBothAxles: p => set(s => ({ front: { ...s.front, ...p }, rear: { ...s.rear, ...p } })),
  patchSuspension: p => set(s => ({ suspension: { ...s.suspension, ...p } })),
  patchMeasured: (a, p) => set(s => a === 'front'
    ? { measuredFront: { ...s.measuredFront, ...p } }
    : { measuredRear: { ...s.measuredRear, ...p } }),
  setView: p => set(p as Partial<State>),

  loadFactoryPackage: index => {
    const v = byId(get().vehicleId);
    const pkg = v?.factoryPackages[index];
    if (!pkg) return;
    const d = pkg.diameterIn;
    const patch: Partial<AxleConfig> = {
      diameterIn: d, tire: pkg.tire, targetEtMm: pkg.etMm,
      outerLipId: `GEN-OL-${d}-3.0`,
      innerBarrelId: `GEN-IB-${d}-5.0`,
      completeShellId: `GEN-CS-${d}-${pkg.widthIn.toFixed(1)}`,
    };
    if (pkg.axle === 'front') get().patchAxle('front', patch);
    else if (pkg.axle === 'rear') get().patchAxle('rear', patch);
    else get().patchBothAxles(patch);
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) set({ saved: JSON.parse(raw) as SavedBuild[] });
    } catch { /* private window, blocked storage: carry on with none */ }
  },

  saveBuild: name => {
    const s = get();
    const build: SavedBuild = {
      id: `b-${Date.now().toString(36)}`,
      name: name.trim() || `${byId(s.vehicleId)?.chassis ?? 'Build'} ${new Date().toLocaleDateString()}`,
      savedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      vehicleId: s.vehicleId,
      front: s.front, rear: s.rear, suspension: s.suspension,
      measuredFront: s.measuredFront, measuredRear: s.measuredRear,
    };
    const saved = [build, ...s.saved].slice(0, 40);
    set({ saved });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  },

  loadBuild: id => {
    const b = get().saved.find(x => x.id === id);
    if (!b) return;
    set({
      vehicleId: b.vehicleId, front: b.front, rear: b.rear,
      suspension: b.suspension,
      measuredFront: b.measuredFront, measuredRear: b.measuredRear,
    });
  },

  deleteBuild: id => {
    const saved = get().saved.filter(x => x.id !== id);
    set({ saved });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  },

  duplicateBuild: id => {
    const b = get().saved.find(x => x.id === id);
    if (!b) return;
    const copy: SavedBuild = { ...b, id: `b-${Date.now().toString(36)}`, name: `${b.name} copy`, savedAt: new Date().toISOString() };
    const saved = [copy, ...get().saved].slice(0, 40);
    set({ saved });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  },
}));

// ----------------------------------------------------------------------
// Derivation. Every number the UI shows comes through here, so the panels
// and the 3D scene can never disagree.
// ----------------------------------------------------------------------

export interface AxleAnalysis {
  config: AxleConfig;
  assembly: AssemblyResult;
  wheel: WheelGeometry | null;
  tire: MountedTire;
  state: CornerState;
  clearance: ClearanceReport | null;
  delta: FitmentDelta | null;
  baselineWheel: WheelGeometry | null;
  baselineTire: MountedTire | null;
  /** Whether the car has any geometry to analyse against. */
  analysable: boolean;
}

export function analyseAxle(
  vehicle: VehicleVariant, axle: Axle, cfg: AxleConfig,
  susp: SuspensionConfig, measured: MeasuredOverrides,
  consensus?: VariantConsensus,
): AxleAnalysis {
  const d = cfg.diameterIn;
  const lip = lipsFor(d).find(x => x.id === cfg.outerLipId) ?? lipsFor(d)[0];
  const barrel = barrelsFor(d).find(x => x.id === cfg.innerBarrelId) ?? barrelsFor(d)[0];
  const shellC = shellsFor(d).find(x => x.id === cfg.completeShellId) ?? shellsFor(d)[0];
  const face = faceById(cfg.faceId) ?? ORIGINAL_FACES[0]!;

  const disc = discVariants({
    faceId: face.id, faceName: face.name, diameterIn: d,
    boltCount: vehicle.bolt.count, pcdMm: vehicle.bolt.pcdMm,
    centreBoreMm: vehicle.centreBoreMm, mount: cfg.mount,
  }).reduce((best, cur) =>
    Math.abs(cur.padDepthIn - cfg.padDepthIn) < Math.abs(best.padDepthIn - cfg.padDepthIn) ? cur : best);

  const assembly = assembleWheel({
    construction: cfg.construction, diameterIn: d,
    outerLip: lip, innerBarrel: barrel, completeShell: shellC,
    disc, spacerMm: cfg.spacerMm,
    targetEtMm: cfg.targetEtMm ?? undefined,
  });

  const widthIn = assembly.achievedWidthIn > 0 ? assembly.achievedWidthIn : 8;
  const tire = mountTire(cfg.tire, widthIn);

  let envBase = axle === 'front' ? vehicle.front : vehicle.rear;

  /*
   * Contributed measurements, where the community has corroborated them,
   * replace the library's estimated envelope. This is the entire payoff of
   * the contribution loop: the geometry handed to the solver is the same
   * kind of object either way, so a corroborated variant simply starts
   * returning real verdicts with no change to the solver at all.
   * Anything the community has not measured falls back to the preset, so a
   * partly measured corner improves rather than regressing to unknown.
   */
  if (consensus && envBase) {
    envBase = envelopeFromConsensus(
      consensus, envBase.kinematics, axle,
      axle === 'front' ? 'Strut body / spring' : 'Trailing arm / spring',
      envBase,
    );
  }
  const dropMm = axle === 'front' ? susp.dropFrontMm : susp.dropRearMm;
  const camberOverride = axle === 'front' ? susp.camberFrontDeg : susp.camberRearDeg;

  let envelope = envBase;
  if (envelope && (measured.archRadiusMm || measured.archLateralMm || measured.innerDepthMm)) {
    // A user measurement is traceable and overrides the library estimate.
    const m = { method: 'tape_measure' as const, grade: 'community_reported' as const, toleranceMm: 3, source: 'user measurement' };
    envelope = {
      ...envelope,
      archRadiusMm: measured.archRadiusMm
        ? { value: measured.archRadiusMm, unit: 'mm', ...m }
        : envelope.archRadiusMm,
      archLateralMm: measured.archLateralMm
        ? { value: measured.archLateralMm, unit: 'mm', ...m }
        : envelope.archLateralMm,
      inner: measured.innerDepthMm
        ? [{
            id: 'measured_inner', label: 'Nearest inner obstruction (measured)',
            radialMm: { value: 150, unit: 'mm', ...m },
            lateralDepthMm: { value: measured.innerDepthMm, unit: 'mm', ...m },
            hits: 'both' as const,
          }]
        : envelope.inner,
    };
  }

  const communityCamber = consensus ? camberOverrideFrom(consensus) : null;
  const communityTravel = consensus ? travelOverrideFrom(consensus) : null;

  const state = resolveCornerState(
    envelope?.kinematics ?? {
      architecture: axle === 'front' ? vehicle.frontArchitecture : vehicle.rearArchitecture,
      bumpTravelMm: 80,
    },
    {
      package: susp.package, dropMm, compressionMm: susp.compressionMm,
      steeringDeg: susp.steeringDeg,
      // a measurement the user took on their own car beats the community
      // consensus, which in turn beats the architecture's rule of thumb
      camberDegOverride: camberOverride ?? communityCamber?.deg ?? null,
      camberOverrideGrade: camberOverride !== null && camberOverride !== undefined
        ? 'community_reported'
        : communityCamber?.grade,
      travelMmOverride: measured.travelMm ?? communityTravel?.mm ?? null,
      travelGradeOverride: measured.travelMm !== null && measured.travelMm !== undefined
        ? 'community_reported'
        : communityTravel?.grade,
    },
  );

  const pkg = vehicle.factoryPackages.find(p => p.axle === axle || p.axle === 'both' || !p.axle)
    ?? vehicle.factoryPackages[0];
  const baselineWheel = pkg
    ? resolveWheel({ widthIn: pkg.widthIn, diameterIn: pkg.diameterIn, etMm: pkg.etMm })
    : null;
  const baselineTire = pkg ? mountTire(pkg.tire, pkg.widthIn) : null;

  const analysable = vehicle.assetState !== 'catalog_entry_only';

  return {
    config: cfg, assembly, wheel: assembly.geometry, tire, state,
    clearance: assembly.geometry && envelope
      ? analyseClearance({
          envelope, wheel: assembly.geometry, tire, state,
          archMod: susp.archMod, wheelCentreBoreMm: disc.centreBoreMm,
        })
      : null,
    delta: assembly.geometry && baselineWheel && baselineTire
      ? compareToBaseline(assembly.geometry, tire, baselineWheel, baselineTire)
      : null,
    baselineWheel, baselineTire, analysable,
  };
}

export function useAnalysis() {
  const s = useBuild();
  const submissions = useSubmissions(st => st.submissions);
  const vehicle = byId(s.vehicleId) ?? VEHICLES[0]!;

  const consensusFor = (axle: Axle): VariantConsensus => aggregateVariant(
    variantKey({
      vehicleId: vehicle.id, axle,
      suspensionPackage: s.suspension.package, brakePackage: 'factory',
    }),
    submissions,
  );

  const frontConsensus = consensusFor('front');
  const rearConsensus = consensusFor('rear');

  return {
    vehicle,
    frontConsensus, rearConsensus,
    front: analyseAxle(vehicle, 'front', s.front, s.suspension, s.measuredFront, frontConsensus),
    rear: analyseAxle(vehicle, 'rear', s.rear, s.suspension, s.measuredRear, rearConsensus),
  };
}
