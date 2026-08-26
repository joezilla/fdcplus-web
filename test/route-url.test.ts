/**
 * Hash-URL grammar for the SPA router.
 *
 * These are the cases that regress silently in a browser — awkward ids ('@',
 * ':', '.', an encoded '/'), malformed percent-escapes, and the fallbacks that
 * keep a typo'd bookmark from rendering a blank page. `route-url.ts` imports
 * nothing (deliberately, so it stays testable from this backend Jest suite);
 * the DOM-bound half lives in `route.ts` and is verified in the browser.
 */

import {
  PAGES,
  HOME,
  parseHash,
  formatHash,
  routeEquals,
  type Route,
} from '../frontend/src/lib/stores/route-url';

const r = (page: Route['page'], detail: string | null = null, params: Record<string, string> = {}): Route =>
  ({ page, detail, params });

describe('parseHash', () => {
  it('falls back to home for empty, bare and malformed hashes', () => {
    for (const h of ['', '#', '#/', '#/nonsense', '#/../etc']) {
      expect(parseHash(h)).toEqual(HOME);
    }
  });

  it('parses every known page', () => {
    for (const p of PAGES) {
      expect(parseHash(`#/${p}`)).toEqual(r(p));
    }
  });

  it('parses a detail segment on detail-capable pages', () => {
    expect(parseHash('#/profiles/altair-8800b@1.2.0')).toEqual(r('profiles', 'altair-8800b@1.2.0'));
    expect(parseHash('#/catalog/8251-usart@1.0.0')).toEqual(r('catalog', '8251-usart@1.0.0'));
    expect(parseHash('#/scripts/boot.txt')).toEqual(r('scripts', 'boot.txt'));
  });

  it('ignores a stray segment on a page with no detail view', () => {
    expect(parseHash('#/terminal/stray')).toEqual(r('terminal'));
    expect(parseHash('#/disks/stray')).toEqual(r('disks'));
  });

  it('splits before decoding, so an encoded slash survives', () => {
    expect(parseHash('#/catalog/a%2Fb')).toEqual(r('catalog', 'a/b'));
  });

  it('rejoins a hand-typed multi-segment tail rather than truncating it', () => {
    expect(parseHash('#/profiles/a/b')).toEqual(r('profiles', 'a/b'));
  });

  it('survives malformed percent-escapes instead of throwing URIError', () => {
    expect(() => parseHash('#/profiles/%zz')).not.toThrow();
    expect(parseHash('#/profiles/%zz')).toEqual(r('profiles', '%zz'));
    expect(() => parseHash('#/profiles/100%')).not.toThrow();
  });

  it('parses query params, and tolerates an empty value', () => {
    expect(parseHash('#/disks?focus=cpm22.dsk')).toEqual(r('disks', null, { focus: 'cpm22.dsk' }));
    expect(parseHash('#/disks?focus=')).toEqual(r('disks', null, { focus: '' }));
    expect(parseHash('#/clients?focus=inst%3Aabc')).toEqual(r('clients', null, { focus: 'inst:abc' }));
  });
});

describe('formatHash', () => {
  it('leaves @ and : legible but escapes / and spaces', () => {
    expect(formatHash(r('profiles', 'altair-8800b@1.2.0'))).toBe('#/profiles/altair-8800b@1.2.0');
    expect(formatHash(r('profiles', 'preset:foo'))).toBe('#/profiles/preset:foo');
    expect(formatHash(r('catalog', 'a/b'))).toBe('#/catalog/a%2Fb');
    expect(formatHash(r('scripts', 'my script.txt'))).toBe('#/scripts/my%20script.txt');
  });

  it('drops a detail segment on a page that has no detail view', () => {
    expect(formatHash(r('disks', 'ignored'))).toBe('#/disks');
  });

  it('omits empty params', () => {
    expect(formatHash(r('disks', null, { focus: '' }))).toBe('#/disks');
    expect(formatHash(r('disks', null, { focus: 'cpm22.dsk' }))).toBe('#/disks?focus=cpm22.dsk');
  });
});

describe('round-trip', () => {
  const cases: Route[] = [
    r('terminal'),
    r('config'),
    r('profiles', 'altair-8800b@1.2.0'),
    r('profiles', 'preset:altair-8800b'),
    r('catalog', 'a/b'),
    r('catalog', '8251-usart@1.0.0'),
    r('scripts', 'boot.txt'),
    r('machines', '9f3c1a2b-4d5e-6789-abcd-ef0123456789'),
    r('disks', null, { focus: 'LIFEBOAT-IMSAI-CPM22-62K.DSK' }),
    r('clients', null, { focus: 'inst:9f3c1a2b' }),
  ];

  it('parseHash(formatHash(x)) === x for every representative route', () => {
    for (const c of cases) {
      expect(parseHash(formatHash(c))).toEqual(c);
    }
  });
});

describe('routeEquals', () => {
  it('compares page, detail and params', () => {
    expect(routeEquals(r('disks'), r('disks'))).toBe(true);
    expect(routeEquals(r('disks'), r('drives'))).toBe(false);
    expect(routeEquals(r('catalog', 'a'), r('catalog', 'b'))).toBe(false);
    expect(routeEquals(r('disks', null, { focus: 'a' }), r('disks', null, { focus: 'a' }))).toBe(true);
    expect(routeEquals(r('disks', null, { focus: 'a' }), r('disks', null, { focus: 'b' }))).toBe(false);
    expect(routeEquals(r('disks', null, { focus: 'a' }), r('disks'))).toBe(false);
  });
});
