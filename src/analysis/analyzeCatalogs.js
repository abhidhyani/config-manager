import { APPS, ENVIRONMENTS } from '../app/AppRegistry.js';
import { createAnalysisContext } from './AnalysisContext.js';
import { SEVERITY_RANK } from './IssueTypes.js';
import { environmentDrift } from './rules/environmentDrift.js';
import { keyConventions } from './rules/keyConventions.js';
import { markup } from './rules/markup.js';
import { missingKeys } from './rules/missingKeys.js';
import { placeholders } from './rules/placeholders.js';
import { sourceFileRules } from './rules/sourceFileRules.js';
import { translations } from './rules/translations.js';
import { valueQuality } from './rules/valueQuality.js';

const RULES = [
  sourceFileRules,
  missingKeys,
  valueQuality,
  placeholders,
  markup,
  translations,
  keyConventions,
  environmentDrift,
];

/**
 * Compares the loaded catalogues and returns every inconsistency found, worst first.
 *
 * Pure: the same catalogues always give the same issues, so the dashboard can re-run it after
 * every pending change and show what the result would look like.
 */
export function analyzeCatalogs({ catalogs, failures = [], apps = APPS, environments = ENVIRONMENTS }) {
  const ctx = createAnalysisContext({ catalogs, failures, apps, environments });
  const unique = new Map();
  for (const rule of RULES) {
    for (const issue of rule(ctx)) {
      unique.set(issue.id, issue);
    }
  }
  return [...unique.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.type.localeCompare(b.type) ||
      a.key.localeCompare(b.key) ||
      a.appId.localeCompare(b.appId),
  );
}
