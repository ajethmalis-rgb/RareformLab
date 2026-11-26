'use client';
import { useBuild, useAnalysis } from '@/store/build';
import { groupedByMake } from '@/data/vehicles';
import {
  ARCHITECTURE_NOTE, PACKAGE_NOTE, PACKAGE_LABEL, CAMBER_GAIN_PER_10MM,
} from '@/engine/kinematics';
import { Panel, Field, Seg, Slider, Note, Row, GradeChip, Btn } from './ui';
import type { SuspensionPackage, ArchModification } from '@/engine/types';

const PKGS: SuspensionPackage[] = [
  'factory', 'lowering_springs', 'coilover_standard',
  'coilover_short_stroke', 'air_driving', 'air_parked',
];

export function VehiclePanel() {
  const s = useBuild();
  const { vehicle, front, rear } = useAnalysis();
  const axleA = s.axle === 'front' ? front : rear;
  const arch = s.axle === 'front' ? vehicle.frontArchitecture : vehicle.rearArchitecture;
  const groups = groupedByMake();

  const stateBadge = vehicle.assetState === 'verified_geometry'
    ? { t: 'VERIFIED GEOMETRY', c: '#4fa97e' }
    : vehicle.assetState === 'illustrative_only'
      ? { t: 'ILLUSTRATIVE ONLY', c: '#e07b39' }
      : { t: 'CATALOGUE ENTRY ONLY', c: '#7c858f' };

  return (
    <div className="flex flex-col gap-2.5">
      <Panel title="Vehicle"
        right={<span className="chip" style={{ color: stateBadge.c, border: `1px solid ${stateBadge.c}55`, background: `${stateBadge.c}18` }}>{stateBadge.t}</span>}>
        <Field label="Chassis">
          <select value={s.vehicleId} onChange={e => s.setVehicle(e.target.value)}>
            {groups.map(g => (
              <optgroup key={g.make} label={g.make}>
                {g.items.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.chassis} · {v.model} · {v.years}
                    {v.assetState === 'catalog_entry_only' ? ' — no geometry' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <div className="mt-1">
          <Row label="Bolt pattern" value={<>{vehicle.bolt.count}&times;{vehicle.bolt.pcdMm} <GradeChip g={vehicle.boltGrade === 'unknown' ? 'unknown' : vehicle.boltGrade} /></>} />
          <Row label="Centre bore" value={`${vehicle.centreBoreMm} mm`} />
          <Row label="Fastener" value={vehicle.fastener === 'bolt' ? `Bolt, ${vehicle.seat.replace('_', ' ')}` : `Stud + nut, ${vehicle.seat.replace('_', ' ')}`} />
          <Row label={`${s.axle} suspension`} value={arch.replace(/_/g, ' ')} />
          <Row label="Camber gain" value={`${CAMBER_GAIN_PER_10MM[arch].toFixed(2)}°/10 mm`} tone="mute" />
        </div>

        <Note tone={arch === 'swing_axle_low_pivot' ? 'warn' : 'mute'}>{ARCHITECTURE_NOTE[arch]}</Note>

        {vehicle.factoryPackages.length > 0 && (
          <div className="mt-2">
            <span className="lbl block mb-1">Factory packages</span>
            <div className="flex flex-col gap-1">
              {vehicle.factoryPackages.map((p, i) => (
                <button key={i} onClick={() => s.loadFactoryPackage(i)}
                  className="text-left font-mono text-[10.5px] px-2 py-1.5 rounded border border-line bg-graphite-900 text-bone-dim hover:border-champagne">
                  {p.label}{p.axle && p.axle !== 'both' ? ` · ${p.axle}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {vehicle.notes.map((n, i) => (
          <Note key={i} tone={/ILLUSTRATIVE|Catalogue entry only|cannot be asserted|SWING AXLE/i.test(n) ? 'warn' : 'mute'}>{n}</Note>
        ))}
      </Panel>

      <Panel title="Suspension">
        <Field label="Package">
          <select value={s.suspension.package}
            onChange={e => s.patchSuspension({ package: e.target.value as SuspensionPackage })}>
            {PKGS.map(p => <option key={p} value={p}>{PACKAGE_LABEL[p]}</option>)}
          </select>
        </Field>
        <Note tone={s.suspension.package === 'air_parked' ? 'warn' : 'mute'}>
          {PACKAGE_NOTE[s.suspension.package]}
        </Note>

        <div className="mt-2">
          <Slider label="Front ride height drop" value={s.suspension.dropFrontMm}
            min={0} max={120} step={5}
            onChange={v => s.patchSuspension({ dropFrontMm: v })}
            format={v => `${v} mm`} />
          <Slider label="Rear ride height drop" value={s.suspension.dropRearMm}
            min={0} max={120} step={5}
            onChange={v => s.patchSuspension({ dropRearMm: v })}
            format={v => `${v} mm`} />
          <Slider label="Compression from static" value={s.suspension.compressionMm}
            min={0} max={90} step={5}
            onChange={v => s.patchSuspension({ compressionMm: v })}
            format={v => `${v} mm`} />
          <Slider label="Steering angle" value={s.suspension.steeringDeg}
            min={-35} max={35} step={1}
            onChange={v => s.patchSuspension({ steeringDeg: v })}
            format={v => `${v}°`} />
          {!axleA.state.steeringSupported && s.suspension.steeringDeg !== 0 && (
            <Note tone="warn">
              No steering-axis geometry for this corner, so steered conditions are not
              analysed. Steering-dependent results read UNKNOWN rather than being guessed.
            </Note>
          )}
        </div>

        <div className="mt-2">
          <div className="flex items-baseline justify-between mb-1">
            <span className="lbl">{s.axle} camber</span>
            <span className="num text-[12px] font-semibold text-champagne">
              {axleA.state.camberDeg.toFixed(2)}°
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <input type="number" step={0.1}
              placeholder="measured"
              value={(s.axle === 'front' ? s.suspension.camberFrontDeg : s.suspension.camberRearDeg) ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                s.patchSuspension(s.axle === 'front' ? { camberFrontDeg: v } : { camberRearDeg: v });
              }} />
            <Btn small onClick={() => s.patchSuspension(
              s.axle === 'front' ? { camberFrontDeg: null } : { camberRearDeg: null })}>AUTO</Btn>
          </div>
          <Note>{axleA.state.notes[0]}</Note>
        </div>

        <div className="mt-2">
          <span className="lbl block mb-1">Arch worked</span>
          <Seg<ArchModification>
            value={s.suspension.archMod}
            onChange={v => s.patchSuspension({ archMod: v })}
            options={[
              { v: 'untouched', label: 'FACTORY' },
              { v: 'rolled', label: 'ROLLED' },
              { v: 'rolled_and_pulled', label: 'PULLED' },
            ]} />
          <Note>
            Credits lateral room at the lip only: 8 mm rolled, 14 mm pulled. It buys nothing
            vertically, and the BUILD TO FIT optimiser ignores it entirely when untouched
            factory metal is a constraint.
          </Note>
        </div>
      </Panel>
    </div>
  );
}
