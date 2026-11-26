
/* ============================================================
   RAREFORM FITMENT LAB — engine, ported from the tested TS build.
   Same algorithms, same reference identities. See README for the
   61 unit tests that pin these numbers.

   COORDINATE FRAME
     origin = hub mounting plane x wheel spin axis
     +x outboard (away from vehicle centreline), +y up
     camber negative = top of wheel leans toward the centreline
     all lengths mm, all angles degrees
   ============================================================ */
const MM = 25.4;
const inToMm = v => v * MM, mmToIn = v => v / MM;
const r2 = (v, d) => { const f = 10 ** (d ?? 2); return Math.round(v * f) / f; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---- evidence grading. The reason this product can refuse to lie. ---- */
const GRADE_RANK = { manufacturer_documented: 4, professionally_measured: 3, community_reported: 2, estimated: 1, unknown: 0 };
const GRADE_LABEL = { manufacturer_documented: 'FACTORY DOC', professionally_measured: 'PRO MEASURED', community_reported: 'YOU MEASURED', estimated: 'ESTIMATED', unknown: 'NO DATA' };
const GRADE_COLOR = { manufacturer_documented: 'var(--ok)', professionally_measured: 'var(--ok)', community_reported: 'var(--info)', estimated: 'var(--warn)', unknown: 'var(--gray)' };
const isVerified = g => GRADE_RANK[g] >= 3;
const worstGrade = (...gs) => gs.reduce((a, b) => GRADE_RANK[b] < GRADE_RANK[a] ? b : a, 'manufacturer_documented');

/* ---- rim geometry ----
   Flange width per side by profile. The familiar "overall = width + 1 inch"
   shortcut assumes 12.7 mm per side, right for J and wrong for others. */
const FLANGE = { J: 12.7, JJ: 13.5, K: 14.2, B: 11.5 };

function resolveWheel(widthIn, diameterIn, etMm, opts) {
  opts = opts || {};
  const f = FLANGE[opts.profile || 'J'] ?? FLANGE.J;
  const fo = opts.flangeOuterMm ?? f, fi = opts.flangeInnerMm ?? f;
  const spacerMm = opts.spacerMm || 0;
  const etEff = etMm - spacerMm;            // a spacer IS a reduction in offset
  const nominal = inToMm(widthIn), half = nominal / 2;
  const centreX = -etEff;
  const innerFlangeX = centreX - half - fi;
  const outerFlangeX = centreX + half + fo;
  return {
    widthIn, diameterIn, etMm, spacerMm, etEffMm: etEff,
    nominalWidthMm: nominal,
    overallWidthMm: nominal + fi + fo,
    flangeOuterMm: fo, flangeInnerMm: fi,
    centrePlaneX: centreX,
    innerBeadSeatDistanceMm: half + etEff,
    outerBeadSeatDistanceMm: half - etEff,
    innerFlangeX, outerFlangeX,
    backspacingMm: Math.abs(innerFlangeX), backspacingIn: mmToIn(Math.abs(innerFlangeX)),
    frontspacingMm: outerFlangeX, frontspacingIn: mmToIn(outerFlangeX),
    rimRadiusMm: inToMm(diameterIn) / 2,
  };
}

/* ---- tyre ----
   Measuring rim, derived when no manufacturer figure exists. Lower aspect
   ratios are specified on proportionally wider rims. Calibrated against
   published values: 185/70R13=5.5, 195/65R15=6.0, 205/55R16=6.5,
   225/45R17=7.5, 245/40R18=8.5, 275/35R19=9.5 */
function designRim(section, aspect) {
  const k = aspect >= 65 ? 0.78 : aspect >= 55 ? 0.82 : aspect >= 45 ? 0.85 : 0.88;
  return Math.round((section / MM) * k * 2) / 2;
}
const stretchIn = (section, aspect, rimW) => rimW - designRim(section, aspect);

function sidewallClass(s) {
  if (s <= -0.75) return { k: 'balloon', label: 'Balloon sidewall', note: 'Rim narrower than the measuring rim. Soft ride, maximum kerb protection for a polished lip, vague turn-in. Period-correct on 13 to 15 inch.' };
  if (s <= -0.25) return { k: 'full', label: 'Full sidewall', note: 'Sidewall stands slightly proud of the flange, which is what protects an expensive lip from kerbs.' };
  if (s < 0.75) return { k: 'oem', label: 'OEM / flush', note: 'Normal fitment. Sidewall roughly level with the rim flange.' };
  if (s < 1.25) return { k: 'mild', label: 'Mild stretch', note: 'Flange now stands proud of the sidewall, so the lip takes kerb strikes first.' };
  if (s < 1.75) return { k: 'aggressive', label: 'Aggressive stretch', note: 'Pinched bead. Needs elevated pressure. A pothole bends the lip or unseats the bead.' };
  return { k: 'beyond_spec', label: 'Beyond published spec', note: 'No tyre maker approves this rim width for this section. The bead can unseat under cornering load.' };
}

function mountTire(section, aspect, diameterIn, rimWidthIn) {
  const mrim = designRim(section, aspect);
  const delta = (rimWidthIn - mrim) * 10;        // 5 mm per half inch, industry convention
  const sectionMm = section + delta;
  const sidewallMm = (section * aspect) / 100;
  // Mounting wider than the measuring rim pulls the sidewall taut and drops
  // overall diameter slightly. Second-order, ~2 mm per half inch.
  const diameterMm = inToMm(diameterIn) + 2 * sidewallMm - (rimWidthIn - mrim) * 4;
  const circumferenceMm = Math.PI * diameterMm * 0.97;  // loaded deflection allowance
  const st = stretchIn(section, aspect, rimWidthIn);
  return {
    section, aspect, diameterIn, rimWidthIn, sectionMm, sidewallMm,
    diameterMm, radiusMm: diameterMm / 2, circumferenceMm,
    treadWidthMm: sectionMm * 0.82,
    measuringRimIn: mrim, stretchIn: r2(st, 2), sidewall: sidewallClass(st),
    // No manufacturer data is shipped, so these stay estimated and the
    // solver refuses to go green on anything that depends on them.
    sectionGrade: 'estimated', diameterGrade: 'estimated',
  };
}

/* ---- assembly cross-section profile ----
   Outboard half-width at radius rho from the spin axis. The ONE function
   both the solver and the drawings read, so the picture cannot disagree
   with the verdict.
     rho < rim radius ......... rim flange
     rho ~45% up the sidewall . maximum section width
     rho = tyre radius ........ tread half-width
   Two behaviours a flat section-width model misses: the widest point sits
   partway up the SIDEWALL, exactly where a lowered car's lip descends to;
   and on a stretched fitment the FLANGE is the outermost point, which is
   why stretched wheels are the bent ones. */
function halfWidthAt(rho, tire, rimRadiusMm, overallWidthMm) {
  const a = Math.abs(rho), flange = overallWidthMm / 2;
  if (a <= rimRadiusMm) return flange;
  const sh = tire.radiusMm - rimRadiusMm;
  if (sh <= 0) return flange;
  const u = Math.min((a - rimRadiusMm) / sh, 1);
  const maxHalf = tire.sectionMm / 2, treadHalf = tire.treadWidthMm / 2, PEAK = 0.45;
  if (u <= PEAK) return flange + (maxHalf - flange) * Math.sin((u / PEAK) * (Math.PI / 2));
  const k = (u - PEAK) / (1 - PEAK);
  return maxHalf - (maxHalf - treadHalf) * Math.pow(Math.sin(k * (Math.PI / 2)), 1.6);
}
function widestPoint(tire, rimRadiusMm, overallWidthMm) {
  let best = -Infinity, at = 0;
  for (let i = 0; i <= 80; i++) {
    const rho = tire.radiusMm * (i / 80);
    const w = halfWidthAt(rho, tire, rimRadiusMm, overallWidthMm);
    if (w > best) { best = w; at = rho; }
  }
  return { halfWidthMm: best, rhoMm: at };
}

/* Camber rotates the wheel about the HUB CENTRE. Correct frame for
   clearance: the suspension fixes the hub at a ride height and the wheel
   tilts around it, which is why camber changes track at the contact patch
   rather than at the hub. Also makes radius camber-invariant, which the
   arch test relies on. */
const camberX = (x, y, deg) => {
  const t = deg * Math.PI / 180;
  return x * Math.cos(t) + y * Math.sin(t);
};

/* ---- suspension ---- */
const GEOMETRY = {
  macpherson_strut:     { gain: -0.12, label: 'MacPherson strut',     note: 'Modest camber gain. The limiting component at the front is usually the strut or spring, not the fender.' },
  double_wishbone:      { gain: -0.14, label: 'Double wishbone',      note: 'Predictable gain. Check the lower arm and the steering stop at full lock.' },
  strut_torsion_bar:    { gain: -0.10, label: 'Strut + torsion bar',  note: 'Ride height comes from re-indexing the torsion bar. Camber plates are the only real adjustment.' },
  semi_trailing_arm:    { gain: -0.28, label: 'Semi-trailing arm',    note: 'Gains camber quickly and toes in as it drops. Rear fitment is governed by this, not by your offset.' },
  multilink:            { gain: -0.18, label: 'Multi-link',           note: 'Moderate gain, adjustable at the eccentrics. The most forgiving rear to fit.' },
  swing_axle_low_pivot: { gain:  0.20, label: 'Low-pivot swing axle', note: 'Lowering pushes the TOP of the tyre OUTBOARD, the opposite of every other architecture here. Arch clearance gets WORSE the lower you go.' },
  live_axle:            { gain:  0.00, label: 'Live axle',            note: 'No camber change with travel. Clearance is static: what you measure is what you get.' },
};
const PACKAGE = {
  factory:               { tf: 1.00, label: 'Factory springs',            note: 'Full factory travel on factory bump stops.' },
  lowering_springs:      { tf: 0.78, label: 'Lowering springs',           note: 'Factory stops with less travel. The setup most likely to rub: travel is lost without being brought under control.' },
  coilover_standard:     { tf: 0.70, label: 'Coilover, stock-length',     note: 'Height from spring preload, which consumes travel. Common, and commonly rubs.' },
  coilover_short_stroke: { tf: 1.05, label: 'Coilover, short stroke',     note: 'Shortened body and stop. Travel preserved below the stop, so a smaller static gap is usable.' },
  air_driving:           { tf: 0.76, label: 'Air, driving height',        note: 'Travel depends on bag and cup. Sleeve bags over-travel more than double-bellows.' },
  air_parked:            { tf: 0.00, label: 'Air, parked / laid out',     note: 'Static geometry only, not a driving state. Clearance here describes a parked car.' },
};
const ARCH_GAIN = { untouched: 0, rolled: 8, rolled_and_pulled: 14 };

function cornerState(arch, pkg, dropMm, compressionMm, camberOverride, travelOverride, bumpTravelMm) {
  const total = dropMm + compressionMm;
  let camberDeg, camberGrade, note;
  if (camberOverride !== null && camberOverride !== undefined && camberOverride !== '') {
    camberDeg = Number(camberOverride) + (GEOMETRY[arch].gain * compressionMm) / 10;
    camberGrade = 'community_reported';
    note = 'Camber taken from your measurement. Change under compression still uses the architecture rate, not a measured curve.';
  } else {
    camberDeg = (GEOMETRY[arch].gain * total) / 10;
    camberGrade = 'estimated';
    note = 'Camber estimated from a typical ' + GEOMETRY[arch].label.toLowerCase() + ' gain rate. Not a measured curve for this car.';
  }
  let remainingTravelMm, travelGrade;
  if (travelOverride !== null && travelOverride !== undefined && travelOverride !== '') {
    remainingTravelMm = Math.max(0, Number(travelOverride) - compressionMm);
    travelGrade = 'community_reported';
  } else {
    // Lowering on stock-length hardware spends roughly 55% of the drop out of
    // available bump travel; the rest is the stop engaging earlier. Estimated.
    remainingTravelMm = Math.max(0, bumpTravelMm * PACKAGE[pkg].tf - dropMm * 0.55 - compressionMm);
    travelGrade = 'estimated';
  }
  return { dropMm, compressionMm, camberDeg: r2(camberDeg, 2), camberGrade, remainingTravelMm: r2(remainingTravelMm, 1), travelGrade, note };
}

/* ---- multipiece assembly ----
   Offset is an OUTPUT. Where the disc sits in the shell determines it:
     ET_eff = W/2 + flangeOuter - padDepth
   Advertised lip + advertised barrel does NOT equal finished bead-seat
   width; the mate allowance is why. */
const MATE_MM = 6.35;
function assemble(cfg) {
  const problems = [];
  let widthIn = 0, naive = 0, mate = 0;
  const fo = FLANGE.J, fi = FLANGE.J;
  if (cfg.construction === 'three_piece') {
    naive = cfg.lipIn + cfg.barrelIn;
    mate = MATE_MM * 2;
    widthIn = naive - mmToIn(mate);
  } else if (cfg.construction === 'two_piece') {
    naive = cfg.shellIn; widthIn = cfg.shellIn;
  } else {
    problems.push('A monoblock has no separable barrel: width and offset are fixed by the casting.');
    naive = cfg.shellIn; widthIn = cfg.shellIn;
  }
  const half = inToMm(widthIn) / 2;
  const padMm = inToMm(cfg.padDepthIn);
  const etEff = half + fo - padMm;
  const achievedEt = etEff + (cfg.spacerMm || 0);
  const wheel = resolveWheel(widthIn, cfg.diameterIn, achievedEt, { spacerMm: cfg.spacerMm || 0 });
  const padThickIn = mmToIn(11);
  const exposedLipIn = cfg.mount === 'reverse_mount' ? 0 : Math.max(0, cfg.padDepthIn - padThickIn);
  const bolts = cfg.diameterIn <= 15 ? (widthIn >= 9 ? 24 : 18)
    : cfg.diameterIn <= 17 ? (widthIn >= 9 ? 30 : 24)
    : cfg.diameterIn <= 19 ? (widthIn >= 10 ? 36 : 30) : (widthIn >= 11 ? 40 : 36);
  const notes = [];
  if (exposedLipIn < 0.6) notes.push('Almost no visible lip at this pad depth. A flat-face multipiece will read as a one-piece.');
  if (exposedLipIn > 4.5) notes.push('Lip over 4.5 inch needs a stepped or welded outer and a reinforced inner. Some builders will not warranty it.');
  if (wheel.backspacingIn < 3.2) notes.push('Very shallow inner barrel. Check the disc pad does not foul the caliper.');
  return {
    ok: problems.length === 0, problems, wheel,
    achievedWidthIn: r2(widthIn, 3), achievedEtMm: r2(achievedEt, 1),
    naiveWidthIn: r2(naive, 3), mateAllowanceMm: r2(mate, 2),
    exposedLipIn: r2(exposedLipIn, 3),
    innerBarrelExposedIn: r2(wheel.backspacingIn - padThickIn, 3),
    hardwareCount: bolts, notes,
    etErrorMm: cfg.targetEtMm === null || cfg.targetEtMm === '' ? null : r2(achievedEt - Number(cfg.targetEtMm), 1),
  };
}
/* Inverse: the pad depth that lands a target offset. */
const padDepthForEt = (widthIn, targetEtMm) => mmToIn(inToMm(widthIn) / 2 + FLANGE.J - targetEtMm);

/* ---- clearance solver ---- */
const THRESH = { archStatic: 10, archDynamic: 8, inner: 8, well: 15 };
const SEV = { clear: 0, indeterminate: 1, marginal: 2, interference: 3 };
const worseV = (a, b) => SEV[b] > SEV[a] ? b : a;
const modelled = (d, th) => d < 0 ? 'interference' : d < th ? 'marginal' : 'clear';
/* The evidence rule. A predicted hit reports at any grade, because a
   predicted hit is useful. A PASS requires verified inputs. Unknown is
   never green. */
const formalise = (m, g) => g === 'unknown' ? 'indeterminate'
  : m === 'interference' ? 'interference'
  : !isVerified(g) ? 'indeterminate' : m;

const CONDITIONS = [
  { id: 'static', label: 'Static', frac: 0 },
  { id: 'half_bump', label: 'Half bump', frac: 0.5 },
  { id: 'full_bump', label: 'Full bump', frac: 1 },
];

function analyse(env, wheel, tire, state, archMod) {
  const results = [], limitations = [];
  const gain = GEOMETRY[env.architecture].gain;
  const archCredit = ARCH_GAIN[archMod] || 0;
  const wp = widestPoint(tire, wheel.rimRadiusMm, wheel.overallWidthMm);

  const pokeMm = env.archLateral.known
    ? camberX(wheel.centrePlaneX + wp.halfWidthMm, wp.rhoMm, state.camberDeg) - (env.archLateral.value + archCredit)
    : NaN;
  const archGapMm = env.archRadius.known
    ? env.archRadius.value - state.dropMm - tire.radiusMm : null;

  limitations.push('Camber through travel is estimated from the architecture’s typical gain rate, not a measured kinematic curve for this car.');
  limitations.push('Steered conditions are not evaluated: no steering-axis geometry.');
  limitations.push('Results describe the discrete conditions listed, not continuous motion between them.');

  for (const cond of CONDITIONS) {
    const compression = state.remainingTravelMm * cond.frac;
    const camber = state.camberDeg + (gain * compression) / 10;
    const travelGrade = cond.frac > 0 ? state.travelGrade : 'manufacturer_documented';

    /* --- fender arch lip ---
       The opening is a circular arc of radius archR about the hub. The
       assembly is a solid of revolution, so a point at radius rho sweeps
       that whole arc. Points with rho < archR pass INSIDE the opening and
       can never reach the lip, however far outboard they sit. That is
       tuck, and it is why a short tyre under a tall arch stands proud of
       the bodywork without rubbing. */
    if (env.archRadius.known && env.archLateral.known) {
      const archR = env.archRadius.value - state.dropMm - compression;
      const lipX = env.archLateral.value + archCredit;
      const grade = worstGrade(env.archRadius.grade, env.archLateral.grade, tire.diameterGrade, state.camberGrade, travelGrade);
      const th = cond.frac > 0 ? THRESH.archDynamic : THRESH.archStatic;
      if (archR >= tire.radiusMm) {
        results.push({
          id: 'fender_lip', label: 'Fender arch lip', kind: 'clearance',
          cond: cond.id, condLabel: cond.label,
          verdict: formalise('clear', grade), modelled: 'clear', d: null, grade, th,
          note: 'Whole assembly stays inside the arch opening (lip radius ' + r2(archR, 0) + ' mm against tyre radius ' + r2(tire.radiusMm, 0) + ' mm). It cannot reach the lip in this condition.',
        });
      } else {
        let min = Infinity, atRho = 0;
        for (let i = 0; i <= 40; i++) {
          const rho = archR + (tire.radiusMm - archR) * (i / 40);
          const x = camberX(wheel.centrePlaneX + halfWidthAt(rho, tire, wheel.rimRadiusMm, wheel.overallWidthMm), rho, camber);
          const gap = lipX - x;
          if (gap < min) { min = gap; atRho = rho; }
        }
        results.push({
          id: 'fender_lip', label: 'Fender arch lip', kind: 'clearance',
          cond: cond.id, condLabel: cond.label,
          verdict: formalise(modelled(min, th), grade), modelled: modelled(min, th),
          d: r2(min, 1), grade, th,
          note: 'Closest approach at radius ' + r2(atRho, 0) + ' mm from the spin axis' + (archCredit ? ', including ' + archCredit + ' mm credited to the worked arch' : '') + '.',
        });
      }
    } else {
      results.push({ id: 'fender_lip', label: 'Fender arch lip', kind: 'clearance', cond: cond.id, condLabel: cond.label, verdict: 'indeterminate', modelled: 'indeterminate', d: null, grade: 'unknown', th: THRESH.archStatic, note: 'Arch position unknown. Measure lip-to-hub vertical and hub-face-to-lip lateral.' });
    }

    /* --- wheel well ceiling. The tyre tucks UP into the well above the
       lip, so the vertical ceiling is the top of the well, not the arch. */
    if (env.wellCeiling.known) {
      const d = env.wellCeiling.value - state.dropMm - compression - tire.radiusMm;
      const grade = worstGrade(env.wellCeiling.grade, tire.diameterGrade, travelGrade);
      results.push({ id: 'well_ceiling', label: 'Wheel well ceiling', kind: 'clearance', cond: cond.id, condLabel: cond.label, verdict: formalise(modelled(d, THRESH.well), grade), modelled: modelled(d, THRESH.well), d: r2(d, 1), grade, th: THRESH.well, note: 'Tread to the top of the well.' });
    } else {
      results.push({ id: 'well_ceiling', label: 'Wheel well ceiling', kind: 'clearance', cond: cond.id, condLabel: cond.label, verdict: 'indeterminate', modelled: 'indeterminate', d: null, grade: 'unknown', th: THRESH.well, note: 'Well ceiling height not recorded.' });
    }

    /* --- inner obstruction. Negative camber swings the inboard upper
       shoulder further inboard, so camber costs inner clearance even as it
       buys arch clearance. */
    if (env.innerDepth.known) {
      const rho = Math.min(150, tire.radiusMm);
      const halfAt = halfWidthAt(rho, tire, wheel.rimRadiusMm, wheel.overallWidthMm);
      const depth = -camberX(wheel.centrePlaneX - halfAt, rho, camber);
      const d = env.innerDepth.value - depth;
      const grade = worstGrade(env.innerDepth.grade, state.camberGrade);
      results.push({ id: 'inner', label: env.innerLabel, kind: 'clearance', cond: cond.id, condLabel: cond.label, verdict: formalise(modelled(d, THRESH.inner), grade), modelled: modelled(d, THRESH.inner), d: r2(d, 1), grade, th: THRESH.inner, note: 'Assembly reaches ' + r2(depth, 0) + ' mm inboard of the hub face; this component sits at ' + r2(env.innerDepth.value, 0) + ' mm. More offset moves toward it, less offset away.' });
    } else {
      results.push({ id: 'inner', label: env.innerLabel, kind: 'clearance', cond: cond.id, condLabel: cond.label, verdict: 'indeterminate', modelled: 'indeterminate', d: null, grade: 'unknown', th: THRESH.inner, note: 'Inner obstruction position not recorded.' });
    }
  }

  /* --- centre bore against the hub spigot. A sub-millimetre figure is the
     correct answer here, so no clearance floor applies to it. */
  if (env.hubSpigotDia) {
    const d = (env.centreBoreMm - env.hubSpigotDia) / 2;
    const m = d < 0 ? 'interference' : d < 0.1 ? 'marginal' : 'clear';
    results.push({ id: 'centre_bore', label: 'Centre bore to hub spigot', kind: 'fitment', cond: 'static', condLabel: 'Assembly', verdict: formalise(m, 'community_reported'), modelled: m, d: r2(d, 2), grade: 'community_reported', th: 0.1, note: d < 0 ? 'Centre bore is smaller than the hub spigot. The wheel will not seat; the bore must be machined or a different centre used.' : 'Clearance per side. A hub-centric ring is required above about 0.5 mm.' });
  }

  const clearanceResults = results.filter(r => r.kind === 'clearance' && r.d !== null);
  const binding = clearanceResults.length
    ? clearanceResults.reduce((a, b) => b.d < a.d ? b : a) : null;

  return {
    results, binding,
    overall: results.reduce((a, r) => worseV(a, r.verdict), 'clear'),
    overallModelled: results.reduce((a, r) => worseV(a, r.modelled), 'clear'),
    pokeMm: isFinite(pokeMm) ? r2(pokeMm, 1) : NaN,
    archGapMm: archGapMm === null ? null : r2(archGapMm, 1),
    widest: wp, limitations,
  };
}

/* ---- baseline comparison. No car geometry needed, so always exact. ---- */
function compareBaseline(pw, pt, bw, bt) {
  const a = widestPoint(pt, pw.rimRadiusMm, pw.overallWidthMm);
  const b = widestPoint(bt, bw.rimRadiusMm, bw.overallWidthMm);
  const pOut = pw.centrePlaneX + a.halfWidthMm, bOut = bw.centrePlaneX + b.halfWidthMm;
  const pIn = -(pw.centrePlaneX - a.halfWidthMm), bIn = -(bw.centrePlaneX - b.halfWidthMm);
  return {
    outboardMm: r2(pOut - bOut, 1),
    inboardMm: r2(pIn - bIn, 1),
    halfTrackMm: r2(-pw.etEffMm - -bw.etEffMm, 1),
    diameterMm: r2(pt.diameterMm - bt.diameterMm, 1),
    speedoPct: r2((pt.circumferenceMm / bt.circumferenceMm - 1) * 100, 2),
  };
}

/* ---- tyre size finder ---- */
const SECTIONS = [155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315,325,335,345];
const ASPECTS = [25,30,35,40,45,50,55,60,65,70,75,80];
function findTires(diameterIn, rimWidthIn, baselineTire, tolPct, wantClass, approvedOnly) {
  const out = [];
  for (const s of SECTIONS) for (const a of ASPECTS) {
    if (Math.abs(rimWidthIn - designRim(s, a)) > 2.0) continue;
    const t = mountTire(s, a, diameterIn, rimWidthIn);
    const dev = (t.circumferenceMm / baselineTire.circumferenceMm - 1) * 100;
    if (Math.abs(dev) > tolPct) continue;
    if (wantClass && wantClass !== 'any' && t.sidewall.k !== wantClass) continue;
    if (approvedOnly && (t.sidewall.k === 'aggressive' || t.sidewall.k === 'beyond_spec')) continue;
    out.push({ tire: t, dev: r2(dev, 2), score: Math.abs(dev) * 1.6 + Math.abs(t.stretchIn) * 0.4 });
  }
  return out.sort((x, y) => x.score - y.score).slice(0, 10);
}

/* ---- BUILD TO FIT. Constraints are never silently relaxed: a candidate
   that breaks one is rejected WITH ITS REASON. ---- */
const LIP_WIDTHS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const BARREL_WIDTHS = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
const PAD_DEPTHS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

function optimise(opts) {
  const { env, state, diameterIn, baselineWheel, baselineTire, goal, cons, archMod } = opts;
  const verified = [], unverified = [], rejected = [];
  let searched = 0;
  const effArch = cons.untouchedMetal ? 'untouched' : archMod;
  const spacers = cons.allowSpacers ? [0, 5, 10] : [0];

  for (const lip of LIP_WIDTHS) for (const barrel of BARREL_WIDTHS) for (const pad of PAD_DEPTHS) {
    const widthIn = r2(lip + barrel - mmToIn(MATE_MM * 2), 3);
    if (widthIn < cons.minWidthIn || widthIn > cons.maxWidthIn) continue;
    const tires = findTires(diameterIn, widthIn, baselineTire, cons.maxSpeedoPct, 'any', cons.noStretch);
    for (const tc of tires.slice(0, 4)) for (const spacerMm of spacers) {
      searched++;
      const asm = assemble({ construction: 'three_piece', diameterIn, lipIn: lip, barrelIn: barrel, padDepthIn: pad, spacerMm, mount: 'front_mount', targetEtMm: null });
      if (!asm.wheel) continue;
      const cl = analyse(env, asm.wheel, tc.tire, state, effArch);
      const delta = compareBaseline(asm.wheel, tc.tire, baselineWheel, baselineTire);
      const id = [lip, barrel, pad, tc.tire.section + '/' + tc.tire.aspect, 'sp' + spacerMm].join('|');

      const violations = [];
      if (cons.noStretch && (tc.tire.sidewall.k === 'aggressive' || tc.tire.sidewall.k === 'beyond_spec'))
        violations.push('Sidewall is ' + tc.tire.sidewall.label.toLowerCase() + ' and stretched tyres are excluded.');
      if (!cons.allowSpacers && spacerMm > 0) violations.push('Spacers are excluded.');
      if (Math.abs(delta.speedoPct) > cons.maxSpeedoPct) violations.push('Speedometer deviation ' + delta.speedoPct + '% exceeds the ' + cons.maxSpeedoPct + '% limit.');
      const relevant = cl.results.filter(r => r.kind === 'clearance' && (cons.drivingUse || r.cond === 'static'));
      for (const r of relevant) {
        if (r.modelled === 'interference') { violations.push('Predicted contact at ' + r.label + ' (' + r.condLabel + ').'); continue; }
        if (r.d !== null && r.d < cons.minClearanceMm) violations.push(r.label + ' at ' + r.d + ' mm is under the ' + cons.minClearanceMm + ' mm minimum (' + r.condLabel + ').');
      }
      const allVerified = relevant.length > 0 && relevant.every(r => isVerified(r.grade));
      if (cons.verifiedOnly && !allVerified) violations.push('Governing geometry is not verified, and verified-only was requested.');

      if (violations.length) { rejected.push({ id, violations }); continue; }

      const evaluable = relevant.filter(r => r.d !== null);
      const worst = evaluable.length ? evaluable.reduce((a, b) => b.d < a.d ? b : a) : null;
      const poke = isFinite(cl.pokeMm) ? cl.pokeMm : 0;
      const wd = worst ? worst.d : 0;
      const stretch = Math.abs(tc.tire.stretchIn);
      let score;
      switch (goal) {
        case 'conservative': score = wd * 2.5 - Math.max(0, poke) * 2 - stretch * 18; break;
        case 'oem_plus':     score = wd * 1.2 - Math.abs(poke + 8) * 1.6 - stretch * 10 + widthIn * 2; break;
        case 'flush':        score = 42 - Math.abs(poke + 3) * 4 + wd * 0.5 - stretch * 6; break;
        case 'max_lip':      score = asm.exposedLipIn * 16 + wd * 0.35 - stretch * 4; break;
        case 'max_width':    score = widthIn * 11 + wd * 0.3 - stretch * 3; break;
        default:             score = asm.exposedLipIn * 9 + widthIn * 5 - Math.max(0, -poke) * 0.6;
      }
      const tradeoffs = [];
      if (poke > 5) tradeoffs.push(r2(poke, 0) + ' mm proud of the bodywork.');
      if (poke < -25) tradeoffs.push(r2(-poke, 0) + ' mm tucked inside the arch, narrow-looking for the diameter.');
      if (tc.tire.sidewall.k === 'mild') tradeoffs.push('Flange stands proud of the sidewall, so the lip takes kerb strikes.');
      if (asm.exposedLipIn < 0.75) tradeoffs.push('Very little visible lip for a multipiece build.');
      if (asm.exposedLipIn > 4.5) tradeoffs.push('Lip over 4.5 inch needs a stepped or welded outer.');
      if (spacerMm > 0) tradeoffs.push('Requires a ' + spacerMm + ' mm spacer, adding a stacked interface and longer bolts.');

      const cand = { id, lip, barrel, pad, spacerMm, asm, tire: tc.tire, cl, delta,
        verdict: cl.overall, worstD: worst ? worst.d : null, binding: worst ? worst.label : null,
        verified: allVerified && cl.overall === 'clear', score: r2(score, 2), tradeoffs };
      (cand.verified ? verified : unverified).push(cand);
    }
  }
  const by = (a, b) => b.score - a.score;
  verified.sort(by); unverified.sort(by);
  return { verified: verified.slice(0, 6), unverified: unverified.slice(0, 6), rejected: rejected.slice(0, 40), searched };
}

/* ============================================================
   VEHICLE LIBRARY

   Entries with a factory package get an ESTIMATED envelope, anchored so
   the factory wheel reads correctly: arch radius = factory tyre radius +
   factory gap; lip lateral = factory assembly's widest point + tuck. That
   makes the preset self-consistent without pretending it was measured on
   a car. Every one is graded `estimated`, and the solver will not return
   a green verdict from it.

   Entries without a factory package carry no geometry at all. They are
   names in a picker, and they say so.

   Bolt patterns and centre bores are graded `community_reported`: well
   established in the enthusiast record, not transcribed from a factory
   document held here.
   ============================================================ */
const V = (o) => o;
const VEHICLES = [
  // ---- BMW ----
  V({ id:'e10', make:'BMW', chassis:'E10', model:'2002', years:'1966-76', bolt:[4,100], bore:57.1, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:4.5, d:13, et:6, sec:165, asp:80 }, gapF:78, tuckF:30, innerF:132, travF:95, gapR:80, tuckR:34, innerR:142, travR:100 }),
  V({ id:'e21', make:'BMW', chassis:'E21', model:'320i', years:'1975-83', bolt:[4,100], bore:57.1, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:5, d:13, et:18, sec:185, asp:70 }, gapF:74, tuckF:28, innerF:140, travF:90, gapR:76, tuckR:32, innerR:150, travR:95 }),
  V({ id:'e30', make:'BMW', chassis:'E30', model:'325i', years:'1982-94', bolt:[4,100], bore:57.1, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:6, d:14, et:42, sec:195, asp:65 }, gapF:68, tuckF:32, innerF:165, travF:80, gapR:70, tuckR:37, innerR:180, travR:85,
      notes:['Rear is a semi-trailing arm: it gains camber fast as it drops, around -1.7 deg at 60 mm. Rear fitment is governed by that, not by offset.'] }),
  V({ id:'e30m3', make:'BMW', chassis:'E30', model:'M3', years:'1986-91', bolt:[4,100], bore:57.1, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:7, d:15, et:24, sec:205, asp:55 }, gapF:62, tuckF:16, innerF:165, travF:78, gapR:64, tuckR:20, innerR:180, travR:82,
      notes:['Flared arches. The envelope differs substantially from a standard E30 and must be measured separately.'] }),
  V({ id:'e28', make:'BMW', chassis:'E28', model:'535i', years:'1981-88', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:6.5, d:14, et:20, sec:195, asp:70 }, gapF:72, tuckF:24, innerF:162, travF:85, gapR:74, tuckR:28, innerR:176, travR:90 }),
  V({ id:'e24', make:'BMW', chassis:'E24', model:'635 CSi', years:'1976-89', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:6.5, d:14, et:20, sec:205, asp:70 }, gapF:70, tuckF:22, innerF:162, travF:85, gapR:72, tuckR:26, innerR:176, travR:90 }),
  V({ id:'e34', make:'BMW', chassis:'E34', model:'535i', years:'1988-96', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:7, d:15, et:20, sec:205, asp:65 }, gapF:70, tuckF:22, innerF:168, travF:88, gapR:72, tuckR:27, innerR:182, travR:92 }),
  V({ id:'e32', make:'BMW', chassis:'E32', model:'735i', years:'1986-94', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:7, d:15, et:20, sec:225, asp:60 }, gapF:70, tuckF:20, innerF:168, travF:85, gapR:72, tuckR:26, innerR:182, travR:90 }),
  V({ id:'e36', make:'BMW', chassis:'E36', model:'328i', years:'1990-2000', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'multilink',
      pkg:{ w:7, d:15, et:47, sec:205, asp:60 }, gapF:66, tuckF:30, innerF:172, travF:82, gapR:68, tuckR:34, innerR:186, travR:88,
      notes:['High factory offset. E36 wheels on an earlier chassis pull INBOARD toward the strut, not outboard.'] }),
  V({ id:'e9',  make:'BMW', chassis:'E9',  model:'3.0 CS', years:'1968-75', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:6, d:14, et:12, sec:195, asp:70 }, gapF:74, tuckF:20, innerF:150, travF:88, gapR:76, tuckR:24, innerR:162, travR:92 }),
  V({ id:'e12', make:'BMW', chassis:'E12', model:'528i', years:'1972-81', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm' }),
  V({ id:'e23', make:'BMW', chassis:'E23', model:'735i', years:'1977-86', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'semi_trailing_arm' }),
  V({ id:'e31', make:'BMW', chassis:'E31', model:'850i', years:'1989-99', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'multilink' }),
  V({ id:'e38', make:'BMW', chassis:'E38', model:'740i', years:'1994-2001', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'multilink' }),
  V({ id:'e39', make:'BMW', chassis:'E39', model:'540i', years:'1995-2003', bolt:[5,120], bore:74.1, fa:'double_wishbone', ra:'multilink' }),
  V({ id:'e46', make:'BMW', chassis:'E46', model:'M3', years:'2000-06', bolt:[5,120], bore:72.56, fa:'macpherson_strut', ra:'multilink' }),

  // ---- Mercedes-Benz ----
  V({ id:'w108', make:'Mercedes-Benz', chassis:'W108', model:'280 SE', years:'1965-72', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'swing_axle_low_pivot',
      pkg:{ w:6, d:14, et:30, sec:185, asp:80 }, gapF:80, tuckF:26, innerF:150, travF:95, gapR:82, tuckR:30, innerR:160, travR:100,
      notes:['LOW-PIVOT SWING AXLE at the rear. Lowering pushes the TOP of the rear tyres OUTBOARD, so arch clearance gets WORSE as it goes down. Do not reason about this car from any other chassis here.'] }),
  V({ id:'w113', make:'Mercedes-Benz', chassis:'W113', model:'280 SL Pagoda', years:'1963-71', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'swing_axle_low_pivot',
      pkg:{ w:6, d:14, et:30, sec:185, asp:80 }, gapF:76, tuckF:24, innerF:148, travF:90, gapR:78, tuckR:28, innerR:158, travR:95,
      notes:['Low-pivot swing axle. Same warning as the W108: it gains POSITIVE camber as you lower it.'] }),
  V({ id:'w123', make:'Mercedes-Benz', chassis:'W123', model:'280 CE', years:'1976-85', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'semi_trailing_arm',
      pkg:{ w:5.5, d:14, et:30, sec:195, asp:70 }, gapF:78, tuckF:30, innerF:158, travF:92, gapR:80, tuckR:35, innerR:170, travR:96 }),
  V({ id:'w124', make:'Mercedes-Benz', chassis:'W124', model:'300 E', years:'1984-95', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'multilink',
      pkg:{ w:6.5, d:15, et:37, sec:195, asp:65 }, gapF:72, tuckF:28, innerF:166, travF:88, gapR:74, tuckR:32, innerR:178, travR:92 }),
  V({ id:'w126', make:'Mercedes-Benz', chassis:'C126', model:'560 SEC', years:'1979-91', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'semi_trailing_arm',
      pkg:{ w:6.5, d:15, et:25, sec:205, asp:65 }, gapF:72, tuckF:22, innerF:166, travF:90, gapR:74, tuckR:27, innerR:180, travR:95 }),
  V({ id:'w201', make:'Mercedes-Benz', chassis:'W201', model:'190 E 2.3-16', years:'1982-93', bolt:[5,112], bore:66.6, fa:'macpherson_strut', ra:'multilink',
      pkg:{ w:7, d:15, et:44, sec:205, asp:55 }, gapF:64, tuckF:22, innerF:170, travF:80, gapR:66, tuckR:26, innerR:182, travR:85 }),
  V({ id:'r107', make:'Mercedes-Benz', chassis:'R107', model:'560 SL', years:'1971-89', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'semi_trailing_arm',
      pkg:{ w:6, d:14, et:30, sec:205, asp:70 }, gapF:74, tuckF:24, innerF:158, travF:88, gapR:76, tuckR:29, innerR:170, travR:92 }),
  V({ id:'w114', make:'Mercedes-Benz', chassis:'W114', model:'250 C', years:'1968-76', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'semi_trailing_arm' }),
  V({ id:'w116', make:'Mercedes-Benz', chassis:'W116', model:'450 SEL', years:'1972-80', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'semi_trailing_arm' }),
  V({ id:'w140', make:'Mercedes-Benz', chassis:'W140', model:'600 SEL', years:'1991-98', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'multilink' }),
  V({ id:'r129', make:'Mercedes-Benz', chassis:'R129', model:'500 SL', years:'1989-2001', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'multilink' }),
  V({ id:'w202', make:'Mercedes-Benz', chassis:'W202', model:'C 36 AMG', years:'1993-2000', bolt:[5,112], bore:66.6, fa:'double_wishbone', ra:'multilink' }),

  // ---- Porsche ----
  V({ id:'911lwb', make:'Porsche', chassis:'901 LWB', model:'911 S', years:'1969-73', bolt:[5,130], bore:71.6, fa:'strut_torsion_bar', ra:'semi_trailing_arm',
      pkg:{ w:6, d:15, et:36, sec:185, asp:70 }, gapF:62, tuckF:20, innerF:150, travF:80, gapR:60, tuckR:16, innerR:168, travR:84 }),
  V({ id:'911sc', make:'Porsche', chassis:'G-body', model:'911 SC', years:'1974-83', bolt:[5,130], bore:71.6, fa:'strut_torsion_bar', ra:'semi_trailing_arm',
      pkg:{ w:6, d:15, et:36, sec:185, asp:70 }, pkgR:{ w:7, d:15, et:23.3, sec:215, asp:60 },
      gapF:60, tuckF:18, innerF:150, travF:78, gapR:58, tuckR:14, innerR:170, travR:82,
      notes:['Staggered from the factory: 6J ET36 front, 7J ET23.3 rear. Configure the axles independently.'] }),
  V({ id:'930', make:'Porsche', chassis:'930', model:'911 Turbo', years:'1975-89', bolt:[5,130], bore:71.6, fa:'strut_torsion_bar', ra:'semi_trailing_arm',
      pkg:{ w:7, d:16, et:23.3, sec:205, asp:55 }, pkgR:{ w:8, d:16, et:10.6, sec:245, asp:45 },
      gapF:56, tuckF:14, innerF:152, travF:72, gapR:54, tuckR:10, innerR:178, travR:76,
      notes:['Wide-body arches, heavily staggered. Front and rear envelopes are very different.'] }),
  V({ id:'964', make:'Porsche', chassis:'964', model:'Carrera 2', years:'1989-94', bolt:[5,130], bore:71.6, fa:'strut_torsion_bar', ra:'multilink',
      pkg:{ w:6, d:16, et:52, sec:205, asp:55 }, pkgR:{ w:8, d:16, et:52, sec:225, asp:50 },
      gapF:58, tuckF:22, innerF:176, travF:75, gapR:56, tuckR:20, innerR:196, travR:80,
      notes:['Much higher factory offset than the G-body, and a coil-spring rear rather than torsion bars. Do not carry G-body numbers across.'] }),
  V({ id:'944t', make:'Porsche', chassis:'944', model:'944 Turbo', years:'1985-91', bolt:[5,130], bore:71.6, fa:'macpherson_strut', ra:'semi_trailing_arm',
      pkg:{ w:7, d:16, et:23.3, sec:205, asp:55 }, pkgR:{ w:8, d:16, et:23.3, sec:225, asp:50 },
      gapF:58, tuckF:16, innerF:158, travF:76, gapR:56, tuckR:14, innerR:176, travR:80 }),
  V({ id:'928', make:'Porsche', chassis:'928', model:'928 S4', years:'1977-95', bolt:[5,130], bore:71.6, fa:'double_wishbone', ra:'multilink',
      pkg:{ w:8, d:16, et:23.3, sec:225, asp:50 }, gapF:58, tuckF:14, innerF:162, travF:78, gapR:56, tuckR:12, innerR:180, travR:82,
      notes:['Weissach rear axle. Its toe-correcting geometry is not captured by a generic multi-link gain rate.'] }),
  V({ id:'993', make:'Porsche', chassis:'993', model:'911 Carrera', years:'1994-98', bolt:[5,130], bore:71.6, fa:'strut_torsion_bar', ra:'multilink' }),
  V({ id:'996', make:'Porsche', chassis:'996', model:'911 Carrera', years:'1997-2005', bolt:[5,130], bore:71.6, fa:'macpherson_strut', ra:'multilink' }),
  V({ id:'924', make:'Porsche', chassis:'924', model:'924', years:'1976-88', bolt:[5,130], bore:71.6, fa:'macpherson_strut', ra:'semi_trailing_arm' }),
  V({ id:'968', make:'Porsche', chassis:'968', model:'968', years:'1991-95', bolt:[5,130], bore:71.6, fa:'macpherson_strut', ra:'semi_trailing_arm' }),
  V({ id:'986', make:'Porsche', chassis:'986', model:'Boxster S', years:'1996-2004', bolt:[5,130], bore:71.6, fa:'macpherson_strut', ra:'multilink' }),
];

const FACES = [
  { id:'mesh',   name:'Classic Mesh',          arch:'mesh',        n:24, hub:0.26, note:'Dense cross-lattice. Period-correct on a 1980s saloon, and it hides a deep lip well.' },
  { id:'five',   name:'Heritage Five-Spoke',   arch:'five_spoke',  n:5,  hub:0.30, note:'Broad flat spokes, large windows. Shows brake hardware, so caliper finish matters.' },
  { id:'split',  name:'Split-Spoke',           arch:'split_spoke', n:10, hub:0.24, note:'Paired spokes reading as five from a distance.' },
  { id:'twenty', name:'Touring Twenty-Spoke',  arch:'multi_spoke', n:20, hub:0.28, note:'Thin radial spokes, nearly flat face. The quietest option against a polished lip.' },
  { id:'turbine',name:'Turbine',               arch:'turbine',     n:12, hub:0.34, note:'Swept vanes, small windows. Nearly closed, so brake cooling is worth checking.' },
  { id:'forged', name:'Classic Forged',        arch:'five_spoke',  n:5,  hub:0.22, note:'Deeply concave five-spoke. Needs shallow pad depth, which drives offset low: check inner clearance first.' },
];

const FINISHES = [
  { id:'polished', label:'Polished aluminium', hex:'#cfd6dd' },
  { id:'brushed',  label:'Brushed aluminium',  hex:'#b7bfc7' },
  { id:'champagne',label:'Champagne gold',     hex:'#cdae78' },
  { id:'gold',     label:'Soft gold',          hex:'#c9a063' },
  { id:'bronze',   label:'Bronze',             hex:'#9c7b4e' },
  { id:'gunmetal', label:'Gunmetal',           hex:'#5b636b' },
  { id:'satin',    label:'Satin black',        hex:'#24282c' },
  { id:'white',    label:'Motorsport white',   hex:'#e8eaec' },
];

/* ============================================================
   STATE
   ============================================================ */
const S = {
  vehicleId: 'e30',
  axle: 'front',
  pkg: 'factory',
  dropF: 50, dropR: 55,
  camberF: '', camberR: '',
  archMod: 'rolled',
  view: 'section',
  front: { construction:'three_piece', d:16, lip:3.0, barrel:5.0, shell:8.0, pad:3.5, mount:'front_mount', spacer:0, sec:205, asp:45, targetEt:20, face:'mesh', faceFin:'gold', lipFin:'polished' },
  rear:  { construction:'three_piece', d:16, lip:3.5, barrel:5.5, shell:9.0, pad:3.5, mount:'front_mount', spacer:0, sec:225, asp:45, targetEt:15, face:'mesh', faceFin:'gold', lipFin:'polished' },
  measF: { arch:'', lip:'', inner:'', trav:'' },
  measR: { arch:'', lip:'', inner:'', trav:'' },
  goal: 'conservative',
  cons: { untouchedMetal:false, allowSpacers:false, noStretch:true, drivingUse:true, verifiedOnly:false, minClearanceMm:10, maxSpeedoPct:3, minWidthIn:7, maxWidthIn:10 },
};
const veh = () => VEHICLES.find(v => v.id === S.vehicleId) || VEHICLES[0];
const cfg = () => S[S.axle];
const meas = () => S.axle === 'front' ? S.measF : S.measR;

/* Build the corner envelope. Measured values override the preset and are
   graded as user measurements, with traceability. */
function envelope(axle) {
  const v = veh();
  const m = axle === 'front' ? S.measF : S.measR;
  const pk = axle === 'rear' ? (v.pkgR || v.pkg) : v.pkg;
  const label = axle === 'front' ? 'Strut body / spring' : 'Trailing arm / spring';
  const arch = axle === 'front' ? v.fa : v.ra;
  const bump = (axle === 'front' ? v.travF : v.travR) || 85;

  let aR = { known:false, grade:'unknown', value:NaN };
  let aL = { known:false, grade:'unknown', value:NaN };
  let wC = { known:false, grade:'unknown', value:NaN };
  let iD = { known:false, grade:'unknown', value:NaN };

  if (pk) {
    const bt = mountTire(pk.sec, pk.asp, pk.d, pk.w);
    const bw = resolveWheel(pk.w, pk.d, pk.et);
    const bwp = widestPoint(bt, bw.rimRadiusMm, bw.overallWidthMm);
    const gap = axle === 'front' ? v.gapF : v.gapR;
    const tuck = axle === 'front' ? v.tuckF : v.tuckR;
    const inner = axle === 'front' ? v.innerF : v.innerR;
    if (gap != null) {
      aR = { known:true, grade:'estimated', value: bt.radiusMm + gap };
      aL = { known:true, grade:'estimated', value: bw.centrePlaneX + bwp.halfWidthMm + tuck };
      wC = { known:true, grade:'estimated', value: bt.radiusMm + gap + 115 };
      iD = { known:true, grade:'estimated', value: inner };
    }
  }
  // user measurements win, and are traced as such
  if (m.arch !== '')  aR = { known:true, grade:'community_reported', value:Number(m.arch) };
  if (m.lip !== '')   aL = { known:true, grade:'community_reported', value:Number(m.lip) };
  if (m.inner !== '') iD = { known:true, grade:'community_reported', value:Number(m.inner) };

  return {
    architecture: arch, innerLabel: label, bumpTravelMm: bump,
    archRadius: aR, archLateral: aL, wellCeiling: wC, innerDepth: iD,
    centreBoreMm: v.bore, hubSpigotDia: null,
    baselinePkg: pk,
  };
}

function derive(axle) {
  const c = S[axle];
  const v = veh();
  const env = envelope(axle);
  const m = axle === 'front' ? S.measF : S.measR;
  const drop = axle === 'front' ? S.dropF : S.dropR;
  const camberOv = axle === 'front' ? S.camberF : S.camberR;

  const asm = assemble({
    construction: c.construction, diameterIn: c.d,
    lipIn: c.lip, barrelIn: c.barrel, shellIn: c.shell,
    padDepthIn: c.pad, spacerMm: c.spacer, mount: c.mount, targetEtMm: c.targetEt,
  });
  const tire = mountTire(c.sec, c.asp, c.d, asm.achievedWidthIn);
  const st = cornerState(env.architecture, S.pkg, drop, 0, camberOv, m.trav, env.bumpTravelMm);
  const cl = analyse(env, asm.wheel, tire, st, S.archMod);

  let baseWheel = null, baseTire = null, delta = null;
  if (env.baselinePkg) {
    const p = env.baselinePkg;
    baseWheel = resolveWheel(p.w, p.d, p.et);
    baseTire = mountTire(p.sec, p.asp, p.d, p.w);
    delta = compareBaseline(asm.wheel, tire, baseWheel, baseTire);
  }
  return { cfg:c, veh:v, env, asm, tire, state:st, cl, delta, baseWheel, baseTire };
}

/* ============================================================
   SVG DRAWINGS — all generated from the engine's numbers
   ============================================================ */
const svgEl = (s) => s;
const fmt = (n, d) => Number(n).toFixed(d === undefined ? 0 : d);

/* --- 1. Transverse cross-section through the axle, with dimensions.
   This is the engineering view: rim, tyre, arch, strut, clearances. --- */
function drawSection(A) {
  const { asm, tire, cl, env, state } = A;
  const w = asm.wheel;
  const W = 860, H = 580;
  const archR = env.archRadius.known ? env.archRadius.value - state.dropMm : null;
  const topMm = Math.max(archR !== null ? archR + 40 : 0, tire.radiusMm + 40);
  const spanY = topMm + tire.radiusMm + 30;
  const spanX = Math.max(w.overallWidthMm, tire.sectionMm) + (env.innerDepth.known ? env.innerDepth.value : 160) + 220;
  const sc = Math.min((H - 90) / spanY, (W - 220) / spanX);
  const cx = 330, cy = 60 + (topMm * sc);
  const X = mm => cx + mm * sc, Y = mm => cy - mm * sc;

  const cam = state.camberDeg;
  const px = (lat, rho) => X(camberX(lat, rho, cam));
  const py = (lat, rho) => Y(camberX(rho, -lat, cam) * 0 + (rho * Math.cos(cam * Math.PI / 180) - lat * Math.sin(cam * Math.PI / 180)));

  // tyre cross-section: upper and lower, outer + inner sidewall
  function tyrePath(sign) {
    const pts = [];
    const r0 = w.rimRadiusMm, r1 = tire.radiusMm, N = 16;
    for (let i = 0; i <= N; i++) {
      const rho = sign * (r0 + (r1 - r0) * (i / N));
      const h = halfWidthAt(rho, tire, r0, w.overallWidthMm);
      pts.push([px(w.centrePlaneX - h, rho), py(w.centrePlaneX - h, rho)]);
    }
    const rt = sign * r1, th = tire.treadWidthMm / 2;
    pts.push([px(w.centrePlaneX - th, rt), py(w.centrePlaneX - th, rt)]);
    pts.push([px(w.centrePlaneX + th, rt), py(w.centrePlaneX + th, rt)]);
    for (let i = N; i >= 0; i--) {
      const rho = sign * (r0 + (r1 - r0) * (i / N));
      const h = halfWidthAt(rho, tire, r0, w.overallWidthMm);
      pts.push([px(w.centrePlaneX + h, rho), py(w.centrePlaneX + h, rho)]);
    }
    return 'M' + pts.map(p => fmt(p[0], 1) + ',' + fmt(p[1], 1)).join('L') + 'Z';
  }

  // rim barrel, upper and lower
  function rimPath(sign) {
    const R = w.rimRadiusMm, fl = R + 5, dr = R - 22;
    const ib = w.innerFlangeX + w.flangeInnerMm, ob = w.outerFlangeX - w.flangeOuterMm;
    const seq = [[fl, w.innerFlangeX], [R, w.innerFlangeX + 1], [R, ib], [dr, ib + 10],
                 [dr, ob - 14], [R, ob], [R, w.outerFlangeX - 1], [fl, w.outerFlangeX]];
    const pts = seq.map(([r, lat]) => [px(lat, sign * r), py(lat, sign * r)]);
    const inner = seq.slice().reverse().map(([r, lat]) => {
      const rr = sign * (r - 9);
      return [px(lat, rr), py(lat, rr)];
    });
    return 'M' + pts.concat(inner).map(p => fmt(p[0], 1) + ',' + fmt(p[1], 1)).join('L') + 'Z';
  }

  const archVerdict = (cl.results.find(r => r.id === 'fender_lip' && r.cond === 'static') || {}).verdict || 'indeterminate';
  const innerVerdict = (cl.results.find(r => r.id === 'inner' && r.cond === 'static') || {}).verdict || 'indeterminate';
  const vcol = v => 'var(--' + (v === 'clear' ? 'ok' : v === 'marginal' ? 'warn' : v === 'interference' ? 'bad' : 'gray') + ')';

  let s = '';
  s += '<defs>'
    + '<linearGradient id="met" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#e3e9ef"/><stop offset=".45" stop-color="#9aa5b0"/>'
    + '<stop offset=".55" stop-color="#c3ccd4"/><stop offset="1" stop-color="#78828d"/></linearGradient>'
    + '</defs>';

  // ground
  const groundY = py(0, -tire.radiusMm);
  s += '<line x1="40" y1="' + fmt(groundY, 1) + '" x2="' + (W - 30) + '" y2="' + fmt(groundY, 1) + '" stroke="var(--line2)" stroke-width="1.5"/>';
  s += '<text x="44" y="' + fmt(groundY + 15, 1) + '" class="dim">GROUND</text>';

  // fender arch: arc of radius archR about the hub, lip at archLateral
  if (archR !== null && env.archLateral.known) {
    const lipX = env.archLateral.value + (ARCH_GAIN[S.archMod] || 0);
    const r = archR * sc;
    s += '<path d="M' + fmt(X(lipX) - r * 0.92, 1) + ',' + fmt(cy - r * 0.39, 1)
      + ' A' + fmt(r, 1) + ',' + fmt(r, 1) + ' 0 0 1 ' + fmt(X(lipX) + r * 0.2, 1) + ',' + fmt(cy - r * 0.98, 1)
      + '" fill="none" stroke="' + vcol(archVerdict) + '" stroke-width="3" stroke-linecap="round" opacity=".5"/>';
    // the lip itself, at the top of the arch
    s += '<circle cx="' + fmt(X(lipX), 1) + '" cy="' + fmt(Y(archR), 1) + '" r="5" fill="' + vcol(archVerdict) + '"/>';
    s += '<line x1="' + fmt(X(lipX), 1) + '" y1="' + fmt(Y(archR), 1) + '" x2="' + (W - 150) + '" y2="' + fmt(Y(archR), 1) + '" stroke="var(--line2)" stroke-width=".8" stroke-dasharray="3 3"/>';
    s += '<text x="' + (W - 146) + '" y="' + fmt(Y(archR) - 5, 1) + '" class="dim">FENDER LIP</text>';
    s += '<text x="' + (W - 146) + '" y="' + fmt(Y(archR) + 10, 1) + '" class="dim2">' + fmt(archR) + ' mm from hub</text>';
    // wheel well ceiling
    if (env.wellCeiling.known) {
      const wc = env.wellCeiling.value - state.dropMm;
      s += '<line x1="' + fmt(X(lipX) - 150, 1) + '" y1="' + fmt(Y(wc), 1) + '" x2="' + fmt(X(lipX) + 30, 1) + '" y2="' + fmt(Y(wc), 1) + '" stroke="var(--line2)" stroke-width="2" opacity=".55"/>';
      s += '<text x="' + fmt(X(lipX) - 148, 1) + '" y="' + fmt(Y(wc) - 6, 1) + '" class="dim">WELL CEILING</text>';
    }
  }

  // inner obstruction
  if (env.innerDepth.known) {
    const d = env.innerDepth.value;
    const x0 = X(-d), x1 = X(-d + 44);
    const yTop = Y(215), yBot = Y(60);
    s += '<rect x="' + fmt(x0, 1) + '" y="' + fmt(yTop, 1) + '" width="' + fmt(x1 - x0, 1) + '" height="' + fmt(yBot - yTop, 1) + '" rx="5" fill="' + vcol(innerVerdict) + '" opacity=".3" stroke="' + vcol(innerVerdict) + '" stroke-width="1.5"/>';
    s += '<text x="' + fmt(x0 + 3, 1) + '" y="' + fmt(yTop - 7, 1) + '" class="dim">' + (S.axle === 'front' ? 'STRUT' : 'ARM') + '</text>';
  }

  // tyre then rim, lower first so the upper reads on top
  s += '<path d="' + tyrePath(-1) + '" fill="var(--rubber)" stroke="var(--line2)" stroke-width="1"/>';
  s += '<path d="' + tyrePath(1) + '" fill="var(--rubber)" stroke="var(--line2)" stroke-width="1"/>';
  s += '<path d="' + rimPath(-1) + '" fill="url(#met)" stroke="var(--line2)" stroke-width=".8"/>';
  s += '<path d="' + rimPath(1) + '" fill="url(#met)" stroke="var(--line2)" stroke-width=".8"/>';

  // hub mounting plane and wheel centre plane
  s += '<line x1="' + fmt(X(0), 1) + '" y1="' + fmt(cy - 150, 1) + '" x2="' + fmt(X(0), 1) + '" y2="' + fmt(cy + 150, 1) + '" stroke="var(--gold)" stroke-width="1.6" stroke-dasharray="7 4"/>';
  s += '<text x="' + fmt(X(0) + 5, 1) + '" y="' + fmt(cy + 164, 1) + '" class="dimg">HUB FACE  x=0</text>';
  s += '<line x1="' + fmt(X(w.centrePlaneX), 1) + '" y1="' + fmt(cy - 120, 1) + '" x2="' + fmt(X(w.centrePlaneX), 1) + '" y2="' + fmt(cy + 120, 1) + '" stroke="var(--fg2)" stroke-width="1" stroke-dasharray="2 4"/>';
  s += '<text x="' + fmt(X(w.centrePlaneX) - 4, 1) + '" y="' + fmt(cy + 134, 1) + '" class="dim" text-anchor="end">CENTRE PLANE</text>';

  // hub centre
  s += '<circle cx="' + fmt(X(0), 1) + '" cy="' + fmt(cy, 1) + '" r="3.5" fill="var(--gold)"/>';

  // dimension: backspacing
  const dimY = cy + 196;
  s += '<line x1="' + fmt(X(w.innerFlangeX), 1) + '" y1="' + fmt(dimY, 1) + '" x2="' + fmt(X(0), 1) + '" y2="' + fmt(dimY, 1) + '" stroke="var(--fg2)" stroke-width="1" marker-start="url(#ar)" marker-end="url(#ar)"/>';
  s += '<text x="' + fmt((X(w.innerFlangeX) + X(0)) / 2, 1) + '" y="' + fmt(dimY - 6, 1) + '" class="dimg" text-anchor="middle">BS ' + fmt(w.backspacingIn, 2) + '"</text>';
  const dimY2 = cy + 218;
  s += '<line x1="' + fmt(X(0), 1) + '" y1="' + fmt(dimY2, 1) + '" x2="' + fmt(X(w.outerFlangeX), 1) + '" y2="' + fmt(dimY2, 1) + '" stroke="var(--fg2)" stroke-width="1"/>';
  s += '<text x="' + fmt((X(0) + X(w.outerFlangeX)) / 2, 1) + '" y="' + fmt(dimY2 + 13, 1) + '" class="dimg" text-anchor="middle">FS ' + fmt(w.frontspacingIn, 2) + '"  (lip ' + fmt(asm.exposedLipIn, 2) + '")</text>';

  s += '<text x="' + (W - 30) + '" y="' + (H - 12) + '" class="dim2" text-anchor="end">camber ' + fmt(state.camberDeg, 2) + '° · outboard →</text>';
  s += '<text x="40" y="26" class="dimg">TRANSVERSE SECTION THROUGH THE AXLE · ' + S.axle.toUpperCase() + '</text>';
  s += '<text x="40" y="42" class="dim2">' + fmt(asm.achievedWidthIn, 1) + 'J×' + A.cfg.d + ' ET' + fmt(asm.achievedEtMm) + ' · ' + A.cfg.sec + '/' + A.cfg.asp + 'R' + A.cfg.d + '</text>';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Transverse cross-section of the wheel and tyre against the fender arch and inner obstruction">'
    + '<defs><marker id="ar" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">'
    + '<path d="M0,1 L6,3.5 L0,6" fill="none" stroke="var(--fg2)" stroke-width="1"/></marker></defs>'
    + s + '</svg>';
}

/* --- 2. Head-on arch view: what the fitment actually looks like. --- */
function drawArch(A) {
  const { asm, tire, cl, env, state } = A;
  const w = asm.wheel;
  const W = 860, H = 580;
  const archR = env.archRadius.known ? env.archRadius.value - state.dropMm : null;
  const topMm = Math.max(archR !== null ? archR + 60 : tire.radiusMm + 90, tire.radiusMm + 90);
  const sc = Math.min((H - 80) / (topMm + tire.radiusMm + 20), (W - 120) / 900);
  const cx = W / 2, cy = 50 + topMm * sc;
  const groundY = cy + tire.radiusMm * sc;
  const cam = state.camberDeg;

  const archVerdict = (cl.results.find(r => r.id === 'fender_lip' && r.cond === 'static') || {}).verdict || 'indeterminate';
  const vcol = v => 'var(--' + (v === 'clear' ? 'ok' : v === 'marginal' ? 'warn' : v === 'interference' ? 'bad' : 'gray') + ')';

  let s = '';
  // body + arch opening
  if (archR !== null) {
    const r = archR * sc;
    s += '<path d="M' + fmt(cx - 400, 1) + ',' + fmt(groundY, 1)
      + ' L' + fmt(cx - 400, 1) + ',' + fmt(cy - r * 0.2, 1)
      + ' A' + fmt(r, 1) + ',' + fmt(r, 1) + ' 0 0 1 ' + fmt(cx + r, 1) + ',' + fmt(cy, 1)
      + ' L' + fmt(cx + 400, 1) + ',' + fmt(cy, 1)
      + ' L' + fmt(cx + 400, 1) + ',' + fmt(groundY, 1) + '" fill="none" stroke="var(--line2)" stroke-width="1"/>';
    s += '<path d="M' + fmt(cx - r, 1) + ',' + fmt(cy, 1)
      + ' A' + fmt(r, 1) + ',' + fmt(r, 1) + ' 0 0 1 ' + fmt(cx + r, 1) + ',' + fmt(cy, 1)
      + '" fill="none" stroke="' + vcol(archVerdict) + '" stroke-width="3.5" stroke-linecap="round"/>';
    s += '<text x="' + fmt(cx + r + 8, 1) + '" y="' + fmt(cy - 6, 1) + '" class="dim">ARCH LIP</text>';
  }
  // tyre, as an annulus, camber-tilted
  const tr = tire.radiusMm * sc, rr = w.rimRadiusMm * sc;
  s += '<g transform="rotate(' + fmt(-cam, 2) + ' ' + fmt(cx, 1) + ' ' + fmt(cy, 1) + ')">';
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(tr, 1) + '" fill="var(--rubber)" stroke="var(--line2)" stroke-width="1"/>';
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(rr + 3, 1) + '" fill="var(--rubber2)"/>';
  // lip annulus
  const fin = FINISHES.find(f => f.id === A.cfg.lipFin) || FINISHES[0];
  const faceFin = FINISHES.find(f => f.id === A.cfg.faceFin) || FINISHES[3];
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(rr, 1) + '" fill="' + fin.hex + '"/>';
  // face
  const faceR = rr * 0.88;
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(faceR, 1) + '" fill="' + faceFin.hex + '"/>';
  s += spokes(A, cx, cy, faceR, faceFin.hex);
  s += '</g>';
  // ground
  s += '<line x1="40" y1="' + fmt(groundY, 1) + '" x2="' + (W - 40) + '" y2="' + fmt(groundY, 1) + '" stroke="var(--line2)" stroke-width="1.5"/>';
  // poke / tuck callout
  if (isFinite(cl.pokeMm)) {
    const lipX = env.archLateral.value + (ARCH_GAIN[S.archMod] || 0);
    const tyreX = lipX + cl.pokeMm;
    s += '<line x1="' + fmt(cx + lipX * sc, 1) + '" y1="' + fmt(cy - tr * 0.55, 1) + '" x2="' + fmt(cx + lipX * sc, 1) + '" y2="' + fmt(groundY + 22, 1) + '" stroke="var(--line2)" stroke-width=".8" stroke-dasharray="3 3"/>';
    s += '<line x1="' + fmt(cx + tyreX * sc, 1) + '" y1="' + fmt(cy, 1) + '" x2="' + fmt(cx + tyreX * sc, 1) + '" y2="' + fmt(groundY + 22, 1) + '" stroke="var(--gold)" stroke-width=".8" stroke-dasharray="3 3"/>';
    s += '<text x="' + fmt(cx + Math.max(lipX, tyreX) * sc + 8, 1) + '" y="' + fmt(groundY + 34, 1) + '" class="dimg">'
      + (cl.pokeMm >= 0 ? fmt(cl.pokeMm) + ' mm POKE' : fmt(-cl.pokeMm) + ' mm TUCK') + '</text>';
  }
  if (cl.archGapMm !== null) {
    s += '<text x="40" y="' + fmt(cy - tr - 14, 1) + '" class="dimg">ARCH GAP ' + fmt(cl.archGapMm) + ' mm</text>';
  }
  s += '<text x="40" y="26" class="dimg">FITMENT AS SEEN HEAD-ON · ' + S.axle.toUpperCase() + '</text>';
  s += '<text x="40" y="42" class="dim2">camber ' + fmt(state.camberDeg, 2) + '° · ' + fmt(state.remainingTravelMm) + ' mm travel remaining</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Head-on view of the wheel in the fender arch showing poke and arch gap">' + s + '</svg>';
}

function spokes(A, cx, cy, R, col) {
  const f = FACES.find(x => x.id === A.cfg.face) || FACES[0];
  const hubR = R * f.hub;
  let s = '';
  const bar = (a, wid, len, r0) => {
    const x = cx + Math.cos(a) * (r0 + len / 2), y = cy + Math.sin(a) * (r0 + len / 2);
    return '<rect x="' + fmt(x - len / 2, 1) + '" y="' + fmt(y - wid / 2, 1) + '" width="' + fmt(len, 1) + '" height="' + fmt(wid, 1)
      + '" rx="' + fmt(Math.min(wid / 2, 3), 1) + '" fill="' + col + '" transform="rotate(' + fmt(a * 180 / Math.PI, 1) + ' ' + fmt(x, 1) + ' ' + fmt(y, 1) + ')"/>';
  };
  const len = R - hubR;
  const n = f.n;
  if (f.arch === 'mesh' || f.arch === 'multi_spoke') {
    const k = f.arch === 'mesh' ? Math.round(n / 2) : n;
    const wd = f.arch === 'mesh' ? R * 0.045 : R * 0.055;
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; s += bar(a + 0.3, wd, len, hubR); }
    if (f.arch === 'mesh') for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + Math.PI / k; s += bar(a - 0.3, wd, len, hubR); }
  } else if (f.arch === 'split_spoke') {
    const k = Math.round(n / 2);
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; s += bar(a + 0.09, R * 0.085, len, hubR); s += bar(a - 0.09, R * 0.085, len, hubR); }
  } else if (f.arch === 'turbine') {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; s += bar(a + 0.42, R * 0.2, len, hubR); }
  } else {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; s += bar(a, R * 0.26, len, hubR); }
  }
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(hubR, 1) + '" fill="' + col + '"/>';
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(hubR * 0.42, 1) + '" fill="var(--panel2)" opacity=".7"/>';
  return s;
}

