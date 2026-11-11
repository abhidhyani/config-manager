import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GitHubError } from '../../src/github/GitHubError.js';
import { PublishError, PullRequestPublisher } from '../../src/github/PullRequestPublisher.js';
import { RepositoryReader } from '../../src/github/RepositoryReader.js';
import { FakeGitHub } from '../helpers/FakeGitHub.js';

const USA_QA = 'foxplus/android/lang/v2/en-US/strings_qa.json';
const MX_QA = 'foxplus/android/lang/v2/es-MX/strings_qa.json';

const file = (entries) => `{\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

describe('PullRequestPublisher', () => {
  let github;
  let publisher;
  const publish = (overrides = {}) =>
    publisher.publish({
      baseBranch: 'develop',
      branch: 'config-manager/add-x',
      title: 'Add string `x`',
      body: 'Body text',
      commitMessage: 'Add string `x`\n\nGenerated.',
      draft: true,
      files: [{ path: USA_QA, changes: new Map([['x', 'New value']]) }],
      ...overrides,
    });

  beforeEach(() => {
    github = new FakeGitHub({
      files: {
        [USA_QA]: file([['a', 'A'], ['b', 'B']]),
        [MX_QA]: file([['a', 'A-es'], ['b', 'B-es']]),
      },
    });
    const reader = new RepositoryReader(github, { owner: 'org', repo: 'repo' });
    publisher = new PullRequestPublisher(github, reader, { owner: 'org', repo: 'repo' });
  });

  it('commits the change on top of the latest base commit and opens a draft pull request', async () => {
    const result = await publish();

    assert.deepEqual(github.commits, [
      { message: 'Add string `x`\n\nGenerated.', tree: 'new-tree', parents: ['base-sha'] },
    ]);
    assert.deepEqual([...github.refs], ['refs/heads/config-manager/add-x']);
    assert.deepEqual(github.pulls, [
      { title: 'Add string `x`', body: 'Body text', head: 'config-manager/add-x', base: 'develop', draft: true },
    ]);
    assert.deepEqual(result, {
      number: 42,
      url: 'https://github.com/org/repo/pull/42',
      branch: 'config-manager/add-x',
      commitSha: 'new-commit',
      draft: true,
      files: [USA_QA],
    });
  });

  it('writes a file that differs from the original only by the added line', async () => {
    await publish();

    const [written] = github.blobs.values();
    assert.equal(written, file([['a', 'A'], ['b', 'B'], ['x', 'New value']]));
  });

  it('builds the tree on the base tree so files outside the change are untouched', async () => {
    await publish();

    assert.deepEqual(github.trees, [
      {
        base_tree: 'base-tree',
        tree: [{ path: USA_QA, mode: '100644', type: 'blob', sha: 'blob-1' }],
      },
    ]);
  });

  it('puts several files into one commit', async () => {
    await publish({
      files: [
        { path: USA_QA, changes: new Map([['x', 'New']]) },
        { path: MX_QA, changes: new Map([['x', 'Nuevo']]) },
      ],
    });

    assert.equal(github.commits.length, 1);
    assert.deepEqual(github.trees[0].tree.map((entry) => entry.path), [USA_QA, MX_QA]);
    assert.equal(github.blobs.get('blob-2'), file([['a', 'A-es'], ['b', 'B-es'], ['x', 'Nuevo']]));
  });

  it('applies changes to the files as they are now, keeping strings merged since the dashboard loaded', async () => {
    github.files[USA_QA] = file([['a', 'A'], ['b', 'B'], ['merged_by_someone_else', 'Theirs']]);

    await publish();

    assert.equal(
      github.blobs.get('blob-1'),
      file([['a', 'A'], ['b', 'B'], ['merged_by_someone_else', 'Theirs'], ['x', 'New value']]),
    );
  });

  it('updates an existing key in place', async () => {
    await publish({ files: [{ path: USA_QA, changes: new Map([['a', 'A changed']]) }] });

    assert.equal(github.blobs.get('blob-1'), file([['a', 'A changed'], ['b', 'B']]));
  });

  it('leaves out a file whose change is already on the base branch but still commits the others', async () => {
    github.files[USA_QA] = file([['a', 'A'], ['b', 'B'], ['x', 'New']]);

    await publish({
      files: [
        { path: USA_QA, changes: new Map([['x', 'New']]) },
        { path: MX_QA, changes: new Map([['x', 'Nuevo']]) },
      ],
    });

    assert.deepEqual(github.trees[0].tree.map((entry) => entry.path), [MX_QA]);
  });

  it('refuses to commit when every change is already present, and writes nothing', async () => {
    github.files[USA_QA] = file([['a', 'A'], ['b', 'B'], ['x', 'New']]);

    await assert.rejects(
      () => publish({ files: [{ path: USA_QA, changes: new Map([['x', 'New']]) }] }),
      (error) => error instanceof PublishError && error.step === 'read-files' && /Nothing to commit/.test(error.message),
    );
    assert.equal(github.blobs.size, 0);
    assert.equal(github.refs.size, 0);
  });

  it('refuses to edit a file formatted unlike what it writes, and writes nothing', async () => {
    github.files[USA_QA] = '{\n    "a": "A"\n}\n';

    await assert.rejects(
      () => publish(),
      (error) => error instanceof PublishError && error.step === 'read-files' && /formatted differently/.test(error.message),
    );
    assert.equal(github.blobs.size, 0);
    assert.equal(github.commits.length, 0);
  });

  it('explains a branch name that is already taken, before opening any pull request', async () => {
    github.refs.add('refs/heads/config-manager/add-x');

    await assert.rejects(
      () => publish(),
      (error) =>
        error instanceof PublishError &&
        error.step === 'create-branch' &&
        error.branchCreated === false &&
        /already exists\. Change the branch name/.test(error.message),
    );
    assert.equal(github.pulls.length, 0);
  });

  it('reports that a branch was left behind when only opening the pull request fails', async () => {
    github.failOn(
      'POST /repos/org/repo/pulls',
      new GitHubError({ kind: 'validation', status: 422, message: 'GitHub rejected the request: No commits between.' }),
    );

    await assert.rejects(
      () => publish(),
      (error) =>
        error instanceof PublishError &&
        error.step === 'open-pr' &&
        error.branchCreated === true &&
        error.branch === 'config-manager/add-x',
    );
  });

  it('surfaces an authorisation failure from GitHub with its original message', async () => {
    github.failOn('GET /repos/org/repo/git/ref', new GitHubError({ kind: 'auth', status: 401, message: 'Token rejected.' }));

    await assert.rejects(
      () => publish(),
      (error) => error instanceof PublishError && error.step === 'resolve-base' && error.message === 'Token rejected.',
    );
  });

  it('reports progress through each step in order', async () => {
    const events = [];

    await publish({ onProgress: (event) => events.push(`${event.step}:${event.status}`) });

    assert.deepEqual(events, [
      'resolve-base:running',
      'resolve-base:done',
      'read-files:running',
      'read-files:done',
      'create-commit:running',
      'create-commit:done',
      'create-branch:running',
      'create-branch:done',
      'open-pr:running',
      'open-pr:done',
    ]);
  });

  it('reports the failing step', async () => {
    github.refs.add('refs/heads/config-manager/add-x');
    const events = [];

    await assert.rejects(() => publish({ onProgress: (event) => events.push(`${event.step}:${event.status}`) }));

    assert.equal(events.at(-1), 'create-branch:failed');
  });
});
