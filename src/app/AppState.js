/** A minimal observable store: `set` merges a patch and tells every subscriber. */
export class AppState {
  #state;
  #listeners = new Set();

  constructor(initial) {
    this.#state = initial;
  }

  get() {
    return this.#state;
  }

  set(patch) {
    this.#state = { ...this.#state, ...patch };
    for (const listener of [...this.#listeners]) listener(this.#state);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
