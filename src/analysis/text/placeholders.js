// Stateless on purpose: a shared /g regex keeps `lastIndex` between `.test()` calls.
const POSITIONAL_TOKEN = '%\\d+\\$(?:\\.\\d+)?[sdfSD@]';
const PLAIN_TOKEN = '%(?:\\.\\d+)?[sdfSD@]';

/**
 * Format arguments the app substitutes at runtime: `%s`, `%1$s`, `%d`, `%.1f`, `{title}`,
 * `{{title}}` and `${title}`. Whitespace inside braces is ignored so `{{ a }}` equals `{{a}}`.
 */
const PLACEHOLDER_PATTERN =
  /%(?:\d+\$)?(?:\.\d+)?[sdfSD@]|\{\{\s*[\w.-]+\s*\}\}|\$\{[^}\s]+\}|\{[A-Za-z_][\w.-]*\}/g;

export function extractPlaceholders(value) {
  return (String(value).match(PLACEHOLDER_PATTERN) ?? []).map((token) => token.replace(/\s+/g, ''));
}

/** Order-independent fingerprint: two values take the same arguments iff signatures match. */
export function placeholderSignature(value) {
  return extractPlaceholders(value).sort().join('\u0000');
}

/** True when a value mixes `%1$s` and `%s`, which Android rejects as ambiguous. */
export function mixesPlaceholderStyles(value) {
  const text = String(value);
  if (!new RegExp(POSITIONAL_TOKEN).test(text)) return false;
  const withoutPositional = text.replace(new RegExp(POSITIONAL_TOKEN, 'g'), '');
  return new RegExp(PLAIN_TOKEN).test(withoutPositional);
}

export function hasUnbalancedBraces(value) {
  const text = String(value);
  const opening = (text.match(/\{/g) ?? []).length;
  const closing = (text.match(/\}/g) ?? []).length;
  return opening !== closing;
}

/** Text left once placeholders, markup and entities are removed; used to judge translatability. */
export function visibleLetters(value) {
  return String(value)
    .replace(PLACEHOLDER_PATTERN, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[^\p{L}]/gu, '');
}
