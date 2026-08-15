/* ==========================================================================
   Who is asking, and what the console is connected to.

   IT FAILS CLOSED BY HAVING NOTHING TO OPEN. There is no staff role in the
   backend — `accounts` carries no such column and no table does — so this
   module cannot check one, and it does not pretend to. What it does instead is
   say so, loudly and permanently, in the bar and in a banner: every screen is a
   placeholder, no endpoint is called, and nothing here is access-controlled.

   That is safe today only because the console does nothing. The moment a screen
   calls something real, the role check has to exist first — the banner is the
   reminder, and `state.staff === null` is the flag a screen must refuse to run
   without.

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

export const state = {
  /* null = unknown, and it stays unknown until something answers */
  account: null,
  /* null = THE CONCEPT DOES NOT EXIST YET. Not false — false would mean "asked
     and refused", and nobody has been asked anything. A screen that acts on
     real data must refuse to run while this is null. */
  staff: null,
  reachable: false,
  problem: hasBackend ? null : 'no backend configured — <meta name="backend"> is empty',
};

/* Reads the session if there is a server to read it from. It never throws: a
   console that cannot boot because the API is down is worse than a console that
   says the API is down. */
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
      state.problem = null;
    } else if (r.status === 401 || r.status === 204) {
      state.account = null;
      state.problem = 'nobody is signed in on this browser';
    } else {
      state.problem = 'the API answered ' + r.status;
    }
  } catch (e) {
    state.reachable = false;
    state.problem = 'the API did not answer (' + (e && e.name ? e.name : 'network') + ')';
  }
  return state;
}

/* What the bar shows: short, and honest about which of the three it is. */
export function connection() {
  if (!hasBackend) return { tone: 'idle', text: 'no backend' };
  if (!state.reachable) return { tone: 'bad', text: 'API unreachable' };
  if (!state.account) return { tone: 'warn', text: 'not signed in' };
  return { tone: 'ok', text: 'connected' };
}

export const displayName = () =>
  state.account?.name || state.account?.email || 'nobody';
