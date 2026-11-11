import { SEVERITY } from './IssueTypes.js';

export const STATUS_FILTERS = Object.freeze([
  { id: 'all', label: 'All strings' },
  { id: 'issues', label: 'Any issue' },
  { id: 'errors', label: 'Errors only' },
  { id: 'missing', label: 'Missing in an app' },
  { id: 'invalid', label: 'Empty / invalid values' },
  { id: 'differs', label: 'Differs (same locale)' },
  { id: 'pending', label: 'Pending changes' },
]);

const INVALID_TYPES = new Set(['empty-value', 'blank-value', 'invalid-type', 'duplicate-key']);

const STATUS_PREDICATES = {
  all: () => true,
  issues: (row, visible) => visible.length > 0,
  errors: (row, visible) => visible.some((issue) => issue.severity === SEVERITY.ERROR),
  missing: (row) => row.missingAppIds.length > 0,
  invalid: (row, visible) => visible.some((issue) => INVALID_TYPES.has(issue.type)),
  differs: (row) => row.differsWithinLocale,
  pending: (row) => row.hasPending,
};

function matchesSearch(row, apps, needle) {
  if (row.key.toLowerCase().includes(needle)) return true;
  return apps.some((app) => {
    const value = row.cells[app.id].value;
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

/**
 * Narrows matrix rows by free-text search, a status preset, and hidden issue types.
 * Hidden types are ignored when deciding whether a row "has issues", so hiding the 800-odd
 * "untranslated" warnings leaves "Any issue" showing only what still needs attention.
 */
export function filterRows(rows, { apps, search = '', status = 'all', hiddenTypes = new Set() }) {
  const needle = search.trim().toLowerCase();
  const predicate = STATUS_PREDICATES[status] ?? STATUS_PREDICATES.all;
  return rows.filter((row) => {
    const visibleIssues = row.issues.filter((issue) => !hiddenTypes.has(issue.type));
    return (needle === '' || matchesSearch(row, apps, needle)) && predicate(row, visibleIssues);
  });
}

export function paginate(rows, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    pageCount,
    start,
    end: Math.min(start + pageSize, rows.length),
    items: rows.slice(start, start + pageSize),
  };
}
