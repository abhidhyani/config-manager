import { ISSUE_TYPES } from '../analysis/IssueTypes.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export const SEVERITY_LABELS = Object.freeze({ error: 'Error', warning: 'Warning', info: 'Info' });
export const SEVERITY_ICONS = Object.freeze({ error: 'circle-alert', warning: 'triangle-alert', info: 'info' });

/** A compact status label. `iconName` is optional; `title` becomes the tooltip. */
export function badge(text, kind, title, iconName) {
  return h('span', { class: `badge badge--${kind}`, title },
    iconName ? icon(iconName, { size: 12 }) : null,
    text,
  );
}

/** The issue's type as a badge with its severity icon; the full explanation is the tooltip. */
export function issueBadge(issue) {
  return badge(ISSUE_TYPES[issue.type]?.label ?? issue.type, issue.severity, issue.message, SEVERITY_ICONS[issue.severity]);
}

export function countBySeverity(issues) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
