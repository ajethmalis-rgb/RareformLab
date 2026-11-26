'use client';
import { create } from 'zustand';
import {
  Submission, validateSubmission, variantKey,
  type MeasurementKey, type ValidationIssue,
} from '@/engine/submission';
import { aggregateVariant, type VariantConsensus } from '@/engine/aggregate';

const KEY = 'rareform.submissions.v1';

/**
 * Local submission store.
 *
 * Browser storage is the wrong home for contributed measurements — they are
 * shared evidence, not a per-viewer convenience, and the whole point is that
 * one person's measurement reaches the next person. This is deliberately a
 * thin layer over a schema that is already server-shaped: every record is a
 * validated `Submission` with a stable id, a submitter id and a status, so
 * moving it behind an API is a transport change rather than a rewrite.
 */
interface State {
  submissions: Submission[];
  /** Guards against re-reading storage on every mount. */
  hydrated: boolean;
  /** Stands in for an account until there is one. */
  currentSubmitterId: string;
  hydrate: () => void;
  add: (s: Submission) => { ok: boolean; issues: ValidationIssue[] };
  setStatus: (id: string, status: Submission['status'], note: string, by: string) => void;
  remove: (id: string) => void;
  forVariant: (key: string) => Submission[];
  consensus: (key: string) => VariantConsensus;
  seedExample: () => void;
}

function persist(subs: Submission[]) {
  try { localStorage.setItem(KEY, JSON.stringify(subs)); } catch { /* blocked storage */ }
}

export const useSubmissions = create<State>((set, get) => ({
  submissions: [],
  hydrated: false,
  currentSubmitterId: 'me',

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      // Reject anything that no longer matches the schema rather than
      // letting a stale shape reach the aggregator.
      const ok: Submission[] = [];
      for (const r of parsed) {
        const res = Submission.safeParse(r);
        if (res.success) ok.push(res.data);
      }
      set({ submissions: ok });
    } catch { /* private window, blocked storage, or corrupt JSON */ }
  },

  add: s => {
    const parsed = Submission.safeParse(s);
    if (!parsed.success) {
      return {
        ok: false,
        issues: [{ key: 'submission', severity: 'reject', message: parsed.error.issues[0]?.message ?? 'Invalid submission.' }],
      };
    }
    const issues = validateSubmission(parsed.data);
    if (issues.some(i => i.severity === 'reject')) return { ok: false, issues };
    const next = [parsed.data, ...get().submissions];
    set({ submissions: next });
    persist(next);
    return { ok: true, issues };
  },

  setStatus: (id, status, note, by) => {
    const next = get().submissions.map(s => s.id === id
      ? { ...s, status, reviewNote: note, reviewedBy: by, reviewedAt: new Date().toISOString() }
      : s);
    set({ submissions: next });
    persist(next);
  },

  remove: id => {
    const next = get().submissions.filter(s => s.id !== id);
    set({ submissions: next });
    persist(next);
  },

  forVariant: key => get().submissions.filter(s => s.variantKey === key),
  consensus: key => aggregateVariant(key, get().submissions),

  /**
   * Three worked submissions for one variant, so the review queue and the
   * consensus view have something to show on a first visit.
   *
   * They are seeded as PENDING, deliberately. An accepted example would
   * reach consensus on its own and quietly promote a real chassis to a
   * green verdict off invented numbers, which is the exact failure this
   * product exists to prevent. Leaving them pending means a person has to
   * accept them in the review UI, where they are labelled as examples, and
   * the promotion is then something a human chose rather than something the
   * seed did behind their back.
   */
  seedExample: () => {
    if (get().submissions.some(s => s.id.startsWith('example-'))) return;
    const VEHICLE = 'bmw-e30-325i';   // must match an id in data/vehicles.ts
    const vk = variantKey({ vehicleId: VEHICLE, axle: 'front', suspensionPackage: 'factory' });
    const base = {
      variantKey: vk, vehicleId: VEHICLE, axle: 'front' as const,
      submitterVerified: false, submittedAt: new Date().toISOString(),
      suspensionPackage: 'factory' as const, rideHeightDropMm: 0,
      bodyOriginal: true, brakePackage: 'factory',
      wheelOnCar: { widthIn: 6, diameterIn: 14, etMm: 42, tireSectionMm: 195, tireAspect: 65 },
      method: 'tape_measure' as const,
      notes: 'EXAMPLE RECORD \u2014 illustrative numbers, not measured from a car.',
      reviewNote: '', reviewedBy: '',
    };
    const mk = (n: number, who: string, j: number, status: Submission['status']): Submission =>
      Submission.parse({
        ...base, id: `example-${n}`, submitterId: who, submitterName: who, status,
        values: {
          archRadiusMm: 382 + j, archLateralMm: 88 + j,
          innerDepthMm: 165 + j, travelMm: 80, camberDeg: Number((-0.4 + j * 0.05).toFixed(2)),
        },
      });
    const seeded = [
      mk(1, 'example-owner-a', 0, 'pending'),
      mk(2, 'example-owner-b', 2, 'pending'),
      mk(3, 'example-owner-c', 1, 'pending'),
    ];
    const next = [...seeded, ...get().submissions];
    set({ submissions: next });
    persist(next);
  },
}));

export { variantKey };
export type { MeasurementKey };
