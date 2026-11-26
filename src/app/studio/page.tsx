'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useBuild } from '@/store/build';
import { VehiclePanel } from '@/components/studio/VehiclePanel';
import { WheelPanel } from '@/components/studio/WheelPanel';
import { ResultsBar } from '@/components/studio/ResultsBar';
import { ClearanceTable } from '@/components/studio/ClearanceTable';
import { Optimizer } from '@/components/studio/Optimizer';
import { Measurement } from '@/components/studio/Measurement';
import { BuildBrief } from '@/components/studio/BuildBrief';
import { SavedBuilds } from '@/components/studio/SavedBuilds';
import { Seg, Btn } from '@/components/studio/ui';
import type { ViewMode, CameraPreset } from '@/store/build';

// The 3D scene is client-only: it touches WebGL on mount.
const Scene = dynamic(() => import('@/components/three/Scene').then(m => m.Scene), {
  ssr: false,
  loading: () => (
    <div className="h-full grid place-items-center text-bone-mute font-mono text-[11px]">
      loading scene…
    </div>
  ),
});

type RightTab = 'wheel' | 'measure' | 'brief' | 'saved';

export default function StudioPage() {
  const s = useBuild();
  const [tab, setTab] = useState<RightTab>('wheel');
  const [optimizerOpen, setOptimizerOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* masthead */}
      <header className="flex items-center gap-3 px-3 py-2 border-b border-line bg-graphite-900 shrink-0 no-print">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden>
            <circle cx="13" cy="13" r="12" fill="none" stroke="#c9a063" strokeWidth="1.4" />
            <circle cx="13" cy="13" r="7.4" fill="none" stroke="#7d8894" strokeWidth="1" />
            <circle cx="13" cy="13" r="2" fill="#c9a063" />
          </svg>
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold tracking-[0.16em] text-bone">RAREFORM</div>
            <div className="font-mono text-[8.5px] tracking-[0.12em] text-bone-mute">FITMENT LAB</div>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <div className="w-[150px]">
            <Seg value={s.axle} onChange={v => s.setAxle(v)}
              options={[{ v: 'front' as const, label: 'FRONT' }, { v: 'rear' as const, label: 'REAR' }]} />
          </div>
          <select value={s.viewMode} onChange={e => s.setView({ viewMode: e.target.value as ViewMode })}
            className="!w-auto">
            <option value="complete">Complete vehicle</option>
            <option value="wheel_with_tire">Wheel with tyre</option>
            <option value="wheel_bare">Bare wheel</option>
            <option value="hub_only">Hub, rotor, caliper</option>
            <option value="exploded">Exploded components</option>
          </select>
          <select value={s.cameraPreset} onChange={e => s.setView({ cameraPreset: e.target.value as CameraPreset })}
            className="!w-auto">
            <option value="front_three_quarter">Front 3/4</option>
            <option value="rear_three_quarter">Rear 3/4</option>
            <option value="side">Side</option>
            <option value="front">Front</option>
            <option value="rear">Rear</option>
            <option value="elevated">Elevated</option>
            <option value="wheel_close">Wheel close-up</option>
          </select>
          {([
            ['tireVisible', 'TYRE'],
            ['transparentBody', 'X-RAY'],
            ['sectionPlane', 'CUTAWAY'],
            ['showDimensions', 'DIMS'],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => s.setView({ [k]: !s[k] })} aria-pressed={s[k]}
              className="font-mono text-[9.5px] font-semibold px-2 py-1.5 rounded border tracking-wider"
              style={s[k]
                ? { background: '#c9a063', borderColor: '#c9a063', color: '#101316' }
                : { background: '#1c2126', borderColor: '#333b43', color: '#848d96' }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_368px]">
        <aside className="hidden lg:block overflow-y-auto scroll border-r border-line p-2.5 bg-graphite-800">
          <VehiclePanel />
        </aside>

        <main className="min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-[320px] relative bg-graphite-900">
            <Scene />
            <div className="absolute left-2.5 bottom-2.5 font-mono text-[9px] leading-snug text-bone-mute
                            bg-graphite-900/85 border border-line rounded px-2 py-1.5 max-w-[22rem] pointer-events-none">
              Body and wheel placement are generic demonstration geometry, not a scan or CAD
              of this vehicle. Clearance results come from the corner envelope only, never
              from this mesh.
            </div>
          </div>
          <div className="shrink-0 max-h-[46%] overflow-y-auto scroll">
            <ResultsBar onOptimize={() => { setOptimizerOpen(true); }} />
          </div>
        </main>

        <aside className="hidden lg:flex flex-col overflow-hidden border-l border-line bg-graphite-800">
          <div className="p-2 border-b border-line shrink-0">
            <Seg<RightTab> value={tab} onChange={setTab} options={[
              { v: 'wheel', label: 'WHEEL' },
              { v: 'measure', label: 'MEASURE' },
              { v: 'brief', label: 'BRIEF' },
              { v: 'saved', label: 'SAVED' },
            ]} />
          </div>
          <div className="flex-1 overflow-y-auto scroll p-2.5 flex flex-col gap-2.5">
            {optimizerOpen && <Optimizer onClose={() => setOptimizerOpen(false)} />}
            {tab === 'wheel' && <><WheelPanel /><ClearanceTable /></>}
            {tab === 'measure' && <><Measurement /><ClearanceTable /></>}
            {tab === 'brief' && <BuildBrief />}
            {tab === 'saved' && <SavedBuilds />}
          </div>
        </aside>
      </div>

      {/* narrow screens: panels stack below the scene */}
      <div className="lg:hidden border-t border-line bg-graphite-800 p-2.5 flex flex-col gap-2.5 overflow-y-auto scroll max-h-[60vh]">
        <Seg<RightTab> value={tab} onChange={setTab} options={[
          { v: 'wheel', label: 'WHEEL' },
          { v: 'measure', label: 'MEASURE' },
          { v: 'brief', label: 'BRIEF' },
          { v: 'saved', label: 'SAVED' },
        ]} />
        <VehiclePanel />
        {tab === 'wheel' && <><WheelPanel /><ClearanceTable /></>}
        {tab === 'measure' && <Measurement />}
        {tab === 'brief' && <BuildBrief />}
        {tab === 'saved' && <SavedBuilds />}
        <Btn onClick={() => setOptimizerOpen(true)}>OPTIMIZE FITMENT</Btn>
        {optimizerOpen && <Optimizer onClose={() => setOptimizerOpen(false)} />}
      </div>
    </div>
  );
}
