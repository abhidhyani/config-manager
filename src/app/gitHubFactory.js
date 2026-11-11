import { GitHubClient } from '../github/GitHubClient.js';
import { PullRequestPublisher } from '../github/PullRequestPublisher.js';
import { RepositoryReader } from '../github/RepositoryReader.js';

/** Wires the GitHub collaborators for one token and repository. Swapped out in tests. */
export function createGitHub(token, { owner, repo }) {
  const client = new GitHubClient({ token });
  const reader = new RepositoryReader(client, { owner, repo });
  const publisher = new PullRequestPublisher(client, reader, { owner, repo });
  return { client, reader, publisher };
}
