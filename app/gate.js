/* ==========================================================================
   The screens that stand in front of the console.

   THEY ARE NOT ROUTES. When one of these is showing, the router has not been
   started at all — there is no rail, no hash handling and no screen module
   loaded. That is the point: a console whose sections merely rendered "access
   denied" would still have run every one of their loaders, and one of them
   would eventually fetch something it should not have.

   WHAT THEY ARE NOT is the access control. `web.RequireStaff` on the API is
   that; these three screens are how the console says which of the three it is
   looking at, so somebody staring at it knows whether to sign in, ask for a
   role, or go and look at the API. Removing them would leak nothing and help
   nobody.

     unreachable   the API did not answer, or refused this origin
     anonymous     nobody is signed in — the form
     not-staff     signed in, no role
     (staff)       not here: the console starts

   THEY WEAR THE PORTAL'S SIGN-IN. Same terminal box, same three dots, same
   `.field` and `.btn-primary` — all of which live in `assets/base.css`, which
   is the shared file, so the console spends no styles of its own on them. A
   member of staff signing in here is looking at the same product they look at
   on `app.codeschool.ing`, and a second visual language for the same act would
   be two designs to keep in step for nothing.

   Each returns HTML for the stage and, optionally, a `wire(el, again)` that
   binds its controls. `again` re-reads the session and lets the shell decide
   over — a screen never decides its own successor.
   ========================================================================== */

import { esc } from './dom.js';
import * as session from './session.js';

export function gateScreen(access) {
  if (access === 'unreachable') return unreachable();
  if (access === 'not-staff') return notStaff();
  return signIn();
}

/* The portal's `signin-box`: a terminal window with its three dots and the file
   name at the right. `term-bar`, `dot` and `modal-file` are base.css's — the
   copy checked by CI — so this is the same chrome, not a lookalike. */
const box = (file, body) =>
  '<div class="view view-gate">' +
    '<div class="signin-box">' +
      '<div class="term-bar">' +
        '<span class="dot d-r"></span><span class="dot d-y"></span><span class="dot d-g"></span>' +
        '<span class="modal-file">' + esc(file) + '</span>' +
      '</div>' +
      '<div class="signin-body">' + body + '</div>' +
    '</div>' +
  '</div>';

/* ---------- nobody is signed in ---------- */

function signIn() {
  return {
    title: 'Staff sign-in',
    html: box('console.session',
      '<h1>Staff area</h1>' +
      '<p class="signin-sub">The same account as the portal. A staff role is ' +
        'granted on the account, not on a separate login.</p>' +
      '<form id="signin-form" novalidate>' +
        '<div class="field">' +
          '<label for="signin-email">sign-in e-mail</label>' +
          '<input id="signin-email" type="email" required autocomplete="username" ' +
            'placeholder="you@codeschool.ing" />' +
        '</div>' +
        '<div class="field">' +
          '<label for="signin-password">password</label>' +
          '<input id="signin-password" type="password" required ' +
            'autocomplete="current-password" />' +
        '</div>' +
        /* Hidden until the API asks for it. Rendering it always would invite a
           code from an account that has no second factor. */
        '<div class="field" id="mfa-field" hidden>' +
          '<label for="signin-code">authentication code</label>' +
          '<input id="signin-code" type="text" inputmode="numeric" ' +
            'autocomplete="one-time-code" />' +
        '</div>' +
        '<button type="submit" class="btn btn-primary" id="signin-submit">Sign in</button>' +
      '</form>' +
      '<p class="signin-notice mono dim" id="signin-error" aria-live="polite"></p>'),
    wire(el, again) {
      const form = el.querySelector('#signin-form');
      const notice = el.querySelector('#signin-error');
      const mfaField = el.querySelector('#mfa-field');
      const submit = el.querySelector('#signin-submit');
      let phase = 'credentials';

      const say = (message, tone) => {
        notice.textContent = message || '';
        notice.className = 'signin-notice mono ' + (tone || 'dim');
      };

      el.querySelector('#signin-email').focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        say('');
        submit.disabled = true;
        submit.textContent = 'Signing in…';

        const result = phase === 'credentials'
          ? await session.signIn(
            el.querySelector('#signin-email').value.trim(),
            el.querySelector('#signin-password').value)
          : await session.signInMFA(el.querySelector('#signin-code').value.trim());

        submit.disabled = false;
        submit.textContent = phase === 'credentials' ? 'Sign in' : 'Verify';

        if (result.mfa) {
          /* The password was right and a code is owed. The two fields stay on
             screen so a wrong code does not cost the password again. */
          phase = 'mfa';
          mfaField.hidden = false;
          submit.textContent = 'Verify';
          el.querySelector('#signin-code').focus();
          return;
        }
        if (result.error) { say(result.error, 'bad'); return; }
        again();
      });
    },
  };
}

/* ---------- signed in, and not staff ---------- */

function notStaff() {
  return {
    title: 'This account is not staff',
    html: box('access.denied',
      '<h1>Not staff</h1>' +
      '<p class="signin-sub">Signed in as <b>' + esc(session.displayName()) +
        '</b>. The API answers the console only for an account with a staff ' +
        'role, and this one has none.</p>' +
      '<p class="signin-sub dim">A role is granted with one statement at the ' +
        'database — there is no screen that grants it, here or anywhere. The ' +
        'statement is in <span class="mono">portal-backend/DEPLOY.md</span>, ' +
        'under “Granting staff”.</p>' +
      '<button class="btn btn-ghost" type="button" id="gate-signout">Sign out</button>' +
      '<p class="signin-notice mono dim">no staff role on this account</p>'),
    wire(el, again) {
      el.querySelector('#gate-signout').addEventListener('click', async () => {
        await session.signOut();
        again();
      });
    },
  };
}

/* ---------- the API did not answer ---------- */

function unreachable() {
  return {
    title: 'The API did not answer',
    html: box('api.down',
      '<h1>No answer</h1>' +
      '<p class="signin-sub">The console reached for <span class="mono">' +
        esc(session.BACKEND || 'the same origin') + '</span> and got nothing ' +
        'back.</p>' +
      /* The browser gives a blocked cross-origin request and a dead server the
         same bare TypeError, so the console cannot tell them apart and says so
         rather than picking one and being wrong half the time. */
      '<p class="signin-sub dim">Two causes look identical from here: the ' +
        'service is down, or this origin is missing from ' +
        '<span class="mono">PORTAL_ALLOWED_ORIGINS</span> and the browser ' +
        'blocked the call before it was answered. The browser console names ' +
        'which.</p>' +
      '<button class="btn btn-ghost" type="button" id="gate-retry">Try again</button>' +
      '<p class="signin-notice mono bad">' +
        esc(session.state.problem || 'no answer') + '</p>'),
    wire(el, again) {
      el.querySelector('#gate-retry').addEventListener('click', () => again());
    },
  };
}
