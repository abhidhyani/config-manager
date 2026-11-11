export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning', INFO: 'info' });

/** Higher is worse; used to pick the badge colour of a row and to sort issues. */
export const SEVERITY_RANK = Object.freeze({ error: 3, warning: 2, info: 1 });

/**
 * Every kind of inconsistency the dashboard can report.
 *
 * `severity` is the default; a rule may override it per issue (for example a placeholder
 * mismatch is an error for a translation but only a warning between independent copy decks).
 */
export const ISSUE_TYPES = Object.freeze({
  'file-unavailable': { label: 'File unavailable', severity: SEVERITY.ERROR },
  'unsafe-formatting': { label: 'Unsafe to edit', severity: SEVERITY.ERROR },
  'duplicate-key': { label: 'Duplicate key', severity: SEVERITY.ERROR },
  'invalid-type': { label: 'Not a string', severity: SEVERITY.ERROR },
  'missing-key': { label: 'Missing string', severity: SEVERITY.ERROR },
  'empty-value': { label: 'Empty value', severity: SEVERITY.ERROR },
  'blank-value': { label: 'Whitespace only', severity: SEVERITY.ERROR },
  'placeholder-mismatch': { label: 'Placeholder mismatch', severity: SEVERITY.ERROR },
  'malformed-placeholder': { label: 'Malformed placeholder', severity: SEVERITY.WARNING },
  'markup-mismatch': { label: 'Markup mismatch', severity: SEVERITY.WARNING },
  'invalid-markup': { label: 'Invalid markup', severity: SEVERITY.WARNING },
  'key-mismatch': { label: 'Key mismatch', severity: SEVERITY.WARNING },
  'key-near-duplicate': { label: 'Near-duplicate key', severity: SEVERITY.WARNING },
  'edge-whitespace-mismatch': { label: 'Edge whitespace differs', severity: SEVERITY.WARNING },
  'invisible-characters': { label: 'Invisible characters', severity: SEVERITY.WARNING },
  'escape-leftover': { label: 'Leftover escape', severity: SEVERITY.WARNING },
  'placeholder-text': { label: 'Placeholder text', severity: SEVERITY.WARNING },
  'untranslated': { label: 'Untranslated', severity: SEVERITY.WARNING },
  'prod-only': { label: 'Missing from QA', severity: SEVERITY.WARNING },
  'edge-whitespace': { label: 'Edge whitespace', severity: SEVERITY.INFO },
  'key-naming': { label: 'Key naming', severity: SEVERITY.INFO },
  'qa-only': { label: 'Only in QA', severity: SEVERITY.INFO },
  'env-value-differs': { label: 'Differs from other environment', severity: SEVERITY.INFO },
});

export function createIssue({ type, envId, appId, key, message, severity, related = null }) {
  const definition = ISSUE_TYPES[type];
  if (!definition) throw new Error(`Unknown issue type: ${type}`);
  return Object.freeze({
    id: `${type}|${envId}|${appId}|${key}`,
    type,
    severity: severity ?? definition.severity,
    envId,
    appId,
    key,
    message,
    related,
  });
}

export function worstSeverity(issues) {
  let worst = null;
  for (const issue of issues) {
    if (worst === null || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst]) {
      worst = issue.severity;
    }
  }
  return worst;
}
