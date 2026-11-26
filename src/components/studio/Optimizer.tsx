'use client';
import { useState } from 'react';
import { useBuild, useAnalysis } from '@/store/build';
import {
  optimizeFitment, DEFAULT_CONSTRAINTS, GOAL_LABEL,
  type StanceGoal, type Constraints, type OptimizeResult,
} from '@/engine/optimizer';
import { lipsFor, barrelsFor, shellsFor, discVariants } from '@/data/components';
import { faceById, ORIGINAL_FACES } from '@/data/faces';
import { Panel, Field, Note, Btn, VerdictChip, GradeChip } from './ui';

const GOALS: StanceGoal[] = [
  'conservative_street', 'oem_plus', 'nearly_flush',
  'max_lip', 'max_width', 'show_parked',
];

/**
 * BUILD TO FIT. The user says what they want the wheel to look like and
 * what they refuse to change about the car; the engine searches real
 * component combinations and reports what the geometry allows.
 *
 * Constraints are never silently relaxed. A combination that breaks one
 * is rejected WITH ITS REASON, so the user can decide to relax it
 * themselves rather than discovering the tool did it for them.
 */
export function Optimizer({ onClose }: { onClose: () => void }) {
  const s = useBuild();
  const { vehicle, front, rear } = useAnalysis();
  const a = s.axle === 'front' ? front : rear;
  const [goal, setGoal] = useState<StanceGoal>('conservative_street');
  const [cons, setCons] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [running, setRunning] = useState(false);

  const envelope = s.axle === 'front' ? vehicle.front : vehicle.rear;
  const face = faceById(a.config.faceId) ?? ORIGINAL_FACES[0]!;
  const d = a.config.diameterIn;

  function run() {
    if (!envelope || !a.baselineWheel || !a.baselineTire) return;
    setRunning(true);
    try {
      const discs = discVariants({
        faceId: face.id, faceName: face.name, diameterIn: d,
        boltCount: vehicle.bolt.count, pcdMm: vehicle.bolt.pcdMm,
        centreBoreMm: vehicle.centreBoreMm, mount: a.config.mount,
      });
      setResult(optimizeFitment({
        envelope,
        suspension: {
          package: s.suspension.package,
          dropMm: s.axle === 'front' ? s.suspension.dropFrontMm : s.suspension.dropRearMm,
          compressionMm: 0,
          camberDegOverride: s.axle === 'front' ? s.suspension.camberFrontDeg : s.suspension.camberRearDeg,
        },
        construction: a.config.construction,
        diameterIn: d,
        outerLips: lipsFor(d),
        innerBarrels: barrelsFor(d),
        completeShells: shellsFor(d),
        discs,
        baselineWheelGeometry: a.baselineWheel,
        baselineTire: a.baselineTire,
        goal, constraints: cons,
        archMod: s.suspension.archMod,
        widthRange: [6.5, 11],
        limit: 6,
      }));
    } finally { setRunning(false); }
  }

  function apply(cid: string) {
    const r = [...(result?.verified ?? []), ...(result?.unverified ?? [])].find(c => c.id === cid);
    if (!r) return;
    s.patchAxle(s.axle, {
      outerLipId: r.components.outerLip ?? a.config.outerLipId,
      innerBarrelId: r.components.innerBarrel ?? a.config.innerBarrelId,
      completeShellId: r.components.completeShell ?? a.config.completeShellId,
      padDepthIn: Number(r.components.disc.match(/PD([\d.]+)/)?.[1] ?? a.config.padDepthIn),
      spacerMm: r.spacerMm,
      tire: r.tireSize,
    });
  }

  return (
    <Panel title={`Build to fit — ${s.axle}`}
      right={<Btn small onClick={onClose}>CLOSE</Btn>}>
      {!envelope || vehicle.assetState === 'catalog_entry_only' ? (
        <Note tone="warn">
          The optimiser searches against the car&apos;s geometry, and this chassis has none
          recorded. It is a catalogue entry only. Measure the four critical dimensions
          first — without them there is nothing to optimise against, and a result would
          be fiction.
        </Note>
      ) : (
        <>
          <Field label="Goal">
            <select value={goal} onChange={e => setGoal(e.target.value as StanceGoal)}>
              {GOALS.map(g => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
            </select>
          </Field>

          <span className="lbl block mb-1.5 mt-2">Hard constraints</span>
          <div className="flex flex-col gap-1.5">
            {([
              ['untouchedFactoryMetal', 'Untouched factory metal — no rolling, pulling or cutting'],
              ['allowSpacers', 'Allow spacers'],
              ['noStretchedTires', 'No stretched tyres'],
              ['approvedTiresOnly', 'Approved rim widths only'],
              ['drivingUse', 'Driving use — dynamic conditions must pass, not just static'],
              ['requireVerifiedGeometry', 'Verified geometry only'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-[11px] leading-snug text-bone-dim cursor-pointer">
                <input type="checkbox" checked={cons[key]} style={{ width: 'auto', marginTop: 2 }}
                  onChange={e => setCons({
                    ...cons, [key]: e.target.checked,
                    ...(key === 'allowSpacers' ? { maxSpacerMm: e.target.checked ? 12 : 0 } : {}),
                  })} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <Field label="Min clearance mm">
              <input type="number" value={cons.minClearanceMm}
                onChange={e => setCons({ ...cons, minClearanceMm: Number(e.target.value) })} />
            </Field>
            <Field label="Max speedo dev %">
              <input type="number" step={0.5} value={cons.maxSpeedoDeviationPct}
                onChange={e => setCons({ ...cons, maxSpeedoDeviationPct: Number(e.target.value) })} />
            </Field>
          </div>

          <Btn prime onClick={run}>{running ? 'SEARCHING…' : 'SEARCH COMBINATIONS'}</Btn>

          {result && (
            <div className="mt-3">
              <div className="text-[10.5px] text-bone-mute mb-2">
                {result.searched} combinations evaluated · {result.verified.length} verified ·{' '}
                {result.unverified.length} unverified · {result.rejected.length} rejected
              </div>

              {result.verified.length === 0 && result.unverified.length === 0 && (
                <Note tone="warn">
                  Nothing satisfies these constraints. The most common rejections were:{' '}
                  {[...new Set(result.rejected.flatMap(r => r.violations))].slice(0, 3).join(' ')}
                  {' '}Relax a constraint deliberately rather than hoping the tool will.
                </Note>
              )}

              {(['verified', 'unverified'] as const).map(bucket => {
                const list = result[bucket];
                if (list.length === 0) return null;
                return (
                  <div key={bucket} className="mb-3">
                    <div className="lbl mb-1" style={{ color: bucket === 'verified' ? '#4fa97e' : '#e07b39' }}>
                      {bucket === 'verified'
                        ? 'Verified — every governing dimension measured'
                        : 'Unverified — rests on estimated geometry'}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {list.map(c => (
                        <div key={c.id} className="border border-line rounded p-2 bg-graphite-900">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="num text-[12px] font-semibold text-champagne">
                              {c.assembly.achievedWidthIn.toFixed(1)}J×{c.assembly.geometry?.diameterIn} ET{c.assembly.achievedEtMm.toFixed(0)}
                              {' · '}{c.tireSize.sectionMm}/{c.tireSize.aspect}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <VerdictChip v={c.verdict} small />
                              <Btn small onClick={() => apply(c.id)}>APPLY</Btn>
                            </div>
                          </div>
                          <div className="num text-[10.5px] text-bone-mute mt-1">
                            lip {c.assembly.exposedLipIn.toFixed(2)}&quot; · barrel {c.assembly.innerBarrelExposedIn.toFixed(2)}&quot;
                            {' · '}BS {c.assembly.geometry?.backspacingIn.toFixed(2)}&quot;
                            {' · '}worst {c.worstDistanceMm ?? '—'} mm at {c.bindingComponent ?? '—'}
                            {c.spacerMm > 0 && ` · ${c.spacerMm} mm spacer`}
                          </div>
                          {c.tradeoffs.length > 0 && (
                            <div className="text-[10.5px] leading-snug text-bone-dim mt-1">
                              {c.tradeoffs.slice(0, 2).join(' ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {result.rejected.length > 0 && (
                <details>
                  <summary className="lbl cursor-pointer">Rejected, with reasons</summary>
                  <div className="mt-1.5 max-h-40 overflow-y-auto scroll flex flex-col gap-1">
                    {result.rejected.slice(0, 25).map((r, i) => (
                      <div key={i} className="num text-[10px] text-bone-mute">
                        <span className="text-bone-dim">{r.id.split('|').slice(0, 3).join(' ')}</span>
                        {' — '}{r.violations[0]}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <Note>{result.limitations.join(' ')}</Note>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
