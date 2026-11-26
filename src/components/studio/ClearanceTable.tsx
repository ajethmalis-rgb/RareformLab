'use client';
import { useBuild, useAnalysis } from '@/store/build';
import { Panel, VerdictChip, GradeChip, Note } from './ui';

/**
 * Every evaluated condition against every component. The point of showing
 * the full matrix is that a build which passes static and fails at the
 * bump stop is the normal failure mode, and a single headline verdict
 * hides it.
 */
export function ClearanceTable() {
  const s = useBuild();
  const { front, rear } = useAnalysis();
  const a = s.axle === 'front' ? front : rear;
  const c = a.clearance;

  if (!c) return (
    <Panel title="Clearance matrix">
      <Note tone="warn">
        This vehicle has no dimensioned corner geometry, so there is nothing to analyse.
        Everything above the bottom bar is still exact — offset, backspacing, barrel
        split, tyre dimensions and the deltas against the factory package all come from
        the wheel and tyre alone.
      </Note>
    </Panel>
  );

  const components = [...new Set(c.results.map(r => r.componentId))];
  const conditions = [...new Set(c.results.map(r => r.conditionId))];

  return (
    <Panel title="Clearance matrix" right={<VerdictChip v={c.overall} />}>
      <div className="overflow-x-auto scroll">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              <th className="lbl text-left py-1.5 pr-3 whitespace-nowrap">Component</th>
              {conditions.map(cond => (
                <th key={cond} className="lbl text-right py-1.5 px-2 whitespace-nowrap">
                  {c.results.find(r => r.conditionId === cond)?.conditionLabel ?? cond}
                </th>
              ))}
              <th className="lbl text-right py-1.5 pl-2 whitespace-nowrap">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {components.map(cid => {
              const row = c.results.filter(r => r.componentId === cid);
              const first = row[0]!;
              return (
                <tr key={cid} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-bone-dim whitespace-nowrap">{first.label}</td>
                  {conditions.map(cond => {
                    const r = row.find(x => x.conditionId === cond);
                    if (!r) return <td key={cond} className="text-right px-2 text-bone-mute">·</td>;
                    return (
                      <td key={cond} className="text-right px-2 whitespace-nowrap">
                        <span style={{ color: r.verdict === 'indeterminate' ? '#7c858f' : undefined }}>
                          {r.minDistanceMm === null ? 'n/a' : `${r.minDistanceMm}`}
                        </span>
                        <span className="ml-1.5"><VerdictChip v={r.verdict} small /></span>
                      </td>
                    );
                  })}
                  <td className="text-right pl-2"><GradeChip g={first.governingGrade} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {c.results
          .filter(r => r.conditionId === 'static' || r.verdict === 'interference')
          .slice(0, 5)
          .map((r, i) => (
            <div key={i} className="text-[10.5px] leading-snug text-bone-mute">
              <span className="text-bone-dim font-semibold">{r.label}:</span> {r.note}
            </div>
          ))}
      </div>
      {c.conditionsSkipped.length > 0 && (
        <Note tone="warn">
          Not evaluated: {c.conditionsSkipped.map(x => `${x.id} (${x.reason})`).join(', ')}.
          These read UNKNOWN rather than being estimated.
        </Note>
      )}
    </Panel>
  );
}
