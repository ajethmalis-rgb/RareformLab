'use client';
import type { ReactNode } from 'react';
import { VERDICT_COLOR, type ClearanceVerdict, type EvidenceGrade } from '@/engine/types';

export function Panel({ title, right, children, className = '' }: {
  title: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="phead">
        <h2 className="lbl" style={{ color: '#b3bbc3' }}>{title}</h2>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-2.5">
      <span className="lbl block mb-1">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] leading-snug text-bone-mute">{hint}</span>}
    </label>
  );
}

export function Row({ label, value, tone }: {
  label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'mute';
}) {
  const color = tone === 'good' ? '#4fa97e' : tone === 'bad' ? '#ce4038'
    : tone === 'warn' ? '#e07b39' : tone === 'mute' ? '#848d96' : '#e7eaed';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
      <span className="text-[11.5px] text-bone-dim">{label}</span>
      <span className="num text-[12px] font-medium whitespace-nowrap" style={{ color }}>{value}</span>
    </div>
  );
}

export function Tile({ label, value, note, tone }: {
  label: string; value: ReactNode; note?: string; tone?: ClearanceVerdict;
}) {
  return (
    <div className="bg-graphite-700 p-2.5 min-w-0">
      <div className="lbl truncate">{label}</div>
      <div className="num font-semibold mt-0.5 tracking-tight leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
        style={{
          color: tone ? VERDICT_COLOR[tone] : '#e7eaed',
          fontSize: typeof value === 'string' && value.length > 9 ? 13 : 18,
        }}>{value}</div>
      {note && <div className="text-[10px] leading-tight text-bone-mute mt-0.5 break-words">{note}</div>}
    </div>
  );
}

export const VERDICT_LABEL: Record<ClearanceVerdict, string> = {
  clear: 'CLEAR',
  marginal: 'MARGINAL',
  interference: 'INTERFERENCE',
  indeterminate: 'UNKNOWN',
};

export function VerdictChip({ v, small }: { v: ClearanceVerdict; small?: boolean }) {
  const c = VERDICT_COLOR[v];
  return (
    <span className="chip" style={{
      color: c, border: `1px solid ${c}66`, background: `${c}1f`,
      fontSize: small ? 8.5 : 9,
    }}>{VERDICT_LABEL[v]}</span>
  );
}

const GRADE_LABEL: Record<EvidenceGrade, string> = {
  manufacturer_documented: 'FACTORY DOC',
  professionally_measured: 'PRO MEASURED',
  community_corroborated: 'CORROBORATED',
  community_reported: 'SINGLE REPORT',
  estimated: 'ESTIMATED',
  unknown: 'NO DATA',
};
const GRADE_COLOR: Record<EvidenceGrade, string> = {
  manufacturer_documented: '#4fa97e',
  professionally_measured: '#4fa97e',
  community_corroborated: '#4fa97e',
  community_reported: '#6a9ec4',
  estimated: '#e07b39',
  unknown: '#7c858f',
};

export function GradeChip({ g }: { g: EvidenceGrade }) {
  const c = GRADE_COLOR[g];
  return (
    <span className="chip" style={{ color: c, border: `1px solid ${c}55`, background: `${c}18` }}>
      {GRADE_LABEL[g]}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-graphite-900 border border-line rounded-md p-0.5">
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className="flex-1 font-mono text-[10px] font-semibold py-1 px-1.5 rounded whitespace-nowrap"
          style={value === o.v
            ? { background: '#c9a063', color: '#101316' }
            : { background: 'transparent', color: '#848d96' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="lbl">{label}</span>
        <span className="num text-[12px] font-semibold text-champagne">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Note({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'warn' | 'bad' }) {
  const styles = tone === 'warn'
    ? { color: '#e07b39', background: '#e07b3914', border: '1px solid #e07b3938' }
    : tone === 'bad'
      ? { color: '#ce4038', background: '#ce403814', border: '1px solid #ce403838' }
      : { color: '#848d96', background: 'transparent', border: 'none' };
  return (
    <p className="text-[11px] leading-snug rounded p-2 mt-1.5" style={styles}>{children}</p>
  );
}

export function Btn({ children, onClick, prime, small }: {
  children: ReactNode; onClick?: () => void; prime?: boolean; small?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`font-mono font-semibold rounded border tracking-wider ${small ? 'text-[10px] px-2 py-1' : 'text-[11px] px-3 py-1.5'}`}
      style={prime
        ? { background: '#c9a063', borderColor: '#c9a063', color: '#101316' }
        : { background: '#242a30', borderColor: '#434d57', color: '#e7eaed' }}>
      {children}
    </button>
  );
}
