let current: HTMLElement | null = null;

/** A short message at the bottom of the page, announced politely to screen readers. */
export function showToast(text: string, ms = 5000): void {
  current?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  current = el;
  setTimeout(() => {
    el.remove();
    if (current === el) current = null;
  }, ms);
}
