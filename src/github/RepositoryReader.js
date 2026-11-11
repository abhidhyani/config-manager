import { decodeBase64Utf8 } from './Base64Utf8.js';
import { GitHubError } from './GitHubError.js';
import { encodePath } from './GitHubClient.js';

/** Read-only access to one repository: branch heads and file contents at a given commit. */
export class RepositoryReader {
  #client;
  #root;

  constructor(client, { owner, repo }) {
    this.#client = client;
    this.#root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  getRepository() {
    return this.#client.get(this.#root);
  }

  /** Commit SHA a branch currently points at. */
  async getBranchHead(branch) {
    const ref = await this.#client.get(`${this.#root}/git/ref/heads/${encodePath(branch)}`);
    return { commitSha: ref.object.sha };
  }

  async getCommitTreeSha(commitSha) {
    const commit = await this.#client.get(`${this.#root}/git/commits/${commitSha}`);
    return commit.tree.sha;
  }

  /** The file's text at `ref` (a commit SHA or branch) plus the blob SHA GitHub knows it by. */
  async readTextFile(path, ref) {
    const data = await this.#client.get(
      `${this.#root}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (Array.isArray(data) || data?.type !== 'file') {
      throw new GitHubError({ kind: 'not-found', message: `${path} is not a file.` });
    }
    let content = data.content;
    if (!content || data.encoding !== 'base64') {
      // The contents API omits the body for large files; the blob API serves them in full.
      content = (await this.#client.get(`${this.#root}/git/blobs/${data.sha}`)).content;
    }
    return { path, sha: data.sha, text: decodeBase64Utf8(content), htmlUrl: data.html_url ?? '' };
  }
}
