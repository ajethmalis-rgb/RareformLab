const fs = require('fs');

// Engine + contribution logic, evaluated together exactly as the page loads them.
const engine = fs.readFileSync('lab-engine.js', 'utf8');
const contrib = fs.readFileSync('lab-contrib.js', 'utf8');

const tests = `
let ok = 0, bad = 0;
const chk = (n, c) => { c ? ok++ : bad++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };
const near = (a, b, t) => Math.abs(a - b) <= t;

console.log('--- grades ---');
chk('corroborated counts as verified', isVerified('community_corroborated'));
chk('self-measured counts as verified', isVerified('self_measured'));
chk('a single report does not', !isVerified('community_reported'));
chk('estimated does not', !isVerified('estimated'));
chk('unknown does not', !isVerified('unknown'));

console.log('--- geometry unchanged by the port ---');
chk('8J ET20 -> BS 5.2874in', near(resolveWheel(8,16,20).backspacingIn, 5.2874, 0.001));
chk('195/65R15 OD 634.5mm', near(mountTire(195,65,15,6.0).diameterMm, 634.5, 0.2));
chk('3pc 3.0+5.5 -> 8.0J', near(assemble({construction:'three_piece',diameterIn:16,lipIn:3.0,barrelIn:5.5,padDepthIn:3.0,spacerMm:0,mount:'front_mount',targetEtMm:null}).achievedWidthIn, 8.0, 0.002));

console.log('--- consensus ---');
const sub = (id, who, v, over) => Object.assign({
  id, variantKey:'vk', vehicleId:'e30', axle:'front', submitterId:who, submitterName:who,
  submitterVerified:false, submittedAt:'', suspensionPackage:'factory', rideHeightDropMm:0,
  bodyOriginal:true, method:'tape_measure', values:{ archRadiusMm:v }, status:'accepted',
}, over || {});

const one = consensusFor('archRadiusMm', [sub('a','alice',383)]);
chk('one submitter is not promoted', one.grade === 'community_reported' && !isVerified(one.grade));
chk('  and it says how many more are needed', /2 more agreeing/.test(one.note));

const three = consensusFor('archRadiusMm', [sub('a','alice',382), sub('b','bob',385), sub('c','carol',383)]);
chk('three distinct submitters promote', three.grade === 'community_corroborated');
chk('  consensus is the median, 383', three.value === 383);
chk('  tolerance floors at the tape, 3mm', three.tolerance === 3);

const same = consensusFor('archRadiusMm', [sub('a','alice',382), sub('b','alice',383), sub('c','alice',384)]);
chk('one person measuring thrice is one opinion', same.grade === 'community_reported' && same.agreeing === 1);

const stray = consensusFor('archRadiusMm',
  [sub('a','alice',382), sub('b','bob',385), sub('c','carol',383), sub('d','dave',420)]);
chk('an outlier is excluded, not averaged', stray.value === 383 && stray.grade === 'community_corroborated');
chk('  and it is marked as an outlier', stray.points.filter(p => p.outlier).length === 1);

const camps = consensusFor('archRadiusMm',
  [sub('a','alice',380), sub('b','bob',381), sub('c','carol',420), sub('d','dave',421)]);
chk('two camps is a conflict, not a consensus', camps.conflict === true);
chk('  not promoted', !isVerified(camps.grade));
chk('  and the solver is handed nothing', consensusDim(camps) === null);
chk('  no average is offered as the answer', /nobody measured/.test(camps.note));

const pending = consensusFor('archRadiusMm',
  [sub('a','alice',382), sub('b','bob',383,{status:'pending'}), sub('c','carol',384,{status:'pending'})]);
chk('pending submissions do not count', pending.agreeing === 1);

console.log('--- camber uses degree-scaled tolerances ---');
const cam = k => Object.assign(sub('x','y',0), { values: { camberDeg: k } });
const camC = consensusFor('camberDeg', [
  Object.assign({}, cam(-0.40), {id:'a', submitterId:'alice'}),
  Object.assign({}, cam(-0.45), {id:'b', submitterId:'bob'}),
  Object.assign({}, cam(-0.35), {id:'c', submitterId:'carol'}),
]);
chk('camber corroborates', camC.grade === 'community_corroborated');
chk('  with a degree band, not a millimetre one', camC.band < 1);

console.log('--- validation ---');
const wheel = { widthIn:7, diameterIn:15, etMm:30, tireSectionMm:195, tireAspect:65 };
chk('impossible value rejected', hasReject(validateSub(sub('a','alice',38))));
chk('measuring to the tyre top is caught',
  /resting on its own arch/.test(validateSub(sub('a','alice',250,{wheelOnCar:wheel}))[0].message));
chk('a sane measurement passes', !hasReject(validateSub(sub('a','alice',383,{wheelOnCar:wheel}))));
chk('modified arch is flagged, not rejected', (() => {
  const i = validateSub(sub('a','alice',383,{bodyOriginal:false}));
  return !hasReject(i) && i.some(x => /excluded from the consensus/.test(x.message));
})());

console.log('--- variant rollup ---');
const four = (who, j) => ({
  id:'s'+who, variantKey:'vk', vehicleId:'e30', axle:'front', submitterId:who, submitterName:who,
  submitterVerified:false, submittedAt:'', suspensionPackage:'factory', rideHeightDropMm:0,
  bodyOriginal:true, method:'tape_measure', status:'accepted',
  values:{ archRadiusMm:382+j, archLateralMm:88+j, innerDepthMm:165+j, travelMm:80 },
});
const v3 = aggregateVariant('vk', [four('alice',0), four('bob',1), four('carol',2)]);
chk('variant becomes analysable at three', v3.analysable === true);
chk('  and says so', /returns real verdicts/.test(nextNeed(v3)));
const v1 = aggregateVariant('vk', [four('alice',0)]);
chk('one submitter is not analysable', v1.analysable === false);
chk('  and it asks for exactly what is missing', /2 more independent/.test(nextNeed(v1)));
const vMod = aggregateVariant('vk',
  [four('alice',0), four('bob',1), four('carol',2), Object.assign(four('dave',40), {bodyOriginal:false})]);
chk('a pulled arch is held out of the consensus', vMod.excluded.length === 1);
chk('  and has not moved the agreed figure', vMod.byKey.archRadiusMm.value === 383);

console.log(bad ? '\\n*** ' + bad + ' FAILED' : '\\nALL ' + ok + ' CHECKS PASS');
`;

// localStorage is absent in node; the storage helpers tolerate that.
global.localStorage = undefined;
eval(engine + contrib + tests);
