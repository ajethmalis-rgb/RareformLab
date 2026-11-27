# Standalone build

`rareform-fitment-lab.html` is the whole product in one file: geometry engine,
contribution loop, vehicle library, drawings and UI. No build step, no node, no
network beyond a Google Fonts stylesheet.

Open it in a browser. That is the entire install.

Three views, switched from the masthead:

- **Studio** — configure a multipiece build against a chassis and get a graded
  clearance verdict, three scale drawings, a tyre size finder, BUILD TO FIT and
  a builder RFQ.
- **Contribute** — submit measurements for a variant, with guidance per
  dimension and live validation.
- **Review** — the queue, plus a per-variant consensus view with every submitted
  value plotted, outliers ringed and the agreement band drawn.

It shares its algorithms and thresholds with `src/engine/`, ported to plain
JavaScript. `node scripts/smoke-standalone.js` runs 33 checks against the
bundle, covering the geometry identities and every corroboration rule: promotion
at three distinct submitters, people-not-rows, outlier exclusion, the two-camps
conflict case, degree-scaled camber tolerances and the tyre-top cross-check.

## One grade exists only here

`self_measured`. The variant-level grades answer "how well is this VARIANT
known", which is right for a shared library. But somebody in the studio is
asking about THEIR car, and for that their own tape measurement is the best
evidence there is. Grading it as a single community report means a person does
the work of measuring and still gets UNKNOWN, which is a bug rather than
caution. It is deliberately not the same as corroborated: measuring your own car
resolves your own verdict and promotes nothing for anyone else.

The Next.js build still grades user overrides as `community_reported`. Bringing
it in line is a small change and worth doing.
