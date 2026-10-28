export type MenuItem = { label: string; action: () => void } | 'separator';

let open: HTMLElement | null = null;

export function closeMenu(): void {
  open?.remove();
  open = null;
}

export function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  for (const item of items) {
    if (item === 'separator') {
      menu.append(document.createElement('hr'));
      continue;
    }
    const b = document.createElement('button');
    b.textContent = item.label;
    b.addEventListener('click', () => {
      closeMenu();
      item.action();
    });
    menu.append(b);
  }
  document.body.append(menu);
  // keep the menu on screen
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height - 4))}px`;
  open = menu;

  const dismiss = (e: Event) => {
    if (e instanceof MouseEvent && menu.contains(e.target as Node)) return;
    closeMenu();
    window.removeEventListener('mousedown', dismiss, true);
    window.removeEventListener('keydown', dismiss, true);
    window.removeEventListener('blur', dismiss);
  };
  window.addEventListener('mousedown', dismiss, true);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && dismiss(e), true);
  window.addEventListener('blur', dismiss);
}
