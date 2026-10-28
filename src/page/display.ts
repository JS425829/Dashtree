import type { TreeNode } from '../core/types';

/** What a card shows as its title: the user's own name, else the page title, else the address. */
export function displayName(n: TreeNode): string {
  const custom = n.customTitle?.trim();
  if (custom) return custom;
  if (n.title) return n.title;
  if (!n.url) return 'Loading…';
  try {
    const u = new URL(n.url);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname);
  } catch { return n.url; }
}
