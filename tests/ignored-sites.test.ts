import { describe, expect, test } from 'vitest';
import { onCommitted, onTabCreated } from '../src/background/handlers';
import { isIgnoredUrl, normalizeSite } from '../src/core/rules';
import { nodeForTab } from '../src/core/tree';
import { memoryStore, type MemoryStore } from './helpers';

const commit = (m: MemoryStore, tabId: number, url: string, extra: Partial<Parameters<typeof onCommitted>[1]> = {}) =>
  onCommitted(m.store, { tabId, url, transitionType: 'link', qualifiers: [], fromHistoryState: false, ...extra });
const urls = (m: MemoryStore) => Object.values(m.state().nodes).map((n) => n.url);
const typed = { transitionType: 'typed' };

describe('normalizeSite', () => {
  test('reduces what people paste to a bare lowercase host name', () => {
    expect(normalizeSite('https://Mail.Example.com/inbox?x=1')).toBe('mail.example.com');
    expect(normalizeSite('  *.Example.com ')).toBe('example.com');
    expect(normalizeSite('example.com:8080/path')).toBe('example.com');
    expect(normalizeSite('')).toBe('');
    expect(normalizeSite('   ')).toBe('');
  });
});

describe('isIgnoredUrl', () => {
  test('matches the site and its subdomains, but not look-alike hosts', () => {
    const list = ['google.com'];
    expect(isIgnoredUrl('https://google.com/', list)).toBe(true);
    expect(isIgnoredUrl('https://mail.google.com/u/0', list)).toBe(true);
    expect(isIgnoredUrl('https://notgoogle.com/', list)).toBe(false);
    expect(isIgnoredUrl('https://google.com.evil.io/', list)).toBe(false);
  });

  test('an entry for a subdomain does not ignore its parent site', () => {
    expect(isIgnoredUrl('https://example.com/', ['mail.example.com'])).toBe(false);
    expect(isIgnoredUrl('https://mail.example.com/', ['mail.example.com'])).toBe(true);
  });

  test('ports and case do not matter, and an empty list or unparseable URL ignores nothing', () => {
    expect(isIgnoredUrl('https://Example.COM:8443/a', ['example.com'])).toBe(true);
    expect(isIgnoredUrl('https://example.com/', [])).toBe(false);
    expect(isIgnoredUrl('not a url', ['example.com'])).toBe(false);
  });
});

describe('ignored sites are never recorded', () => {
  test('a first visit to an ignored site adds nothing', async () => {
    const m = memoryStore({ ignoredSites: ['bank.example'] });
    await commit(m, 1, 'https://online.bank.example/accounts', typed);
    expect(urls(m)).toEqual([]);
  });

  test('navigating a tracked tab to an ignored site hollows its node and records nothing new', async () => {
    const m = memoryStore({ ignoredSites: ['bank.example'] });
    await commit(m, 1, 'https://x/a', typed);
    await commit(m, 1, 'https://bank.example/login');
    expect(urls(m)).toEqual(['https://x/a']);
    expect(nodeForTab(m.state(), 1)).toBeUndefined();
  });

  test('a link opened in a new tab to an ignored site leaves no placeholder behind', async () => {
    const m = memoryStore({ ignoredSites: ['bank.example'] });
    await commit(m, 1, 'https://x/a', typed);
    await onTabCreated(m.store, { tabId: 2, openerTabId: 1 });
    await commit(m, 2, 'https://bank.example/login');
    expect(urls(m)).toEqual(['https://x/a']);
  });

  test('pages on other sites are still recorded', async () => {
    const m = memoryStore({ ignoredSites: ['bank.example'] });
    await commit(m, 1, 'https://portal.azure.com/', typed);
    expect(urls(m)).toEqual(['https://portal.azure.com/']);
  });
});
