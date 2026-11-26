# Standalone build

`rareform-fitment-lab.html` is the whole studio in one file: engine, vehicle
library, drawings and UI. No build step, no node, no network beyond a Google
Fonts stylesheet.

Open it in a browser. That is the entire install.

It shares the engine's algorithms and reference identities with `src/engine/`,
ported to plain JavaScript. 34 reference checks run against it in
`scripts/smoke-standalone.js`.

The two builds are deliberately separate: this one is for showing people and
using in a workshop, the Next.js app is where the product grows.