/* --- 3. Build face: the multipiece construction, to scale. --- */
function drawFace(A) {
  const { asm } = A;
  const w = asm.wheel;
  const W = 860, H = 580;
  const cx = W * 0.40, cy = H / 2;
  const R = Math.min(H * 0.38, W * 0.26);
  const sc = R / w.rimRadiusMm;
  const lipMm = asm.exposedLipIn * 25.4;
  const lipBand = Math.max(6, Math.min(R * 0.42, lipMm * sc * 2.2));
  const faceR = R - lipBand;
  const fin = FINISHES.find(f => f.id === A.cfg.lipFin) || FINISHES[0];
  const faceFin = FINISHES.find(f => f.id === A.cfg.faceFin) || FINISHES[3];

  let s = '';
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(R, 1) + '" fill="' + fin.hex + '" stroke="var(--line2)"/>';
  s += '<circle cx="' + fmt(cx, 1) + '" cy="' + fmt(cy, 1) + '" r="' + fmt(faceR, 1) + '" fill="' + faceFin.hex + '"/>';
  s += spokes(A, cx, cy, faceR, faceFin.hex);
  // assembly hardware on the flange circle
  const hw = asm.hardwareCount;
  const hwR = (R + faceR) / 2;
  for (let i = 0; i < hw; i++) {
    const a = (i / hw) * Math.PI * 2;
    s += '<circle cx="' + fmt(cx + Math.cos(a) * hwR, 1) + '" cy="' + fmt(cy + Math.sin(a) * hwR, 1) + '" r="2.6" fill="var(--gold)"/>';
  }
  // lug bolts on the vehicle bolt circle
  const v = A.veh;
  const pcdR = (v.bolt[1] / 2) * sc;
  for (let i = 0; i < v.bolt[0]; i++) {
    const a = (i / v.bolt[0]) * Math.PI * 2 - Math.PI / 2;
    s += '<circle cx="' + fmt(cx + Math.cos(a) * pcdR, 1) + '" cy="' + fmt(cy + Math.sin(a) * pcdR, 1) + '" r="5" fill="var(--panel)" stroke="var(--fg2)" stroke-width="1"/>';
  }
  // lip callout
  s += '<line x1="' + fmt(cx + faceR, 1) + '" y1="' + fmt(cy - R * 0.72, 1) + '" x2="' + fmt(cx + R, 1) + '" y2="' + fmt(cy - R * 0.72, 1) + '" stroke="var(--gold)" stroke-width="1.4"/>';
  s += '<text x="' + fmt(cx + R + 10, 1) + '" y="' + fmt(cy - R * 0.72 + 4, 1) + '" class="dimg">LIP ' + fmt(asm.exposedLipIn, 2) + '"</text>';

  // spec block
  const bx = W * 0.72;
  const rows = [
    ['Construction', A.cfg.construction === 'three_piece' ? '3-piece' : A.cfg.construction === 'two_piece' ? '2-piece' : 'monoblock'],
    ['Outer lip', fmt(A.cfg.lip, 1) + '"'],
    ['Inner barrel', fmt(A.cfg.barrel, 1) + '"'],
    ['Advertised sum', fmt(asm.naiveWidthIn, 2) + '"'],
    ['Mate allowance', '−' + fmt(asm.mateAllowanceMm, 2) + ' mm'],
    ['FINISHED WIDTH', fmt(asm.achievedWidthIn, 2) + 'J'],
    ['Disc pad depth', fmt(A.cfg.pad, 1) + '"'],
    ['ACHIEVED OFFSET', 'ET' + fmt(asm.achievedEtMm, 1)],
    ['Backspacing', fmt(w.backspacingIn, 2) + '"'],
    ['Visible lip', fmt(asm.exposedLipIn, 2) + '"'],
    ['Inner barrel exp.', fmt(asm.innerBarrelExposedIn, 2) + '"'],
    ['Hardware', asm.hardwareCount + ' per wheel'],
    ['Bolt circle', v.bolt[0] + '×' + v.bolt[1]],
  ];
  s += '<text x="' + fmt(bx, 1) + '" y="86" class="dimg">BUILD SPEC</text>';
  rows.forEach((r, i) => {
    const y = 110 + i * 22;
    const strong = r[0] === r[0].toUpperCase();
    s += '<text x="' + fmt(bx, 1) + '" y="' + y + '" class="' + (strong ? 'dimg' : 'dim') + '">' + r[0] + '</text>';
    s += '<text x="' + fmt(W - 30, 1) + '" y="' + y + '" class="' + (strong ? 'dimg' : 'dim2') + '" text-anchor="end">' + r[1] + '</text>';
    s += '<line x1="' + fmt(bx, 1) + '" y1="' + (y + 6) + '" x2="' + fmt(W - 30, 1) + '" y2="' + (y + 6) + '" stroke="var(--line)" stroke-width=".6"/>';
  });
  s += '<text x="40" y="26" class="dimg">MULTIPIECE BUILD · ' + S.axle.toUpperCase() + '</text>';
  s += '<text x="40" y="42" class="dim2">lip and barrel drawn to the computed split</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Wheel face showing the multipiece construction with the computed lip width and hardware count">' + s + '</svg>';
}

