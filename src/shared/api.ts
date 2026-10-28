/**
 * The extension API for whichever browser this runs in. Firefox provides a promise-based `browser` namespace;
 * Chrome and Edge provide `chrome` (which is promise-based in Manifest V3). Everything else imports `ext`
 * from here instead of touching a browser global, so the same code runs in all three.
 */
const g = globalThis as { browser?: typeof chrome; chrome?: typeof chrome };

export const ext = (g.browser ?? g.chrome) as typeof chrome;

export type NavDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails;
