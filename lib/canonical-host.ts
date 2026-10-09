/**
 * Redirects a page opened at the fully-qualified hostname with a trailing dot
 * (`example.app.`) to the same URL without it.
 *
 * Why: the browser treats `host.` as a different origin from `host`. Every
 * Server Action carries `Origin: https://host.` while the hosting front end
 * forwards `x-forwarded-host: host`, so Next's CSRF check refuses all of them
 * ("Invalid Server Actions request", HTTP 500). On staging, 10 Oct, that left
 * add-to-cart silently failing and the cart page loading forever. Cookies set
 * on `host.` are also not sent to `host`, so sign-in would split too.
 *
 * The server cannot see the dot on a page request (the front end strips it
 * from the forwarded host), so this has to run in the browser, before the app
 * hydrates. Inline and dependency-free; CSP allows inline scripts
 * (next.config.ts).
 */
export const CANONICAL_HOST_SCRIPT =
  '(function(l){var h=l.hostname;if(h&&h.charAt(h.length-1)==="."){' +
  'var c=h.replace(/\\.+$/,"");if(c){l.replace(l.protocol+"//"+c+(l.port?":"+l.port:"")+l.pathname+l.search+l.hash);}}})(window.location);';