/* ============================================================
   RENDER + WIRING
   ============================================================ */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const VC = { clear:'ok', marginal:'warn', interference:'bad', indeterminate:'gray' };
const VL = { clear:'CLEAR', marginal:'MARGINAL', interference:'INTERFERENCE', indeterminate:'UNKNOWN' };
const chip = (txt, tone) => '<span class="chip t-' + tone + '">' + txt + '</span>';
const vchip = v => chip(VL[v], VC[v]);
const gchip = g => '<span class="chip" style="color:' + GRADE_COLOR[g] + ';border-color:color-mix(in srgb,' + GRADE_COLOR[g] + ' 45%,transparent);background:color-mix(in srgb,' + GRADE_COLOR[g] + ' 14%,transparent)">' + GRADE_LABEL[g] + '</span>';

function opt(v, label, sel) {
  return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
}

/* ---- the controls ---- */
function renderControls() {
  const v = veh(), c = cfg(), m = meas();
  const hasGeom = !!v.pkg;

  $('vehsel').innerHTML = ['BMW', 'Mercedes-Benz', 'Porsche'].map(mk =>
    '<optgroup label="' + mk + '">' + VEHICLES.filter(x => x.make === mk).map(x =>
      opt(x.id, x.chassis + ' · ' + x.model + ' · ' + x.years + (x.pkg ? '' : ' — no geometry'), S.vehicleId)
    ).join('') + '</optgroup>').join('');

  const arch = S.axle === 'front' ? v.fa : v.ra;
  $('vehinfo').innerHTML =
    row('Bolt pattern', v.bolt[0] + '×' + v.bolt[1] + ' ' + gchip('community_reported')) +
    row('Centre bore', v.bore + ' mm') +
    row(S.axle + ' suspension', GEOMETRY[arch].label) +
    row('Camber gain', fmt(GEOMETRY[arch].gain, 2) + '° / 10 mm', 'mute');
  $('archnote').className = 'note' + (arch === 'swing_axle_low_pivot' ? ' warn' : '');
  $('archnote').textContent = GEOMETRY[arch].note;

  $('geomstate').innerHTML = hasGeom
    ? chip('ESTIMATED ENVELOPE', 'warn')
    : chip('NO GEOMETRY', 'gray');
  $('vehnotes').innerHTML = (v.notes || []).map(n =>
    '<p class="note' + (/SWING AXLE|WORSE|INBOARD/.test(n) ? ' warn' : '') + '">' + esc(n) + '</p>').join('')
    + (hasGeom
      ? '<p class="note">Envelope is anchored so the factory ' + fmt(v.pkg.w, 1) + 'J×' + v.pkg.d + ' ET' + v.pkg.et + ' package reads correctly. It has not been measured on a car. Measure the four dimensions below and the absolute numbers become facts.</p>'
      : '<p class="note warn">No factory package recorded for this chassis, so there is nothing to anchor an envelope to. Offset, backspacing, barrel split and tyre dimensions below are still exact. Absolute clearance needs the four measurements.</p>');

  $('pkgsel').innerHTML = Object.keys(PACKAGE).map(k => opt(k, PACKAGE[k].label, S.pkg)).join('');
  $('pkgnote').className = 'note' + (S.pkg === 'air_parked' ? ' warn' : '');
  $('pkgnote').textContent = PACKAGE[S.pkg].note;

  $('dropF').value = S.dropF; $('dropFo').textContent = S.dropF + ' mm';
  $('dropR').value = S.dropR; $('dropRo').textContent = S.dropR + ' mm';
  $('camb').value = S.axle === 'front' ? S.camberF : S.camberR;

  segSet('archseg', S.archMod);
  segSet('axleseg', S.axle);
  segSet('conseg', c.construction);
  segSet('viewseg', S.view);

  $('dia').innerHTML = [13,14,15,16,17,18,19,20].map(d => opt(d, d + '"', c.d)).join('');
  $('lip').innerHTML = LIP_WIDTHS.map(x => opt(x, fmt(x, 1) + '"', c.lip)).join('');
  $('barrel').innerHTML = BARREL_WIDTHS.map(x => opt(x, fmt(x, 1) + '"', c.barrel)).join('');
  $('pad').innerHTML = PAD_DEPTHS.map(x => opt(x, fmt(x, 1) + '"', c.pad)).join('');
  $('spacer').innerHTML = [0,3,5,8,10,12,15].map(x => opt(x, x + ' mm', c.spacer)).join('');
  $('face').innerHTML = FACES.map(f => opt(f.id, f.name, c.face)).join('');
  $('facefin').innerHTML = FINISHES.map(f => opt(f.id, f.label, c.faceFin)).join('');
  $('lipfin').innerHTML = FINISHES.map(f => opt(f.id, f.label, c.lipFin)).join('');
  $('sec').innerHTML = SECTIONS.map(x => opt(x, x, c.sec)).join('');
  $('asp').innerHTML = ASPECTS.map(x => opt(x, x, c.asp)).join('');
  $('targetet').value = c.targetEt;
  $('facenote').textContent = (FACES.find(f => f.id === c.face) || FACES[0]).note;
  $('lipwrap').hidden = c.construction !== 'three_piece';
  $('shellwrap').hidden = c.construction === 'three_piece';
  $('shell').innerHTML = [6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11].map(x => opt(x, fmt(x, 1) + '"', c.shell)).join('');

  $('m_arch').value = m.arch; $('m_lip').value = m.lip;
  $('m_inner').value = m.inner; $('m_trav').value = m.trav;
  const anyMeas = Object.values(m).some(x => x !== '');
  $('measbadge').innerHTML = anyMeas ? gchip('community_reported') : gchip(hasGeom ? 'estimated' : 'unknown');
}

