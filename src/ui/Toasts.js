import { h } from './dom.js';
import { icon } from './icons.js';

const DEFAULT_TIMEOUT_MS = 4500;
const TOAST_ICONS = Object.freeze({ info: 'info', success: 'circle-check', error: 'circle-alert' });

/** Short confirmations in a polite live region, so screen readers hear them without stealing focus. */
export class Toaster {
  #container;

  constructor(container) {
    this.#container = container;
  }

  show(message, { kind = 'info', timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const toast = h('div', { class: `toast toast--${kind}` },
      icon(TOAST_ICONS[kind] ?? 'info', { size: 18, className: 'toast__icon' }),
      h('span', null, message),
    );
    this.#container.append(toast);
    setTimeout(() => toast.remove(), timeout);
  }
}
