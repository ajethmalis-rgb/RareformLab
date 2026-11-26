'use client';
import { useBuild, useAnalysis, type AxleAnalysis } from '@/store/build';
import { VERDICT_COLOR } from '@/engine/types';
import { VerdictChip, GradeChip, Tile, Btn } from './ui';

/** Plain-language corrections, derived from which component is binding. */
function corrections(a: AxleAnalysis): string[] {
  const c = a.clearance;
  if (!c) return ['No corner geometry for this vehicle, so there is nothing to correct against. Use the measurement workflow.'];
  const out: string[] = [];
  const worst = c.results
    .filter(r => r.minDistanceMm !== null && r.kind === 'clearance')
    .sort((x, y) => x.minDistanceMm! - y.minDistanceMm!)[0];
  if (!worst) return ['Nothing evaluable: every governing dimension for this corner is missing.'];

  if (worst.componentId === 'fender_lip') {
    out.push('Raise the disc pad depth to pull the assembly inboard — that raises offset and moves the lip away from the arch.');
    out.push('Narrow the outer lip, or drop a tyre size, to reduce the widest section.');
    out.push('Less ride-height drop leaves the lip further above the tyre shoulder.');
  } else if (worst.componentId.includes('strut') || worst.componentId.includes('trailing') || worst.componentId.includes('inner')) {
    out.push('Reduce the disc pad depth to lower offset and move the assembly away from the strut.');
    out.push('A narrower inner barrel reduces backspacing directly.');
    out.push('A spacer helps this specific problem, at the cost of arch clearance and a stacked interface.');
  } else if (worst.componentId === 'well_ceiling') {
    out.push('Lose overall tyre diameter: a lower aspect ratio at the same section.');
    out.push('Shorten the bump stop, or move to short-stroke hardware, to control where travel ends.');
  } else if (worst.componentId.startsWith('caliper')) {
    out.push('Increase wheel diameter, or choose a disc with more spoke-back relief.');
    out.push('This check needs a measured barrel profile to be more than a screening test.');
  }
  if (a.tire.sidewall.klass === 'aggressive' || a.tire.sidewall.klass === 'beyond_spec')
    out.push('Choose a tyre section the rim width is approved for; the current one is outside spec.');
  return out;
}

function AxleColumn({ a, label }: { a: AxleAnalysis; label: string }) {
  const c = a.clearance;
  const w = a.wheel;
  const binding = c?.results
    .filter(r => r.minDistanceMm !== null && r.kind === 'clearance')
    .sort((x, y) => x.minDistanceMm! - y.minDistanceMm!)[0];

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="lbl" style={{ color: '#c9a063' }}>{label}</span>
        {c && <VerdictChip v={c.overall} small />}
        {binding && <GradeChip g={binding.governingGrade} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line">
        <Tile label="Assembled" value={w ? `${a.assembly.achievedWidthIn.toFixed(1)}J×${a.config.diameterIn}` : '—'}
          note={a.assembly.naiveWidthIn > 0
            ? `advertised sum ${a.assembly.naiveWidthIn.toFixed(1)}"`
            : undefined} />
        <Tile label="Offset" value={w ? `ET${a.assembly.achievedEtMm.toFixed(0)}` : '—'}
          note={a.assembly.etErrorMm !== null
            ? `${a.assembly.etErrorMm > 0 ? '+' : ''}${a.assembly.etErrorMm} vs target`
            : undefined} />
        <Tile label="Backspace" value={w ? `${w.backspacingIn.toFixed(2)}"` : '—'}
          note={w ? `${w.backspacingMm.toFixed(1)} mm` : undefined} />
        <Tile label="Tyre" value={`${a.config.tire.sectionMm}/${a.config.tire.aspect}`}
          note={`${a.tire.diameterMm.toFixed(0)} mm OD`} />
        <Tile label="Min clearance"
          value={binding?.minDistanceMm !== undefined && binding?.minDistanceMm !== null
            ? `${binding.minDistanceMm} mm` : '—'}
          note={binding?.label}
          tone={binding?.verdict} />
        <Tile label="Binding at" value={binding ? binding.conditionLabel : '—'}
          note={c ? `${c.conditionsEvaluated.length} evaluated, ${c.conditionsSkipped.length} skipped` : undefined} />
      </div>
      {c && (
        <div className="mt-1.5 text-[10.5px] leading-snug text-bone-mute">
          {Number.isFinite(c.pokeMm) && (
            <span>
              {c.pokeMm >= 0
                ? `${c.pokeMm.toFixed(0)} mm proud of the bodywork`
                : `${(-c.pokeMm).toFixed(0)} mm tucked inside the arch`}
              {c.archGapMm !== null && ` · ${c.archGapMm.toFixed(0)} mm arch gap`}
              {' · '}
            </span>
          )}
          <span>camber {a.state.camberDeg.toFixed(2)}° · {a.state.remainingTravelMm.toFixed(0)} mm travel left</span>
        </div>
      )}
    </div>
  );
}

export function ResultsBar({ onOptimize }: { onOptimize: () => void }) {
  const { vehicle, front, rear } = useAnalysis();
  const s = useBuild();
  const a = s.axle === 'front' ? front : rear;
  const fixes = corrections(a);

  return (
    <div className="border-t border-line bg-graphite-800">
      <div className="px-3 py-2.5 grid grid-cols-1 min-[1800px]:grid-cols-2 gap-4">
        <AxleColumn a={front} label="Front axle" />
        <AxleColumn a={rear} label="Rear axle" />
      </div>
      <div className="px-3 pb-2.5 flex flex-wrap items-start gap-3 justify-between border-t border-line pt-2">
        <div className="min-w-0 flex-1">
          <span className="lbl">Suggested corrections · {s.axle}</span>
          <ul className="mt-1 text-[11px] leading-snug text-bone-dim list-none">
            {fixes.slice(0, 3).map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span style={{ color: '#c9a063' }}>→</span><span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Btn prime onClick={onOptimize}>OPTIMIZE FITMENT</Btn>
        </div>
      </div>
      {a.clearance && a.clearance.limitations.length > 0 && (
        <div className="px-3 pb-2.5 text-[10px] leading-snug" style={{ color: VERDICT_COLOR.indeterminate }}>
          {a.clearance.limitations.join(' ')}
          {vehicle.assetState !== 'verified_geometry' &&
            ' No verdict here is a safety statement. Physical test fitting is required before road use.'}
        </div>
      )}
    </div>
  );
}