const row = (k, v, tone) =>
  '<div class="r"><span>' + k + '</span><span class="num' + (tone ? ' ' + tone : '') + '">' + v + '</span></div>';

function segSet(id, val) {
  const el = $(id); if (!el) return;
  [...el.querySelectorAll('button')].forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));
}

/* ---- the output ---- */
function renderOutput() {
  const A = derive(S.axle);
  const B = derive(S.axle === 'front' ? 'rear' : 'front');
  const { asm, tire, cl, state, delta, env } = A;
  const w = asm.wheel;

  // verdict band
  const v = cl.overall;
  $('verdict').className = 'verdict v-' + VC[v];
  const bind = cl.binding;
  $('vhead').innerHTML =
    '<span class="vdot"></span>'
    + '<h2 class="vtitle">' + VL[v] + '</h2>'
    + '<span class="vspec">' + fmt(asm.achievedWidthIn, 1) + 'J×' + A.cfg.d + ' ET' + fmt(asm.achievedEtMm)
    + ' · ' + A.cfg.sec + '/' + A.cfg.asp + 'R' + A.cfg.d + '</span>'
    + (bind ? gchip(bind.grade) : '');
  $('vmeta').innerHTML = bind
    ? 'tightest ' + fmt(bind.d, 1) + ' mm<br>' + esc(bind.label) + '<br><span class="mute">' + esc(bind.condLabel) + '</span>'
    : '<span class="mute">nothing evaluable</span>';

  // flags, worst first
  const order = { interference:0, marginal:1, indeterminate:2, clear:3 };
  const flags = cl.results.slice()
    .filter(r => r.cond === 'static' || r.modelled === 'interference' || r.modelled === 'marginal')
    .sort((a, b) => order[a.verdict] - order[b.verdict])
    .slice(0, 5);
  $('flags').innerHTML = flags.map(r =>
    '<div class="flag">' + vchip(r.verdict)
    + '<div><b>' + esc(r.label) + '</b> · ' + esc(r.condLabel)
    + (r.d !== null ? ' · <span class="num">' + fmt(r.d, 1) + ' mm</span>' : '')
    + '<br>' + esc(r.note) + '</div></div>').join('');

  // deltas
  $('deltas').innerHTML = delta
    ? tile('Outboard', (delta.outboardMm > 0 ? '+' : '') + fmt(delta.outboardMm, 1), 'mm vs factory, toward the fender')
    + tile('Inboard', (delta.inboardMm > 0 ? '+' : '') + fmt(delta.inboardMm, 1), 'mm, toward the strut')
    + tile('Half-track', (delta.halfTrackMm > 0 ? '+' : '') + fmt(delta.halfTrackMm, 1), 'mm per corner')
    + tile('Diameter', (delta.diameterMm > 0 ? '+' : '') + fmt(delta.diameterMm, 1), 'mm rolling')
    + tile('Speedometer', (delta.speedoPct > 0 ? '+' : '') + fmt(delta.speedoPct, 2) + '%', 'reads ' + (delta.speedoPct > 0 ? 'slow' : 'fast'))
    + tile('Poke / tuck', isFinite(cl.pokeMm) ? (cl.pokeMm >= 0 ? '+' + fmt(cl.pokeMm) : fmt(cl.pokeMm)) : '—', isFinite(cl.pokeMm) ? (cl.pokeMm >= 0 ? 'mm proud of the body' : 'mm inside the arch') : 'arch position unknown')
    : '<div class="tile"><div class="tn">No factory package recorded, so there is no baseline to compare against.</div></div>';

  // geometry readout
  $('geom').innerHTML =
    row('Finished width', fmt(asm.achievedWidthIn, 2) + 'J', 'gld')
    + row('Advertised sum', fmt(asm.naiveWidthIn, 2) + '"', 'mute')
    + row('Mate allowance', '−' + fmt(asm.mateAllowanceMm, 2) + ' mm', 'mute')
    + row('Achieved offset', 'ET' + fmt(asm.achievedEtMm, 1), 'gld')
    + (asm.etErrorMm !== null ? row('vs target ET' + A.cfg.targetEt, (asm.etErrorMm > 0 ? '+' : '') + fmt(asm.etErrorMm, 1) + ' mm', Math.abs(asm.etErrorMm) > 5 ? 'neg' : 'pos') : '')
    + row('Backspacing', fmt(w.backspacingIn, 3) + '" (' + fmt(w.backspacingMm, 1) + ' mm)')
    + row('Frontspacing', fmt(w.frontspacingIn, 3) + '" (' + fmt(w.frontspacingMm, 1) + ' mm)')
    + row('Flange to flange', fmt(w.overallWidthMm, 1) + ' mm')
    + row('Visible outer lip', fmt(asm.exposedLipIn, 2) + '"', 'gld')
    + row('Inner barrel exposed', fmt(asm.innerBarrelExposedIn, 2) + '"')
    + row('Assembly hardware', asm.hardwareCount + ' per wheel')
    + (w.spacerMm ? row('Effective offset', 'ET' + fmt(w.etEffMm, 1) + ' with ' + w.spacerMm + ' mm spacer', 'warn') : '');

  // tyre readout
  $('tyre').innerHTML =
    row('Mounted section', fmt(tire.sectionMm) + ' mm', 'gld')
    + row('Measuring rim', fmt(tire.measuringRimIn, 1) + '"')
    + row('Overall diameter', fmt(tire.diameterMm, 1) + ' mm')
    + row('Rolling circumference', fmt(tire.circumferenceMm) + ' mm')
    + row('Sidewall height', fmt(tire.sidewallMm, 1) + ' mm')
    + row('Stretch index', (tire.stretchIn >= 0 ? '+' : '') + fmt(tire.stretchIn, 2) + '"',
        tire.sidewall.k === 'beyond_spec' ? 'neg' : tire.sidewall.k === 'aggressive' ? 'warn' : tire.sidewall.k === 'oem' ? 'pos' : '')
    + row('Sidewall class', tire.sidewall.label,
        tire.sidewall.k === 'beyond_spec' ? 'neg' : tire.sidewall.k === 'aggressive' ? 'warn' : '');
  $('tyrenote').className = 'note' + (tire.sidewall.k === 'beyond_spec' ? ' bad' : tire.sidewall.k === 'aggressive' ? ' warn' : '');
  $('tyrenote').textContent = tire.sidewall.note;

  // candidate sizes
  if (A.baseTire) {
    const cands = findTires(A.cfg.d, asm.achievedWidthIn, A.baseTire, 4, $('lookclass').value, false);
    $('cands').innerHTML = cands.length
      ? '<table><thead><tr><th>Size</th><th>Mounted</th><th>Diameter</th><th>Speedo</th><th>Sidewall</th></tr></thead><tbody>'
      + cands.map(x => '<tr data-sec="' + x.tire.section + '" data-asp="' + x.tire.aspect + '" class="pick">'
        + '<td class="gld">' + x.tire.section + '/' + x.tire.aspect + 'R' + x.tire.diameterIn + '</td>'
        + '<td>' + fmt(x.tire.sectionMm) + ' mm</td>'
        + '<td>' + fmt(x.tire.diameterMm) + ' mm</td>'
        + '<td>' + (x.dev > 0 ? '+' : '') + fmt(x.dev, 2) + '%</td>'
        + '<td>' + chip(x.tire.sidewall.label, x.tire.sidewall.k === 'oem' ? 'ok' : x.tire.sidewall.k === 'beyond_spec' ? 'bad' : x.tire.sidewall.k === 'aggressive' ? 'warn' : 'info') + '</td>'
        + '</tr>').join('') + '</tbody></table>'
      : '<p class="note">Nothing within tolerance at this width. Widen the tolerance or change the rim width.</p>';
    [...$('cands').querySelectorAll('tr.pick')].forEach(tr => tr.onclick = () => {
      cfg().sec = Number(tr.dataset.sec); cfg().asp = Number(tr.dataset.asp); renderAll();
    });
  } else {
    $('cands').innerHTML = '<p class="note">No factory package to size against on this chassis.</p>';
  }

  // clearance matrix
  const comps = [...new Set(cl.results.map(r => r.id))];
  const conds = [...new Set(cl.results.map(r => r.cond))];
  $('matrix').innerHTML = '<table><thead><tr><th>Component</th>'
    + conds.map(cd => '<th class="r">' + esc((cl.results.find(r => r.cond === cd) || {}).condLabel || cd) + '</th>').join('')
    + '<th class="r">Evidence</th></tr></thead><tbody>'
    + comps.map(id => {
      const rowr = cl.results.filter(r => r.id === id);
      return '<tr><td>' + esc(rowr[0].label) + '</td>'
        + conds.map(cd => {
          const r = rowr.find(x => x.cond === cd);
          if (!r) return '<td class="r mute">·</td>';
          return '<td class="r">' + (r.d === null ? '<span class="mute">n/a</span>' : fmt(r.d, 1)) + ' ' + vchip(r.verdict) + '</td>';
        }).join('')
        + '<td class="r">' + gchip(rowr[0].grade) + '</td></tr>';
    }).join('') + '</tbody></table>';

  $('limits').textContent = cl.limitations.join(' ') + ' No verdict here is a safety statement. Physical test fitting is required before road use.';

  // corrections
  $('fixes').innerHTML = corrections(A).slice(0, 3)
    .map(f => '<li><span class="arrow">→</span><span>' + esc(f) + '</span></li>').join('');

  // drawing
  $('draw').innerHTML = S.view === 'section' ? drawSection(A) : S.view === 'arch' ? drawArch(A) : drawFace(A);

  // brief + cost
  $('brief').textContent = buildBrief(A, B);
  $('cost').innerHTML = costTable(A, B);
}

