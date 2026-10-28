// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { renderTopBar } from '../src/page/topbar';

function setup(settings = DEFAULT_SETTINGS) {
  document.body.innerHTML = '<header id="bar"></header>';
  const send = vi.fn();
  const bar = renderTopBar(document.getElementById('bar')!, settings, send, () => {});
  return { send, bar };
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

describe('theme switch', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('the top bar has a dark-mode switch that flips light to dark', () => {
    const { send } = setup({ ...DEFAULT_SETTINGS, theme: 'light' });
    const sw = $('button[role=switch]');
    expect(sw.getAttribute('aria-label')).toBe('Dark mode');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { theme: 'dark' } });
  });

  test('and flips dark back to light', () => {
    const { send } = setup({ ...DEFAULT_SETTINGS, theme: 'dark' });
    const sw = $('button[role=switch]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { theme: 'light' } });
  });

  test('the switch follows settings changes', () => {
    const { bar } = setup({ ...DEFAULT_SETTINGS, theme: 'light' });
    bar.update({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect($('button[role=switch]').getAttribute('aria-checked')).toBe('true');
  });

  test('Settings offers System, Light and Dark and sends the choice', () => {
    const { send } = setup({ ...DEFAULT_SETTINGS, theme: 'system' });
    const select = $<HTMLSelectElement>('select[aria-label="Theme"]');
    expect([...select.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
    expect(select.value).toBe('system');
    select.value = 'dark';
    select.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { theme: 'dark' } });
  });
});

describe('on/off settings', () => {
  const cases: [string, string][] = [
    ['same tab adds a new node', 'sameTabAddsNode'],
    ['after #', 'routeFragmentsAreSeparate'],
    ['earlier page', 'reuseEarlierPage'],
    ['Redirects update', 'redirectsUpdateNode'],
    ['After a restart', 'wipeHollowAfterRestart'],
    ['When a tab closes', 'hollowOnTabClose'],
    ['hollow children of favourites', 'clearRemovesFavouriteChildren'],
    ['Ask before deleting', 'confirmBeforeDeleting'],
    ['Compact cards', 'compactCards'],
    ['site name', 'showSiteName'],
    ['open/closed dot', 'showStatusDots'],
    ['Dashed connector', 'dashedConnectors'],
  ];
  const checkboxFor = (text: string) =>
    [...document.querySelectorAll('label')].find((l) => l.textContent!.includes(text))!.querySelector<HTMLInputElement>('input[type=checkbox]')!;

  test.each(cases)('"%s" is a checkbox that sends %s', (text, key) => {
    const { send } = setup();
    const box = checkboxFor(text);
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { [key]: box.checked } });
  });

  test('every checkbox shows the current value', () => {
    setup({ ...DEFAULT_SETTINGS, compactCards: true, showSiteName: false });
    expect(checkboxFor('Compact cards').checked).toBe(true);
    expect(checkboxFor('site name').checked).toBe(false);
    expect(checkboxFor('same tab adds a new node').checked).toBe(true);
  });

  test('settings are grouped under Recording, Cleanup and Appearance headings', () => {
    setup();
    expect([...document.querySelectorAll('.popover h2')].map((h) => h.textContent)).toEqual(['Recording', 'Cleanup', 'Appearance', 'Ignored sites']);
  });
});

describe('Clear hollow nodes confirmation', () => {
  const clearButton = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Clear hollow nodes')!;

  test('asks first when confirmBeforeDeleting is on, and does nothing if declined', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { send } = setup();
    clearButton().click();
    expect(ask).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith({ type: 'clearHollow' });
    ask.mockReturnValue(true);
    clearButton().click();
    expect(send).toHaveBeenCalledWith({ type: 'clearHollow' });
    ask.mockRestore();
  });

  test('does not ask when confirmBeforeDeleting is off', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { send } = setup({ ...DEFAULT_SETTINGS, confirmBeforeDeleting: false });
    clearButton().click();
    expect(ask).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'clearHollow' });
    ask.mockRestore();
  });
});

describe('ignored sites setting', () => {
  test('shows the current list one site per line', () => {
    setup({ ...DEFAULT_SETTINGS, ignoredSites: ['bank.example', 'mail.example.com'] });
    expect($<HTMLTextAreaElement>('textarea[aria-label="Ignored sites"]').value).toBe('bank.example\nmail.example.com');
  });

  test('cleans up what is typed (URLs, wildcards, blanks, duplicates) before saving', () => {
    const { send } = setup();
    const box = $<HTMLTextAreaElement>('textarea[aria-label="Ignored sites"]');
    box.value = 'https://Bank.example/login\n\n*.Mail.example.com\nbank.example';
    box.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({
      type: 'setSettings',
      settings: { ignoredSites: ['bank.example', 'mail.example.com'] },
    });
  });

  test('an update from the background does not overwrite text while it is being edited', () => {
    const { bar } = setup({ ...DEFAULT_SETTINGS, ignoredSites: ['a.example'] });
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Settings')!.click(); // the panel must be open to type in it
    const box = $<HTMLTextAreaElement>('textarea[aria-label="Ignored sites"]');
    box.focus();
    expect(document.activeElement).toBe(box);
    box.value = 'a.example\nhalf-typed';
    bar.update({ ...DEFAULT_SETTINGS, ignoredSites: ['a.example'] });
    expect(box.value).toBe('a.example\nhalf-typed');
  });

  test('the checkboxes for the other settings still work', () => {
    const { send } = setup();
    const box = document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0];
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { sameTabAddsNode: box.checked } });
  });
});
