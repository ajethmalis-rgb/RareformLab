'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSubmissions, variantKey } from '@/store/submissions';
import { VEHICLES, byId } from '@/data/vehicles';
import {
  CORE_KEYS, MEASUREMENT_LABEL, PLAUSIBLE_RANGE, unitFor,
  validateSubmission, Submission,
  type MeasurementKey, type ValidationIssue,
} from '@/engine/submission';
import { nextNeed } from '@/engine/aggregate';
import { PACKAGE_LABEL } from '@/engine/kinematics';
import type { SuspensionPackage, MeasurementMethod } from '@/engine/types';
import { Panel, Field, Note, Btn, GradeChip, Row } from '@/components/studio/ui';

/** Each measurement, with how to take it and why it decides something. */
const GUIDE: Record<string, { how: string; why: string }> = {
  archRadiusMm: {
    how: 'Car on the ground at ride height, wheel on. Measure straight up from the centre of the wheel to the lowest point of the fender lip. Take it at the top of the arch, not at the front or rear of the opening.',
    why: 'Decides whether the tyre can reach the lip at all. Above the tyre radius and the assembly sits inside the opening, where it cannot touch the lip however far out it sits.',
  },
  archLateralMm: {
    how: 'Wheel off. Lay a straight edge against the hub mounting face, square to it, and measure outboard to the fender lip. Use a rule and a square; this one cannot be eyeballed.',
    why: 'Fixes where the lip sits across the car. Every poke, tuck and arch clearance figure is measured from it.',
  },
  innerDepthMm: {
    how: 'Wheel off, from the same mounting face, measure inboard to the closest point of the strut body, spring, perch or arm, at roughly tyre-shoulder height.',
    why: 'Sets the inboard limit. More offset moves the assembly toward it, less offset away.',
  },
  travelMm: {
    how: 'Jack the body until the suspension is at full compression on the stop, or measure the gap to the stop and add the stop’s own crush. Record the vertical distance the hub still has to rise.',
    why: 'This is what static-only calculators ignore. Most rubbing happens at the stop, not at rest.',
  },
  camberDeg: {
    how: 'A digital gauge on the wheel face at ride height, or a plumb line and rule against the rim flange. Negative when the top leans in.',
    why: 'Decides where the tyre shoulder actually sits against the arch. Without it the model falls back to a rule of thumb for the suspension type, and no arch result can be better than estimated.',
  },
  wellCeilingMm: {
    how: 'From the hub centre straight up to the highest point of the inner wheel housing. Optional, but it is the real vertical ceiling.',
    why: 'The tyre tucks up into the well above the lip, so this is the vertical limit rather than the arch.',
  },
};
const ASK_KEYS: MeasurementKey[] = [...CORE_KEYS, 'camberDeg', 'wellCeilingMm'];

const METHODS: MeasurementMethod[] = [
  'tape_measure', 'caliper', 'calibrated_jig', 'laser_scan', 'cmm', 'photogrammetry',
];
const METHOD_LABEL: Record<string, string> = {
  tape_measure: 'Tape measure or steel rule',
  caliper: 'Caliper',
  calibrated_jig: 'Calibrated jig',
  laser_scan: 'Laser scan',
  cmm: 'CMM',
  photogrammetry: 'Photogrammetry, with a calibration reference in frame',
};

