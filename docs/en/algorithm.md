# The palette algorithm, in full

**Version 1.0.0.** This page is the specification. The reference implementation is
[`src/lib/palette/extract.ts`](../../src/lib/palette/extract.ts) — the same file
the browser and the server both import. There is a live playground at
[`/algorithm`](https://unngl.link/algorithm) that runs it in your browser, and a test suite with a
golden hash so that any change to the output fails CI.

The point of publishing all of this is simple: **a hint you cannot verify is a
hint you cannot trust.** If you are going to tell people that six hex codes came
from a specific photo, the process that produced them has to be checkable by
someone who does not trust us.

---

## Contract

```
extractPalette(data: RGBA bytes, width: number, height: number) -> {
  colors:  string[6],   // "#rrggbb", most dominant first
  primary: string,      // == colors[0]
  weight:  number       // 0..1, 3 decimals: share of weighted mass in colors[0]
}
```

Pure. No DOM, no I/O, no randomness, no clock, no network. Same input bytes, same
output, on any machine, in any JavaScript engine, forever.

### Constants

| Name | Value | Meaning |
|---|---|---|
| `PALETTE_SIZE` | `6` | how many colours. The *entire* palette, not a preview. |
| `SAMPLE_GRID` | `64` | the resampling lattice is 64 × 64 |
| `LONG_EDGE` | `256` | the source is box-filtered down to at most this |
| `MIN_ALPHA` | `0.5` | samples below this alpha are ignored entirely |
| `CHROMA_FLOOR` | `0.35` | every sample keeps at least this share of its weight |
| `CHROMA_REF` | `0.16` | chroma at which a sample gets full chroma weight |
| `KMEANS_ITERATIONS` | `24` | fixed iteration budget, not epsilon-based |
| `MERGE_DISTANCE` | `0.01` | clusters closer than this in OKLab are merged |
| `CHROMA_OUTLIER` | `0.012` | clusters below this chroma are dropped as outliers |
| `MAX_OUTLIER_WEIGHT` | `0.4` | …unless that would discard more than 40% of the weight |

Every one of these is public and versioned. Changing any of them is a major
version bump and a new `ALGORITHM_VERSION`.

---

## Step 1 — sRGB → linear → OKLab

Colour clustering in sRGB is a mistake: sRGB is not perceptually uniform, so
"nearest colour" in RGB is not "nearest colour" to a human eye. Everything is done
in **OKLab** (Björn Ottosson, 2020).

**sRGB → linear** (IEC 61966-2-1 transfer function):

```
c_lin = c ≤ 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4
```

**linear sRGB → OKLab**: cube-root the LMS cone responses, then apply M2.

```
l = (0.4122214708·r + 0.5363325363·g + 0.0514459929·b) ^ (1/3)
m = (0.2119034982·r + 0.6806995451·g + 0.1073969566·b) ^ (1/3)
s = (0.0883024619·r + 0.2817188376·g + 0.6299787005·b) ^ (1/3)

L =  0.2104542553·l + 0.7936177850·m − 0.0040720468·s
a =  1.9779984951·l − 2.4285922050·m + 0.4505937099·s
b =  0.0259040371·l + 0.7827717662·m − 0.8086757660·s
```

**Chroma** is `C = hypot(a, b)` — how colourful a sample is, independent of
lightness.

## Step 2 — Deterministic resampling

The image is reduced to a **fixed** number of samples, so run time and output
never depend on the input dimensions.

1. **Box-filter** the source down to at most `LONG_EDGE` (256) on the longest
   side. Averaging happens in **premultiplied alpha**, so transparent edges do
   not bleed black inward. If the image is already small enough, this step is
   skipped entirely.
2. **Sample a 64 × 64 lattice.** Each cell of the lattice is box-filtered into one
   sample. If a cell is fully transparent, it is skipped — a transparent pixel
   has no colour, and inventing one would bias the result.
3. **Un-premultiply** the surviving cell, convert to OKLab, and compute its
   weight:

```
alpha = mean cell alpha
if alpha < 0.5            -> skip the cell
C      = chroma(lab)
weight = alpha × (0.35 + 0.65 × min(1, C / 0.16))
```

**Why the chroma bias.** Without it, a portrait is mostly background — skin, sky,
walls — and the six slots fill with beige and grey. The hint stops being a "look
at this person" signal. The floor means a grey pixel still counts, at 35% of its
alpha weight, so genuinely grey images still produce grey palettes; the bias only
stops grey from *dominating*.

Result: exactly 4096 samples (fewer only if whole cells were transparent), each
an OKLab triple plus a weight. `Float64Array` throughout.

## Step 3 — Deterministic weighted k-means

Six clusters. Every step of the randomness is removed.

**Seeding — farthest point:**

1. The first centre is the sample with the **highest weight**. Ties break by
   lowest `L`, then lowest `a`.
2. Each subsequent centre is the sample that is **furthest from every centre
   chosen so far**, under the metric below. Ties break to the lowest index.

**The metric** weights chroma up by 1.4:

```
d² = ΔL² + (1.4·Δa)² + (1.4·Δb)²
```

Two colours with the same lightness but different hues are far more
distinguishable than two shades of the same grey, and this says so.

**Lloyd iterations** run for a **fixed 24 iterations**, not until convergence.
An epsilon-based early exit is the classic way two machines end up disagreeing
about a floating-point boundary; a fixed budget cannot. Assignments and centre
recomputation are done in `f64` and rounded exactly once, at the very end.

Clusters with zero weight are discarded.

## Step 4 — Merge, drop, order

**Merge.** Any two centres within `MERGE_DISTANCE` (0.01) in OKLab are combined
into their weight-averaged position. 0.01 is roughly 0.6% of the unit gamut
diagonal — below that, two "different" colours are the same colour to a human.
After merging you may have fewer than six.

**Drop outliers.** Any centre with chroma below `CHROMA_OUTLIER` (0.012) is
dropped — the small saturated speck that happens to be in the photo, like the red
car in a grey picture. But if dropping them would have discarded **more than 40%**
of the total weight, the "outliers" were the picture after all, so they are all
put back. This guard is what stops a mostly-grey image with one colourful corner
from returning a single-colour palette.

**Order.** By descending weight. Ties break by hue angle (`atan2(b, a)`, 0..360),
then by ascending `L`. Fully specified, so the order is stable.

## Step 5 — Output

Each centre is converted back through OKLab → linear sRGB → sRGB, **clipped per
channel** to 0..255, and formatted as lowercase `#rrggbb`. No alpha, no 8-digit
hex, no colour names.

If fewer than six centres survive, the remaining slots are filled by **repeating
the most dominant colour**. The palette is always exactly six entries, so the
collage layout is always the same, and a two-colour image is honestly reported as
two colours rather than padded with noise.

`weight` is `colors[0]`'s share of the total weighted mass, to three decimals.

### Edge cases, specified

| Input | Output |
|---|---|
| fully transparent image | six × `#000000`, `weight: 0` |
| single colour image | that colour × 6 |
| greyscale image | greys (the chroma floor keeps them, at reduced weight) |
| 1 × 1 pixel | that pixel's colour × 6 |
| extreme aspect ratio | unchanged — the lattice is always 64 × 64 |

## Integrity

Every palette ships with a hash so a reader can check it has not been altered in
transit:

```
canonical = {"v":"1.0.0","colors":[...],"weight":0.123}   // fixed key order
hash      = FNV-1a 32-bit(canonical), lowercase hex, 8 characters
```

The canonical form fixes both the key order and the array length, so the hash is
stable forever. FNV-1a is not a cryptographic hash — it is a checksum whose only
job is to catch a corrupted or hand-edited palette, and it is not used for any
security decision. Anything that matters is verified by *recomputing* the palette
from the image, not by comparing hashes.

---

## How the server verifies a hint

This is the part that makes the whole thing honest.

1. The sender's browser decodes their photo, runs `extractPalette`, and shows
   them six colours immediately. It sends the image **and** the six hex values.
2. The server decodes the **original uploaded file** with its own decoder
   (`src/lib/palette/png.ts` — no dependencies, hard size bounds) and runs
   `extractPalette` on the real pixels.
3. It compares the server's result with the claimed result.
4. **Equal** → the hint is stored as `verified`. **Different** → stored as
   `unverified`, and the reader is shown that the claim did not match the file.

The sender's claim is never taken at face value, and the app does not need to be
in the loop for that to be true. Someone could patch the browser, forge the hex
values, and the server would still compute the truth from the bytes it received.

This is also why the app accepts PNG on the server: a format with a fully
specified, dependency-free decode path that can be bounds-checked before anything
is allocated.

## Reimplementing it

If you want to check our work — and you should — the algorithm is about 200 lines
of arithmetic with no dependencies. In order:

1. Decode to RGBA.
2. Box-filter to 256 on the long edge, premultiplied alpha.
3. Sample a 64 × 64 lattice, skipping cells under 0.5 alpha.
4. Convert to OKLab; weight by `alpha × (0.35 + 0.65·min(1, C/0.16))`.
5. Farthest-point-seed 6 clusters; run 24 weighted Lloyd iterations with the
   1.4× chroma metric.
6. Merge within 0.01; drop chroma < 0.012 unless that exceeds 40% of the weight.
7. Order by weight, then hue, then lightness. Convert to sRGB, clip, format.
8. Pad to six by repeating the dominant colour.

The test suite pins the output for fixed inputs with a golden hash
(`26d88308`), so an independent implementation that matches on the fixtures
matches everywhere.

## Versioning

`ALGORITHM_VERSION` is stored on every hint row. If the algorithm ever changes in
a way that alters output, the version changes too, and old hints keep rendering
with the version that produced them. A palette from `1.0.0` is a historical fact
about a photo, not a recomputation waiting to be invalidated by a deploy.

## Licence

The algorithm and its reference implementation are part of UnNGL and are
**AGPL-3.0-or-later**. Reimplement it, translate it, or use it in a closed-source
service of your own — the algorithm is a published method, and only the software
that ships it carries the copyleft obligation.
