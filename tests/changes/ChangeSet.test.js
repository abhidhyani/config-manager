import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyChanges,
  CHANGE_KIND,
  effectiveChanges,
  groupByFile,
  resolveChanges,
  summarizeChanges,
} from '../../src/changes/ChangeSet.js';
import { PendingChanges } from '../../src/changes/PendingChanges.js';
import { PendingChangesStorage } from '../../src/changes/PendingChangesStorage.js';
import { JsonStorage, MemoryStorage } from '../../src/storage/BrowserStorage.js';
import { catalog, catalogMap } from '../helpers/fixtures.js';

const base = catalogMap(
  catalog('usa', 'qa', { greeting: 'Hello', farewell: 'Bye' }),
  catalog('nation', 'qa', { greeting: 'Hey' }),
  catalog('usa', 'prod', { greeting: 'Hello' }),
);

describe('resolveChanges', () => {
  it('derives what each pending value would do from the loaded catalogue', () => {
    const resolved = resolveChanges(
      [
        { fileKey: 'usa:qa', key: 'brand_new', value: 'New' },
        { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
        { fileKey: 'usa:qa', key: 'farewell', value: 'Bye' },
        { fileKey: 'mexico:qa', key: 'greeting', value: 'Hola' },
      ],
      base,
    );

    assert.deepEqual(
      resolved.map((change) => [change.key, change.kind, change.before]),
      [
        ['brand_new', CHANGE_KIND.ADD, null],
        ['greeting', CHANGE_KIND.UPDATE, 'Hello'],
        ['farewell', CHANGE_KIND.UNCHANGED, 'Bye'],
        ['greeting', CHANGE_KIND.FILE_MISSING, null],
      ],
    );
  });

  it('only counts additions and updates as effective, so a no-op never lands in a pull request', () => {
    const resolved = resolveChanges(
      [
        { fileKey: 'usa:qa', key: 'farewell', value: 'Bye' },
        { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
      ],
      base,
    );

    assert.deepEqual(effectiveChanges(resolved).map((change) => change.key), ['greeting']);
  });
});

describe('applyChanges', () => {
  it('returns catalogues with the effective changes applied and leaves the originals alone', () => {
    const resolved = resolveChanges(
      [
        { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
        { fileKey: 'usa:qa', key: 'brand_new', value: 'New' },
      ],
      base,
    );

    const effective = applyChanges(base, resolved);

    assert.equal(effective.get('usa:qa').get('greeting'), 'Howdy');
    assert.deepEqual(effective.get('usa:qa').keys(), ['greeting', 'farewell', 'brand_new']);
    assert.equal(base.get('usa:qa').get('greeting'), 'Hello');
    assert.equal(effective.get('nation:qa'), base.get('nation:qa'));
  });
});

describe('summarizeChanges and groupByFile', () => {
  const resolved = resolveChanges(
    [
      { fileKey: 'usa:qa', key: 'brand_new', value: 'New' },
      { fileKey: 'nation:qa', key: 'greeting', value: 'Yo' },
      { fileKey: 'usa:prod', key: 'greeting', value: 'Howdy' },
    ],
    base,
  );

  it('counts additions, updates and flags production files', () => {
    const summary = summarizeChanges(resolved);

    assert.equal(summary.adds, 1);
    assert.equal(summary.updates, 2);
    assert.equal(summary.touchesProduction, true);
    assert.deepEqual(summary.keys, ['brand_new', 'greeting']);
  });

  it('does not flag production when only QA files change', () => {
    assert.equal(summarizeChanges(resolved.filter((change) => change.envId === 'qa')).touchesProduction, false);
  });

  it('groups effective changes by file in path order', () => {
    const groups = groupByFile(resolved);

    assert.deepEqual(groups.map((group) => group.fileKey), ['nation:qa', 'usa:prod', 'usa:qa']);
    assert.equal(groups.find((group) => group.fileKey === 'usa:qa').changes.length, 1);
  });
});

describe('PendingChanges', () => {
  it('keeps one value per file and key, the latest winning', () => {
    const pending = new PendingChanges();

    pending.upsert({ fileKey: 'usa:qa', key: 'a', value: '1' });
    pending.upsert({ fileKey: 'usa:qa', key: 'a', value: '2' });
    pending.upsert({ fileKey: 'nation:qa', key: 'a', value: '3' });

    assert.equal(pending.size, 2);
    assert.equal(pending.get('usa:qa', 'a').value, '2');
  });

  it('removes and clears', () => {
    const pending = new PendingChanges([
      { fileKey: 'usa:qa', key: 'a', value: '1' },
      { fileKey: 'usa:qa', key: 'b', value: '2' },
    ]);

    assert.equal(pending.remove('usa:qa', 'a'), true);
    assert.equal(pending.has('usa:qa', 'a'), false);
    pending.clear();
    assert.equal(pending.size, 0);
  });
});

describe('PendingChangesStorage', () => {
  const create = () => new PendingChangesStorage(new JsonStorage(new MemoryStorage()));

  it('restores edits after a reload for the same repository and branch', () => {
    const storage = create();
    storage.save('org/repo@develop', new PendingChanges([{ fileKey: 'usa:qa', key: 'a', value: '1' }]));

    assert.deepEqual(storage.load('org/repo@develop').list(), [{ fileKey: 'usa:qa', key: 'a', value: '1' }]);
  });

  it('does not carry edits into a different repository or branch', () => {
    const storage = create();
    storage.save('org/repo@develop', new PendingChanges([{ fileKey: 'usa:qa', key: 'a', value: '1' }]));

    assert.equal(storage.load('org/repo@main').size, 0);
    assert.equal(storage.load('other/repo@develop').size, 0);
  });

  it('forgets the stored edits once everything is cleared', () => {
    const storage = create();
    storage.save('s', new PendingChanges([{ fileKey: 'usa:qa', key: 'a', value: '1' }]));
    storage.save('s', new PendingChanges());

    assert.equal(storage.load('s').size, 0);
  });

  it('ignores corrupt entries instead of failing to load', () => {
    const backend = new MemoryStorage();
    backend.setItem(
      'configManager.pending.v1',
      JSON.stringify({ scope: 's', changes: [{ fileKey: 'usa:qa', key: 'ok', value: 'v' }, { nope: true }, null] }),
    );

    assert.deepEqual(new PendingChangesStorage(new JsonStorage(backend)).load('s').list(), [
      { fileKey: 'usa:qa', key: 'ok', value: 'v' },
    ]);
  });
});
