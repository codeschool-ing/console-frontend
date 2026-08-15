/* ==========================================================================
   Hash routing.

   Hash, and not the History API, for a practical reason: the portal is served as
   a static file (the vitrine already lives on GitHub Pages) and
   `history.pushState` requires the server to return the index at any path. A
   hash works anywhere, including opening the file straight off disk.

   A screen is a function `async (params) => { title, el, after?, onLeave? }`.
   `after` runs AFTER the element enters the document — the graph measures real
   positions and cannot be measured outside the tree. `onLeave` undoes whatever
   the screen registered outside its own element, such as a resize listener.
   ========================================================================== */

const routes = [];

export function route(pattern, load) {
  // '/course/:id/lesson/:ix' → a regex with named groups
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, n) => {
    names.push(n);
    return '([^/]+)';
  }) + '$');
  routes.push({ re, names, load });
}

/* GOING WHERE YOU ALREADY ARE STILL RENDERS. Assigning the hash it already has
   fires no `hashchange`, so nothing re-runs — and the screen keeps showing what
   it was built from, which is not always what the state says any more. That is
   how switching track from the bar left the old graph on screen: `api.enrol()`
   wrote the new track and `goTo('/track')` was a no-op, so the only way to see
   the new one was to leave the screen and come back.

   Re-dispatching is right for every caller, not only that one: `goTo` is asked
   for a screen, and a screen built from stale state is the wrong screen. */
export const goTo = (path) => {
  const target = '#' + path;
  if (location.hash === target) return dispatch();
  location.hash = target;
  return undefined;
};

export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h || '/dashboard';
}

function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { r, params };
  }
  return null;
}

let onChange = () => {};
export function whenChanged(f) { onChange = f; }

export async function dispatch() {
  const path = currentPath();
  const found = match(path);
  await onChange(path, found);
}

export function start() {
  addEventListener('hashchange', dispatch);
  return dispatch();
}
