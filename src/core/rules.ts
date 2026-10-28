import type { Settings } from './types';

export type NavAction = 'ignore' | 'add-child' | 'update-node' | 'new-root';

export interface NavInput {
  transitionType: string;
  qualifiers: string[];
  fromHistoryState: boolean;
  hashOnly: boolean;
  sameOrigin: boolean;
}

const NEW_ROOT_TRANSITIONS = new Set(['typed', 'generated', 'auto_bookmark', 'keyword', 'keyword_generated', 'start_page']);

export function decideNavigation(i: NavInput, s: Settings): NavAction {
  if (i.transitionType === 'reload' || i.qualifiers.includes('forward_back') || i.hashOnly) return 'ignore';
  if (i.fromHistoryState && !i.sameOrigin) return 'ignore';
  if (i.qualifiers.includes('client_redirect')) return 'update-node';
  if (!i.fromHistoryState && NEW_ROOT_TRANSITIONS.has(i.transitionType)) return 'new-root';
  return s.sameTabAddsNode ? 'add-child' : 'update-node';
}

export function isTrackableUrl(url: string): boolean {
  return /^(https?|file):/i.test(url);
}

export function stripHash(url: string): string {
  return url.split('#')[0];
}

/**
 * Identity of a page for "same page?" checks. Single-page apps such as Azure Portal keep their route
 * in the fragment (#view/..., #@tenant/resource/...), so a fragment containing '/' is part of the
 * identity; plain in-page anchors (#section-2) are not.
 */
export function routeKey(url: string): string {
  const i = url.indexOf('#');
  return i >= 0 && url.slice(i).includes('/') ? url : stripHash(url);
}