const tile = (k, v, n) =>
  '<div class="tile"><div class="tk">' + k + '</div><div class="tv">' + v + '</div>'
  + (n ? '<div class="tn">' + n + '</div>' : '') + '</div>';

function corrections(A) {
  const b = A.cl.binding;
  const out = [];
  if (!b) return ['Nothing evaluable on this corner: the governing geometry is missing. Take the four measurements.'];
  if (b.id === 'fender_lip') {
    out.push('Raise the disc pad depth to pull the assembly inboard. That raises offset and moves the widest point away from the arch.');
    out.push('Narrow the outer lip, or drop a tyre section, to reduce the widest point directly.');
    out.push('Less ride-height drop leaves the lip further above the tyre shoulder.');
  } else if (b.id === 'inner') {
    out.push('Reduce the disc pad depth to lower offset and move the assembly away from the strut.');
    out.push('A narrower inner barrel reduces backspacing directly.');
    out.push('A spacer genuinely helps this one, at the cost of arch clearance and a stacked interface.');
  } else if (b.id === 'well_ceiling') {
    out.push('Lose overall diameter: a lower aspect ratio at the same section.');
    out.push('Shorten the bump stop, or move to short-stroke hardware, so travel ends where you choose.');
  }
  if (A.tire.sidewall.k === 'aggressive' || A.tire.sidewall.k === 'beyond_spec')
    out.push('Choose a section the rim width is approved for: the current one is outside any published spec.');
  if (A.cl.overall === 'indeterminate')
    out.push('Take the four measurements. Until then every absolute number here is an estimate, however precise it looks.');
  return out;
}

