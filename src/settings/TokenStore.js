const TOKEN_KEY = 'configManager.githubToken';

/**
 * Holds the GitHub personal access token.
 *
 * It always lives in `sessionStorage` (cleared when the tab closes). Only when the user opts in
 * with "remember" is a second copy written to `localStorage`, so persisting a credential on the
 * device is a deliberate choice rather than a default.
 */
export class TokenStore {
  #session;
  #local;

  constructor({ session, local }) {
    this.#session = session;
    this.#local = local;
  }

  get() {
    return this.#session.getItem(TOKEN_KEY) ?? this.#local.getItem(TOKEN_KEY) ?? '';
  }

  isRemembered() {
    return this.#local.getItem(TOKEN_KEY) !== null;
  }

  set(token, { remember = false } = {}) {
    const trimmed = String(token ?? '').trim();
    if (trimmed === '') {
      this.clear();
      return;
    }
    this.#session.setItem(TOKEN_KEY, trimmed);
    if (remember) {
      this.#local.setItem(TOKEN_KEY, trimmed);
    } else {
      this.#local.removeItem(TOKEN_KEY);
    }
  }

  clear() {
    this.#session.removeItem(TOKEN_KEY);
    this.#local.removeItem(TOKEN_KEY);
  }
}
