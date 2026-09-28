import Link from 'next/link';
import type { Metadata } from 'next';
import { AlgorithmPlayground } from '@/components/algorithm-playground';
import { PaletteCollage } from '@/components/palette-collage';
import { SUNSET } from '@/lib/samples.generated';
import {
  ALGORITHM_VERSION,
  CHROMA_FLOOR,
  CHROMA_OUTLIER,
  CHROMA_REF,
  LONG_EDGE,
  MAX_OUTLIER_WEIGHT,
  MERGE_DISTANCE,
  MIN_ALPHA,
  PALETTE_SIZE,
  SAMPLE_GRID,
} from '@/lib/palette/extract';

export const metadata: Metadata = {
  title: 'The UnNGL palette algorithm, in full',
  description:
    'The complete, public specification of how UnNGL turns a photo into six colours: every constant, every step, and the code that implements it.',
  alternates: { canonical: '/algorithm' },
};

const CONSTANTS: Array<[string, string, string]> = [
  ['PALETTE_SIZE', String(PALETTE_SIZE), 'colours in a hint'],
  ['SAMPLE_GRID', `${SAMPLE_GRID}×${SAMPLE_GRID}`, 'samples taken, whatever the image size'],
  ['LONG_EDGE', String(LONG_EDGE), 'box-filter target before sampling'],
  ['MIN_ALPHA', String(MIN_ALPHA), 'samples more transparent than this are ignored'],
  ['CHROMA_FLOOR', String(CHROMA_FLOOR), 'weight floor for grey pixels'],
  ['CHROMA_REF', String(CHROMA_REF), 'chroma at which a sample gets full weight'],
  ['CHROMA_OUTLIER', String(CHROMA_OUTLIER), 'below this chroma, a cluster may be dropped'],
  ['MAX_OUTLIER_WEIGHT', String(MAX_OUTLIER_WEIGHT), 'never drop more than this share'],
  ['MERGE_DISTANCE', String(MERGE_DISTANCE), 'OKLab distance at which two clusters merge'],
  ['KMEANS_ITERATIONS', '24', 'fixed budget; no epsilon-based early exit'],
];