/* ---- cost envelope. Ranges, with the assumption stated. ---- */
function costTable(A, B) {
  const lipIn = Math.max(A.asm.exposedLipIn, B.asm.exposedLipIn);
  const dia = Math.max(A.cfg.d, B.cfg.d);
  const lipCost = lipIn > 4 ? [260, 440] : lipIn > 3 ? [190, 330] : [150, 260];
  const barrelCost = dia >= 18 ? [150, 260] : [110, 200];
  const rows = [
    ['Centre discs, 4', 'donor set, condition-dependent', 600, 2500],
    ['Outer lips, 4', fmt(lipIn, 2) + '" visible', lipCost[0] * 4, lipCost[1] * 4],
    ['Inner barrels, 4', dia + '"', barrelCost[0] * 4, barrelCost[1] * 4],
    ['Hardware', (A.asm.hardwareCount * 2 + B.asm.hardwareCount * 2) + ' bolts, o-rings, sealant', 160, 420],
    ['Assembly labour', '4 wheels', 400, 800],
    ['Refinish centres', 'powder, paint or polish', 400, 1000],
    ['Tyres, 4', A.cfg.sec + '/' + A.cfg.asp + ' and ' + B.cfg.sec + '/' + B.cfg.asp, 600, 1600],
  ];
  const lo = rows.reduce((a, r) => a + r[2], 0), hi = rows.reduce((a, r) => a + r[3], 0);
  const money = n => '$' + n.toLocaleString('en-US');
  return rows.map(r =>
    '<div class="cr"><span>' + r[0] + '<span class="mute"> · ' + r[1] + '</span></span>'
    + '<span class="num">' + money(r[2]) + ' – ' + money(r[3]) + '</span></div>').join('')
    + '<div class="cr tot"><span>TOTAL, SET OF FOUR</span><span class="num">' + money(lo) + ' – ' + money(hi) + '</span></div>'
    + '<p class="note warn">Ranges only. No supplier catalogue is connected, so these are not quotes. '
    + 'The cost that matters is the one not on this list: a wrong offset means new barrels at '
    + money(barrelCost[0] * 4 + lipCost[0] * 4) + ' to ' + money(barrelCost[1] * 4 + lipCost[1] * 4)
    + ' plus three to six weeks, and it is why the four measurements come before the order.</p>';
}

