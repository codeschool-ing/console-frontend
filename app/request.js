/* ==========================================================================
   Every call a screen makes, and the one thing they all have to agree about.

   THE GATE DECIDED ONCE, AT BOOT. `app/main.js` asks who is signed in, picks a
   screen from the answer and starts the router. Nothing after that re-asks —
   so a role revoked, a session expired or an API that fell over WHILE the
   console is open would turn every screen into a spinner that never resolves,
   with nothing on the page saying why.

   This is where that is noticed. A 401 or a 403 from any screen means the
   answer the shell decided on has stopped being true, so the shell is told to
   decide again and the right gate screen takes the page over. Every screen gets
   it by calling `get` instead of `fetch`, which is the whole reason this file
   exists rather than a `fetch` in each screen.

   WHAT IT IS NOT is the access control — `web.RequireStaff` on the API is, and
   this only reacts to it. A screen that called `fetch` directly would still be
   refused by the server; what it would lose is the console noticing.

   THE REFUSAL IS NOT AN ERROR THE SCREEN SHOULD DRAW. It throws with `refused`
   set, and a screen that catches it must paint nothing: the shell has already
   replaced the stage, and an error panel drawn over a sign-in form is a page
   showing two answers at once.
   ========================================================================== */

import * as session from './session.js';

/* Set by app/main.js. It is a hook and not an import of `main.js` because that
   module imports the screens, which import this one — and a cycle through the
   boot file is a class of bug that shows up as an undefined function at the
   worst moment. */
let onRefused = () => {};
export const whenRefused = (fn) => { onRefused = fn; };

/* Thrown by `get`. `refused` marks the two the shell handles; everything else
   is the screen's to show. */
export class RequestError extends Error {
  constructor(message, { status = 0, code = '', refused = false } = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    this.refused = refused;
  }
}

/* A GET, as JSON, with the session cookie.

   `params` is an object rather than a built query string: a screen assembling
   its own would have to remember to encode, and the one that forgets is the one
   with a search box in it. Empty and null values are dropped, so an empty search
   sends no `q` at all rather than `q=`.

   The body of both verbs is `send` below; this pair is the whole surface. */
export async function get(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    query.set(k, String(v));
  });
  const suffix = query.toString() ? '?' + query.toString() : '';
  return send('GET', path + suffix);
}

/* A PUT with a JSON body — the console's first write.

   IT SHARES EVERY BRANCH WITH `get`, and that is the whole reason it lives here
   rather than as a `fetch` in the one screen that writes: a 401 or 403 from a
   WRITE is the same stale answer as one from a read. A write that skipped the
   refusal path would leave a screen saying "could not save" when the real
   answer was "you are not staff any more" — and the gate would never go up.

   IT IS DELIBERATELY NOT A GENERAL `request(method, ...)`. Two verbs are what
   the console does; a third arrives with its own reasons, and a helper that
   already took any verb would have it added without them. */
export async function put(path, body) {
  return send('PUT', path, body);
}

async function send(method, path, body) {
  if (!session.hasBackend) {
    throw new RequestError('there is no backend configured', { code: 'no_backend' });
  }

  const init = { method, credentials: 'include', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let r;
  try {
    r = await fetch(session.BACKEND + path, init);
  } catch (e) {
    /* The same bare TypeError a blocked origin gives, so this says both rather
       than picking one — see the gate's `unreachable` screen. */
    throw new RequestError(
      'the API did not answer — it is down, or this origin is not in PORTAL_ALLOWED_ORIGINS',
      { code: 'unreachable' });
  }

  if (r.status === 401 || r.status === 403) {
    /* The shell's answer has gone stale. Re-deciding replaces the whole stage
       with the gate screen that fits, so the caller must not draw anything. */
    onRefused();
    throw new RequestError(
      r.status === 401 ? 'the session has ended' : 'this account is not staff',
      { status: r.status, refused: true });
  }

  const payload = await r.json().catch(() => null);
  if (!r.ok) {
    throw new RequestError(payload?.error?.message || ('the API answered ' + r.status),
      { status: r.status, code: payload?.error?.code || '' });
  }
  return payload;
}
