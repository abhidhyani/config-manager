import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CatalogParseError, parseCatalogText, scanTopLevelKeys } from '../../src/strings/catalogParser.js';

describe('parseCatalogText', () => {
  it('keeps keys in file order even when they look like integers', () => {
    const { entries } = parseCatalogText('{\n  "b": "1",\n  "10": "2",\n  "a": "3",\n  "2": "4"\n}\n');

    assert.deepEqual([...entries.keys()], ['b', '10', 'a', '2']);
  });

  it('reports a key that appears twice instead of silently keeping the last value', () => {
    const { entries, duplicateKeys } = parseCatalogText('{"a": "first", "b": "x", "a": "second"}');

    assert.deepEqual(duplicateKeys, ['a']);
    assert.equal(entries.get('a'), 'second');
    assert.deepEqual([...entries.keys()], ['a', 'b']);
  });

  it('rejects text that is not valid JSON with a readable message', () => {
    assert.throws(() => parseCatalogText('{"a": '), (error) => {
      assert.ok(error instanceof CatalogParseError);
      assert.match(error.message, /^Invalid JSON/);
      return true;
    });
  });

  it('rejects JSON that is not an object of key/value pairs', () => {
    assert.throws(() => parseCatalogText('["a", "b"]'), /Expected a JSON object/);
    assert.throws(() => parseCatalogText('null'), /Expected a JSON object/);
  });

  it('accepts an empty object', () => {
    const { entries, duplicateKeys } = parseCatalogText('{}\n');

    assert.equal(entries.size, 0);
    assert.deepEqual(duplicateKeys, []);
  });
});

describe('scanTopLevelKeys', () => {
  it('is not fooled by braces, quotes and key-like text inside values', () => {
    const text = '{"a": "{\\"b\\": 1}", "c": "x, \\"d\\": 2", "e": "}"}';

    assert.deepEqual(scanTopLevelKeys(text).orderedKeys, ['a', 'c', 'e']);
  });

  it('skips nested objects and arrays without reading their keys as top-level keys', () => {
    const text = '{"a": {"inner": [1, {"deep": "x"}]}, "b": null, "c": 3}';

    assert.deepEqual(scanTopLevelKeys(text).orderedKeys, ['a', 'b', 'c']);
  });

  it('decodes escaped characters in keys before comparing them', () => {
    const text = '{"caf\\u00e9": "1", "café": "2"}';

    assert.deepEqual(scanTopLevelKeys(text).duplicates, ['café']);
  });
});
