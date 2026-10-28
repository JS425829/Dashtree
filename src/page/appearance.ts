import type { Settings } from '../core/types';
import { DEFAULT_LAYOUT, type LayoutOpts } from './layout';

const COMPACT_LAYOUT: LayoutOpts = { nodeW: 224, nodeH: 44, gapX: 18, gapY: 52 };

/** Card size and spacing for the current settings. */
export const layoutOptsFor = (s: Settings): LayoutOpts => (s.compactCards ? COMPACT_LAYOUT : DEFAULT_LAYOUT);

/** Classes put on the canvas; the stylesheet does the rest. */
export function appearanceClasses(s: Settings): string[] {
  const out: string[] = [];
  if (s.compactCards) out.push('compact');
  if (!s.showSiteName) out.push('hide-site');
  if (!s.showStatusDots) out.push('hide-dots');
  if (!s.dashedConnectors) out.push('solid-lines');
  if (!s.showGroupOutlines) out.push('hide-groups');
  if (!s.showNoteBoxes) out.push('hide-notes');
  return out;
}