export default function AlgorithmPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="pill pill-outline">public spec</p>
        <h1 className="display-lg mt-4">The UnNGL palette algorithm</h1>
        <p className="serif-accent mt-3 text-2xl leading-snug">
          Version {ALGORITHM_VERSION}. If you can read this page and write some code, you can
          reproduce any hint UnNGL has ever produced.
        </p>
        <p className="mt-5 max-w-prose leading-relaxed">
          There is no secret step. No model, no service, no API — just resampling, a colour
          space, and weighted k-means. It is deterministic, so the same photo always yields the
          same six colours in the same order, and that property is what makes a hint
          checkable.
        </p>
      </header>

      <div className="my-10">
        <AlgorithmPlayground />
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="prose-unngl">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Why publish it</h2>
        <p>
          A “hint” is only worth anything if you can trust it. If the server can quietly
          decide that a hint is “too vague” and charge you, or show you a different photo
          than the one that was submitted, the whole feature is a slot machine. Publishing the
          algorithm turns the claim from{' '}
          <em>“trust us, this is who it is”</em> into <em>“here are six hex values, here is
          the input, check it yourself”</em>.
        </p>
        <p>
          It also means someone can point UnNGL at their own implementation, get the same
          hashes, and build tools on top of it. That is the point of open source.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Constants</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-0 bg-surface-sunk text-left">
                <th className="p-2">name</th>
                <th className="p-2">value</th>
                <th className="p-2">meaning</th>
              </tr>
            </thead>
            <tbody>
              {CONSTANTS.map(([name, value, meaning]) => (
                <tr key={name} className="border-0">
                  <td className="font-mono text-[0.68rem] p-2 align-top">{name}</td>
                  <td className="p-2 align-top font-semibold">{value}</td>
                  <td className="p-2 align-top text-ink-soft">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="prose-unngl mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">The steps</h2>

        <h3>0. Input</h3>
        <p>
          A decoded RGBA8 image, any dimensions. In UnNGL the browser scales the upload to a
          512px longest edge and stores it as a lossless PNG; the server decodes those exact
          bytes. Implementations may start from any resolution — the algorithm is defined to be
          resolution-independent (see “Guarantees”).
        </p>

        <h3>1. Box-filter to {LONG_EDGE}px</h3>
        <p>
          If the longest edge exceeds {LONG_EDGE}, average it down in premultiplied alpha, so
          transparent pixels do not bleed black into their neighbours. Images already at or
          under {LONG_EDGE} pass through untouched.
        </p>

        <h3>2. Sample a fixed {SAMPLE_GRID}×{SAMPLE_GRID} lattice</h3>
        <p>
          Divide the filtered image into {SAMPLE_GRID}×{SAMPLE_GRID} cells and average each
          cell in premultiplied alpha again. This yields exactly {SAMPLE_GRID * SAMPLE_GRID}{' '}
          samples no matter the input size — constant runtime, and no dependence on a browser's
          idea of how many pixels an image “has”.
        </p>

        <h3>3. Convert to OKLab, weight, drop</h3>
        <p>
          Each sample is converted from sRGB to OKLab (Björn Ottosson, 2020). Samples with
          alpha below {MIN_ALPHA} are discarded entirely. Every remaining sample gets a weight:
        </p>
        <pre className="font-mono text-[0.68rem] overflow-x-auto border-0 bg-ink p-3 text-white">
          {`w = alpha * (CHROMA_FLOOR + (1 - CHROMA_FLOOR) * min(1, C / CHROMA_REF))`}
        </pre>
        <p>
          where <code>C</code> is the OKLab chroma <code>sqrt(a² + b²)</code>. A photo is
          mostly background, and without this bias the six slots fill with greys. The floor
          keeps genuine neutrals in play — a black-and-white profile photo should still produce
          a black-and-white palette.
        </p>

        <h3>4. Weighted k-means, deterministically seeded</h3>
        <p>
          Run at most {PALETTE_SIZE} clusters for a fixed 24 Lloyd iterations (or until no
          sample changes cluster). Seeding is farthest-point: the first centre is the
          highest-weight sample, and each subsequent centre is the sample furthest (in a
          chroma-weighted OKLab distance) from every centre chosen so far. No random numbers
          are involved anywhere.
        </p>

        <h3>5. Merge, prune, order</h3>
        <p>
          Clusters within OKLab distance {MERGE_DISTANCE} of each other are merged, weighted by
          mass. Clusters with chroma below {CHROMA_OUTLIER} are dropped as outliers — unless
          that would discard more than {Math.round(MAX_OUTLIER_WEIGHT * 100)}% of the total
          weight, in which case they are all kept (a greyscale image is not “all outlier”).
          Finally the clusters are ordered by weight, descending, with ties broken by hue then
          lightness so the order is total. If fewer than six survive, the dominant colour is
          repeated to fill the palette: a hint is always six values.
        </p>

        <h3>6. Output</h3>
        <p>
          Each cluster centre is converted back to sRGB, clamped per channel and rounded to
          two hex digits. The first colour is the dominant one, and its share of the total
          weight is reported to three decimals.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="prose-unngl mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Canonical form and hashing</h2>
        <p>
          A palette is serialised with fixed key order and a fixed array length, so it hashes
          identically forever:
        </p>
        <pre className="font-mono text-[0.68rem] overflow-x-auto border-0 bg-ink p-3 text-white">
          {'{"v":"1.0.0","colors":["#a12247","#238782","#e4ba9e","#645566","#bc696d","#89a392"],"weight":0.53}'}
        </pre>
        <p>
          The hash is FNV-1a (32-bit) over those UTF-8 bytes, rendered as eight lowercase hex
          digits. The example above is the studio sample used elsewhere on this site.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="prose-unngl mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Guarantees</h2>
        <ul>
          <li>
            <strong>Deterministic.</strong> Same bytes in, same six hex values out, on every
            machine and every run. No RNG, no locale, no time.
          </li>
          <li>
            <strong>Constant work.</strong> {SAMPLE_GRID * SAMPLE_GRID} samples, 24
            iterations, 6 clusters. A 4000px photo costs the same as a 64px avatar.
          </li>
          <li>
            <strong>Resolution-independent.</strong> The same scene rendered at two sizes
            produces the same palette to within about 0.01 in OKLab distance — a couple of
            8-bit steps, which is what resampling quantisation costs.
          </li>
          <li>
            <strong>Verifiable.</strong> UnNGL recomputes every hint server-side from the
            uploaded PNG and compares hashes. A mismatch is shown to the reader as
            unverified rather than hidden.
          </li>
          <li>
            <strong>Six values, always.</strong> A palette with fewer than six distinct
            clusters is padded by repeating the dominant colour. A viewer never has to handle
            a variable-length palette.
          </li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Reference implementation</h2>
        <p className="mt-4 leading-relaxed">
          The single file that implements everything above, dependency-free, runs in both the
          browser and Node. It is the code UnNGL actually uses, not a simplified illustration.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="https://github.com/AlshyTacohcysp/UnNGL/blob/main/src/lib/palette/extract.ts"
            className="btn"
            target="_blank"
            rel="noreferrer noopener"
          >
            extract.ts
          </a>
          <a
            href="https://github.com/AlshyTacohcysp/UnNGL/blob/main/tests/palette.test.ts"
            className="btn"
            target="_blank"
            rel="noreferrer noopener"
          >
            the tests (including a golden hash)
          </a>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="display-md border-b-[2.5px] border-ink pb-2">Version history</h2>
        <ul className="mt-4 flex flex-col gap-3">
          <li className="card-flat p-4">
            <p className="label">v{ALGORITHM_VERSION} — current</p>
            <p className="leading-relaxed">
              Fixed-lattice resampling, chroma-weighted seeding, merge + outlier pruning,
              canonical hashing. Every hint on this deployment was produced by this version.
            </p>
            <div className="mt-3">
              <PaletteCollage colors={SUNSET.colors} footnote verified />
            </div>
          </li>
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          Changing anything in the table above is a new version. The old one stays documented
          forever, because existing hints were computed with it and must remain checkable.
        </p>
      </section>

      <p className="mt-12 text-center">
        <Link href="/login" className="btn btn-outline">
          Try it with your own photo →
        </Link>
      </p>
    </div>
  );
}
