# RAREFORM FITMENT LAB

Vehicle-specific wheel engineering studio for vintage and modern-classic German cars.
Build the wheel around the vehicle, rather than build a wheel and hope it fits.

**Offset is an output, not an input.** You choose the lip depth and barrel you want; the
geometry tells you what offset that produces and whether the car can take it.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000  →  /studio
npm test             # 88 unit tests
npm run typecheck    # strict TS, no errors
npm run build        # production build
```

No API keys. No external services. No network calls at runtime beyond a Google Fonts
stylesheet. The core workflow is fully usable offline.

---

## What is exact and what is not

This is the most important section in the repository. Read it before trusting a number.

### Exact, tested, and independent of any vehicle data

Everything derived from the wheel and tyre alone:

- Offset, effective offset with spacers (`ET_eff = ET − spacer`)
- Bead-seat distances from the documented reference planes
- Backspacing and frontspacing from **physical flange geometry**, not the "+1 inch" shortcut
- Finished assembled width from **mating geometry** — advertised lip + advertised barrel
  does *not* equal finished bead-seat width, and the mate allowance is why
- Mounted section width, overall diameter, rolling circumference, speedometer deviation
- Measuring-rim derivation, stretch index, sidewall classification
- Barrel splits, exposed lip, hardware count, target-vs-achieved offset
- Camber projection, and every delta against the factory package

88 unit tests check these against hand-calculated values and published tyre data. Each
expectation is worked out in a comment above it; none is snapshotted from the
implementation's own output.

### Not exact: absolute clearance

Absolute clearance depends on four dimensions of a **specific car**:

1. Fender lip to hub centre, vertical, at ride height
2. Hub mounting face to fender lip, lateral
3. Hub mounting face to the nearest inner obstruction, lateral
4. Hub travel remaining to the bump stop

These are not licensable from BMW, Mercedes-Benz or Porsche. **They are not in this
repository for any real car.** The measurement workflow in the studio exists to collect
them, and a user measurement overrides the library estimate with full traceability.

### How the engine refuses to invent safety

Every dimension carries an `EvidenceGrade`:

| Grade | Meaning | Counts as evidence? |
| --- | --- | --- |
| `manufacturer_documented` | Factory drawing, CAD, homologation document | yes |
| `professionally_measured` | CMM, calibrated jig, shop scan, verified submitter | yes |
| `community_corroborated` | 3+ independent owners agreeing within tolerance | **yes** |
| `community_reported` | A single owner measurement with a stated method | no |
| `estimated` | Derived or inferred — **not a measurement** | no |
| `unknown` | Absent. `NaN`, never zero. | no |

The collision engine returns two verdicts per check:

- **`verdict`** — the formal one. A region whose governing dimension is `estimated` or
  `unknown` returns `indeterminate`, never `clear`, whatever the arithmetic says.
  A predicted **interference is still reported at any grade**, because a predicted hit is
  useful information.
- **`modelledVerdict`** — what the geometry says taking inputs at face value. Useful for
  ranking options against each other. Not a safety statement.

Consequences worth understanding, because they look like bugs and are not:

- Supply no measured tyre data and *every* clearance result that depends on tyre radius
  is `indeterminate`. Two tyres stamped the same size differ by a couple of percent in
  overall diameter, so a nominal designation is not a measurement.
- The caliper-to-barrel check sits at `indeterminate` on the default barrel wall, which is
  a reference value. Supply a measured barrel profile and it becomes verifiable.
- Steered conditions are **not evaluated** without steering-axis geometry. They are
  skipped and listed as skipped, rather than guessed at.

The only thing in this repository carrying a verified pass out of the box is a
**synthetic test fixture**, and it is not a car. Real vehicles get there the only way
they can: somebody measures them. See **The contribution loop** below.

---

## The contribution loop

This is how a chassis stops being an estimate, and it is the only mechanism in the
product that makes the library compound.

One person with a tape measure produces a data point. It could be a mis-read, a car with
a quietly repaired arch, or a variant nobody realised was different. Three independent
people arriving within a few millimetres of each other is **evidence**, and the engine
treats it as such: `community_corroborated` is in `VERIFIED_GRADES`, so that variant
starts returning real clearance verdicts instead of UNKNOWN.

Admitting that grade is the most consequential decision in the data model. Refusing it
would be safer-looking and useless — nobody measures their car for a badge that stays
grey forever. What keeps it honest is the bar in `aggregate.ts`:

1. **Distinct submitters.** One keen owner measuring three times is one opinion.
2. **Agreement inside an instrument-derived band.** Tape measurements cannot inherit a
   caliper's tolerance by sitting next to one; the band is `3 x` the coarsest method
   present, floored at 5 mm.
3. **Outliers excluded, not averaged.** Averaging a wrong number moves the consensus
   toward it. Median and median-absolute-deviation throughout, because with four hand
   measurements one transposed digit destroys a mean and barely moves a median.
4. **Disagreement surfaced, never resolved by arithmetic.** If the scatter exceeds what
   the instrument explains, the submissions are two camps rather than a cluster, and the
   engine reports a conflict and hands the solver *nothing*. A MAD-scaled threshold alone
   would find no outliers in `380, 381, 420, 421` and cheerfully report a corroborated
   400.5 mm — a figure nobody measured, sitting between two real clusters. That case is
   a test.
5. **Modified bodywork held out.** A rolled or pulled arch describes that car, not the
   model. Kept on record and shown; never aggregated.
6. **Nothing promotes automatically.** Arithmetic rejects the impossible; a person
   accepts what is left.

### What a contributor is asked for

Four measurements make a corner analysable, plus camber:

| Measurement | Why it decides something |
| --- | --- |
| Fender lip to hub centre, vertical | Whether the tyre can reach the lip at all |
| Hub face to fender lip, lateral | Where the lip sits across the car |
| Hub face to nearest inner obstruction | The inboard limit |
| Hub travel remaining to the bump stop | What static-only calculators ignore |
| Camber at the stated ride height | Where the tyre shoulder actually sits |

Camber is contributable rather than left to a rule of thumb, because without it every
arch verdict is capped at `estimated` by the architecture's typical gain rate. Several
cars of one variant measured at the same height are corroborating a real point on that
variant's camber curve.

Submitting the fitted wheel is optional and worth the thirty seconds: it enables the
cross-check that catches the commonest error, an arch radius smaller than the fitted
tyre's radius, which means the tape went to the top of the tyre rather than the hub.

### Pages

- `/contribute` — guided submission with live validation
- `/review` — the queue, plus a per-variant consensus view with the spread plotted,
  outliers ringed, the agreement band drawn and the conflict state visible

Seeded example records are **pending**, deliberately: an accepted example would reach
consensus on its own and quietly promote a real chassis to green off invented numbers.

---

## Architecture

```
src/
  engine/              Pure TypeScript. No React, no Three.js, no DOM, no network.
    units.ts           Coordinate frame and reference planes. READ THIS FIRST.
    types.ts           Evidence grading, verdicts, Zod schemas.
    wheel.ts           Rim geometry, multipiece assembly, offset from mating geometry.
    tire.ts            Tyre maths, measuring rim, mounted width, assembly profile.
    kinematics.ts      Suspension architectures, camber gain, travel, conditions.
    collision.ts       Clearance solver with evidence propagation.
    optimizer.ts       BUILD TO FIT reverse search.
    __tests__/         53 tests, hand-calculated fixtures.
  data/
    fixtures.ts        Synthetic verified fixture (the only verified geometry here).
    vehicles.ts        Chassis catalogue, honestly graded.
    components.ts      Barrels, lips, discs, hardware, finishes.
    faces.ts           Original designs + reference-only entries.
  store/build.ts       Typed state. All derivation flows through analyseAxle().
  components/
    three/geometry.ts  Procedural geometry generators.
    three/*.tsx        R3F scene, hub-mounted assembly.
    studio/*.tsx       Panels.
  app/                 Next.js App Router.
```

### Coordinate frame

One right-handed frame per corner, defined for the right-hand side and mirrored in X.

- **Origin**: intersection of the hub mounting plane with the wheel spin axis — the face
  the wheel actually bolts to, because it is the one plane a user can reach with a tape.
- **+X** outboard, **+Y** up, **+Z** forward.
- Lengths in millimetres internally; inches only at the UI boundary.
- Camber is negative when the top of the wheel leans toward the vehicle centreline.
- Camber rotates about the **hub centre**, not the contact patch. That is the correct
  frame for clearance: the suspension fixes the hub at a given ride height and the wheel
  tilts around it, which is why camber changes track at the contact patch rather than at
  the hub. It also makes a point's radius from the spin axis camber-invariant, which the
  solver relies on.

### One profile function, two consumers

`assemblyHalfWidth()` returns the outboard half-width of the wheel-and-tyre assembly at a
given radius. Both the collision solver and the 3D mesh generator read it, so the drawing
cannot disagree with the verdict. Two behaviours fall out of it that a flat
"section width" model misses:

- The widest part of the assembly sits partway up the **sidewall** — exactly the radius a
  lowered car's fender lip descends to. That is the mechanism of rubbing.
- On a stretched fitment the section half-width is less than the flange, so the **rim
  flange** becomes the outermost point. That is why stretched wheels are the bent ones.

### The arch is an opening, not a plane

The fender opening is a circular arc of radius `archRadius` about the hub centre. The tyre
is a solid of revolution, so a point on its surface at radius ρ sweeps that whole arc as
the wheel turns. **Points with ρ < archRadius pass inside the opening and can never touch
the lip, however far outboard they sit.** That is what tuck is, and it is why a short tyre
under a tall arch can stand proud of the bodywork without rubbing. Poke is a bodywork and
fender-coverage matter; it is not a rub, and the engine reports them separately.

---

## Delivered in this build

| Area | State |
| --- | --- |
| Deterministic geometry engine | **Done**, 88 passing tests |
| Evidence grading end to end | **Done**, enforced in the solver and the optimiser |
| Synthetic verified fixture (collision / marginal / clear) | **Done** |
| Multipiece assembly from real component increments | **Done** |
| Clearance solver, 6 conditions, per-component matrix | **Done** |
| BUILD TO FIT optimiser with non-negotiable constraints | **Done** |
| Vehicle catalogue, 47 chassis | **Done** (BMW 19, Mercedes-Benz 14, Porsche 14 — 1 illustrative, 46 catalogue-only, 0 verified) |
| Procedural 3D, hub-mounted, camber-correct | **Done** |
| View modes: complete / wheel+tyre / bare / hub / exploded | **Done** |
| X-ray, cutaway clipping, dimension overlays, 7 camera presets | **Done** |
| Independent front/rear, square and staggered | **Done** |
| Measurement workflow with traceable override | **Done** |
| Saved builds, version-pinned, local persistence | **Done** |
| Build brief: text, JSON, print | **Done** |
| Original wheel faces (7), procedurally rendered | **Done** |
| Component catalogue: 96 lips, 108 barrels, 132 shells, 13–24" | **Done** (generic trade sizes, no supplier data) |
| OEM reference entries (39), non-configurable | **Done** |

## Not delivered, and why

Stated plainly rather than implied:

- **Verified geometry for any real vehicle.** The blocker is data acquisition, not code.
  Every downstream capability is gated on this.
- **Real scans, CAD or a STEP conversion pipeline.** No assets exist to convert. The
  loader accepts GLB/GLTF/OBJ/STL by design; nothing is supplied.
- **Caliper and suspension collision meshes.** Catalogue entries carry `unknown` for
  these, and the solver reports `indeterminate` rather than estimating them.
- **Steering and suspension kinematic animation.** Requires real kinematics. Steered
  conditions are skipped, not faked.
- **AI photoreal rendering.** Needs a server-side provider and a key. The native 3D view
  is the working export path; no image-generation success is simulated.
- **PostgreSQL / Supabase and accounts.** Submissions live in browser storage, which is
  the wrong home for shared evidence — the whole point is that one person's measurement
  reaches the next person. The schema is already server-shaped (stable ids, submitter
  ids, statuses, validated records), so this is a transport change.
- **Photo upload against a calibration reference.** The schema admits
  `photogrammetry` as a method and flags it for review; no upload path exists yet.
- **Supplier part numbers, prices, availability.** No supplier catalogue is connected.
  Component IDs are generic trade sizes, and cross-supplier compatibility is not assumed.
- **PDF export via headless rendering.** Print CSS plus text and JSON export instead.

## Roadmap

**Phase 2 — done.** Submission schema with plausibility and cross-checks, consensus
with corroboration and conflict detection, review queue, and the studio consuming
contributed geometry in place of the chassis estimate. Still open within it: photo
upload with a calibration reference, and a server-backed store (the schema is already
server-shaped, so that is a transport change rather than a rewrite).

**Phase 3** — Measured assets for E30, E34, W124 and 964; showroom rendering; build
comparison with synchronised views; PDF export.

**Phase 4** — Supplier and community ingestion with schema validation and review;
professional builder accounts and quotations.

### The acquisition question, which is the real one

The code is the easy half. The library is the asset, and it cannot be bought. A workable
sequence:

1. Ship the measurement protocol and the deterministic engine. The engine is what makes a
   contributed measurement worth something to anybody else.
2. Get measured envelopes from the shops that already have the cars on lifts. They are
   also the buyers, because a wrong offset costs them a re-barrel and six weeks.
3. Grade and version every contribution. The grading is the moat: an ungraded fitment
   database is a forum thread, and there are already plenty of those.

---

## Testing

```bash
npm test
```

| Suite | Covers |
| --- | --- |
| `wheel.test.ts` | Standard-formula identity, negative offset, spacers, bead-seat identities, J vs K profile divergence, measured flange override, assembly from mating geometry, offset from pad depth, lip calculation, reverse mount, inverse solve, invalid combinations, hardware count |
| `tire.test.ts` | Measuring rim vs published values, overall diameter for four known sizes, 5 mm-per-half-inch growth, stretch boundaries, approved-range flagging, measured circumference preference, speedo deviation, sidewall-vs-flange widest point, size finder filters |
| `collision.test.ts` | The three acceptance cases from computed distances, arch interference, the evidence rule in three forms, condition skipping, arch-modification credit, exact baseline deltas |
| `optimizer.test.ts` | Constraint enforcement (spacers, stretch, untouched metal, clearance floor, verified-only), rejection reporting, verified/unverified separation, goal ranking |
| `aggregate.test.ts` | Median/MAD, promotion at three distinct submitters, people-not-rows, outlier exclusion, the two-camps case that a MAD-only threshold would miss, instrument honesty, variant rollup, validation cross-checks |
| `contribution-e2e.test.ts` | The acceptance test for the whole loop: identical geometry reads UNKNOWN on the estimate and CLEAR once three people have measured it, and the un-measured well ceiling stays UNKNOWN throughout |
| `library.test.ts` | The counts this README quotes, so the document cannot drift from the data; plus the honesty invariants — a catalogue entry cannot acquire geometry, an illustrative envelope cannot be graded above `estimated`, a reference face cannot become configurable |

The synthetic fixture `FIX-1` produces, from computed distances alone:

- a **clear** case — 7J × 15 ET30, 195/65R15 (strut 18.4 mm, tyre inside the arch opening)
- a **marginal** case — 7J × 15 ET42, 205/60R15 (strut 6.4 mm, under the 8 mm threshold)
- an **interference** case — 8J × 15 ET55, 225/60R15 (strut −19.3 mm)
- an **arch interference** case — 9J × 18 ET0, 265/60R18 (lip −25.0 mm)

---

## Legal position on wheel faces

Original designs in `faces.ts` are defined here by their own parameters and are free to
configure and build. Reference entries name real OEM and aftermarket wheels so a user can
state a target and so the catalogue's intended shape is visible; they carry no geometry
and no asset, and they are not configurable.

Removing a logo does not resolve design or trademark rights in a wheel face, and a
procedural copy of a recognisable proprietary face is still a copy. Using one requires an
authorised reference or a licensed asset. Nothing here implies affiliation with or
endorsement by any manufacturer.

---

## Safety

Nothing in this product establishes structural feasibility, load capacity or road safety.
No machining procedure, torque figure or material rating is produced anywhere. A
visualisation is not engineering proof. An anecdotal no-rub fitment is not a guarantee.
Concept visualisation of an OEM-to-multipiece conversion does not establish that it can be
built.

**Physical test fitting and professional inspection are required before road use.**
