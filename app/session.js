/* ==========================================================================
   Who is asking, and what the console is connected to.

   THE ROLE EXISTS NOW. `accounts.staff_role` is a column, `web.RequireStaff`
   refuses anyone without it, and `GET /api/session` reports it as `staff`. This
   module reads that field; it does not decide anything with it that the API
   does not decide again. A console that hid its own screens while calling an
   API that answered anyway would be a lock painted on a door.

   So the rule this file used to state — that nothing here is access-controlled
   — is retired, and the one replacing it is narrower: **what the console shows
   is a courtesy, what the API refuses is the control.** Every screen still
   calls an endpoint behind `RequireStaff`, and a screen that forgets to is a
   bug the API catches.

   FIVE ANSWERS, not two, because they need five different screens: no backend
   at all, a backend that did not answer, nobody signed in, somebody signed in
   without the role, and staff. `access()` below is that decision, in one place.

   The backend is read from <meta name="backend">, exactly as the portal reads
   it: empty means no server, which is what a local run and the browser suite
   both need.
   ========================================================================== */

const meta = document.querySelector('meta[name="backend"]');
const configured = (meta?.content || '').trim();

/* 'same-origin' is a shape, not an origin: one host in front of both, with the
   API under /api. It has to be spelled out because the base URL it means is the
   empty string, and empty is already taken by "no backend". */
export const BACKEND = configured === 'same-origin' ? '' : configured;
export const hasBackend = configured !== '';

/* Where staff go to turn on two-factor — the student portal, because that is
   where enrolment lives. Empty on a local run, and the screen that needs it
   says the address in words rather than linking nowhere. */
export const PORTAL = (document.querySelector('meta[name="portal"]')?.content || '').trim();

export const state = {
  /* null = unknown, and it stays unknown until something answers */
  account: null,
  /* null = NOBODY HAS ANSWERED YET. Not '' — the empty string is the API
     saying "this account has no role", which is a different thing from not
     having asked, and the two lead to different screens. */
  staff: null,
  /* Whether this staff account owes a second factor before the API will serve
     it. The SERVER decides — one field, `staffNeedsMfa` — because the rule has
     two halves (does this deployment offer two-factor, does this account have
     one) and re-deriving it here would be a second copy of a policy. */
  needsFactor: false,
  reachable: false,
  problem: hasBackend ? null : 'no backend configured — <meta name="backend"> is empty',
};

/* Reads the session if there is a server to read it from. It never throws: a
   console that cannot boot because the API is down is worse than a console that
   says the API is down.

   A cross-origin refusal — this console's origin missing from
   PORTAL_ALLOWED_ORIGINS — reaches JavaScript as a bare TypeError with no
   detail, by the browser's design. It lands in the same branch as an API that
   is genuinely down, which is why the message names both rather than asserting
   either. */
export async function load() {
  if (!hasBackend) return state;
  try {
    const r = await fetch(BACKEND + '/api/session', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    state.reachable = true;
    if (r.status === 200) {
      const body = await r.json().catch(() => null);
      state.account = body && (body.account || body);
      /* The API omits `staff` for everyone without a role, so the empty string
         is the answer for a student — and it is an ANSWER, not a silence. */
      state.staff = (state.account && state.account.staff) || '';
      state.needsFactor = !!(state.account && state.account.staffNeedsMfa);
      state.problem = null;
    } else if (r.status === 401 || r.status === 204) {
      state.account = null;
      state.staff = '';
      state.needsFactor = false;
      state.problem = 'nobody is signed in on this browser';
    } else {
      state.staff = null;
      state.problem = 'the API answered ' + r.status;
    }
  } catch (e) {
    state.reachable = false;
    state.staff = null;
    state.problem = 'the API did not answer — it is down, or this origin is not in '
      + 'PORTAL_ALLOWED_ORIGINS (' + (e && e.name ? e.name : 'network') + ')';
  }
  return state;
}

/* The six, in the order they have to be checked: each is only meaningful once
   the one before it is ruled out. This is the only place the console decides
   what it is looking at. */
export function access() {
  if (!hasBackend) return 'no-backend';
  if (!state.reachable) return 'unreachable';
  if (!state.account) return 'anonymous';
  if (!state.staff) return 'not-staff';
  /* AFTER the role and before the console. Somebody with no role is told they
     have no role; being sent to set up two-factor for a console they may not
     use either way would be advice that leads nowhere. */
  if (state.needsFactor) return 'staff-no-factor';
  return 'staff';
}

/* ---------- signing in ----------
   The console has a form of its own rather than sending staff to the student
   portal to sign in and walk back. It is the same endpoint and the same cookie
   — the cookie is issued for the whole of codeschool.ing — so this costs a form
   and nothing at all on the server. */

/* Answers { ok } | { mfa: true } | { error }. It never throws, for the reason
   load() does not: the form has to be able to say what went wrong. */
export async function signIn(email, password) {
  return post('/api/session', { email, password });
}

/* The second step, for an account with two-factor on. It exists even though the
   deployment has MFA off today: a staff account is exactly the account somebody
   turns it on for, and a console that locked out the first person to do so
   would be found the hard way. */
export async function signInMFA(code) {
  return post('/api/session/mfa', { code });
}

async function post(path, body) {
  if (!hasBackend) return { error: 'there is no backend configured' };
  try {
    const r = await fetch(BACKEND + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await r.json().catch(() => null);
    if (r.status === 200 && payload && payload.mfaRequired) return { mfa: true };
    if (r.ok) return { ok: true };
    return {
      error: payload?.error?.message || ('the API answered ' + r.status),
    };
  } catch (e) {
    return { error: 'the API did not answer (' + (e && e.name ? e.name : 'network') + ')' };
  }
}

export async function signOut() {
  if (hasBackend) {
    try {
      await fetch(BACKEND + '/api/session', { method: 'DELETE', credentials: 'include' });
    } catch (e) { /* the local state is cleared either way */ }
  }
  state.account = null;
  state.staff = '';
}

/* What the bar shows: short, and honest about which of the five it is. */
export function connection() {
  switch (access()) {
    case 'no-backend': return { tone: 'idle', text: 'no backend' };
    case 'unreachable': return { tone: 'bad', text: 'API unreachable' };
    case 'anonymous': return { tone: 'warn', text: 'not signed in' };
    case 'not-staff': return { tone: 'bad', text: 'not staff' };
    case 'staff-no-factor': return { tone: 'warn', text: 'two-factor required' };
    default: return { tone: 'ok', text: 'connected' };
  }
}

export const displayName = () =>
  state.account?.name || state.account?.email || 'nobody';
