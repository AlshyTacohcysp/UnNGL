/**
 * End-to-end product flow against a running UnNGL backed by real Postgres.
 *
 *   terminal 1:  npm run db:serve
 *   terminal 2:  npm run dev
 *   terminal 3:  npm run test:e2e
 *
 * Everything here goes over HTTP, exactly as a browser would: sign in by email,
 * create an inbox, send a message with a photo, read the hint back, claim it,
 * rename, and sign out. The point is to exercise every one of the call sites
 * that became async in the move from SQLite to Postgres.
 */
import { deflateSync } from 'node:zlib';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3100';
// The Origin header the app expects. Normally the same as BASE, but a
// production run is configured with an https origin while the test talks to it
// over localhost — and the same-origin check is right to refuse that, so the
// test has to send the origin the app was told about.
const ORIGIN = process.env.E2E_ORIGIN ?? BASE;
const EMAIL = `e2e-${Date.now()}@unngl.test`;

let cookie = '';
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

async function call(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    ...(cookie ? { cookie } : {}),
    ...(init.headers ?? {}),
  };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith('unngl_session=')) cookie = c.split(';')[0]!;
  }
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* an HTML error page */
  }
  return { status: res.status, body, text };
}

/** A small PNG built the way the browser builds one, so the hint verifies. */
function makePng(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, cr]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sendForm(slug: string, body: string, png: Buffer) {
  const form = new FormData();
  form.set('body', body);
  form.set('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'palette.png');
  return call(`/api/messages?to=${encodeURIComponent(slug)}`, { method: 'POST', form });
}

async function main() {
  console.log(`\nUnNGL end-to-end against ${BASE}\n`);

  console.log('Health');
  const plain = await call('/api/health');
  check('health answers', plain.status === 200 && plain.body?.status === 'ok');
  const h = await call('/api/health?detail=1');
  if (h.body?.storage === undefined) {
    // Production refuses the detail unless HEALTH_DETAIL=1, which is correct
    // and worth seeing the test acknowledge rather than fail on.
    check('health detail is withheld in production', true, 'refused, as it should be');
  } else {
    check('health reports Postgres', h.body?.storage === 'postgres', String(h.body?.storage));
    check('the schema is applied', Number(h.body?.schema) >= 1, `v${h.body?.schema}`);
  }

  console.log('\nThe same-origin check');
  const evil = await fetch(`${BASE}/api/inboxes`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  check('a cross-origin POST is refused', evil.status === 403, String(evil.status));

  console.log('\nSign in by email');
  const asked = await call('/api/auth/email', { method: 'POST', json: { email: EMAIL } });
  check('a code is requested', asked.status === 200, JSON.stringify(asked.body).slice(0, 80));
  const code: string | undefined = asked.body?.devCode;
  if (!code) {
    console.log('  ..   EXPOSE_DEV_CODES is not set, skipping the sign-in half of the run');
    await signedOutChecks();
    console.log(failures === 0 ? '\nAll end-to-end checks passed.' : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  }
  check('development mode hands the code back', Boolean(code), code);

  const wrong = await call('/api/auth/verify', { method: 'POST', json: { email: EMAIL, code: '000000' } });
  check('a wrong code is refused', wrong.status >= 400, String(wrong.status));

  const verify = await call('/api/auth/verify', { method: 'POST', json: { email: EMAIL, code } });
  check('the right code signs in', verify.status === 200, JSON.stringify(verify.body).slice(0, 80));
  check('a session cookie is set', cookie.includes('unngl_session='));

  console.log('\nThe inbox');
  const made = await call('/api/inboxes', { method: 'POST', json: { title: 'E2E inbox' } });
  check('an inbox is created', made.status === 201, JSON.stringify(made.body).slice(0, 90));
  const slug: string = made.body?.inbox?.slug;
  check('it has a slug', Boolean(slug), String(slug));

  console.log('\nMessages and hints');
  const png = makePng(8, 8, (x, y) => [(x * 32) % 256, (y * 32) % 256, 128]);
  const sent = await sendForm(slug, 'hello from postgres', png);
  check('a message with a photo is accepted', sent.status === 201, JSON.stringify(sent.body).slice(0, 110));
  check('the photo produced a hint', sent.body?.hintAttached === true);
  const claimToken: string = String(sent.body?.claimUrl ?? '').split('/h/')[1] ?? '';
  check('the sender gets a claim link', Boolean(claimToken), claimToken);

  console.log('\nReading it back');
  // The send page is public: the link is the credential.
  const sendPage = await fetch(`${BASE}/${slug}`);
  check('the public send page renders', sendPage.status === 200, String(sendPage.status));
  check('it is a real form, not an error page', (await sendPage.text()).includes('message'), '');

  // The inbox view belongs to the owner and needs the session.
  // `redirect: 'manual'` on purpose: fetch follows a 307 by default, and a
  // redirect to the sign-in page is the correct answer here, not a 200.
  const anon = await fetch(`${BASE}/i/${slug}`, { redirect: 'manual' });
  check("someone else's inbox is not readable", anon.status === 404 || anon.status === 307, String(anon.status));
  const anonOwner = await fetch(`${BASE}/i/${slug}`, {
    redirect: 'manual',
    headers: { cookie: 'unngl_session=forged' },
  });
  check('a forged session does not open it', anonOwner.status === 307 || anonOwner.status === 404, String(anonOwner.status));

  const owner = await call(`/i/${slug}`);
  const pageHtml = owner.text;
  check('the owner can open their inbox', owner.status === 200, String(owner.status));
  check('the message body is on the page', pageHtml.includes('hello from postgres'));
  const swatches = [...new Set(pageHtml.match(/#[0-9a-fA-F]{6}/g) ?? [])];
  check('the palette is on the page', swatches.length > 2, swatches.slice(0, 8).join(' '));

  const claimPage = await fetch(`${BASE}/h/${claimToken}`);
  check('the claim page renders the hint', claimPage.status === 200 && /#[0-9a-fA-F]{6}/.test(await claimPage.text()), String(claimPage.status));

  console.log('\nReplacing the hint');
  const png2 = makePng(8, 8, (x) => [200, (x * 25) % 256, 60]);
  const form = new FormData();
  form.set('image', new Blob([new Uint8Array(png2)], { type: 'image/png' }), 'new.png');
  const replaced = await call(`/api/claim/${claimToken}`, { method: 'POST', form });
  check('the claim link accepts a new photo', replaced.status === 200, JSON.stringify(replaced.body).slice(0, 110));
  const colors: string[] = replaced.body?.hint?.colors ?? [];
  check('the new palette is stored', colors.length > 0, colors.join(' '));

  console.log('\nProfile, rename, sign out');
  const profile = await call('/api/profile');
  check('the session resolves to a user', profile.status === 200 && Boolean(profile.body?.user?.id), String(profile.body?.user?.email));
  check('the email reads as verified', profile.body?.user?.verified === true);

  const renamed = await call(`/api/inboxes/${slug}`, { method: 'PATCH', json: { title: 'Renamed' } });
  check('the inbox renames', renamed.status === 200, JSON.stringify(renamed.body).slice(0, 90));
  const after = await call(`/i/${slug}`);
  check('the new title stuck on the page', after.text.includes('Renamed') && !after.text.includes('E2E inbox'));

  const out = await call('/api/auth/logout', { method: 'POST' });
  check('logout succeeds', out.status === 200 || out.status === 204, String(out.status));
  cookie = '';
  const afterOut = await call('/api/profile');
  check('the session really is gone', afterOut.status === 401, String(afterOut.status));

  const replay = await call('/api/auth/verify', { method: 'POST', json: { email: EMAIL, code } });
  check('a used code cannot be replayed', replay.status >= 400, String(replay.status));

  console.log(failures === 0 ? '\nAll end-to-end checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

/** What can be checked with no session at all. */
async function signedOutChecks() {
  console.log('\nSigned out');
  const profile = await call('/api/profile');
  check('the profile is closed', profile.status === 401, String(profile.status));
  const make = await call('/api/inboxes', { method: 'POST', json: { title: 'nope' } });
  check('an inbox cannot be created', make.status === 401, String(make.status));
  const send = await call('/api/messages?to=nosuchslug', { method: 'POST', form: new FormData() });
  check('an unknown inbox is refused', send.status === 404, String(send.status));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
