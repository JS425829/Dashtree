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
