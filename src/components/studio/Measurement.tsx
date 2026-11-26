'use client';
import { useBuild, useAnalysis } from '@/store/build';
import { Panel, Field, Note, Btn, GradeChip } from './ui';
import { isKnown } from '@/engine/types';

const STEPS = [
  {
    key: 'archRadiusMm' as const,
    label: '1 · Fender lip to hub centre, vertical',
    how: 'Car on the ground at ride height, wheel on. Measure straight up from the centre of the wheel to the lowest point of the fender lip. Read it at the top of the arch, not at the front or rear of the opening.',
    why: 'Decides whether the tyre can reach the lip at all. If this exceeds the tyre radius the assembly sits inside the arch opening and cannot touch it.',
  },
  {
    key: 'archLateralMm' as const,
    label: '2 · Hub mounting face to fender lip, lateral',
    how: 'Wheel off. Lay a straight edge against the hub mounting face, square to it, and measure outboard to the fender lip. A long steel rule and a square is enough; do not do this by eye.',
    why: 'Fixes where the lip sits across the car. Every poke, tuck and arch clearance figure is measured from this.',
  },
  {
    key: 'innerDepthMm' as const,
    label: '3 · Hub mounting face to nearest inner obstruction',
    how: 'Wheel off. From the same mounting face, measure inboard to the closest point of the strut body, spring, perch or arm, at roughly the height of the tyre shoulder.',
    why: 'Sets the inboard limit. More offset moves the assembly toward this, less offset away from it.',
  },
  {
    key: 'travelMm' as const,
    label: '4 · Hub travel remaining to the bump stop',
    how: 'Jack the body until the suspension is at full compression on the stop, or measure the gap to the stop and add the stop’s own crush. Record it as the vertical distance the hub still has to rise.',
    why: 'This is what the static-only calculators ignore. Most rubbing happens at the stop, not at rest.',
  },
];

export function Measurement() {
  const s = useBuild();
  const { vehicle, front, rear } = useAnalysis();
  const measured = s.axle === 'front' ? s.measuredFront : s.measuredRear;
  const a = s.axle === 'front' ? front : rear;
  const envelope = s.axle === 'front' ? vehicle.front : vehicle.rear;

  const presetFor = (key: typeof STEPS[number]['key']): number | null => {
    if (!envelope) return null;
    if (key === 'archRadiusMm') return isKnown(envelope.archRadiusMm) ? envelope.archRadiusMm.value : null;
    if (key === 'archLateralMm') return isKnown(envelope.archLateralMm) ? envelope.archLateralMm.value : null;
    if (key === 'innerDepthMm') {
      const ob = envelope.inner[0];
      return ob && isKnown(ob.lateralDepthMm) ? ob.lateralDepthMm.value : null;
    }
    return envelope.kinematics.bumpTravelMm;
  };

  const anyMeasured = Object.values(measured).some(v => v !== null);

  return (
    <Panel title={`Measurement — ${s.axle}`}
      right={anyMeasured
        ? <GradeChip g="community_reported" />
        : <GradeChip g={vehicle.assetState === 'catalog_entry_only' ? 'unknown' : 'estimated'} />}>
      <Note tone={anyMeasured ? 'mute' : 'warn'}>
        {anyMeasured
          ? 'Your measurements are in use and are traced as user-measured. They override the library estimate for this corner.'
          : 'Absolute clearances are currently estimates from the chassis preset. Four measurements make them facts. Everything else on this page — offset, backspacing, barrel split, tyre dimensions, deltas from the factory package — is already exact and needs none of this.'}
      </Note>

      <div className="flex flex-col gap-3 mt-2">
        {STEPS.map(step => {
          const preset = presetFor(step.key);
          return (
            <div key={step.key} className="border-t border-line pt-2.5 first:border-0 first:pt-0">
              <Field label={step.label}>
                <div className="flex gap-1.5">
                  <input type="number" placeholder={preset !== null ? `preset ${preset.toFixed(0)}` : 'mm — no preset'}
                    value={measured[step.key] ?? ''}
                    onChange={e => s.patchMeasured(s.axle, {
                      [step.key]: e.target.value === '' ? null : Number(e.target.value),
                    })} />
                  {preset !== null && (
                    <Btn small onClick={() => s.patchMeasured(s.axle, { [step.key]: Math.round(preset) })}>
                      LOAD
                    </Btn>
                  )}
                </div>
              </Field>
              <p className="text-[11px] leading-snug text-bone-dim">{step.how}</p>
              <p className="text-[10.5px] leading-snug text-bone-mute mt-1">
                <span style={{ color: '#c9a063' }}>Why: </span>{step.why}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-3">
        <Btn onClick={() => s.patchMeasured(s.axle, {
          archRadiusMm: null, archLateralMm: null, innerDepthMm: null, travelMm: null,
        })}>CLEAR ALL</Btn>
      </div>

      <Note>
        Photographs are not measurements. An uncalibrated image cannot give a dimension
        to the millimetre, and nothing here will infer one from a picture. Calibrated
        photogrammetry against a known reference is a valid method, and the schema accepts
        it — but it has to be done properly, with the reference in frame.
      </Note>

      {a.clearance && a.clearance.binding && (
        <div className="num text-[10.5px] text-bone-mute mt-1">
          Currently binding: {a.clearance.binding.label} at {a.clearance.binding.minDistanceMm} mm
          {' ±'}{a.clearance.binding.toleranceMm.toFixed(0)} mm tolerance
        </div>
      )}
    </Panel>
  );
}