/* ---- builder RFQ ---- */
function axleBrief(A, label) {
  const { asm, tire, cl, state, delta } = A, w = asm.wheel, c = A.cfg;
  const L = [];
  const pad = (s, n) => String(s).padEnd(n);
  L.push(label.toUpperCase());
  L.push('  Assembled         ' + fmt(asm.achievedWidthIn, 2) + 'J x ' + c.d + '  ET' + fmt(asm.achievedEtMm, 1));
  L.push('  Advertised sum    ' + fmt(asm.naiveWidthIn, 2) + '"  (mate allowance ' + fmt(asm.mateAllowanceMm, 2) + ' mm)');
  if (asm.etErrorMm !== null)
    L.push('  Target offset     ET' + c.targetEt + '  ->  achieved ET' + fmt(asm.achievedEtMm, 1) + '  (' + (asm.etErrorMm > 0 ? '+' : '') + asm.etErrorMm + ' mm)');
  L.push('  Backspacing       ' + fmt(w.backspacingIn, 3) + '"  (' + fmt(w.backspacingMm, 1) + ' mm)');
  L.push('  Frontspacing      ' + fmt(w.frontspacingIn, 3) + '"  (' + fmt(w.frontspacingMm, 1) + ' mm)');
  L.push('  Flange to flange  ' + fmt(w.overallWidthMm, 1) + ' mm');
  L.push('  Bead seats        inner ' + fmt(w.innerBeadSeatDistanceMm, 1) + ' / outer ' + fmt(w.outerBeadSeatDistanceMm, 1) + ' mm from hub face');
  if (w.spacerMm) L.push('  Spacer            ' + w.spacerMm + ' mm  (effective ET' + fmt(w.etEffMm, 1) + ')');
  L.push('');
  L.push('  Face              ' + (FACES.find(f => f.id === c.face) || FACES[0]).name + '  [original design]');
  L.push('  Construction      ' + c.construction.replace(/_/g, ' ') + ', ' + c.mount.replace(/_/g, ' '));
  L.push('  Outer lip         ' + fmt(c.lip, 1) + '" component -> ' + fmt(asm.exposedLipIn, 2) + '" visible');
  L.push('  Inner barrel      ' + fmt(c.barrel, 1) + '" component -> ' + fmt(asm.innerBarrelExposedIn, 2) + '" exposed');
  L.push('  Disc pad depth    ' + fmt(c.pad, 1) + '"   <- this is what sets the offset');
  L.push('  Hardware          ' + asm.hardwareCount + ' per wheel');
  L.push('  Finish            face ' + c.faceFin + ' / lip ' + c.lipFin);
  L.push('');
  L.push('  Tyre              ' + c.sec + '/' + c.asp + 'R' + c.d);
  L.push('  Mounted section   ' + fmt(tire.sectionMm) + ' mm   [estimated from the nominal designation]');
  L.push('  Overall diameter  ' + fmt(tire.diameterMm, 1) + ' mm   [estimated]');
  L.push('  Measuring rim     ' + fmt(tire.measuringRimIn, 1) + '"');
  L.push('  Sidewall          ' + tire.sidewall.label + '  (' + (tire.stretchIn >= 0 ? '+' : '') + tire.stretchIn + '" vs measuring rim)');
  L.push('');
  L.push('  Camber            ' + fmt(state.camberDeg, 2) + ' deg   [' + state.camberGrade + ']');
  L.push('  Travel remaining  ' + fmt(state.remainingTravelMm) + ' mm   [' + state.travelGrade + ']');
  if (delta) {
    L.push('');
    L.push('  VS FACTORY PACKAGE  (exact arithmetic, no assumptions)');
    L.push('    outboard        ' + (delta.outboardMm > 0 ? '+' : '') + delta.outboardMm + ' mm');
    L.push('    inboard         ' + (delta.inboardMm > 0 ? '+' : '') + delta.inboardMm + ' mm');
    L.push('    half-track      ' + (delta.halfTrackMm > 0 ? '+' : '') + delta.halfTrackMm + ' mm per corner');
    L.push('    rolling dia.    ' + (delta.diameterMm > 0 ? '+' : '') + delta.diameterMm + ' mm');
    L.push('    speedometer     ' + (delta.speedoPct > 0 ? '+' : '') + delta.speedoPct + '%');
  }
  L.push('');
  L.push('  CLEARANCE  ' + cl.overall.toUpperCase() + ' (formal) / ' + cl.overallModelled.toUpperCase() + ' (modelled)');
  cl.results.forEach(r => {
    L.push('    ' + pad(r.label, 26) + pad((r.d === null ? 'n/a' : fmt(r.d, 1) + ' mm'), 10)
      + pad(r.verdict, 15) + pad(r.condLabel, 12) + '[' + r.grade + ']');
  });
  return L;
}

