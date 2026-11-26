'use client';
import { useBuild, useAnalysis } from '@/store/build';
import { ORIGINAL_FACES, REFERENCE_FACES, faceById, classifyConversion, CONVERSION_LABEL, CONVERSION_NOTE } from '@/data/faces';
import { lipsFor, barrelsFor, shellsFor, FINISHES, SPACERS_MM, DIAMETERS, PAD_DEPTHS } from '@/data/components';
import { findTireSizes, SECTIONS, ASPECTS } from '@/engine/tire';
import { Panel, Field, Row, Note, Seg, Btn } from './ui';
import type { ConstructionType, MountStyle } from '@/engine/types';
import type { FinishId } from '@/data/components';

export function WheelPanel() {
  const s = useBuild();
  const { vehicle, front, rear } = useAnalysis();
  const axle = s.axle;
  const a = axle === 'front' ? front : rear;
  const cfg = a.config;
  const face = faceById(cfg.faceId);
  const conv = face ? classifyConversion(face) : 'insufficient_data';

  const set = (p: Parameters<typeof s.patchAxle>[1]) => s.patchAxle(axle, p);

  const candidates = a.baselineTire
    ? findTireSizes({
        diameterIn: cfg.diameterIn,
        rimWidthIn: a.assembly.achievedWidthIn || 8,
        baseline: a.baselineTire,
        tolerancePct: 4, limit: 8,
      })
    : [];

  return (
    <div className="flex flex-col gap-2.5">
      <Panel title={`${axle} wheel`}
        right={<Btn small onClick={() => s.patchBothAxles(cfg)}>COPY TO BOTH</Btn>}>
        <Field label="Face">
          <select value={cfg.faceId} onChange={e => set({ faceId: e.target.value })}>
            <optgroup label="Configurable — original designs">
              {ORIGINAL_FACES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </optgroup>
            <optgroup label="Reference only — not configurable">
              {REFERENCE_FACES.map(f => (
                <option key={f.id} value={f.id}>
                  {f.referencedMaker} {f.name} — reference
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        {face && (
          <>
            <Note tone={face.configurable ? 'mute' : 'warn'}>{face.rights}</Note>
            {face.note && <Note>{face.note}</Note>}
            <Row label="Conversion class" value={CONVERSION_LABEL[conv]} tone="mute" />
            <Note>{CONVERSION_NOTE[conv]}</Note>
          </>
        )}

        <div className="mt-2">
          <span className="lbl block mb-1">Construction</span>
          <Seg<ConstructionType> value={cfg.construction}
            onChange={v => set({ construction: v })}
            options={[
              { v: 'three_piece', label: '3-PIECE' },
              { v: 'two_piece', label: '2-PIECE' },
              { v: 'monoblock', label: 'MONO' },
            ]} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <Field label="Diameter">
            <select value={cfg.diameterIn} onChange={e => {
              const d = Number(e.target.value);
              set({
                diameterIn: d,
                outerLipId: `GEN-OL-${d}-3.0`,
                innerBarrelId: `GEN-IB-${d}-5.0`,
                completeShellId: `GEN-CS-${d}-8.0`,
                tire: { ...cfg.tire, diameterIn: d },
              });
            }}>
              {DIAMETERS.map(d => <option key={d} value={d}>{d}&quot;</option>)}
            </select>
          </Field>
          <Field label="Spacer">
            <select value={cfg.spacerMm} onChange={e => set({ spacerMm: Number(e.target.value) })}>
              {SPACERS_MM.map(v => <option key={v} value={v}>{v} mm</option>)}
            </select>
          </Field>
        </div>

        {cfg.construction === 'two_piece' ? (
          <Field label="Complete rim shell">
            <select value={cfg.completeShellId} onChange={e => set({ completeShellId: e.target.value })}>
              {shellsFor(cfg.diameterIn).map(c =>
                <option key={c.id} value={c.id}>{c.widthIn.toFixed(1)}&quot; shell · {c.id}</option>)}
            </select>
          </Field>
        ) : cfg.construction === 'three_piece' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Outer lip">
              <select value={cfg.outerLipId} onChange={e => set({ outerLipId: e.target.value })}>
                {lipsFor(cfg.diameterIn).map(c =>
                  <option key={c.id} value={c.id}>{c.widthIn.toFixed(1)}&quot;</option>)}
              </select>
            </Field>
            <Field label="Inner barrel">
              <select value={cfg.innerBarrelId} onChange={e => set({ innerBarrelId: e.target.value })}>
                {barrelsFor(cfg.diameterIn).map(c =>
                  <option key={c.id} value={c.id}>{c.widthIn.toFixed(1)}&quot;</option>)}
              </select>
            </Field>
          </div>
        ) : (
          <Note tone="warn">
            A monoblock has no separable barrel: width and offset are fixed by the casting,
            so there is nothing to configure here.
          </Note>
        )}

        <div className="grid grid-cols-2 gap-2 mt-1">
          <Field label="Disc pad depth">
            <select value={cfg.padDepthIn} onChange={e => set({ padDepthIn: Number(e.target.value) })}>
              {PAD_DEPTHS.map(p => <option key={p} value={p}>{p.toFixed(1)}&quot;</option>)}
            </select>
          </Field>
          <Field label="Mount">
            <select value={cfg.mount} onChange={e => set({ mount: e.target.value as MountStyle })}>
              <option value="front_mount">Front mount</option>
              <option value="sandwich_mount">Sandwich</option>
              <option value="reverse_mount">Reverse</option>
            </select>
          </Field>
        </div>
        <Note>
          Pad depth is what sets offset. Offset is an output of the build, not an input:
          you choose the lip you want and the geometry tells you what offset you get.
        </Note>

        <Field label="Target offset (for the target-vs-achieved readout)">
          <input type="number" value={cfg.targetEtMm ?? ''} placeholder="ET mm"
            onChange={e => set({ targetEtMm: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
      </Panel>

      <Panel title="Tyre">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Section">
            <select value={cfg.tire.sectionMm}
              onChange={e => set({ tire: { ...cfg.tire, sectionMm: Number(e.target.value) } })}>
              {SECTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Aspect">
            <select value={cfg.tire.aspect}
              onChange={e => set({ tire: { ...cfg.tire, aspect: Number(e.target.value) } })}>
              {ASPECTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Rim">
            <input type="number" value={cfg.tire.diameterIn} readOnly />
          </Field>
        </div>
        <Row label="Mounted section" value={`${a.tire.sectionMm.toFixed(0)} mm`} />
        <Row label="Measuring rim" value={`${(a.assembly.achievedWidthIn - a.tire.sidewall.stretchIn).toFixed(1)}"`} />
        <Row label="Sidewall" value={a.tire.sidewall.label}
          tone={a.tire.sidewall.klass === 'beyond_spec' ? 'bad'
            : a.tire.sidewall.klass === 'aggressive' ? 'warn'
            : a.tire.sidewall.klass === 'oem' ? 'good' : undefined} />
        <Note tone={a.tire.sidewall.klass === 'beyond_spec' ? 'bad'
          : a.tire.sidewall.klass === 'aggressive' ? 'warn' : 'mute'}>
          {a.tire.sidewall.note}
        </Note>

        {candidates.length > 0 && (
          <div className="mt-2">
            <span className="lbl block mb-1">Candidates at this width</span>
            <div className="flex flex-col gap-1">
              {candidates.map(c => (
                <button key={`${c.size.sectionMm}-${c.size.aspect}`}
                  onClick={() => set({ tire: c.size })}
                  className="flex items-center justify-between gap-2 font-mono text-[10.5px] px-2 py-1.5 rounded border border-line bg-graphite-900 text-bone-dim hover:border-champagne">
                  <span>{c.size.sectionMm}/{c.size.aspect}R{c.size.diameterIn}</span>
                  <span className="text-bone-mute">
                    {c.mounted.diameterMm.toFixed(0)} mm · {c.deviationPct > 0 ? '+' : ''}{c.deviationPct.toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Finish">
        {([
          ['faceFinish', 'Face'],
          ['lipFinish', 'Lip / barrel'],
          ['hardwareFinish', 'Hardware'],
        ] as const).map(([key, label]) => (
          <Field key={key} label={label}>
            <select value={cfg[key]} onChange={e => set({ [key]: e.target.value as FinishId })}>
              {FINISHES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
        ))}
        <Row label="Bolt circle" value={`${vehicle.bolt.count}×${vehicle.bolt.pcdMm}`} tone="mute" />
      </Panel>
    </div>
  );
}
