'use client';
import { useEffect, useState } from 'react';
import { useBuild } from '@/store/build';
import { byId } from '@/data/vehicles';
import { Panel, Btn, Note } from './ui';

export function SavedBuilds() {
  const s = useBuild();
  const [name, setName] = useState('');
  useEffect(() => { s.hydrate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Saved builds" right={<span className="lbl">this browser</span>}>
      <div className="flex gap-1.5 mb-2">
        <input type="text" placeholder="e.g. E32 / mesh 18 flush" value={name}
          onChange={e => setName(e.target.value)} />
        <Btn prime onClick={() => { s.saveBuild(name); setName(''); }}>SAVE</Btn>
      </div>
      {s.saved.length === 0 ? (
        <Note>
          Nothing saved yet. A saved build pins the engine version alongside the
          configuration, so it still means the same thing after the catalogue changes.
        </Note>
      ) : (
        <div className="flex flex-col gap-1">
          {s.saved.map(b => {
            const v = byId(b.vehicleId);
            return (
              <div key={b.id} className="flex items-center gap-2 border border-line rounded px-2 py-1.5 bg-graphite-900">
                <button onClick={() => s.loadBuild(b.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-[11.5px] text-bone truncate">{b.name}</div>
                  <div className="num text-[9.5px] text-bone-mute">
                    {v?.chassis ?? b.vehicleId} · {b.front.diameterIn}&quot;/{b.rear.diameterIn}&quot; ·
                    eng {b.engineVersion} · {new Date(b.savedAt).toLocaleDateString()}
                  </div>
                </button>
                <Btn small onClick={() => s.duplicateBuild(b.id)}>DUP</Btn>
                <button onClick={() => s.deleteBuild(b.id)}
                  className="font-mono text-[11px] text-bone-mute px-1 hover:text-verdict-bad">×</button>
              </div>
            );
          })}
        </div>
      )}
      <Note>
        Local persistence only: these live in this browser and reach nothing else. The
        account-backed store is the next step, and the schema is already versioned for it.
      </Note>
    </Panel>
  );
}
