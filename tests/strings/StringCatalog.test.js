import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StringCatalog } from '../../src/strings/StringCatalog.js';

const META = { fileKey: 'usa:qa', appId: 'usa', envId: 'qa', path: 'a.json' };
const parse = (text) => StringCatalog.fromText(META, text);

describe('StringCatalog formatting', () => {
  it('writes back exactly the bytes it read, so an edit never reformats unrelated lines', () => {
    const text = '{\n  "greeting": "Hello",\n  "z_last": "caf\u00e9 \u2014 \\"quoted\\" \\\\ back\\nline",\n  "a_first": "<b>Hi</b>"\n}\n';

    const catalog = parse(text);

    assert.equal(catalog.roundTripSafe, true);
    assert.equal(catalog.serialize(), text);
  });

  it('marks a file that is not formatted the way it writes as unsafe to edit', () => {
    const fourSpaceIndent = '{\n    "a": "1"\n}\n';

    assert.equal(parse(fourSpaceIndent).roundTripSafe, false);
  });

  it('preserves a missing trailing newline instead of adding one', () => {
    const catalog = parse('{\n  "a": "1"\n}');

    assert.equal(catalog.roundTripSafe, true);
    assert.equal(catalog.withValues([['b', '2']]).serialize(), '{\n  "a": "1",\n  "b": "2"\n}');
  });

  it('is unsafe to edit when a key is duplicated, since writing would drop one of them', () => {
    const catalog = parse('{\n  "a": "1",\n  "a": "2"\n}\n');

    assert.equal(catalog.roundTripSafe, false);
    assert.deepEqual(catalog.duplicateKeys, ['a']);
  });

  it('serializes an empty catalogue as an empty object', () => {
    assert.equal(parse('{}\n').serialize(), '{}\n');
  });
});

describe('StringCatalog.withValues', () => {
  const base = parse('{\n  "b": "old",\n  "a": "keep"\n}\n');

  it('updates an existing key in place and appends a new key at the end', () => {
    const next = base.withValues([
      ['b', 'new'],
      ['c', 'added'],
    ]);

    assert.equal(next.serialize(), '{\n  "b": "new",\n  "a": "keep",\n  "c": "added"\n}\n');
  });

  it('does not mutate the original catalogue', () => {
    base.withValues([['b', 'changed']]);

    assert.equal(base.get('b'), 'old');
    assert.equal(base.size, 2);
  });

  it('keeps an integer-like new key at the end rather than letting JS reorder it', () => {
    const next = base.withValues([['1', 'numeric']]);

    assert.deepEqual(next.keys(), ['b', 'a', '1']);
    assert.ok(next.serialize().endsWith('  "1": "numeric"\n}\n'));
  });

  it('produces no difference when the value is already the current one', () => {
    assert.equal(base.withValues([['a', 'keep']]).serialize(), base.serialize());
  });
});
