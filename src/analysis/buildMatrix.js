import { worstSeverity } from './IssueTypes.js';

/**
 * One row per key, one cell per app, for a single environment.
 *
 * `catalogs` are the *effective* catalogues (pending changes applied) and `baseCatalogs` the
 * ones loaded from GitHub; a cell is "pending" exactly where the two disagree, and then shows
 * the new value with the old one kept for display.
 */
export function buildMatrix({ envId, apps, catalogs, baseCatalogs, issueIndex, fileKeyOf }) {
  const keys = new Set();
  for (const app of apps) {
    const catalog = catalogs.get(fileKeyOf(app.id, envId));
    if (catalog) for (const key of catalog.entries.keys()) keys.add(key);
  }

  const rows = [...keys].sort((a, b) => a.localeCompare(b)).map((key) => {
    const cells = {};
    const allIssues = [];
    for (const app of apps) {
      const fileKey = fileKeyOf(app.id, envId);
      const catalog = catalogs.get(fileKey);
      const base = baseCatalogs.get(fileKey);
      const present = Boolean(catalog?.has(key));
      const value = present ? catalog.get(key) : null;
      const baseValue = base?.has(key) ? base.get(key) : null;
      const issues = issueIndex.forCell(envId, app.id, key);
      allIssues.push(...issues);
      cells[app.id] = {
        appId: app.id,
        loaded: Boolean(catalog),
        present,
        value,
        baseValue,
        pending: present && value !== baseValue,
        issues,
      };
    }

    const loadedValues = apps.filter((app) => cells[app.id].present).map((app) => app.id);
    return {
      key,
      cells,
      issues: allIssues,
      severity: worstSeverity(allIssues),
      missingAppIds: apps.filter((app) => cells[app.id].loaded && !cells[app.id].present).map((app) => app.id),
      hasPending: loadedValues.some((appId) => cells[appId].pending),
      differsWithinLocale: differsWithinLocale(apps, cells),
    };
  });
  return rows;
}

/** Apps that share a locale (USA and Nation are both en-US) but hold different text. */
function differsWithinLocale(apps, cells) {
  const byLocale = new Map();
  for (const app of apps) {
    const cell = cells[app.id];
    if (!cell.present || typeof cell.value !== 'string') continue;
    byLocale.set(app.locale, [...(byLocale.get(app.locale) ?? []), cell.value]);
  }
  return [...byLocale.values()].some((values) => values.length > 1 && new Set(values).size > 1);
}
