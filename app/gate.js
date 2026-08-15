/* ==========================================================================
   The screens that stand in front of the console.

   THEY ARE NOT ROUTES. When one of these is showing, the router has not been
   started at all — there is no rail, no hash handling and no screen module
   loaded. That is the point: a console whose sections merely rendered "access
   denied" would still have run every one of their loaders, and one of them
   would eventually fetch something it should not have.

   WHAT THEY ARE NOT is the access control. `web.RequireStaff` on the API is
   that; these four screens are how the console says which of the four it is
   looking at, so somebody staring at it knows whether to sign in, ask for a
   role, or go and look at the API. Removing them would leak nothing and help
   nobody.

     unreachable   the API did not answer, or refused this origin
     anonymous     nobody is signed in — the form
     not-staff     signed in, no role
     (staff)       not here: the console starts

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

/* ---------- nobody is signed in ---------- */

function signIn() {
  return {
    title: 'Staff sign-in',
    html:
      '<div class="view view-gate">' +
        '<header class="view-head">' +
          '<span class="eyebrow mono">Console</span>' +
          '<h1>Sign in</h1>' +
          '<p>The same account as the portal. A staff role is granted on the ' +
          'account, not on a separate login — see ' +
          '<span class="mono">DEPLOY.md</span>.</p>' +
        '</header>' +
        '<form class="block form" id="signin-form" novalidate>' +
          '<label class="field">' +
            '<span class="field-label mono">E-mail</span>' +
            '<input type="email" id="signin-email" name="email" autocomplete="username" ' +
              'required autofocus />' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label mono">Password</span>' +
            '<input type="password" id="signin-password" name="password" ' +
              'autocomplete="current-password" required />' +
          '</label>' +
          /* Hidden until the API asks for it. Rendering it always would invite
             a code from an account that has no second factor. */
          '<label class="field" id="mfa-field" hidden>' +
            '<span class="field-label mono">Two-factor code</span>' +
            '<input type="text" id="signin-code" name="code" inputmode="numeric" ' +
              'autocomplete="one-time-code" />' +
          '</label>' +
          '<p class="form-error" id="signin-error" role="alert" hidden></p>' +
          '<button class="btn" type="submit" id="signin-submit">Sign in</button>' +
        '</form>' +
      '</div>',
    wire(el, again) {
      const form = el.querySelector('#signin-form');
      const error = el.querySelector('#signin-error');
      const mfaField = el.querySelector('#mfa-field');
      const submit = el.querySelector('#signin-submit');
      let stage = 'password';

      const say = (message) => {
        error.textContent = message || '';
        error.hidden = !message;
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        say('');
        submit.disabled = true;
        submit.textContent = 'Signing in…';

        const result = stage === 'password'
          ? await session.signIn(
            el.querySelector('#signin-email').value.trim(),
            el.querySelector('#signin-password').value)
          : await session.signInMFA(el.querySelector('#signin-code').value.trim());

        submit.disabled = false;
        submit.textContent = 'Sign in';

        if (result.mfa) {
          /* The password was right and a code is owed. The two fields stay on
             screen so a wrong code does not cost the password again. */
          stage = 'mfa';
          mfaField.hidden = false;
          el.querySelector('#signin-code').focus();
          say('');
          return;
        }
        if (result.error) { say(result.error); return; }
        again();
      });
    },
  };
}

/* ---------- signed in, and not staff ---------- */

function notStaff() {
  return {
    title: 'This account is not staff',
    html:
      '<div class="view view-gate">' +
        '<header class="view-head">' +
          '<span class="eyebrow mono">Refused</span>' +
          '<h1>This account is not staff</h1>' +
          '<p>Signed in as <b>' + esc(session.displayName()) + '</b>. The API ' +
          'answers the console only for an account with a staff role, and this ' +
          'one has none.</p>' +
        '</header>' +
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[no staff role]</p>' +
          '<p class="empty-note">A role is granted with one statement at the ' +
          'database — there is no screen that grants it, here or anywhere. The ' +
          'statement is in <span class="mono">portal-backend/DEPLOY.md</span>, ' +
          'under “Granting staff”.</p>' +
        '</section>' +
        '<button class="btn btn-quiet" type="button" id="gate-signout">' +
          'Sign out</button>' +
      '</div>',
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
    html:
      '<div class="view view-gate">' +
        '<header class="view-head">' +
          '<span class="eyebrow mono">Disconnected</span>' +
          '<h1>The API did not answer</h1>' +
          '<p>The console reached for <span class="mono">' +
          esc(session.BACKEND || 'the same origin') + '</span> and got nothing ' +
          'back.</p>' +
        '</header>' +
        '<section class="block block-empty">' +
          '<p class="empty-line mono">' + esc(session.state.problem || 'no answer') +
          '</p>' +
          /* The browser gives a blocked cross-origin request and a dead server
             the same bare TypeError, so the console cannot tell them apart and
             says so instead of picking one and being wrong half the time. */
          '<p class="empty-note">Two causes look identical from here: the ' +
          'service is down, or this origin is missing from ' +
          '<span class="mono">PORTAL_ALLOWED_ORIGINS</span> and the browser ' +
          'blocked the call before it was answered. The browser console names ' +
          'which.</p>' +
        '</section>' +
        '<button class="btn btn-quiet" type="button" id="gate-retry">' +
          'Try again</button>' +
      '</div>',
    wire(el, again) {
      el.querySelector('#gate-retry').addEventListener('click', () => again());
    },
  };
}
