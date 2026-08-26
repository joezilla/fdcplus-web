/**
 * Hash-URL grammar for the SPA. Pure string functions with no Svelte or DOM
 * dependency, so they can be unit-tested outside a browser.
 *
 *   #/<page>[/<detailId>][?k=v&...]
 *
 * Detail ids are opaque and may contain '.', '@', ':' or '/' — card and profile
 * ids are `name@version`, profile refs can be `preset:<id>`, client ids are
 * `inst:<uuid>`, disk and script names carry dots. They are percent-encoded as a
 * single path segment (with '@' and ':' left legible, as RFC 3986 permits in a
 * path segment) and are always split-before-decode so an encoded '/' survives.
 */

export const PAGES = [
  'terminal', 'disks', 'drives', 'clients', 'cassettes',
  'catalog', 'profiles', 'machines', 'scripts', 'config',
] as const;
export type PageId = (typeof PAGES)[number];

/** Pages that address a single record with a trailing path segment. */
export const DETAIL_PAGES: ReadonlySet<PageId> =
  new Set<PageId>(['catalog', 'profiles', 'machines', 'scripts']);

export interface Route {
  page: PageId;
  /** The selected record on a master/detail page; null on the list view. */
  detail: string | null;
  /** Query modifiers. Currently only `focus` (disks, clients). */
  params: Readonly<Record<string, string>>;
}

export const HOME: Route = { page: 'terminal', detail: null, params: {} };

const isPage = (v: string): v is PageId => (PAGES as readonly string[]).includes(v);

/** decodeURIComponent that survives hand-typed garbage — '%zz' throws URIError. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Encode one path segment, leaving '@' and ':' legible. '/' and '%' stay
 * escaped so split-before-decode is unambiguous.
 */
function encodeSeg(s: string): string {
  return encodeURIComponent(s).replace(/%40/g, '@').replace(/%3A/gi, ':');
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  if (!raw || raw === '/') return HOME;

  const qi = raw.indexOf('?');
  const path = qi === -1 ? raw : raw.slice(0, qi);
  const query = qi === -1 ? '' : raw.slice(qi + 1);

  const segs = path.split('/').filter(Boolean);
  const page = segs[0] ?? '';
  // Unknown page → home rather than a blank screen. A typo'd bookmark should
  // land somewhere useful, not on an empty <main>.
  if (!isPage(page)) return HOME;

  // Forgiving parse: rejoin a stray tail so a hand-typed '#/profiles/a/b' still
  // resolves. Emit is always strict (one segment, '/' escaped as %2F).
  const detail = segs.length > 1 ? safeDecode(segs.slice(1).join('/')) : null;

  const params: Record<string, string> = {};
  // URLSearchParams never throws on malformed input, unlike decodeURIComponent.
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;

  return {
    page,
    // Ignore a stray segment on a page that has no detail view.
    detail: DETAIL_PAGES.has(page) ? detail : null,
    params,
  };
}

export function formatHash(r: Route): string {
  let out = `#/${r.page}`;
  if (r.detail && DETAIL_PAGES.has(r.page)) out += `/${encodeSeg(r.detail)}`;
  const qs = new URLSearchParams(
    Object.entries(r.params).filter(([, v]) => v != null && v !== ''),
  ).toString();
  if (qs) out += `?${qs}`;
  return out;
}

export function routeEquals(a: Route, b: Route): boolean {
  if (a.page !== b.page || a.detail !== b.detail) return false;
  const ak = Object.keys(a.params);
  const bk = Object.keys(b.params);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a.params[k] === b.params[k]);
}
