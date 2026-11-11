import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GitHubError } from '../../src/github/GitHubError.js';
import { loadCatalogs } from '../../src/strings/CatalogLoader.js';

const targets = [
  { fileKey: 'usa:qa', appId: 'usa', envId: 'qa', path: 'usa.json' },
  { fileKey: 'mexico:qa', appId: 'mexico', envId: 'qa', path: 'mexico.json' },
  { fileKey: 'nation:qa', appId: 'nation', envId: 'qa', path: 'nation.json' },
];

const readerWith = (files) => ({
  async readTextFile(path, ref) {
    assert.equal(ref, 'commit-1', 'every file must be read at the same commit');
    const entry = files[path];
    if (entry instanceof Error) throw entry;
    return { path, sha: `sha-${path}`, text: entry, htmlUrl: `https://example/${path}` };
  },
});

describe('loadCatalogs', () => {
  it('loads every file at one commit and keeps the blob SHA and link for each', async () => {
    const { catalogs, failures } = await loadCatalogs({
      reader: readerWith({ 'usa.json': '{\n  "a": "1"\n}\n', 'mexico.json': '{}\n', 'nation.json': '{}\n' }),
      targets,
      ref: 'commit-1',
    });

    assert.equal(failures.length, 0);
    assert.equal(catalogs.size, 3);
    assert.equal(catalogs.get('usa:qa').get('a'), '1');
    assert.equal(catalogs.get('usa:qa').sha, 'sha-usa.json');
    assert.equal(catalogs.get('usa:qa').htmlUrl, 'https://example/usa.json');
  });

  it('still loads the other files when one is missing or malformed, and says why', async () => {
    const { catalogs, failures } = await loadCatalogs({
      reader: readerWith({
        'usa.json': '{}\n',
        'mexico.json': new GitHubError({ kind: 'not-found', status: 404, message: 'Not found.' }),
        'nation.json': '{"a": ',
      }),
      targets,
      ref: 'commit-1',
    });

    assert.deepEqual([...catalogs.keys()], ['usa:qa']);
    assert.deepEqual(failures.map((failure) => failure.target.appId).sort(), ['mexico', 'nation']);
    assert.equal(failures.find((failure) => failure.target.appId === 'mexico').message, 'Not found.');
    assert.match(failures.find((failure) => failure.target.appId === 'nation').message, /Invalid JSON/);
  });
});
