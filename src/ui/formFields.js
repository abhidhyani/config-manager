import { h } from './dom.js';
import { icon } from './icons.js';

let fieldCounter = 0;

/**
 * A labelled control with optional help and an error slot wired up for assistive tech.
 * `leadingIcon` / `trailing` wrap the input in a bordered row (for a key icon, a reveal button...).
 * Returns `{ element, input, setError }`.
 */
export function createField({ label, hint, input, leadingIcon, trailing }) {
  fieldCounter += 1;
  const inputId = `field-${fieldCounter}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  input.id = inputId;

  const hintElement = hint ? h('p', { id: hintId, class: 'field__hint' }, hint) : null;
  const errorElement = h('p', { id: errorId, class: 'field__error', role: 'alert', hidden: true });
  input.setAttribute('aria-describedby', [hintElement ? hintId : '', errorId].filter(Boolean).join(' '));

  const control = leadingIcon || trailing
    ? h('div', { class: 'input-affix' },
      leadingIcon ? icon(leadingIcon, { size: 16, className: 'input-affix__icon' }) : null,
      input,
      trailing,
    )
    : input;

  const element = h('div', { class: 'field' },
    h('label', { class: 'field__label', for: inputId }, label),
    control,
    hintElement,
    errorElement,
  );

  const setError = (message) => {
    errorElement.hidden = !message;
    errorElement.textContent = message ?? '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };

  return { element, input, setError };
}

export function textInput({ value = '', placeholder = '', type = 'text', monospace = true, onInput, onChange }) {
  return h('input', {
    type,
    value,
    placeholder,
    class: `input${monospace ? ' input--mono' : ''}`,
    autocomplete: 'off',
    spellcheck: 'false',
    onInput,
    onChange,
  });
}

export function checkbox({ label, checked = false, disabled = false, onChange, hint, focusId }) {
  const input = h('input', { type: 'checkbox', checked, disabled, onChange, 'data-focus-id': focusId });
  const element = h('label', { class: `check${disabled ? ' is-disabled' : ''}` },
    input,
    h('span', { class: 'check__text' }, label, hint ? h('span', { class: 'check__hint' }, hint) : null),
  );
  return { element, input };
}

/** A selectable card (an app or environment) that still behaves as a real checkbox. */
export function choice({ label, hint, checked = false, disabled = false, onChange, appId }) {
  const input = h('input', { type: 'checkbox', class: 'choice__input', checked, disabled, onChange });
  const element = h('label', { class: `choice${appId ? ` app--${appId}` : ''}${disabled ? ' is-disabled' : ''}` },
    input,
    h('span', { class: 'choice__body' },
      h('span', { class: 'choice__mark' }, icon('check', { size: 13 })),
      h('span', { class: 'choice__text' },
        h('span', { class: 'choice__label' }, label),
        hint ? h('span', { class: 'choice__hint' }, hint) : null,
      ),
    ),
  );
  return { element, input };
}

/** An on/off switch with a label and optional explanation. */
export function toggle({ label, hint, checked = false, onChange }) {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch__input', checked, onChange });
  const element = h('label', { class: 'switch' },
    input,
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__thumb' })),
    h('span', { class: 'switch__text' },
      h('span', { class: 'switch__label' }, label),
      hint ? h('span', { class: 'switch__hint' }, hint) : null,
    ),
  );
  return { element, input };
}
