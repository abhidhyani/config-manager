import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSite, findProblems } from '../../scripts/build-site.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const scratchDirectories = [];

function scratch() {
  const directory = mkdtempSync(join(tmpdir(), 'config-manager-site-'));
  scratchDirectories.push(directory);
  return directory;
}

function writeSite(directory, files) {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), contents);
  }
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('buildSite', () => {
  it('publishes the page, its modules, styles and assets and nothing else', () => {
    const outDirectory = join(scratch(), 'site');
    buildSite({ root: PROJECT_ROOT, outDirectory });

    const published = readdirSync(outDirectory).sort();
    assert.deepEqual(published, ['.nojekyll', 'assets', 'index.html', 'src', 'styles']);
    assert.ok(existsSync(join(outDirectory, 'src', 'main.js')));
    assert.ok(existsSync(join(outDirectory, 'styles', 'tokens.css')));
  });

  it('leaves out tests, scripts, docs and package files so they are never served', () => {
    const outDirectory = join(scratch(), 'site');
    buildSite({ root: PROJECT_ROOT, outDirectory });

    for (const excluded of ['tests', 'scripts', 'README.md', 'package.json', 'deploy']) {
      assert.equal(existsSync(join(outDirectory, excluded)), false, `${excluded} must not be published`);
    }
  });

  it('replaces the previous build instead of merging into it', () => {
    const outDirectory = join(scratch(), 'site');
    writeSite(outDirectory, { 'stale.txt': 'left over from an earlier build' });

    buildSite({ root: PROJECT_ROOT, outDirectory });

    assert.equal(existsSync(join(outDirectory, 'stale.txt')), false);
  });

  it('refuses an output directory that would wipe the project', () => {
    // A throwaway project nested in a throwaway parent: if the guard ever breaks, only this is emptied.
    const parent = scratch();
    const root = join(parent, 'project');
    writeSite(root, { 'index.html': '<!doctype html>', 'precious.txt': 'must survive' });

    assert.throws(() => buildSite({ root, outDirectory: root }), /contains the project/);
    assert.throws(() => buildSite({ root, outDirectory: parent }), /contains the project/);
    assert.ok(existsSync(join(root, 'precious.txt')));
  });

  it('fails clearly when a required part of the site is missing', () => {
    const root = scratch();
    writeSite(root, { 'index.html': '<!doctype html>' });

    assert.throws(() => buildSite({ root, outDirectory: join(scratch(), 'site') }), /\.nojekyll is missing/);
  });
});

describe('findProblems', () => {
  it('accepts a site whose references and imports all resolve', () => {
    const site = scratch();
    writeSite(site, {
      'index.html': '<link href="styles/a.css" rel="stylesheet"><script type="module" src="src/main.js"></script><a href="https://example.com">x</a>',
      'styles/a.css': 'body{}',
      'src/main.js': "import { b } from './lib/b.js';\nconst later = () => import('./lib/b.js');",
      'src/lib/b.js': 'export const b = 1;',
    });

    assert.deepEqual(findProblems(site), []);
  });

  it('reports a stylesheet or script the page points at but the build lacks', () => {
    const site = scratch();
    writeSite(site, { 'index.html': '<link href="styles/missing.css"><script src="src/main.js"></script>', 'src/main.js': '' });

    assert.deepEqual(findProblems(site), ['index.html references missing file styles/missing.css']);
  });

  it('reports a relative import that points at a file that was not copied', () => {
    const site = scratch();
    writeSite(site, {
      'index.html': '<script src="src/main.js"></script>',
      'src/main.js': "import './setup.js';\nexport { gone } from './gone.js';",
      'src/setup.js': '',
    });

    assert.deepEqual(findProblems(site), ['src/main.js imports missing module ./gone.js']);
  });
});