export default function ContributePage() {
  const store = useSubmissions();
  useEffect(() => { store.hydrate(); store.seedExample(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [vehicleId, setVehicleId] = useState('e30');
  const [axle, setAxle] = useState<'front' | 'rear'>('front');
  const [pkg, setPkg] = useState<SuspensionPackage>('factory');
  const [drop, setDrop] = useState(0);
  const [bodyOriginal, setBodyOriginal] = useState(true);
  const [brake, setBrake] = useState('factory');
  const [method, setMethod] = useState<MeasurementMethod>('tape_measure');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [wheel, setWheel] = useState({ widthIn: '', diameterIn: '', etMm: '', tireSectionMm: '', tireAspect: '' });
  const [values, setValues] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [done, setDone] = useState<string | null>(null);

  const vehicle = byId(vehicleId) ?? VEHICLES[0]!;
  const vk = variantKey({ vehicleId, axle, suspensionPackage: pkg, brakePackage: brake });
  const consensus = store.consensus(vk);

  const draft: Submission | null = useMemo(() => {
    const vals: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n)) vals[k] = n;
    }
    if (Object.keys(vals).length === 0) return null;
    const w = Object.values(wheel).every(x => x !== '' && Number.isFinite(Number(x)))
      ? {
          widthIn: Number(wheel.widthIn), diameterIn: Number(wheel.diameterIn),
          etMm: Number(wheel.etMm), tireSectionMm: Number(wheel.tireSectionMm),
          tireAspect: Number(wheel.tireAspect),
        }
      : undefined;
    const res = Submission.safeParse({
      id: 'sub-' + Date.now().toString(36),
      variantKey: vk, vehicleId, axle,
      submitterId: store.currentSubmitterId, submitterName: name,
      submitterVerified: false, submittedAt: new Date().toISOString(),
      suspensionPackage: pkg, rideHeightDropMm: drop,
      bodyOriginal, brakePackage: brake, wheelOnCar: w,
      method, values: vals, notes,
      status: 'pending', reviewNote: '', reviewedBy: '',
    });
    return res.success ? res.data : null;
  }, [values, wheel, vk, vehicleId, axle, name, pkg, drop, bodyOriginal, brake, method, notes, store.currentSubmitterId]);

  const issues: ValidationIssue[] = draft ? validateSubmission(draft) : [];
  const blocking = issues.filter(i => i.severity === 'reject');
  const flags = issues.filter(i => i.severity === 'flag');

  function submit() {
    if (!draft) return;
    const r = store.add(draft);
    if (r.ok) { setDone(draft.id); setValues({}); }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex items-center justify-between gap-4 flex-wrap mb-7">
          <div>
            <h1 className="font-mono text-[13px] font-bold tracking-[0.17em]">CONTRIBUTE A MEASUREMENT</h1>
            <p className="text-[12.5px] text-bone-dim mt-1 max-w-xl leading-relaxed">
              Four dimensions turn a chassis from an estimate into something the engine will
              return a real verdict on. Three independent people measuring the same variant
              is what promotes it for everybody.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/studio" className="font-mono text-[11px] px-3 py-1.5 rounded border border-line text-bone-dim">STUDIO</Link>
            <Link href="/review" className="font-mono text-[11px] px-3 py-1.5 rounded border border-line text-bone-dim">REVIEW QUEUE</Link>
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="flex flex-col gap-3">
            <Panel title="Which car, exactly">
              <Note tone="warn">
                Measurements only combine within an exact variant. A car on sports suspension
                is not the same variant as one on standard springs, and an M3 arch is not an
                E30 arch. If in doubt, say so in the notes rather than guessing.
              </Note>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                <Field label="Chassis">
                  <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                    {['BMW', 'Mercedes-Benz', 'Porsche'].map(mk => (
                      <optgroup key={mk} label={mk}>
                        {VEHICLES.filter(v => v.make === mk).map(v => (
                          <option key={v.id} value={v.id}>{v.chassis} · {v.model} · {v.years}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Axle">
                  <select value={axle} onChange={e => setAxle(e.target.value as 'front' | 'rear')}>
                    <option value="front">Front</option><option value="rear">Rear</option>
                  </select>
                </Field>
                <Field label="Suspension on the car">
                  <select value={pkg} onChange={e => setPkg(e.target.value as SuspensionPackage)}>
                    {(['factory','lowering_springs','coilover_standard','coilover_short_stroke','air_driving'] as SuspensionPackage[])
                      .map(p => <option key={p} value={p}>{PACKAGE_LABEL[p]}</option>)}
                  </select>
                </Field>
                <Field label="Drop from stock, mm">
                  <input type="number" value={drop} onChange={e => setDrop(Number(e.target.value) || 0)} />
                </Field>
                <Field label="Brake package">
                  <input type="text" value={brake} onChange={e => setBrake(e.target.value)} placeholder="factory" />
                </Field>
                <Field label="Your name or handle">
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="optional" />
                </Field>
              </div>
              <label className="flex items-start gap-2 text-[12px] text-bone-dim mt-1 cursor-pointer">
                <input type="checkbox" checked={bodyOriginal} style={{ width: 'auto', marginTop: 3 }}
                  onChange={e => setBodyOriginal(e.target.checked)} />
                <span>Bodywork is original: arches never rolled, pulled, flared or repaired.</span>
              </label>
              {!bodyOriginal && (
                <Note tone="warn">
                  Kept on record and shown, but held out of the consensus. A worked arch
                  describes that car rather than the model, and averaging it in would move
                  the agreed figure for everyone else.
                </Note>
              )}
            </Panel>

            <Panel title="Wheel currently on the car" right={<span className="lbl">enables the sanity check</span>}>
              <Note>
                Optional, and worth the thirty seconds. Knowing the fitted wheel lets the form
                catch the commonest error immediately: an arch radius smaller than the tyre
                radius means the measurement was taken to the top of the tyre rather than to
                the hub centre.
              </Note>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                {([['widthIn','Width J'],['diameterIn','Dia in'],['etMm','ET mm'],['tireSectionMm','Section'],['tireAspect','Aspect']] as const)
                  .map(([k, label]) => (
                    <Field key={k} label={label}>
                      <input type="number" value={wheel[k]}
                        onChange={e => setWheel({ ...wheel, [k]: e.target.value })} />
                    </Field>
                  ))}
              </div>
            </Panel>

            <Panel title="Measurements" right={
              <select value={method} onChange={e => setMethod(e.target.value as MeasurementMethod)} className="!w-auto">
                {METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            }>
              <Note>
                How you measured sets the tolerance that can ever be claimed from this. Agreement
                between tape measurements never adds up to caliper precision, and the engine
                will not pretend otherwise.
              </Note>
              <div className="flex flex-col gap-3 mt-3">
                {ASK_KEYS.map(k => {
                  const g = GUIDE[k];
                  const range = PLAUSIBLE_RANGE[k];
                  const issue = issues.find(i => i.key === k);
                  const core = CORE_KEYS.includes(k);
                  return (
                    <div key={k} className="border-t border-line pt-3 first:border-0 first:pt-0">
                      <Field label={`${MEASUREMENT_LABEL[k]}${core ? '' : ' — optional'}`}>
                        <div className="flex items-center gap-2">
                          <input type="number" step="0.1" value={values[k] ?? ''}
                            placeholder={`${range[0]} to ${range[1]} ${unitFor(k)}`}
                            onChange={e => setValues({ ...values, [k]: e.target.value })} />
                          <span className="font-mono text-[11px] text-bone-mute w-6">{unitFor(k)}</span>
                        </div>
                      </Field>
                      {g && <>
                        <p className="text-[11.5px] leading-snug text-bone-dim">{g.how}</p>
                        <p className="text-[10.5px] leading-snug text-bone-mute mt-1">
                          <span style={{ color: '#c9a063' }}>Why: </span>{g.why}
                        </p>
                      </>}
                      {issue && (
                        <Note tone={issue.severity === 'reject' ? 'bad' : 'warn'}>{issue.message}</Note>
                      )}
                    </div>
                  );
                })}
              </div>
              <Field label="Notes">
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="anything a reviewer should know" />
              </Field>

              {flags.filter(f => f.key === 'submission').map((f, i) => (
                <Note key={i} tone="warn">{f.message}</Note>
              ))}
              {blocking.length > 0 && (
                <Note tone="bad">
                  {blocking.length} problem{blocking.length === 1 ? '' : 's'} must be fixed before this can be submitted.
                </Note>
              )}

              <div className="flex items-center gap-2 mt-3">
                <Btn prime onClick={submit}>SUBMIT FOR REVIEW</Btn>
                {done && <span className="font-mono text-[11px]" style={{ color: '#4fa97e' }}>
                  Submitted. It sits in the review queue until a person accepts it.
                </span>}
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-3">
            <Panel title="This variant so far" right={<GradeChip g={consensus.weakestCoreGrade} />}>
              <Note>{nextNeed(consensus)}</Note>
              <div className="mt-2">
                {CORE_KEYS.map(k => {
                  const c = consensus.byKey[k];
                  return (
                    <Row key={k} label={MEASUREMENT_LABEL[k].split(',')[0]!}
                      value={c && Number.isFinite(c.value)
                        ? `${c.value} ${unitFor(k)} · ${c.agreeingSubmitters}/${3}`
                        : 'none yet'}
                      tone={c && Number.isFinite(c.value) ? undefined : 'mute'} />
                  );
                })}
              </div>
              {consensus.excluded.length > 0 && (
                <Note tone="warn">
                  {consensus.excluded.length} submission{consensus.excluded.length === 1 ? '' : 's'} held
                  out of the consensus: {consensus.excluded[0]!.reason}
                </Note>
              )}
              <div className="mt-2 text-[10.5px] text-bone-mute leading-snug">
                {vehicle.chassis} · {vehicle.model} · {axle} · {PACKAGE_LABEL[pkg]}
              </div>
            </Panel>

            <Panel title="Why three people">
              <p className="text-[12px] leading-relaxed text-bone-dim">
                One measurement is a data point. It could be a mis-read tape, a car with a
                quietly repaired arch, or a variant nobody realised was different.
              </p>
              <p className="text-[12px] leading-relaxed text-bone-dim mt-2">
                Three independent people arriving within a few millimetres of each other is
                evidence, and the engine treats it as such: that variant starts returning real
                clearance verdicts instead of UNKNOWN. Outliers are excluded rather than
                averaged in, and if the submissions split into two camps the engine reports a
                disagreement instead of inventing a midpoint nobody measured.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}
