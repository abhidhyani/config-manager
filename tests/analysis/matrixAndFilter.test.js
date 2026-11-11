import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPS, makeFileKey } from '../../src/app/AppRegistry.js';
import { analyzeCatalogs } from '../../src/analysis/analyzeCatalogs.js';
import { buildMatrix } from '../../src/analysis/buildMatrix.js';
import { filterRows, paginate } from '../../src/analysis/filterRows.js';
import { IssueIndex } from '../../src/analysis/IssueIndex.js';
import { SEVERITY } from '../../src/analysis/IssueTypes.js';
import { applyChanges, resolveChanges } from '../../src/changes/ChangeSet.js';
import { trio } from '../helpers/fixtures.js';

function matrixFor(base, pending = []) {
  const effective = applyChanges(base, resolveChanges(pending, base));
  const issueIndex = new IssueIndex(analyzeCatalogs({ catalogs: effective }));
  return buildMatrix({
    envId: 'qa',
    apps: APPS,
    catalogs: effective,
    baseCatalogs: base,
    issueIndex,
    fileKeyOf: makeFileKey,
  });
}

const base = trio('qa', {
  usa: { shared: 'Watch now', only_usa: 'Hi', same_locale: 'One' },
  mexico: { shared: 'Ver ahora', only_usa: 'Hola', same_locale: 'Uno' },
  nation: { shared: 'Watch now', same_locale: 'Two' },
});

describe('buildMatrix', () => {
  const rows = matrixFor(base);
  const row = (key) => rows.find((candidate) => candidate.key === key);

  it('lists every key from any app exactly once, sorted', () => {
    assert.deepEqual(rows.map((candidate) => candidate.key), ['only_usa', 'same_locale', 'shared']);
  });

  it('marks the apps that lack a key and attaches the missing-string issue to that cell', () => {
    const missing = row('only_usa');

    assert.deepEqual(missing.missingAppIds, ['nation']);
    assert.equal(missing.cells.nation.present, false);
    assert.deepEqual(missing.cells.nation.issues.map((issue) => issue.type), ['missing-key']);
    assert.equal(missing.severity, SEVERITY.ERROR);
  });

  it('notices apps that share a locale but hold different text', () => {
    assert.equal(row('same_locale').differsWithinLocale, true);
    assert.equal(row('shared').differsWithinLocale, false);
  });

  it('marks a cell pending where a pending change differs from what was loaded', () => {
    const withPending = matrixFor(base, [{ fileKey: 'nation:qa', key: 'only_usa', value: 'Hi' }]);
    const added = withPending.find((candidate) => candidate.key === 'only_usa');

    assert.equal(added.cells.nation.pending, true);
    assert.equal(added.cells.nation.value, 'Hi');
    assert.equal(added.cells.nation.baseValue, null);
    assert.equal(added.hasPending, true);
    assert.deepEqual(added.missingAppIds, [], 'the pending change resolves the missing string');
    assert.equal(added.cells.usa.pending, false);
  });
});

describe('filterRows', () => {
  const rows = matrixFor(base);
  const filter = (options) => filterRows(rows, { apps: APPS, ...options }).map((row) => row.key);

  it('searches keys and values of every app, case-insensitively', () => {
    assert.deepEqual(filter({ search: 'ONLY_' }), ['only_usa']);
    assert.deepEqual(filter({ search: 'ver ahora' }), ['shared']);
  });

  it('narrows to strings missing in some app', () => {
    assert.deepEqual(filter({ status: 'missing' }), ['only_usa']);
  });

  it('narrows to strings whose same-locale values differ', () => {
    assert.deepEqual(filter({ status: 'differs' }), ['same_locale']);
  });

  it('leaves out rows whose only issues are of a hidden type', () => {
    const untranslated = matrixFor(
      trio('qa', { usa: { a: 'Watch now' }, mexico: { a: 'Watch now' }, nation: { a: 'Watch now' } }),
    );

    const shown = filterRows(untranslated, { apps: APPS, status: 'issues', hiddenTypes: new Set() });
    const hidden = filterRows(untranslated, { apps: APPS, status: 'issues', hiddenTypes: new Set(['untranslated']) });

    assert.equal(shown.length, 1);
    assert.equal(hidden.length, 0);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 205 }, (_, index) => index);

  it('returns the requested page and its bounds', () => {
    const page = paginate(items, 3, 100);

    assert.equal(page.pageCount, 3);
    assert.equal(page.items.length, 5);
    assert.equal(page.start, 200);
    assert.equal(page.end, 205);
  });

  it('clamps a page number that no longer exists after filtering', () => {
    assert.equal(paginate(items, 99, 100).page, 3);
    assert.equal(paginate([], 5, 100).page, 1);
  });
});
