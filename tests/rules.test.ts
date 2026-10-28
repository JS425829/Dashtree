import { describe, expect, test } from 'vitest';
import { decideNavigation, isTrackableUrl, stripHash, type NavInput } from '../src/core/rules';
import { DEFAULT_SETTINGS } from '../src/core/types';

const nav = (over: Partial<NavInput>): NavInput => ({
  transitionType: 'link',
  qualifiers: [],
  fromHistoryState: false,
  hashOnly: false,
  sameOrigin: true,
  ...over,
});

describe('decideNavigation', () => {
  test('reload is ignored', () => {
    expect(decideNavigation(nav({ transitionType: 'reload' }), DEFAULT_SETTINGS)).toBe('ignore');
  });

  test('back/forward is ignored', () => {
    expect(decideNavigation(nav({ qualifiers: ['forward_back'] }), DEFAULT_SETTINGS)).toBe('ignore');
  });

  test('hash-only changes are ignored', () => {
    expect(decideNavigation(nav({ hashOnly: true }), DEFAULT_SETTINGS)).toBe('ignore');
  });

  test.each(['typed', 'generated', 'auto_bookmark'])('%s starts a new root', (transitionType) => {
    expect(decideNavigation(nav({ transitionType }), DEFAULT_SETTINGS)).toBe('new-root');
  });

  test('a link adds a child by default and updates the node when the setting is off', () => {
    expect(decideNavigation(nav({}), DEFAULT_SETTINGS)).toBe('add-child');
    expect(decideNavigation(nav({}), { ...DEFAULT_SETTINGS, sameTabAddsNode: false })).toBe('update-node');
  });

  test('a client redirect updates the current node rather than adding one', () => {
    expect(decideNavigation(nav({ qualifiers: ['client_redirect'] }), DEFAULT_SETTINGS)).toBe('update-node');
  });

  test('with redirectsUpdateNode off a client redirect is treated like any other navigation', () => {
    expect(decideNavigation(nav({ qualifiers: ['client_redirect'] }), { ...DEFAULT_SETTINGS, redirectsUpdateNode: false })).toBe('add-child');
  });

  test('same-origin history-state route changes count, cross-origin ones do not', () => {
    expect(decideNavigation(nav({ fromHistoryState: true, sameOrigin: true }), DEFAULT_SETTINGS)).toBe('add-child');
    expect(decideNavigation(nav({ fromHistoryState: true, sameOrigin: false }), DEFAULT_SETTINGS)).toBe('ignore');
  });
});

describe('url helpers', () => {
  test('isTrackableUrl rejects browser-internal and empty URLs', () => {
    expect(isTrackableUrl('edge://newtab')).toBe(false);
    expect(isTrackableUrl('about:blank')).toBe(false);
    expect(isTrackableUrl('chrome-extension://abc/page.html')).toBe(false);
    expect(isTrackableUrl('')).toBe(false);
    expect(isTrackableUrl('https://portal.azure.com/#home')).toBe(true);
  });

  test('routeKey keeps route-style fragments (Azure Portal) but drops plain anchors', async () => {
    const { routeKey } = await import('../src/core/rules');
    expect(routeKey('https://x/a#section-2')).toBe('https://x/a');
    expect(routeKey('https://portal.azure.com/#view/HubsExtension/Browse')).toBe('https://portal.azure.com/#view/HubsExtension/Browse');
  });

  test('routeKey ignores route-style fragments too when told fragments are not separate pages', async () => {
    const { routeKey } = await import('../src/core/rules');
    expect(routeKey('https://portal.azure.com/#view/A/b', false)).toBe('https://portal.azure.com/');
  });

  test('stripHash drops the fragment', () => {
    expect(stripHash('https://x/a#b')).toBe('https://x/a');
  });
});
