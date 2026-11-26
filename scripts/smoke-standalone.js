const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','standalone','bundle-check.js'), 'utf8');
const cut = src.indexOf('   RENDER + WIRING');
if (cut < 0) { console.error('could not locate the render section'); process.exit(1); }
const engine = src.slice(0, src.lastIndexOf('/* ===', cut));

const tests = `
const f=(n,d)=>Number(n).toFixed(d===undefined?2:d);
let pass=0,fail=0;
const chk=(n,g,w,t)=>{const ok=Math.abs(g-w)<=t;ok?pass++:fail++;
  console.log((ok?'  PASS':'  FAIL')+'  '+n.padEnd(42)+' got '+f(g)+'  want ~'+w);};

chk('8J ET0 -> BS 4.5in', resolveWheel(8,16,0).backspacingIn, 4.5, 0.0001);
chk('8J ET20 -> BS 5.2874in', resolveWheel(8,16,20).backspacingIn, 5.2874, 0.001);
chk('9J ET15 -> FS 4.40945in', resolveWheel(9,17,15).frontspacingIn, 4.40945, 0.001);
chk('10J ET-12 -> BS 5.02756in', resolveWheel(10,17,-12).backspacingIn, 5.02756, 0.001);
chk('ET35 +15mm spacer == ET20', resolveWheel(8,16,35,{spacerMm:15}).backspacingMm, resolveWheel(8,16,20).backspacingMm, 0.001);
chk('K profile departs from the +1in rule', resolveWheel(8,16,20,{profile:'K'}).backspacingMm, 135.8, 0.001);
chk('bead seat inner = W/2 + ET', resolveWheel(8,16,20).innerBeadSeatDistanceMm, 121.6, 0.001);

chk('185/70R13 measuring rim 5.5', designRim(185,70), 5.5, 0.001);
chk('195/65R15 measuring rim 6.0', designRim(195,65), 6.0, 0.001);
chk('225/45R17 measuring rim 7.5', designRim(225,45), 7.5, 0.001);
chk('275/35R19 measuring rim 9.5', designRim(275,35), 9.5, 0.001);
chk('195/65R15 OD 634.5mm', mountTire(195,65,15,6.0).diameterMm, 634.5, 0.2);
chk('205/55R16 OD 631.9mm', mountTire(205,55,16,6.5).diameterMm, 631.9, 0.2);
chk('245/40R18 OD 653.2mm', mountTire(245,40,18,8.5).diameterMm, 653.2, 0.2);
chk('205/55 on 8in -> 220mm section', mountTire(205,55,16,8.0).sectionMm, 220, 0.2);

const a=assemble({construction:'three_piece',diameterIn:16,lipIn:3.0,barrelIn:5.5,padDepthIn:3.0,spacerMm:0,mount:'front_mount',targetEtMm:20});
chk('3pc 3.0+5.5 -> 8.0J finished', a.achievedWidthIn, 8.0, 0.002);
chk('advertised sum is 8.5in, not 8.0', a.naiveWidthIn, 8.5, 0.002);
chk('ET38.1 derived from pad depth', a.achievedEtMm, 38.1, 0.1);
chk('frontspacing == pad depth 76.2mm', a.wheel.frontspacingMm, 76.2, 0.1);
chk('visible lip = pad 3.0in less 11mm pad', a.exposedLipIn, 3.0-11/25.4, 0.002);
chk('target vs achieved surfaced', a.etErrorMm, 18.1, 0.1);
chk('pad depth solving back to ET20', padDepthForEt(8.0,20), 3.7126, 0.001);

chk('camber -1deg on 650 OD: top in 5.67mm', -camberX(0,325,-1), 5.67, 0.02);
chk('E30 rear STA 60mm -> -1.68deg', GEOMETRY.semi_trailing_arm.gain*6, -1.68, 0.01);
chk('swing axle gains POSITIVE camber', GEOMETRY.swing_axle_low_pivot.gain, 0.20, 0.001);

// stretched fitment: the FLANGE is the widest point, not the tyre
const w8=resolveWheel(8,16,20), t8=mountTire(205,40,16,8.0);
chk('205/40 on 8J section 215mm', t8.sectionMm, 215, 0.2);
chk('  ...flange 114.3 is the widest point', widestPoint(t8,w8.rimRadiusMm,w8.overallWidthMm).halfWidthMm, 114.3, 0.2);
// unstretched: the SIDEWALL is the widest point
const w6=resolveWheel(6,15,42), t6=mountTire(195,65,15,6.0);
chk('195/65 on 6J widest = section/2', widestPoint(t6,w6.rimRadiusMm,w6.overallWidthMm).halfWidthMm, 97.5, 0.2);

chk('stretch class: 195/50 on 9J is beyond spec', sidewallClass(stretchIn(195,50,9.0)).k==='beyond_spec'?1:0, 1, 0);
chk('stretch class: 195/65 on 6J is oem', sidewallClass(stretchIn(195,65,6.0)).k==='oem'?1:0, 1, 0);

// the evidence rule
chk('estimated input cannot return clear', formalise('clear','estimated')==='indeterminate'?1:0, 1, 0);
chk('unknown input cannot return clear', formalise('clear','unknown')==='indeterminate'?1:0, 1, 0);
chk('interference reports even on weak data', formalise('interference','estimated')==='interference'?1:0, 1, 0);
chk('verified input can return clear', formalise('clear','professionally_measured')==='clear'?1:0, 1, 0);

console.log(fail ? '\\n*** ' + fail + ' FAILURES' : '\\nALL ' + pass + ' ENGINE CHECKS PASS');
`;
eval(engine + tests);
