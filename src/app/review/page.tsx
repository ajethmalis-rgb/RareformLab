'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSubmissions } from '@/store/submissions';
import { byId } from '@/data/vehicles';
import {
  MEASUREMENT_LABEL, CORE_KEYS, unitFor, validateSubmission,
  type Submission, type MeasurementKey,
} from '@/engine/submission';
import { consensusFor, nextNeed, MIN_CORROBORATION, type Consensus } from '@/engine/aggregate';
import { PACKAGE_LABEL } from '@/engine/kinematics';
import { Panel, Note, Btn, GradeChip, Row } from '@/components/studio/ui';

/**
 * A one-dimensional plot of every submitted value for a measurement, with
 * outliers marked and the agreement band drawn in. A reviewer deciding
 * whether two numbers are the same measurement needs to SEE the spread;
 * a column of figures hides exactly the thing being judged.
 */
function Spread({ c }: { c: Consensus }) {
  if (c.points.length === 0) return null;
  const vals = c.points.map(p => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.18, c.agreementBandMm, 1);
  const min = lo - pad, max = hi + pad;
  const W = 520, H = 58;
  const x = (v: number) => 14 + ((v - min) / (max - min || 1)) * (W - 28);
  // Raw submitted values carry float noise once they have been through any
  // arithmetic (-0.35 arrives as -0.3500000000000004). Round for display at
  // a precision the unit actually supports.
  const dp = unitFor(c.key) === '\u00b0' ? 2 : 1;
  const show = (v: number) => {
    const r = Number(v.toFixed(dp));
    return Number.isInteger(r) ? String(r) : r.toFixed(dp);
  };
  const band = Number.isFinite(c.value)
    ? [x(c.value - c.agreementBandMm), x(c.value + c.agreementBandMm)]
    : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={`Spread of ${c.points.length} submitted values for ${c.label}`}>
      {band && (
        <rect x={band[0]} y={14} width={Math.max(band[1]! - band[0]!, 2)} height={22}
          fill={c.conflict ? '#ce403822' : '#4fa97e22'}
          stroke={c.conflict ? '#ce403866' : '#4fa97e66'} strokeWidth="1" rx="3" />
      )}
      <line x1="14" y1="25" x2={W - 14} y2="25" stroke="#424b55" strokeWidth="1" />
      {Number.isFinite(c.value) && !c.conflict && (
        <line x1={x(c.value)} y1="10" x2={x(c.value)} y2="40" stroke="#c9a063" strokeWidth="1.6" />
      )}
      {c.points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.value)} cy={25} r={p.outlier ? 4 : 5}
            fill={p.outlier ? 'none' : '#c9a063'}
            stroke={p.outlier ? '#ce4038' : '#c9a063'} strokeWidth={p.outlier ? 1.8 : 0} />
          <text x={x(p.value)} y={51} textAnchor="middle"
            fontFamily="var(--font-mono, monospace)" fontSize="9"
            fill={p.outlier ? '#ce4038' : '#848d96'}>{show(p.value)}</text>
        </g>
      ))}
      <text x="14" y="10" fontFamily="var(--font-mono, monospace)" fontSize="8.5" fill="#69727b">
        {Number.isFinite(c.value) && !c.conflict
          ? `band ±${c.agreementBandMm} ${unitFor(c.key)}`
          : 'no agreed value'}
      </text>
    </svg>
  );
}

