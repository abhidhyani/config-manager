const FIRST_ERROR_DETAIL = (payload) =>
  Array.isArray(payload?.errors) && payload.errors.length > 0
    ? ` ${payload.errors.map((error) => error.message ?? error.code ?? '').filter(Boolean).join('; ')}`
    : '';

/** Extracts the authorization URL from `X-GitHub-SSO: required; url=https://...`. */
function parseSsoUrl(header) {
  const match = /url=(\S+)/.exec(header ?? '');
  return match ? match[1] : null;
}

/**
 * A GitHub failure translated into something a developer or QA user can act on.
 * `kind` is stable for code to branch on; `message` is for people.
 */
export class GitHubError extends Error {
  constructor({ kind, message, status = 0, ssoUrl = null, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
    this.ssoUrl = ssoUrl;
  }

  static network(cause) {
    return new GitHubError({
      kind: 'network',
      message: 'Could not reach GitHub. Check your connection and that api.github.com is not blocked.',
      cause,
    });
  }

  static fromResponse(response, payload) {
    const { status, headers } = response;
    const apiMessage = payload?.message ? String(payload.message) : '';

    if (status === 401) {
      return new GitHubError({
        kind: 'auth',
        status,
        message: 'GitHub rejected the token (expired, revoked or mistyped). Update it in Settings.',
      });
    }

    if (status === 403) {
      const sso = headers.get('x-github-sso');
      if (sso) {
        return new GitHubError({
          kind: 'sso',
          status,
          ssoUrl: parseSsoUrl(sso),
          message:
            'The token must be authorized for this organization\'s SAML SSO. ' +
            'Open the token in GitHub settings and choose "Configure SSO" > "Authorize".',
        });
      }
      if (headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(apiMessage)) {
        const reset = Number(headers.get('x-ratelimit-reset'));
        const when = reset ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : '';
        return new GitHubError({ kind: 'rate-limit', status, message: `GitHub rate limit reached.${when}` });
      }
      return new GitHubError({
        kind: 'forbidden',
        status,
        message:
          'The token is not allowed to do this. It needs read/write access to Contents and Pull requests ' +
          `on the repository.${apiMessage ? ` (${apiMessage})` : ''}`,
      });
    }

    if (status === 404) {
      return new GitHubError({
        kind: 'not-found',
        status,
        message:
          'Not found. Check the repository, branch and paths in Settings. ' +
          'GitHub also answers 404 for a private repository the token cannot see.',
      });
    }

    if (status === 422) {
      return new GitHubError({
        kind: 'validation',
        status,
        message: `GitHub rejected the request: ${apiMessage || 'validation failed'}.${FIRST_ERROR_DETAIL(payload)}`,
      });
    }

    return new GitHubError({
      kind: 'unknown',
      status,
      message: `GitHub returned ${status}${apiMessage ? `: ${apiMessage}` : ''}.`,
    });
  }
}
