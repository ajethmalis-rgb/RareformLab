import Link from 'next/link';
import { LIBRARY_STATS, VEHICLES } from '@/data/vehicles';
import { ORIGINAL_FACES, REFERENCE_FACES } from '@/data/faces';

export default function Home() {
  const stats = LIBRARY_STATS();
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex items-center gap-3 mb-10">
          <svg width="30" height="30" viewBox="0 0 26 26" aria-hidden>
            <circle cx="13" cy="13" r="12" fill="none" stroke="#c9a063" strokeWidth="1.3" />
            <circle cx="13" cy="13" r="7.4" fill="none" stroke="#7d8894" strokeWidth="0.9" />
            <circle cx="13" cy="13" r="2" fill="#c9a063" />
          </svg>
          <div>
            <h1 className="font-mono text-[15px] font-bold tracking-[0.18em]">RAREFORM FITMENT LAB</h1>
            <p className="font-mono text-[10px] tracking-[0.1em] text-bone-mute">
              BUILD THE WHEEL AROUND THE VEHICLE
            </p>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-bone-dim max-w-2xl">
          A wheel engineering studio for vintage and modern-classic German cars. Offset is
          an output of the build, not an input: you choose the lip you want, and the
          geometry tells you what offset that gives you and whether the car can take it.
        </p>

        <Link href="/studio"
          className="inline-block mt-7 font-mono text-[12px] font-semibold tracking-[0.1em] px-5 py-2.5 rounded"
          style={{ background: '#c9a063', color: '#101316' }}>
          OPEN FITMENT STUDIO →
        </Link>

        <section className="mt-14 border border-line rounded-lg overflow-hidden">
          <div className="phead"><h2 className="lbl" style={{ color: '#b3bbc3' }}>What this does and does not know</h2></div>
          <div className="p-5 text-[13.5px] leading-relaxed text-bone-dim flex flex-col gap-4">
            <p>
              The geometry engine is exact and tested: offset, backspacing, frontspacing,
              bead-seat positions from real flange dimensions, finished width from mating
              geometry rather than advertised sums, mounted section width, rolling
              diameter, camber projection, barrel splits, and every delta against the
              factory package. <span className="text-bone">53 unit tests</span> check it
              against hand-calculated values and published tyre data.
            </p>
            <p>
              <span className="text-bone">Absolute clearance is a different question</span>,
              and it depends on four dimensions of a specific car: where the fender lip
              sits vertically and laterally relative to the hub face, where the nearest
              inner obstruction is, and how much travel is left to the bump stop. Those
              have to be measured. They are not licensable from the manufacturers, and
              they are not in this repository for any real car.
            </p>
            <p>
              So the engine grades every dimension it uses and refuses to return a pass on
              weak evidence. A region governed by an estimated or missing figure reads{' '}
              <span className="font-mono text-[12px]" style={{ color: '#7c858f' }}>UNKNOWN</span>,
              never green. A predicted interference is still reported at any grade, because
              a predicted hit is useful information. The one thing in here that carries a
              verified pass is a synthetic test fixture, and it is not a car.
            </p>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line rounded-lg overflow-hidden">
          {[
            { k: 'Chassis catalogued', v: stats.total, n: 'BMW, Mercedes-Benz, Porsche' },
            { k: 'With verified geometry', v: stats.verified, n: 'clearance analysis available', tone: '#7c858f' },
            { k: 'Illustrative geometry', v: stats.illustrative, n: 'estimated, ranks options only', tone: '#e07b39' },
            { k: 'Catalogue entry only', v: stats.catalogOnly, n: 'name known, no geometry', tone: '#7c858f' },
          ].map(x => (
            <div key={x.k} className="bg-graphite-700 p-4">
              <div className="lbl">{x.k}</div>
              <div className="num text-[26px] font-semibold mt-1" style={{ color: x.tone ?? '#c9a063' }}>{x.v}</div>
              <div className="text-[10.5px] text-bone-mute leading-tight mt-0.5">{x.n}</div>
            </div>
          ))}
        </div>

        <section className="mt-10 grid md:grid-cols-2 gap-5">
          <div className="border border-line rounded-lg p-5">
            <h3 className="lbl mb-2" style={{ color: '#c9a063' }}>Wheel faces</h3>
            <p className="text-[12.5px] leading-relaxed text-bone-dim">
              <span className="text-bone">{ORIGINAL_FACES.length} original designs</span> defined
              here by their own parameters and rendered procedurally. These are configurable
              and buildable.
            </p>
            <p className="text-[12.5px] leading-relaxed text-bone-dim mt-2.5">
              <span className="text-bone">{REFERENCE_FACES.length} reference entries</span> name
              real OEM and aftermarket wheels so you can state a target. They carry no
              geometry and no asset, and they are not configurable. Removing a logo does not
              resolve design rights in a wheel face, and a procedural copy of a recognisable
              face is still a copy. Using one needs a licensed asset, which is an acquisition
              task rather than a code task.
            </p>
          </div>
          <div className="border border-line rounded-lg p-5">
            <h3 className="lbl mb-2" style={{ color: '#c9a063' }}>Build to fit</h3>
            <p className="text-[12.5px] leading-relaxed text-bone-dim">
              Say what you want the wheel to look like and what you refuse to change about
              the car — untouched factory metal, no spacers, no stretched tyres, a minimum
              clearance you will accept. The optimiser searches real component increments
              and reports what the geometry allows.
            </p>
            <p className="text-[12.5px] leading-relaxed text-bone-dim mt-2.5">
              Constraints are never silently relaxed. Combinations that break one are
              rejected with the reason shown, and candidates resting on estimated geometry
              are listed separately from verified ones.
            </p>
          </div>
        </section>

        <p className="mt-10 text-[11.5px] leading-relaxed text-bone-mute max-w-3xl">
          Nothing here establishes structural feasibility, load capacity or road safety. No
          machining procedure, torque figure or material rating is produced anywhere in this
          product. A visualisation is not engineering proof, an anecdotal no-rub fitment is
          not a guarantee, and physical test fitting with professional inspection is required
          before road use. {VEHICLES.length} chassis are catalogued; that is a measure of the
          library&apos;s intended shape, not of how many are ready to analyse.
        </p>
      </div>
    </main>
  );
}
