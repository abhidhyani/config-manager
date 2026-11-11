import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodePath, GitHubClient } from '../../src/github/GitHubClient.js';
import { GitHubError } from '../../src/github/GitHubError.js';
import { RepositoryReader } from '../../src/github/RepositoryReader.js';
import { FakeGitHub, toGitHubBase64 } from '../helpers/FakeGitHub.js';

const respond = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

function clientReturning(response, token = 'secret-token') {
  const requests = [];
  const client = new GitHubClient({
    token,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return typeof response === 'function' ? response() : response;
    },
  });
  return { client, requests };
}

const failureOf = async (response) => {
  const { client } = clientReturning(response);
  try {
    await client.get('/x');
  } catch (error) {
    return error;
  }
  assert.fail('expected the request to fail');
};

describe('GitHubClient requests', () => {
  it('sends the token as a bearer credential to api.github.com only', async () => {
    const { client, requests } = clientReturning(respond(200, { ok: true }));

    await client.get('/repos/org/repo');

    assert.equal(requests[0].url, 'https://api.github.com/repos/org/repo');
    assert.equal(requests[0].init.headers.Authorization, 'Bearer secret-token');
    assert.equal(requests[0].init.headers.Accept, 'application/vnd.github+json');
    assert.equal(requests[0].init.method, 'GET');
  });

  it('sends no Authorization header when there is no token', async () => {
    const { client, requests } = clientReturning(respond(200, {}), '');

    await client.get('/repos/org/repo');

    assert.equal('Authorization' in requests[0].init.headers, false);
  });

  it('posts a JSON body with a content type', async () => {
    const { client, requests } = clientReturning(respond(201, { sha: 'abc' }));

    const result = await client.post('/git/blobs', { content: 'x', encoding: 'utf-8' });

    assert.deepEqual(result, { sha: 'abc' });
    assert.equal(requests[0].init.body, JSON.stringify({ content: 'x', encoding: 'utf-8' }));
    assert.equal(requests[0].init.headers['Content-Type'], 'application/json');
  });
});

describe('GitHubClient error mapping', () => {
  it('tells the user a rejected token is the problem on 401', async () => {
    const error = await failureOf(respond(401, { message: 'Bad credentials' }));

    assert.ok(error instanceof GitHubError);
    assert.equal(error.kind, 'auth');
    assert.match(error.message, /token/i);
  });

  it('points at SSO authorisation, with the link, when the organisation enforces SAML', async () => {
    const error = await failureOf(
      respond(403, { message: 'Resource protected by organization SAML enforcement.' }, {
        'x-github-sso': 'required; url=https://github.com/orgs/foxcorp-product/sso?authorization_request=abc',
      }),
    );

    assert.equal(error.kind, 'sso');
    assert.equal(error.ssoUrl, 'https://github.com/orgs/foxcorp-product/sso?authorization_request=abc');
    assert.match(error.message, /SSO/);
  });

  it('reports the rate limit when the quota is exhausted', async () => {
    const error = await failureOf(
      respond(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1893456000' }),
    );

    assert.equal(error.kind, 'rate-limit');
    assert.match(error.message, /rate limit/i);
  });

  it('explains missing permissions on an ordinary 403', async () => {
    const error = await failureOf(respond(403, { message: 'Resource not accessible by personal access token' }));

    assert.equal(error.kind, 'forbidden');
    assert.match(error.message, /Contents and Pull requests/);
  });

  it('warns that a private repository also answers 404 on 404', async () => {
    const error = await failureOf(respond(404, { message: 'Not Found' }));

    assert.equal(error.kind, 'not-found');
    assert.match(error.message, /private repository/);
  });

  it('includes the validation detail GitHub gives on 422', async () => {
    const error = await failureOf(
      respond(422, { message: 'Validation Failed', errors: [{ message: 'A pull request already exists for x.' }] }),
    );

    assert.equal(error.kind, 'validation');
    assert.match(error.message, /A pull request already exists/);
  });

  it('falls back to the status code for anything else', async () => {
    const error = await failureOf(respond(502, { message: 'Bad gateway' }));

    assert.equal(error.kind, 'unknown');
    assert.match(error.message, /502/);
  });

  it('reports an unreachable GitHub as a network problem', async () => {
    const client = new GitHubClient({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await assert.rejects(() => client.get('/x'), (error) => error.kind === 'network');
  });

  it('lets an aborted request propagate as an abort, not as a GitHub error', async () => {
    const client = new GitHubClient({
      fetchImpl: async () => {
        throw new DOMException('Aborted', 'AbortError');
      },
    });

    await assert.rejects(() => client.get('/x'), (error) => error.name === 'AbortError');
  });
});

describe('RepositoryReader', () => {
  const files = { 'foxplus/android/lang/v2/en-US/strings.json': '{\n  "café": "Ünïcode — ok"\n}\n' };
  const reader = (github) => new RepositoryReader(github, { owner: 'org', repo: 'repo' });

  it('decodes a UTF-8 file that GitHub returned as wrapped base64', async () => {
    const result = await reader(new FakeGitHub({ files })).readTextFile(
      'foxplus/android/lang/v2/en-US/strings.json',
      'base-sha',
    );

    assert.equal(result.text, files['foxplus/android/lang/v2/en-US/strings.json']);
    assert.equal(result.sha, 'blob-of-foxplus/android/lang/v2/en-US/strings.json');
  });

  it('reads files at a given commit rather than at the moving branch', async () => {
    const github = new FakeGitHub({ files });

    await reader(github).readTextFile('foxplus/android/lang/v2/en-US/strings.json', 'base-sha');

    assert.match(github.calls[0].path, /\?ref=base-sha$/);
  });

  it('falls back to the blob endpoint when the contents API omits a large file body', async () => {
    const calls = [];
    const client = {
      async get(path) {
        calls.push(path);
        if (path.includes('/contents/')) return { type: 'file', sha: 'big', encoding: 'none', content: '' };
        return { content: toGitHubBase64('{}\n') };
      },
    };

    const result = await reader(client).readTextFile('big.json', 'sha');

    assert.equal(result.text, '{}\n');
    assert.ok(calls.at(-1).endsWith('/git/blobs/big'));
  });

  it('rejects a path that is a directory', async () => {
    const client = { get: async () => [{ type: 'file' }] };

    await assert.rejects(() => reader(client).readTextFile('dir', 'sha'), /is not a file/);
  });

  it('resolves a branch to its head commit, including branches with slashes', async () => {
    const calls = [];
    const client = {
      async get(path) {
        calls.push(path);
        return { object: { sha: 'abc' } };
      },
    };

    assert.deepEqual(await reader(client).getBranchHead('release/1.2'), { commitSha: 'abc' });
    assert.ok(calls[0].endsWith('/git/ref/heads/release/1.2'));
  });
});

describe('encodePath', () => {
  it('encodes each segment but keeps the separators', () => {
    assert.equal(encodePath('a b/c#d/ü.json'), 'a%20b/c%23d/%C3%BC.json');
  });
});
