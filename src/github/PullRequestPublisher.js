import { StringCatalog } from '../strings/StringCatalog.js';
import { GitHubError } from './GitHubError.js';

export const PUBLISH_STEPS = Object.freeze([
  { id: 'resolve-base', label: 'Resolve the latest base branch commit' },
  { id: 'read-files', label: 'Apply changes to the current files' },
  { id: 'create-commit', label: 'Create the commit' },
  { id: 'create-branch', label: 'Create the branch' },
  { id: 'open-pr', label: 'Open the pull request' },
]);

const FILE_MODE = '100644';

/** A publish failure that says which step broke and whether a branch was already left behind. */
export class PublishError extends Error {
  constructor({ step, message, branch, branchCreated = false, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PublishError';
    this.step = step;
    this.branch = branch;
    this.branchCreated = branchCreated;
  }
}

/**
 * Turns a set of per-file key changes into a branch, one commit and a pull request.
 *
 * Changes are applied to the files as they are on the base branch *right now*, not to the copy
 * the dashboard loaded earlier, so strings merged by someone else in the meantime are kept.
 * All files go into a single commit through the Git Data API, so the pull request is atomic.
 */
export class PullRequestPublisher {
  #client;
  #reader;
  #root;

  constructor(client, reader, { owner, repo }) {
    this.#client = client;
    this.#reader = reader;
    this.#root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  /**
   * @param files `[{ path, changes: Map<key, value> }]`
   * @returns `{ number, url, branch, commitSha, draft, files }`
   */
  async publish({ baseBranch, branch, title, body, commitMessage, draft, files, onProgress = () => {} }) {
    let step = PUBLISH_STEPS[0].id;
    let branchCreated = false;
    const enter = (id) => {
      step = id;
      onProgress({ step: id, status: 'running' });
    };
    const finish = () => onProgress({ step, status: 'done' });

    try {
      enter('resolve-base');
      const { commitSha: baseSha } = await this.#reader.getBranchHead(baseBranch);
      const baseTreeSha = await this.#reader.getCommitTreeSha(baseSha);
      finish();

      enter('read-files');
      const updates = await this.#applyChanges(files, baseSha);
      finish();

      enter('create-commit');
      const commit = await this.#createCommit({ updates, baseSha, baseTreeSha, message: commitMessage });
      finish();

      enter('create-branch');
      await this.#client.post(`${this.#root}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
      branchCreated = true;
      finish();

      enter('open-pr');
      const pull = await this.#client.post(`${this.#root}/pulls`, {
        title,
        body,
        head: branch,
        base: baseBranch,
        draft,
      });
      finish();

      return {
        number: pull.number,
        url: pull.html_url,
        branch,
        commitSha: commit.sha,
        draft: Boolean(pull.draft ?? draft),
        files: updates.map(({ path }) => path),
      };
    } catch (error) {
      onProgress({ step, status: 'failed' });
      throw this.#toPublishError(error, { step, branch, branchCreated });
    }
  }

  async #applyChanges(files, baseSha) {
    const updates = [];
    for (const file of files) {
      const { text, sha } = await this.#reader.readTextFile(file.path, baseSha);
      const catalog = StringCatalog.fromText({ path: file.path, sha }, text);
      if (!catalog.roundTripSafe) {
        throw new PublishError({
          step: 'read-files',
          message:
            `${file.path} is formatted differently from what Config Manager writes, so editing it ` +
            'would change unrelated lines. Edit this file by hand.',
        });
      }
      const content = catalog.withValues(file.changes).serialize();
      if (content !== text) updates.push({ path: file.path, content });
    }
    if (updates.length === 0) {
      throw new PublishError({
        step: 'read-files',
        message: 'Nothing to commit: every change is already present on the base branch.',
      });
    }
    return updates;
  }

  async #createCommit({ updates, baseSha, baseTreeSha, message }) {
    const blobs = await Promise.all(
      updates.map(({ content }) =>
        this.#client.post(`${this.#root}/git/blobs`, { content, encoding: 'utf-8' }),
      ),
    );
    const tree = await this.#client.post(`${this.#root}/git/trees`, {
      base_tree: baseTreeSha,
      tree: updates.map(({ path }, index) => ({
        path,
        mode: FILE_MODE,
        type: 'blob',
        sha: blobs[index].sha,
      })),
    });
    return this.#client.post(`${this.#root}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [baseSha],
    });
  }

  #toPublishError(error, { step, branch, branchCreated }) {
    if (error instanceof PublishError) {
      error.branch ??= branch;
      return error;
    }
    let message = error instanceof GitHubError ? error.message : `Unexpected error: ${error?.message ?? error}`;
    if (step === 'create-branch' && error instanceof GitHubError && /already exists/i.test(error.message)) {
      message = `A branch named "${branch}" already exists. Change the branch name and try again.`;
    }
    return new PublishError({ step, message, branch, branchCreated, cause: error });
  }
}
