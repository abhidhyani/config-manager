import { h } from './dom.js';
import { icon } from './icons.js';

let dialogCounter = 0;

/**
 * A modal built on `<dialog>`, so focus trapping, Escape and the backdrop come from the browser.
 * It never closes by clicking outside (that would throw away a half-written edit), and while
 * `setBusy(true)` neither Escape nor the close button can dismiss it.
 */
export class ModalDialog {
  constructor({ title, subtitle = '', iconName = null, size = 'medium', onClose = () => {} }) {
    dialogCounter += 1;
    const titleId = `dialog-title-${dialogCounter}`;
    this.busy = false;
    this.body = h('div', { class: 'dialog__body' });
    this.footer = h('div', { class: 'dialog__footer' });
    this.closeButton = h('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Close dialog',
      onClick: () => this.close(),
    }, icon('x', { size: 18 }));
    this.element = h('dialog', { class: `dialog dialog--${size}`, 'aria-labelledby': titleId },
      h('div', { class: 'dialog__header' },
        iconName ? h('span', { class: 'dialog__icon' }, icon(iconName, { size: 20 })) : null,
        h('div', { class: 'dialog__heading' },
          h('h2', { id: titleId, class: 'dialog__title' }, title),
          subtitle ? h('p', { class: 'dialog__subtitle' }, subtitle) : null,
        ),
        this.closeButton,
      ),
      this.body,
      this.footer,
    );
    this.element.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    this.element.addEventListener('close', () => {
      this.element.remove();
      onClose();
    });
  }

  open() {
    document.body.append(this.element);
    this.element.showModal();
    return this;
  }

  close() {
    if (this.busy) return;
    if (this.element.open) this.element.close();
  }

  setBusy(busy) {
    this.busy = busy;
    this.closeButton.disabled = busy;
    this.element.classList.toggle('is-busy', busy);
  }
}
