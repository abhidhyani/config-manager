import { GitHubError } from '../../src/github/GitHubError.js';

/** GitHub returns base64 wrapped at 60 columns; reproduce that so decoding is exercised for real. */
export function toGitHubBase64(text) {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/(.{60})/g, '$1\n');
}

/**
 * An in-memory stand-in for the slice of the GitHub REST API the app uses. It implements the
 * same `get` / `post` surface as `GitHubClient`, records every call, and can be told to fail a
 * given route, so the real reader and publisher run against it unchanged.
 */
export class FakeGitHub {
  constructor({ files, owner = 'org', repo = 'repo', baseBranch = 'develop' }) {
    this.files = { ...files };
    this.root = `/repos/${owner}/${repo}`;
    this.baseBranch = baseBranch;
    this.calls = [];
    this.blobs = new Map();
    this.trees = [];
    this.commits = [];
    this.refs = new Set();
    this.pulls = [];
    this.failures = new Map();
    this.canPush = true;
  }

  /** Make the next request whose `METHOD path` contains `needle` fail with `error`. */
  failOn(needle, error) {
    this.failures.set(needle, error);
  }

  async get(path) {
    return this.#handle('GET', path);
  }

  async post(path, body) {
    return this.#handle('POST', path, body);
  }

  #handle(method, path, body) {
    this.calls.push({ method, path, body });
    for (const [needle, error] of this.failures) {
      if (`${method} ${path}`.includes(needle)) {
        this.failures.delete(needle);
        throw error;
      }
    }

    const relative = path.slice(this.root.length);
    if (method === 'GET') return this.#get(relative);
    return this.#post(relative, body);
  }

  #get(relative) {
    if (relative === '') {
      return { full_name: this.root.slice('/repos/'.length), permissions: { push: this.canPush } };
    }
    if (relative === `/git/ref/heads/${this.baseBranch}`) return { object: { sha: 'base-sha' } };
    if (relative === '/git/commits/base-sha') return { tree: { sha: 'base-tree' } };

    const contents = relative.match(/^\/contents\/(.+)\?ref=(.+)$/);
    if (contents) {
      const filePath = decodeURIComponent(contents[1]);
      if (!(filePath in this.files)) {
        throw new GitHubError({ kind: 'not-found', status: 404, message: 'Not found.' });
      }
      return {
        type: 'file',
        sha: `blob-of-${filePath}`,
        encoding: 'base64',
        content: toGitHubBase64(this.files[filePath]),
        html_url: `https://github.com/org/repo/blob/develop/${filePath}`,
      };
    }
    throw new Error(`FakeGitHub: unhandled GET ${relative}`);
  }

  #post(relative, body) {
    if (relative === '/git/blobs') {
      const sha = `blob-${this.blobs.size + 1}`;
      this.blobs.set(sha, body.content);
      return { sha };
    }
    if (relative === '/git/trees') {
      this.trees.push(body);
      return { sha: 'new-tree' };
    }
    if (relative === '/git/commits') {
      this.commits.push(body);
      return { sha: 'new-commit' };
    }
    if (relative === '/git/refs') {
      if (this.refs.has(body.ref)) {
        throw new GitHubError({
          kind: 'validation',
          status: 422,
          message: 'GitHub rejected the request: Reference already exists.',
        });
      }
      this.refs.add(body.ref);
      return { ref: body.ref };
    }
    if (relative === '/pulls') {
      this.pulls.push(body);
      return { number: 42, html_url: 'https://github.com/org/repo/pull/42', draft: body.draft };
    }
    throw new Error(`FakeGitHub: unhandled POST ${relative}`);
  }
}
