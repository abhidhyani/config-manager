import { h } from './dom.js';

/** Leading/trailing spaces, line breaks, non-breaking space, and zero-width / bidi control characters. */
const SPECIAL = /(^ +| +$|\n|\u00A0|[\u200B-\u200D\u2060\uFEFF\u202A-\u202E])/;

function describe(token) {
  if (token === '\n') return { text: '\u21B5', title: 'Line break', warn: false, breakAfter: true };
  if (token === '\u00A0') return { text: '\u237D', title: 'Non-breaking space (U+00A0)', warn: true };
  if (/^ +$/.test(token)) return { text: '\u00B7'.repeat(token.length), title: 'Space', warn: false };
  const code = token.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  return { text: `<U+${code}>`, title: `Invisible character U+${code}`, warn: true };
}

/** A key in monospace that may wrap after an underscore instead of in the middle of a word. */
export function renderKey(key) {
  const words = String(key).split('_');
  return h('code', { class: 'key' }, words.map((word, index) =>
    index < words.length - 1 ? [`${word}_`, h('wbr')] : word,
  ));
}

/**
 * A string value with the characters that are invisible in a plain cell made visible, because
 * the difference between "Subscribe" and "Subscribe " (or a non-breaking space) is exactly the
 * kind of thing this tool exists to surface.
 */
export function renderValue(text) {
  const parts = String(text)
    .split(SPECIAL)
    .map((token, index) => {
      if (token === '') return null;
      if (index % 2 === 0) return token;
      const { text: shown, title, warn, breakAfter } = describe(token);
      return [
        h('span', { class: `ws${warn ? ' ws--warn' : ''}`, title }, shown),
        breakAfter ? h('br') : null,
      ];
    });
  return h('span', { class: 'value' }, parts);
}
