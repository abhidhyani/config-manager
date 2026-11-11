import { GitHubError } from './GitHubError.js';

export const GITHUB_API_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';

async function readPayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

/** Percent-encodes each path segment but keeps the slashes between them. */
export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

/**
 * Thin wrapper over `fetch` for api.github.com. Runs entirely in the browser: GitHub's API
 * allows cross-origin requests with an Authorization header, so no backend is needed.
 * The token is held only inside this instance and is sent only to GitHub.
 */
export class GitHubClient {
  #token;
  #fetch;
  #baseUrl;

  constructor({ token = '', fetchImpl = (...args) => globalThis.fetch(...args), baseUrl = GITHUB_API_URL } = {}) {
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  async request(method, path, { body, signal } = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
    };
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw GitHubError.network(error);
    }

    const payload = await readPayload(response);
    if (!response.ok) throw GitHubError.fromResponse(response, payload);
    return payload;
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options) {
    return this.request('POST', path, { ...options, body });
  }
}
