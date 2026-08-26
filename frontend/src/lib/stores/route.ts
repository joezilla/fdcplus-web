/**
 * Hash-based route store — the SPA's single source of truth for "which page,
 * which record, which focus".
 *
 * The fragment is never sent to the server, so this needs no express catch-all
 * (src/middleware/static.ts only serves index.html at '/') and no `base` in
 * vite.config. Deep links survive reloads, including the three
 * `window.location.reload()` bounces (api.ts on 401, ConfigPage on
 * restart/shutdown) which previously dumped the operator back on the terminal.
 *
 * Feedback-loop protection is an equality check, not a "we are writing" flag:
 *   1. `navigate()` no-ops when the target equals the current route, so an
 *      effect that re-fires after a route write settles instead of looping.
 *   2. `syncFromLocation()` compares before it sets, so any event a history
 *      write provokes cannot bounce back into the store.
 * A synchronous flag would be unsound: `location.hash = x` (the pushState
 * fallback below) fires hashchange *asynchronously*, long after the flag
 * cleared.
 */

import { writable, get } from 'svelte/store';
import { HOME, formatHash, parseHash, routeEquals, type Route, type PageId } from './route-url';

export { PAGES, DETAIL_PAGES, type PageId, type Route } from './route-url';

const canUseDom = typeof window !== 'undefined';

export const route = writable<Route>(canUseDom ? parseHash(window.location.hash) : HOME);

export interface NavOptions {
  /** Overwrite the current history entry instead of pushing a new one. */
  replace?: boolean;
}

export interface NavTarget {
  page: PageId;
  detail?: string | null;
  params?: Record<string, string>;
}

export function navigate(to: NavTarget, opts: NavOptions = {}): void {
  const next: Route = { page: to.page, detail: to.detail ?? null, params: to.params ?? {} };
  if (routeEquals(get(route), next)) return; // idempotent: no duplicate history entries

  route.set(next);
  if (!canUseDom) return;

  const url = formatHash(next);
  try {
    // pushState/replaceState fire neither hashchange nor popstate, so this
    // never round-trips back through syncFromLocation.
    if (opts.replace) window.history.replaceState({ b8: true }, '', url);
    else window.history.pushState({ b8: true }, '', url);
  } catch {
    // Some embedded WebViews refuse pushState. The hash assignment does fire a
    // (deferred) hashchange; syncFromLocation's equality check absorbs it.
    window.location.hash = url;
  }
}

/**
 * Patch query params on the current route. Defaults to replace — params are
 * modifiers of the current view, not destinations of their own.
 */
export function setParams(
  patch: Record<string, string | null>,
  opts: NavOptions = { replace: true },
): void {
  const cur = get(route);
  const params: Record<string, string> = { ...cur.params };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') delete params[k];
    else params[k] = v;
  }
  navigate({ page: cur.page, detail: cur.detail, params }, opts);
}

/**
 * Anchor target for a route — document-relative, so it stays correct whatever
 * path the SPA is served from.
 */
export function href(to: NavTarget): string {
  return formatHash({ page: to.page, detail: to.detail ?? null, params: to.params ?? {} });
}

function syncFromLocation(): void {
  const next = parseHash(window.location.hash);
  if (routeEquals(get(route), next)) return; // the loop breaker
  route.set(next);
}

if (canUseDom) {
  // Back/Forward across fragment-only entries fires both events in Chrome and
  // Firefox; both handlers are idempotent, so listening to each is safe and
  // also covers a hand-edited address bar.
  window.addEventListener('hashchange', syncFromLocation);
  window.addEventListener('popstate', syncFromLocation);

  // Canonicalize the entry URL ('', '#', '#/', '#/nonsense') without adding a
  // history entry, so Back from the first screen leaves the app rather than
  // bouncing between '' and '#/terminal'.
  const canonical = formatHash(get(route));
  if (window.location.hash !== canonical) {
    try {
      window.history.replaceState({ b8: true }, '', canonical);
    } catch {
      // Non-fatal: the store is already correct, only the address bar lags.
    }
  }
}
