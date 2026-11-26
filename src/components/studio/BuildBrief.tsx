'use client';
import { useBuild, useAnalysis, ENGINE_VERSION, type AxleAnalysis } from '@/store/build';
import { faceById } from '@/data/faces';
import { Panel, Btn, Note } from './ui';

/**
 * The build brief is a QUOTE REQUEST, not fabrication instructions.
 * It carries the specs, the bill of materials, the conditions that were
 * actually evaluated, and — the part that matters — what is unknown and
 * what has to be physically verified before anything is ordered.
 */
function axleBrief(a: AxleAnalysis, label: string): string[] {
  const w = a.wheel;
  const face = faceById(a.config.faceId);
  const L: string[] = [];
  L.push(`${label.toUpperCase()}`);
  if (!w) { L.push('  NOT BUILDABLE AS CONFIGURED:'); a.assembly.problems.forEach(p => L.push(`    - ${p}`)); return L; }
  L.push(`  Assembled           ${a.assembly.achievedWidthIn.toFixed(2)}J x ${w.diameterIn}  ET${a.assembly.achievedEtMm.toFixed(1)}`);
  L.push(`  Advertised sum      ${a.assembly.naiveWidthIn.toFixed(2)}"  (mate allowance ${a.assembly.mateAllowanceMm.toFixed(2)} mm)`);
  if (a.assembly.etErrorMm !== null)
    L.push(`  Target offset       ET${a.config.targetEtMm}  ->  achieved ET${a.assembly.achievedEtMm.toFixed(1)}  (${a.assembly.etErrorMm > 0 ? '+' : ''}${a.assembly.etErrorMm} mm)`);
  L.push(`  Backspacing         ${w.backspacingIn.toFixed(3)}"  (${w.backspacingMm.toFixed(1)} mm)`);
  L.push(`  Frontspacing        ${w.frontspacingIn.toFixed(3)}"  (${w.frontspacingMm.toFixed(1)} mm)`);
  L.push(`  Flange to flange    ${w.overallWidthMm.toFixed(1)} mm`);
  L.push(`  Bead seats          inner ${w.innerBeadSeatDistanceMm.toFixed(1)} mm / outer ${w.outerBeadSeatDistanceMm.toFixed(1)} mm from hub face`);
  if (w.spacerMm > 0) L.push(`  Spacer              ${w.spacerMm} mm  (effective ET${w.etEffMm.toFixed(1)})`);
  L.push('');
  L.push(`  Face                ${face?.name ?? '—'}  [${face?.kind === 'original' ? 'original design' : 'REFERENCE ONLY — needs a licensed asset'}]`);
  L.push(`  Construction        ${a.config.construction.replace(/_/g, ' ')}, ${a.config.mount.replace(/_/g, ' ')}`);
  L.push(`  Outer lip           ${a.assembly.exposedLipIn.toFixed(2)}" exposed`);
  L.push(`  Inner barrel        ${a.assembly.innerBarrelExposedIn.toFixed(2)}"`);
  L.push(`  Split               ${a.assembly.exposedLipIn.toFixed(2)}" outer / ${a.assembly.innerBarrelExposedIn.toFixed(2)}" inner`);
  L.push(`  Hardware            ${a.assembly.hardwareCount} per wheel`);
  L.push(`  Finishes            face ${a.config.faceFinish} / lip ${a.config.lipFinish} / hardware ${a.config.hardwareFinish}`);
  L.push('');
  L.push(`  Tyre                ${a.config.tire.sectionMm}/${a.config.tire.aspect}R${a.config.tire.diameterIn}`);
  L.push(`  Mounted section     ${a.tire.sectionMm.toFixed(0)} mm   [${a.tire.sectionGrade}]`);
  L.push(`  Overall diameter    ${a.tire.diameterMm.toFixed(1)} mm   [${a.tire.diameterGrade}]`);
  L.push(`  Rolling circum.     ${a.tire.circumferenceMm.toFixed(0)} mm   [${a.tire.circumferenceGrade}]`);
  L.push(`  Sidewall            ${a.tire.sidewall.label} (${a.tire.sidewall.stretchIn >= 0 ? '+' : ''}${a.tire.sidewall.stretchIn}" vs measuring rim)`);
  if (a.tire.sidewall.withinApprovedRange === false)
    L.push('  !! Rim width is outside the tyre maker approved range.');
  L.push('');
  L.push(`  Camber              ${a.state.camberDeg.toFixed(2)} deg   [${a.state.camberGrade}]`);
  L.push(`  Travel remaining    ${a.state.remainingTravelMm.toFixed(0)} mm   [${a.state.travelGrade}]`);
  if (a.delta) {
    L.push('');
    L.push('  VS FACTORY PACKAGE (exact arithmetic, no assumptions)');
    L.push(`    outboard          ${a.delta.outboardMm > 0 ? '+' : ''}${a.delta.outboardMm} mm`);
    L.push(`    inboard           ${a.delta.inboardMm > 0 ? '+' : ''}${a.delta.inboardMm} mm`);
    L.push(`    half-track        ${a.delta.halfTrackMm > 0 ? '+' : ''}${a.delta.halfTrackMm} mm per corner`);
    L.push(`    rolling diameter  ${a.delta.diameterMm > 0 ? '+' : ''}${a.delta.diameterMm} mm`);
    L.push(`    speedometer       ${a.delta.speedoPct > 0 ? '+' : ''}${a.delta.speedoPct}%`);
  }
  if (a.clearance) {
    L.push('');
    L.push(`  CLEARANCE — ${a.clearance.overall.toUpperCase()} (formal) / ${a.clearance.overallModelled.toUpperCase()} (modelled)`);
    for (const r of a.clearance.results) {
      L.push(`    ${r.label.padEnd(30)} ${String(r.minDistanceMm ?? 'n/a').padStart(7)} mm  ${r.verdict.padEnd(14)} ${r.conditionLabel}  [${r.governingGrade}]`);
    }
    if (a.clearance.conditionsSkipped.length)
      L.push(`    NOT EVALUATED: ${a.clearance.conditionsSkipped.map(x => `${x.id} (${x.reason})`).join('; ')}`);
  } else {
    L.push('');
    L.push('  CLEARANCE — NOT ANALYSED. No dimensioned corner geometry for this vehicle.');
  }
  return L;
}