export default function ReviewPage() {
  const store = useSubmissions();
  useEffect(() => { store.hydrate(); store.seedExample(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'queue' | 'variants'>('queue');

  const pending = store.submissions.filter(s => s.status === 'pending');
  const variants = useMemo(() => {
    const keys = [...new Set(store.submissions.map(s => s.variantKey))];
    return keys.map(k => ({ key: k, consensus: store.consensus(k) }));
  }, [store.submissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (s: Submission) => {
    const v = byId(s.vehicleId);
    return `${v?.chassis ?? s.vehicleId} ${v?.model ?? ''} · ${s.axle} · ${PACKAGE_LABEL[s.suspensionPackage]}`
      + (s.rideHeightDropMm ? ` · ${s.rideHeightDropMm} mm drop` : '');
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="font-mono text-[13px] font-bold tracking-[0.17em]">REVIEW QUEUE</h1>
            <p className="text-[12.5px] text-bone-dim mt-1 max-w-xl leading-relaxed">
              Nothing is promoted automatically. Arithmetic rejects the impossible; a person
              decides whether what is left really describes the variant.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/contribute" className="font-mono text-[11px] px-3 py-1.5 rounded border border-line text-bone-dim">CONTRIBUTE</Link>
            <Link href="/studio" className="font-mono text-[11px] px-3 py-1.5 rounded border border-line text-bone-dim">STUDIO</Link>
          </div>
        </header>

        <div className="flex gap-0.5 bg-graphite-900 border border-line rounded-md p-0.5 mb-4 w-fit">
          {([['queue', `PENDING (${pending.length})`], ['variants', `VARIANTS (${variants.length})`]] as const)
            .map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} aria-pressed={tab === v}
                className="font-mono text-[10.5px] font-semibold py-1.5 px-4 rounded"
                style={tab === v ? { background: '#c9a063', color: '#101316' } : { color: '#848d96' }}>
                {label}
              </button>
            ))}
        </div>

        {tab === 'queue' && (
          <div className="flex flex-col gap-3">
            {pending.some(s => s.id.startsWith('example-')) && (
              <Note tone="warn">
                The queue is seeded with three EXAMPLE records so this page has something to
                show. Their numbers are illustrative, not measured from a car. Accepting all
                three will promote the E30 front variant to corroborated and change what the
                studio reports for it — which is the loop working, but do it knowing the
                figures are invented. Reject them to clear the queue instead.
              </Note>
            )}
            {pending.length === 0 && (
              <Panel title="Nothing pending">
                <Note>The queue is empty. New submissions land here before they can affect any consensus.</Note>
              </Panel>
            )}
            {pending.map(s => {
              const issues = validateSubmission(s);
              const flags = issues.filter(i => i.severity === 'flag');
              return (
                <Panel key={s.id} title={describe(s)}
                  right={<span className="lbl">{s.submitterName || s.submitterId}</span>}>
                  <div className="grid sm:grid-cols-2 gap-x-5">
                    {(Object.keys(s.values) as MeasurementKey[]).map(k => (
                      <Row key={k} label={MEASUREMENT_LABEL[k].split(',')[0]!}
                        value={`${s.values[k]} ${unitFor(k)}`} />
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-bone-mute leading-snug">
                    Method: {s.method.replace(/_/g, ' ')}
                    {s.wheelOnCar && ` · fitted ${s.wheelOnCar.widthIn}J×${s.wheelOnCar.diameterIn} ET${s.wheelOnCar.etMm}, ${s.wheelOnCar.tireSectionMm}/${s.wheelOnCar.tireAspect}`}
                    {!s.bodyOriginal && ' · BODYWORK MODIFIED'}
                    {s.notes && ` · “${s.notes}”`}
                    {s.id.startsWith('example-') && ' · EXAMPLE RECORD'}
                  </div>
                  {flags.map((f, i) => <Note key={i} tone="warn">{f.message}</Note>)}

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <input type="text" placeholder="reviewer note" value={notes[s.id] ?? ''}
                      onChange={e => setNotes({ ...notes, [s.id]: e.target.value })}
                      style={{ flex: 1, minWidth: 180 }} />
                    <Btn prime onClick={() => store.setStatus(s.id, 'accepted', notes[s.id] ?? '', 'reviewer')}>ACCEPT</Btn>
                    <Btn onClick={() => store.setStatus(s.id, 'rejected', notes[s.id] ?? '', 'reviewer')}>REJECT</Btn>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}

        {tab === 'variants' && (
          <div className="flex flex-col gap-3">
            {variants.length === 0 && (
              <Panel title="No variants yet"><Note>Nothing has been submitted.</Note></Panel>
            )}
            {variants.map(({ key, consensus }) => {
              const [vid, axle, pkg] = key.split('|');
              const v = byId(vid!);
              return (
                <Panel key={key}
                  title={`${v?.chassis ?? vid} ${v?.model ?? ''} · ${axle} · ${PACKAGE_LABEL[pkg as keyof typeof PACKAGE_LABEL] ?? pkg}`}
                  right={<GradeChip g={consensus.weakestCoreGrade} />}>
                  <Note tone={consensus.analysable ? 'mute' : 'warn'}>{nextNeed(consensus)}</Note>

                  <div className="flex flex-col gap-4 mt-3">
                    {CORE_KEYS.concat('camberDeg' as MeasurementKey).map(k => {
                      const c = consensus.byKey[k];
                      if (!c || c.points.length === 0) return null;
                      return (
                        <div key={k} className="border-t border-line pt-3 first:border-0 first:pt-0">
                          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                            <span className="text-[12px] text-bone">{c.label}</span>
                            <span className="num text-[12px]" style={{ color: c.conflict ? '#ce4038' : '#c9a063' }}>
                              {Number.isFinite(c.value) && !c.conflict
                                ? `${Number(c.value.toFixed(2))} ±${Number(c.toleranceMm.toFixed(2))} ${unitFor(k)}`
                                : 'unresolved'}
                              <span className="ml-2"><GradeChip g={c.grade} /></span>
                            </span>
                          </div>
                          <Spread c={c} />
                          <p className="text-[11px] leading-snug text-bone-mute mt-1">{c.note}</p>
                          <p className="text-[10px] text-bone-mute mt-1">
                            {c.agreeingSubmitters} of {c.distinctSubmitters} submitters agree
                            {c.agreeingSubmitters < MIN_CORROBORATION && !c.conflict
                              && ` · ${c.needsMore} more promotes it`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {consensus.excluded.length > 0 && (
                    <Note tone="warn">
                      Held out of the consensus: {consensus.excluded.length} submission
                      {consensus.excluded.length === 1 ? '' : 's'}. {consensus.excluded[0]!.reason}
                    </Note>
                  )}
                </Panel>
              );
            })}
          </div>
        )}

        <footer className="mt-8 pt-4 border-t border-line text-[11px] leading-relaxed text-bone-mute">
          Example records are seeded on a first visit so this page has something to show; they
          are marked as such. Submissions live in this browser only — the schema is already
          server-shaped, so moving it behind an API is a transport change, not a rewrite.
          A corroborated consensus is evidence about a <b className="text-bone-dim">variant</b>,
          never a guarantee about any particular car, and physical test fitting is still
          required before road use.
        </footer>
      </div>
    </main>
  );
}
