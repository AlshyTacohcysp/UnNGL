# UnNGL — overview

**Anonymous messages where the hint is a person's entire colour palette, and it
costs nothing.**

UnNGL is a free, open source alternative to NGL.link. You share a link, strangers
write to you anonymously, and instead of paying to unlock a vague "profile photo
hint", you get the sender's whole palette: six colours extracted from their photo
by an algorithm published in full, versioned, and independently verifiable.

---

## The idea

The NGL business model *is* the hint. The app can produce one for pennies, charge
you dollars to look at it, and faces no pressure to make it useful. The FTC has
gone after apps using exactly this design, including around children's data.

UnNGL inverts it on every axis:

| | NGL-style | UnNGL |
|---|---|---|
| Cost of a hint | paid in-app purchase, per message | free, always; no purchase button exists |
| What you get | often vague, sometimes fabricated | six exact hex values from a published algorithm |
| Can you verify it? | no | yes — recompute it yourself; the spec is public |
| What happens to photos | stored, and sold | deleted 7 days after the palette is derived |
| IP addresses | stored | never stored raw; a truncated HMAC per message |
| Source | closed | AGPL-3.0, self-hostable, one PostgreSQL database |

**Why a palette is a good hint.** To someone who *knows* you, six colours pulled
from your profile photo is an unmistakable fingerprint. To someone who doesn't,
it is useless. That is exactly the right shape for privacy: it reveals to the
people who already know you, and nothing to anyone else. It cannot be
reverse-searched, and there is nothing to sell.

---

## The product

| Route | What it is |
|---|---|
| `/` | the pitch |
| `/[handle\|slug]` | **your public link.** anyone can write here anonymously. You get a random slug automatically, or you pick a handle such as `amina.k` — both keep working |
| `/i/[handle\|slug]` | your inbox: every message, every palette, nothing locked |
| `/h/[token]` | the sender's private claim link, to attach or change a hint later |
| `/algorithm` | the full public specification, plus a playground that runs in your browser |
| `/login` | email code, or OAuth |
| `/settings` | name, avatar (stored as a palette), email, delete account |
| `/privacy`, `/terms`, `/about` | the short versions |
| `/api/health` | liveness, with an opt-in detail mode |

### The flow, end to end

1. **Get a link.** Sign in with a 6-digit email code, or an OAuth provider. You
   get a short link that is your inbox: 12 characters from a 31-symbol alphabet,
   71 bits of entropy.
2. **Someone writes to you.** No account, no name, no number. They may attach a
   photo purely so you can see their colours.
3. **You see their palette.** Six colours, computed in their browser *and*
   recomputed on our server from the original file. If the two disagree, the
   reader is told and the hint is marked unverified. The photo is deleted after
   7 days.

No step involves a payment, an account, or a coin flip.

### Sign-in

**Email first**: a 6-digit code, no passwords anywhere. Codes are stored only as
an HMAC digest, expire in 10 minutes, are single-use, burn an attempt on failure,
and are rate-limited per address and per IP.

**OAuth** is a generic 2.0/OIDC client — adding a provider is a table entry, not
new code. Google, GitHub, Discord and Facebook are wired up and switch on as soon
as their credentials are set. A provider with a *verified* email that matches an
existing account links to it, which is what makes email and OAuth the same
account rather than two half-accounts.

**On Instagram:** Meta retired the Instagram Basic Display API in December 2024,
so no ordinary app can read an Instagram profile that way any more. A sign-in
button doing it would be a button that cannot work. What remains is Facebook
Login, which can return an Instagram username, so that is the provider labelled
**Facebook / Instagram**. For the palette itself it makes no difference: a photo
and a documented algorithm is all a hint needs.

---

## Design

The direction taken from the screen mockups, built as a system in
`src/app/globals.css`:

- **Figtree** for everything structural; **Instrument Serif** (roman and italic)
  for exactly one thing at a time: a human voice (message bodies, the prompt
  above the composer, captions). Both are vendored through Fontsource.
- The page is a soft lavender field (`#e9e9f2`) and cards float on it in pure
  white, rounded to 24px. **Nothing has an ink outline** — surfaces are
  separated by colour and whitespace, not by a border.
- Ink is a deep navy (`#1b1b33`), never black. It reads softer on lavender.
- **The one hard edge in the app is the shadow under the primary button**: a
  coral slab (`#f2543d`) peeking out below and to the right, the way a
  risograph mis-registers. That is the only place a hard shadow appears.
- Six colours carry the product's promise: amber, coral, teal, indigo, pink, sky.
- The palette is the signature object, and it is always **colour, never a
  photo**: a flat ground with four large cropped circles on the inbox, a
  rounded segmented pill on the composer, a dot pill and a disc in the diagram.

The favicon and Open Graph card are generated by `npm run assets` from the same
six colours, so the identity and the product are visibly the same thing.

---

## Where to go next

- [Getting started](getting-started.md) — run it in 60 seconds
- [Deployment](deployment.md) — Docker, VPS, PaaS, backups
- [Architecture](architecture.md) — how the code is arranged and why
- [The palette algorithm](algorithm.md) — the complete specification
- [API reference](api.md) — every endpoint
- [Security](security.md) — threat model, audit, and hardening
- [Contributing](contributing.md) — how to help
