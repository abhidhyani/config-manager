import { SEVERITY_RANK } from '../../analysis/IssueTypes.js';
import { SEVERITY_ICONS } from '../badges.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const MENU_ID = 'issue-types';

/**
 * A dropdown of checkboxes to hide or show whole kinds of issue (for example the 800-odd
 * "untranslated" warnings). The dashboard is rebuilt on every state change, so the menu carries
 * its open state across rebuilds, stays open while boxes are ticked, and closes on an outside
 * click or Escape. The state is read from the live element, never from the async `toggle` event.
 */
export class IssueTypeMenu {
  #controller;
  #open = false;
  #element = null;

  constructor({ controller }) {
    this.#controller = controller;
    document.addEventListener('click', (event) => this.#closeOnOutsideClick(event));
    document.addEventListener('keydown', (event) => this.#closeOnEscape(event));
  }

  render(state) {
    const hidden = new Set(state.preferences.hiddenIssueTypes);
    const types = state.issueIndex
      .typeCounts(state.preferences.environment)
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count);
    this.#rememberOpenState();
    if (types.length === 0) {
      this.#element = null;
      return null;
    }

    const hiddenCount = types.filter(({ type }) => hidden.has(type)).length;
    this.#element = h('details', { class: 'menu', 'data-menu': MENU_ID, open: this.#open },
      h('summary', { class: `btn menu__trigger${hiddenCount > 0 ? ' has-hidden' : ''}`, 'data-focus-id': 'issue-types-trigger' },
        icon('filter', { size: 16 }),
        'Issue types',
        hiddenCount > 0 ? h('span', { class: 'menu__hidden-count' }, `${hiddenCount} hidden`) : null,
        icon('chevron-down', { size: 14, className: 'menu__chevron' }),
      ),
      h('div', { class: 'menu__panel', role: 'group', 'aria-label': 'Issue types shown' },
        h('p', { class: 'menu__heading' }, 'Show these kinds of issue'),
        h('ul', { class: 'menu__list' }, types.map(({ type, count, label, severity }) => this.#renderItem({
          type, count, label, severity, shown: !hidden.has(type),
        }))),
      ),
    );
    return this.#element;
  }

  #renderItem({ type, count, label, severity, shown }) {
    return h('li', null,
      h('label', { class: 'menu__item' },
        h('input', {
          type: 'checkbox',
          checked: shown,
          'data-focus-id': `issue-type-${type}`,
          onChange: () => this.#controller.toggleIssueType(type),
        }),
        icon(SEVERITY_ICONS[severity], { size: 14, className: `menu__severity menu__severity--${severity}` }),
        h('span', { class: 'menu__label' }, label),
        h('span', { class: 'menu__count' }, count.toLocaleString()),
      ),
    );
  }

  /** Called just before the old element is replaced, while it still holds the user's choice. */
  #rememberOpenState() {
    if (this.#element?.isConnected) this.#open = this.#element.open;
  }

  #isOpen() {
    return Boolean(this.#element?.isConnected && this.#element.open);
  }

  /** The clicked node may already have been replaced by a re-render, so look at its own ancestry. */
  #closeOnOutsideClick(event) {
    if (!this.#isOpen()) return;
    if (event.target instanceof Element && event.target.closest(`[data-menu="${MENU_ID}"]`)) return;
    this.#close();
  }

  #closeOnEscape(event) {
    if (event.key !== 'Escape' || !this.#isOpen()) return;
    this.#close();
    this.#element.querySelector('summary')?.focus();
  }

  #close() {
    this.#open = false;
    this.#element.open = false;
  }
}
