const ALIASES = { class: 'className', for: 'htmlFor' };

/** Names that must go through `setAttribute`: read-only properties, or ones whose string form matters. */
const ATTRIBUTE_ONLY = new Set(['list', 'form', 'role', 'spellcheck']);

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Builds an element: `h('button', { class: 'btn', onClick }, 'Save')`.
 * `on*` keys become listeners, properties are assigned directly, everything else is an attribute.
 * `null`, `undefined` and `false` children and attributes are skipped so views can use `cond && node`.
 */
export function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [rawName, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (rawName.startsWith('on') && typeof value === 'function') {
      element.addEventListener(rawName.slice(2).toLowerCase(), value);
      continue;
    }
    if (rawName === 'style' && typeof value === 'object') {
      // CSSOM writes are allowed by the strict CSP; a `style="..."` attribute would not be.
      for (const [property, propertyValue] of Object.entries(value)) element.style.setProperty(property, String(propertyValue));
      continue;
    }
    const name = ALIASES[rawName] ?? rawName;
    if (name in element && !ATTRIBUTE_ONLY.has(name)) {
      element[name] = value;
    } else {
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
  append(element, children);
  return element;
}

export function replaceChildren(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
}

/**
 * Re-renders `root` without dropping the caret: whichever control inside it carries
 * `data-focus-id` and has focus is found again afterwards, focused, with its selection restored.
 */
export function preserveFocus(root, render) {
  const active = document.activeElement;
  const focusId = active instanceof HTMLElement && root.contains(active) ? active.dataset.focusId : undefined;
  let selection = null;
  if (focusId) {
    try {
      selection = [active.selectionStart, active.selectionEnd];
    } catch {
      selection = null;
    }
  }

  render();

  if (!focusId) return;
  const next = root.querySelector(`[data-focus-id="${CSS.escape(focusId)}"]`);
  if (!(next instanceof HTMLElement)) return;
  next.focus({ preventScroll: true });
  if (selection && selection[0] !== null && typeof next.setSelectionRange === 'function') {
    try {
      next.setSelectionRange(selection[0], selection[1]);
    } catch {
      // Not a text control (checkbox, select); focus alone is enough.
    }
  }
}