function buildBrief(A, B) {
  const v = veh();
  const front = S.axle === 'front' ? A : B, rear = S.axle === 'front' ? B : A;
  const L = [];
  L.push('RAREFORM FITMENT LAB — BUILD BRIEF');
  L.push('='.repeat(76));
  L.push('Generated        ' + new Date().toISOString());
  L.push('');
  L.push('VEHICLE');
  L.push('  ' + v.make + ' ' + v.model + ' — ' + v.chassis + ' — ' + v.years);
  L.push('  Bolt pattern     ' + v.bolt[0] + 'x' + v.bolt[1] + '   Centre bore ' + v.bore + ' mm');
  L.push('  Front suspension ' + GEOMETRY[v.fa].label);
  L.push('  Rear suspension  ' + GEOMETRY[v.ra].label);
  L.push('  Package          ' + PACKAGE[S.pkg].label);
  L.push('  Drop             front ' + S.dropF + ' mm / rear ' + S.dropR + ' mm');
  L.push('  Arch             ' + S.archMod.replace(/_/g, ' '));
  L.push('  Geometry source  ' + (v.pkg ? 'ESTIMATED envelope anchored on the factory package' : 'NONE RECORDED'));
  L.push('');
  L.push(...axleBrief(front, 'Front axle'));
  L.push('');
  L.push(...axleBrief(rear, 'Rear axle'));
  L.push('');
  L.push('BILL OF MATERIALS — FOUR WHEELS');
  L.push('  Outer lips        2 x ' + fmt(front.cfg.lip, 1) + '" front, 2 x ' + fmt(rear.cfg.lip, 1) + '" rear, ' + front.cfg.d + '"');
  L.push('  Inner barrels     2 x ' + fmt(front.cfg.barrel, 1) + '" front, 2 x ' + fmt(rear.cfg.barrel, 1) + '" rear');
  L.push('  Centre discs      4 x ' + fmt(front.cfg.pad, 1) + '" pad depth front / ' + fmt(rear.cfg.pad, 1) + '" rear');
  L.push('  Hardware          ' + (front.asm.hardwareCount * 2 + rear.asm.hardwareCount * 2) + ' bolts, o-rings, sealant');
  L.push('  Valves and caps   4 sets');
  L.push('  Tyres             2 x ' + front.cfg.sec + '/' + front.cfg.asp + 'R' + front.cfg.d
    + ', 2 x ' + rear.cfg.sec + '/' + rear.cfg.asp + 'R' + rear.cfg.d);
  L.push('');
  L.push('  No supplier catalogue is connected. Component sizes above are generic trade');
  L.push('  sizes; part numbers, prices and availability are NOT included, and');
  L.push('  cross-supplier compatibility is not assumed.');
  L.push('');
  L.push('ASSUMPTIONS AND UNKNOWNS');
  L.push('  - Tyre section and overall diameter are derived from the nominal size');
  L.push('    designation, not measured. Real diameters vary a couple of percent');
  L.push('    between makes in the same stamped size.');
  L.push('  - Camber through travel is estimated from the architecture typical gain');
  L.push('    rate, not a measured kinematic curve for this car.');
  L.push('  - Steered conditions are NOT evaluated: no steering-axis geometry.');
  L.push('  - Caliper envelope is not recorded, so spoke and barrel brake clearance');
  L.push('    has not been analysed at all.');
  if (!v.pkg) L.push('  - No factory package for this chassis: absolute clearance is unavailable.');
  L.push('  - Results describe the discrete conditions listed, not continuous motion.');
  L.push('');
  L.push('PHYSICAL VERIFICATION — COMPLETE BEFORE ORDERING BARRELS');
  [ 'Measure fender lip to hub centre, vertical, both axles, at ride height.',
    'Measure hub face to fender lip, lateral, both axles.',
    'Measure hub face to the nearest inner obstruction, both axles.',
    'Measure hub travel remaining to the bump stop, both axles.',
    'Confirm centre bore against the hub spigot with the disc in hand.',
    'Confirm caliper radial and axial envelope against the barrel.',
    'Test fit ONE assembled wheel before the other three are built.',
    'Check full steering lock both ways at full compression.',
    'Confirm the tyre maker approves this rim width for the chosen section.',
    'Have a qualified builder confirm structural suitability of the components.',
  ].forEach((c, i) => L.push('  ' + String(i + 1).padStart(2) + '. [ ] ' + c));
  L.push('');
  L.push('-'.repeat(76));
  L.push('For a professional quote request. NOT certified fabrication instruction.');
  L.push('Nothing here establishes structural feasibility, load capacity or road');
  L.push('safety. No machining procedure, torque figure or material rating is');
  L.push('produced anywhere in this tool. Physical test fitting and professional');
  L.push('inspection are required before road use.');
  return L.join('\n');
}

/* ---- BUILD TO FIT ---- */
function runOptimiser() {
  const A = derive(S.axle);
  if (!A.env.archRadius.known) {
    $('optout').innerHTML = '<p class="note warn">The optimiser searches against the car’s geometry, and this corner has none. '
      + 'Either pick a chassis with a factory package, or take the four measurements. Without them a result would be fiction.</p>';
    return;
  }
  const c = S.cons;
  const res = optimise({
    env: A.env, state: A.state, diameterIn: A.cfg.d,
    baselineWheel: A.baseWheel, baselineTire: A.baseTire,
    goal: S.goal, cons: c, archMod: S.archMod,
  });
  let h = '<p class="note">' + res.searched + ' combinations evaluated · '
    + res.verified.length + ' verified · ' + res.unverified.length + ' unverified · '
    + res.rejected.length + ' rejected</p>';
  const list = res.verified.length ? res.verified : res.unverified;
  if (!list.length) {
    const reasons = [...new Set(res.rejected.flatMap(r => r.violations))].slice(0, 3);
    h += '<p class="note warn">Nothing satisfies these constraints. Most common rejections: '
      + esc(reasons.join(' ')) + ' Relax a constraint deliberately rather than hoping the tool will.</p>';
  } else {
    if (!res.verified.length)
      h += '<p class="note warn">All candidates rest on an estimated envelope, so none can be called verified. '
        + 'They are ranked honestly against each other; they are not a pass.</p>';
    h += list.map(x =>
      '<div class="cand" data-id="' + esc(x.id) + '">'
      + '<div class="candhead"><span class="gld num">' + fmt(x.asm.achievedWidthIn, 1) + 'J×' + A.cfg.d
      + ' ET' + fmt(x.asm.achievedEtMm) + ' · ' + x.tire.section + '/' + x.tire.aspect + '</span>'
      + vchip(x.verdict) + '<button class="btn sm apply">APPLY</button></div>'
      + '<div class="num mute sml">lip ' + fmt(x.lip, 1) + '" + barrel ' + fmt(x.barrel, 1) + '" · pad ' + fmt(x.pad, 1) + '"'
      + ' · visible lip ' + fmt(x.asm.exposedLipIn, 2) + '" · BS ' + fmt(x.asm.wheel.backspacingIn, 2) + '"'
      + ' · worst ' + (x.worstD === null ? '—' : fmt(x.worstD, 1) + ' mm at ' + esc(x.binding)) + '</div>'
      + (x.tradeoffs.length ? '<div class="sml">' + esc(x.tradeoffs.slice(0, 2).join(' ')) + '</div>' : '')
      + '</div>').join('');
  }
  if (res.rejected.length) {
    h += '<details><summary>Rejected, with reasons</summary><div class="rejlist">'
      + res.rejected.slice(0, 18).map(r => '<div class="num sml mute">' + esc(r.id.split('|').slice(0, 3).join(' / '))
      + ' — ' + esc(r.violations[0]) + '</div>').join('') + '</div></details>';
  }
  $('optout').innerHTML = h;
  [...$('optout').querySelectorAll('.cand')].forEach(el => {
    const btn = el.querySelector('.apply');
    if (!btn) return;
    btn.onclick = () => {
      const x = list.find(y => y.id === el.dataset.id);
      if (!x) return;
      const c2 = cfg();
      c2.lip = x.lip; c2.barrel = x.barrel; c2.pad = x.pad; c2.spacer = x.spacerMm;
      c2.sec = x.tire.section; c2.asp = x.tire.aspect;
      renderAll();
    };
  });
}

/* ---- wiring ---- */
function persist() { try { localStorage.setItem('rareform.v1', JSON.stringify(S)); } catch (e) { /* private window or blocked storage */ } }
function renderAll() { renderControls(); renderOutput(); persist(); }

function bindSeg(id, fn) {
  [...$(id).querySelectorAll('button')].forEach(b => b.onclick = () => { fn(b.dataset.v); renderAll(); });
}

function init() {
  $('vehsel').onchange = e => { S.vehicleId = e.target.value; renderAll(); };
  $('pkgsel').onchange = e => { S.pkg = e.target.value; renderAll(); };
  $('dropF').oninput = e => { S.dropF = Number(e.target.value); renderAll(); };
  $('dropR').oninput = e => { S.dropR = Number(e.target.value); renderAll(); };
  $('camb').oninput = e => { if (S.axle === 'front') S.camberF = e.target.value; else S.camberR = e.target.value; renderAll(); };
  $('cambauto').onclick = () => { if (S.axle === 'front') S.camberF = ''; else S.camberR = ''; renderAll(); };
  bindSeg('axleseg', v => S.axle = v);
  bindSeg('archseg', v => S.archMod = v);
  bindSeg('viewseg', v => S.view = v);
  bindSeg('conseg', v => cfg().construction = v);

  const num = (id, key) => $(id).onchange = e => { cfg()[key] = Number(e.target.value); renderAll(); };
  num('dia', 'd'); num('lip', 'lip'); num('barrel', 'barrel'); num('pad', 'pad');
  num('spacer', 'spacer'); num('shell', 'shell'); num('sec', 'sec'); num('asp', 'asp');
  $('face').onchange = e => { cfg().face = e.target.value; renderAll(); };
  $('facefin').onchange = e => { cfg().faceFin = e.target.value; renderAll(); };
  $('lipfin').onchange = e => { cfg().lipFin = e.target.value; renderAll(); };
  $('targetet').onchange = e => { cfg().targetEt = e.target.value === '' ? null : Number(e.target.value); renderAll(); };
  $('lookclass').onchange = renderOutput;

  $('copyboth').onclick = () => {
    const c = cfg();
    const other = S.axle === 'front' ? S.rear : S.front;
    Object.assign(other, JSON.parse(JSON.stringify(c)));
    renderAll();
  };
  $('padforet').onclick = () => {
    const c = cfg();
    const target = Number(c.targetEt);
    if (!isFinite(target)) return;
    const width = assemble({ construction:c.construction, diameterIn:c.d, lipIn:c.lip, barrelIn:c.barrel, shellIn:c.shell, padDepthIn:c.pad, spacerMm:c.spacer, mount:c.mount, targetEtMm:null }).achievedWidthIn;
    const want = padDepthForEt(width, target - (c.spacer || 0));
    c.pad = PAD_DEPTHS.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
    renderAll();
  };

  ['m_arch','m_lip','m_inner','m_trav'].forEach(id => {
    $(id).oninput = e => {
      const k = id.slice(2);
      (S.axle === 'front' ? S.measF : S.measR)[k] = e.target.value;
      renderAll();
    };
  });
  $('measclear').onclick = () => {
    const m = S.axle === 'front' ? S.measF : S.measR;
    m.arch = m.lip = m.inner = m.trav = '';
    renderAll();
  };
  $('measload').onclick = () => {
    const env = envelope(S.axle);
    const m = S.axle === 'front' ? S.measF : S.measR;
    if (env.archRadius.known) m.arch = Math.round(env.archRadius.value);
    if (env.archLateral.known) m.lip = Math.round(env.archLateral.value);
    if (env.innerDepth.known) m.inner = Math.round(env.innerDepth.value);
    m.trav = Math.round(env.bumpTravelMm);
    renderAll();
  };

  $('goalsel').onchange = e => { S.goal = e.target.value; };
  ['untouchedMetal','allowSpacers','noStretch','drivingUse','verifiedOnly'].forEach(k => {
    const el = $('c_' + k); if (!el) return;
    el.checked = S.cons[k];
    el.onchange = e => { S.cons[k] = e.target.checked; };
  });
  $('c_minClear').value = S.cons.minClearanceMm;
  $('c_minClear').onchange = e => { S.cons.minClearanceMm = Number(e.target.value); };
  $('optrun').onclick = runOptimiser;

  $('copybrief').onclick = () => {
    const txt = $('brief').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => toast('Build brief copied')).catch(selectBrief);
    } else selectBrief();
  };
  function selectBrief() {
    const r = document.createRange(); r.selectNodeContents($('brief'));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast('Selected — copy with your keyboard');
  }

  // remember the last build in this browser, as a convenience only
  try {
    const raw = localStorage.getItem('rareform.v1');
    if (raw) Object.assign(S, JSON.parse(raw));
  } catch (e) { /* private window or blocked storage: carry on */ }
  renderAll();
}

let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

