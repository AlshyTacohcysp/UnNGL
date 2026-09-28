# Contributing

UnNGL is AGPL-3.0-or-later. Contributions are welcome, and the bar is about
intent, not ceremony: a change should make the product better *or* make it
harder to abuse, and it should come with a reason.

## Getting set up

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm install
npm run dev
```

Node 22.5 or newer is required — UnNGL uses the built-in `node:sqlite`, so there
is no native module to compile. If `npm install` tries to run `node-gyp`,
something is wrong; it should not.

```bash
npm test          # must pass
npm run typecheck # must pass
npm run build     # must pass
```

All three are expected before you open a pull request.

## What is useful

**In rough order of how much it would help:**

1. **Translations.** The interface is English-only right now. A French
   translation is already documented; other languages would be genuinely
   valuable.
2. **OAuth providers.** `src/lib/oauth.ts` is a table plus a small amount of
   per-provider metadata. Adding one should be a few lines, not a new module.
3. **A second image format on the verification path.** Currently PNG only,
   because it is the only format with a fully specified, bounds-checkable decode
   path that can be written without dependencies. JPEG would be the obvious next
   step, and it would need the same care: bounds before allocation, no unbounded
   inflate, no reliance on `Content-Length`.
4. **Accessibility.** Real work: keyboard paths through the composer, focus
   management in the inbox, `prefers-reduced-motion` throughout, and contrast
   checks on the collage palette. The design is deliberately loud; it does not
   need to be inaccessible.
5. **Moderation hooks.** The app has no abuse reporting today, and that is a real
   gap for a public deployment. A documented, self-hosted reporting path would
   help.
6. **Bugs and security findings.** See [security](security.md#reporting-a-vulnerability).

## What will probably be declined

- **A paywall, a premium tier, or any purchase button.** Not a style
  disagreement — it is the entire premise. A hint that costs money is the thing
  this project exists to replace.
- **Analytics of any kind.** Not even aggregate, not even self-hosted. The
  privacy claim is load-bearing on the product, and a script that watches
  visitors would be a regression in the only sense that matters here.
- **A new runtime dependency**, for convenience. See
  [architecture](architecture.md#dependencies) for the reasoning. If you truly
  need one, open an issue first and make the case.
- **A change to the palette algorithm that alters output**, without a version
  bump and a discussion. The algorithm is a published specification and a
  golden-hash test guards it. Changing it silently would invalidate every hint
  already in the wild.
- **Removing a security control** without a very good reason and a test proving
  the reason still holds.

## Style

There is no linter config, and the code is written in a fairly plain style. Match
the file you are in.

- **Comments explain *why*, not *what*.** The codebase has comments where a
  decision is non-obvious — why the limiter fails closed, why the PNG decoder
  caps the inflate, why the seeding is farthest-point. It does not have comments
  restating the code.
- **No clever code.** These files get read by people auditing an anonymous
  message app under time pressure. Clear beats compact.
- **Every route goes through `route()`** in `src/lib/http.ts`. That is what makes
  the same-origin check unbypassable by a future contributor.
- **Every request body gets a `zod` schema** in `src/lib/validation.ts`.
- **Secrets are stored as HMAC digests**, never plaintext. If you add a token,
  follow the pattern in `src/lib/crypto.ts`.

## Tests

Two files, and they are different in kind:

- `tests/palette.test.ts` pins the algorithm's output, including a golden hash
  that fails on any unintended change. If your change alters the output, that is
  a deliberate act, not an accident.
- `tests/security.test.ts` is a regression suite. Each test corresponds to a real
  defect or a real attack, and is written to fail loudly if the protection is
  removed. **Adding a test here is one of the most valuable contributions you
  can make** — find a weakness, fix it, and leave the test behind.

## Pull requests

1. Branch from `main`.
2. Make sure `npm test && npm run typecheck && npm run build` all pass.
3. Explain what changed and why. If it closes an issue, say so.
4. If it touches the algorithm, the database schema, or anything security
   related, say so explicitly — those get looked at more carefully.

## Licence

Contributions are accepted under **AGPL-3.0-or-later**, the same terms the
project ships under. If you are contributing on behalf of an employer, check
that this is permitted.

The copyleft is deliberate and not a licensing accident. A hosted version of this
app has a duty to offer its users the corresponding source. That is a feature: it
means nobody can take this and turn it into a closed product with a paywall.