export function BuildBrief() {
  const s = useBuild();
  const { vehicle, front, rear } = useAnalysis();

  const lines: string[] = [];
  lines.push('RAREFORM FITMENT LAB — BUILD BRIEF');
  lines.push('='.repeat(78));
  lines.push(`Generated          ${new Date().toISOString()}`);
  lines.push(`Engine version     ${ENGINE_VERSION}`);
  lines.push('');
  lines.push('VEHICLE');
  lines.push(`  ${vehicle.make} ${vehicle.model} — ${vehicle.chassis} — ${vehicle.years} — ${vehicle.bodyStyle}`);
  lines.push(`  Asset state       ${vehicle.assetState.replace(/_/g, ' ').toUpperCase()}`);
  lines.push(`  Bolt pattern      ${vehicle.bolt.count}x${vehicle.bolt.pcdMm}  [${vehicle.boltGrade}]`);
  lines.push(`  Centre bore       ${vehicle.centreBoreMm} mm`);
  lines.push(`  Fastener          ${vehicle.fastener}, ${vehicle.seat.replace(/_/g, ' ')}`);
  lines.push(`  Front suspension  ${vehicle.frontArchitecture.replace(/_/g, ' ')}`);
  lines.push(`  Rear suspension   ${vehicle.rearArchitecture.replace(/_/g, ' ')}`);
  lines.push(`  Package           ${s.suspension.package.replace(/_/g, ' ')}`);
  lines.push(`  Drop              front ${s.suspension.dropFrontMm} mm / rear ${s.suspension.dropRearMm} mm`);
  lines.push(`  Arch              ${s.suspension.archMod.replace(/_/g, ' ')}`);
  lines.push('');
  lines.push(...axleBrief(front, 'Front axle'));
  lines.push('');
  lines.push(...axleBrief(rear, 'Rear axle'));
  lines.push('');
  lines.push('BILL OF MATERIALS — FOUR WHEELS');
  const bom = [
    ['Outer lips', `4 x ${front.config.diameterIn}" (2 front, 2 rear)`],
    ['Inner barrels', `4 x ${front.config.diameterIn}"`],
    ['Centre discs', `4 x ${faceById(front.config.faceId)?.name ?? '—'}`],
    ['Assembly hardware', `${front.assembly.hardwareCount * 2 + rear.assembly.hardwareCount * 2} bolts, o-rings, sealant`],
    ['Valves and caps', '4 sets'],
    ['Tyres', `2 x ${front.config.tire.sectionMm}/${front.config.tire.aspect}R${front.config.tire.diameterIn}, 2 x ${rear.config.tire.sectionMm}/${rear.config.tire.aspect}R${rear.config.tire.diameterIn}`],
  ];
  if (front.config.spacerMm > 0 || rear.config.spacerMm > 0)
    bom.push(['Spacers', `front ${front.config.spacerMm} mm, rear ${rear.config.spacerMm} mm`]);
  bom.forEach(([k, v]) => lines.push(`  ${k!.padEnd(20)} ${v}`));
  lines.push('');
  lines.push('  Supplier part numbers, prices and availability are NOT included: no supplier');
  lines.push('  catalogue is connected to this build. Component IDs above are generic trade');
  lines.push('  sizes, and cross-supplier compatibility is not assumed.');
  lines.push('');
  lines.push('ASSUMPTIONS AND UNKNOWNS');
  const unknowns: string[] = [];
  if (vehicle.assetState !== 'verified_geometry')
    unknowns.push(`Vehicle geometry is ${vehicle.assetState.replace(/_/g, ' ')}. Absolute clearances are not measurements of this car.`);
  [front, rear].forEach((a, i) => {
    const which = i === 0 ? 'Front' : 'Rear';
    if (a.clearance) a.clearance.limitations.forEach(l => unknowns.push(`${which}: ${l}`));
    if (a.tire.diameterGrade === 'estimated')
      unknowns.push(`${which}: tyre overall diameter derived from the nominal size designation, not measured. Real diameters vary by a couple of percent between makes.`);
  });
  const face = faceById(front.config.faceId);
  if (face && !face.configurable)
    unknowns.push(`Face "${face.name}" is a reference entry. It has no asset or geometry and requires an authorised reference or licensed asset before it can be built.`);
  unknowns.forEach(u => lines.push(`  - ${u}`));
  lines.push('');
  lines.push('PHYSICAL VERIFICATION CHECKLIST — COMPLETE BEFORE ORDERING BARRELS');
  [
    'Measure hub face to fender lip, lateral, both axles, at ride height.',
    'Measure fender lip to hub centre, vertical, both axles, at ride height.',
    'Measure hub face to the nearest inner obstruction, both axles.',
    'Measure hub travel remaining to the bump stop, both axles.',
    'Confirm centre bore against the hub spigot with the disc in hand.',
    'Confirm caliper radial and axial envelope against the barrel and spoke-back profile.',
    'Test fit one assembled wheel before the remaining three are built.',
    'Check full steering lock, both directions, at full compression.',
    'Confirm the tyre maker approves this rim width for the chosen section.',
    'Have a qualified builder confirm structural suitability of the chosen components.',
  ].forEach((c, i) => lines.push(`  ${String(i + 1).padStart(2)}. [ ] ${c}`));
  lines.push('');
  lines.push('-'.repeat(78));
  lines.push('This brief is for a professional quote request. It is NOT certified fabrication');
  lines.push('instruction, and nothing in it establishes structural feasibility, load capacity');
  lines.push('or road safety. No machining procedure, torque figure or material rating is');
  lines.push('produced anywhere in this product. Physical test fitting and professional');
  lines.push('inspection are required before road use.');

  const text = lines.join('\n');

  function copy() {
    navigator.clipboard?.writeText(text).catch(() => {
      const el = document.getElementById('brief-pre');
      if (el) {
        const r = document.createRange(); r.selectNodeContents(el);
        const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
      }
    });
  }
  function download() {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rareform-${vehicle.chassis}-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function downloadJson() {
    const payload = {
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      vehicle: {
        id: vehicle.id, make: vehicle.make, model: vehicle.model,
        chassis: vehicle.chassis, years: vehicle.years,
        assetState: vehicle.assetState, bolt: vehicle.bolt,
        centreBoreMm: vehicle.centreBoreMm,
      },
      suspension: s.suspension,
      axles: { front, rear },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rareform-${vehicle.chassis}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title="Build brief"
      right={
        <div className="flex gap-1.5 no-print">
          <Btn small onClick={copy}>COPY</Btn>
          <Btn small onClick={download}>.TXT</Btn>
          <Btn small onClick={downloadJson}>.JSON</Btn>
          <Btn small prime onClick={() => window.print()}>PRINT</Btn>
        </div>
      }>
      <pre id="brief-pre" className="num text-[10px] leading-relaxed whitespace-pre overflow-x-auto scroll bg-graphite-900 border border-line rounded p-3 m-0 max-h-[32rem]">
        {text}
      </pre>
      <Note>
        The machine-readable .JSON carries the same content plus the full clearance
        matrix and every evidence grade, so a builder&apos;s system can ingest it without
        re-typing anything.
      </Note>
    </Panel>
  );
}
