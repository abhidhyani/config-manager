import { findMarkupProblems, hasMarkup, markupSignature } from '../analysis/text/markup.js';
import { extractPlaceholders, placeholderSignature } from '../analysis/text/placeholders.js';
import { areKeysSimilar, isSnakeCase, VALID_KEY } from '../analysis/text/keys.js';

const ENTITY = /&(?:amp|lt|gt|quot|apos);/;
const ANDROID_ESCAPE = /\\['"]/;

export function validateKey(key, { existingKeys = [] } = {}) {
  const errors = [];
  const warnings = [];

  if (key === '') {
    errors.push('Enter a key.');
    return { errors, warnings };
  }
  if (!VALID_KEY.test(key)) {
    errors.push('Keys may only contain letters, digits and underscores, and cannot start with a digit.');
    return { errors, warnings };
  }
  if (!isSnakeCase(key)) {
    warnings.push('Existing keys are snake_case (lowercase with underscores); this one is not.');
  }
  const similar = existingKeys.filter((existing) => areKeysSimilar(key, existing)).slice(0, 3);
  if (similar.length > 0) {
    warnings.push(`Similar key already exists: ${similar.map((existing) => `\`${existing}\``).join(', ')}.`);
  }
  return { errors, warnings };
}

/** Problems with one value, independent of other apps. */
export function validateValue(value) {
  const errors = [];
  const warnings = [];

  if (value === '') {
    errors.push('Value is empty.');
    return { errors, warnings };
  }
  if (value.trim() === '') {
    errors.push('Value contains only whitespace.');
    return { errors, warnings };
  }
  if (value !== value.trim()) {
    warnings.push('Has leading or trailing whitespace. Only keep it for sentence fragments the app concatenates.');
  }
  if (ANDROID_ESCAPE.test(value) || (!hasMarkup(value) && ENTITY.test(value))) {
    warnings.push('Contains an Android/XML escape (\\\' or &amp;); config strings should hold the plain text.');
  }
  for (const problem of findMarkupProblems(value)) {
    warnings.push(`Invalid HTML: ${problem}.`);
  }
  return { errors, warnings };
}

/**
 * Problems that only show up when the same key is written to several apps at once:
 * the format arguments and HTML tags must agree, or one app renders it wrongly.
 */
export function validateAcrossApps(valuesByAppLabel) {
  const warnings = [];
  const entries = Object.entries(valuesByAppLabel).filter(([, value]) => value.trim() !== '');
  if (entries.length < 2) return warnings;

  const [referenceLabel, referenceValue] = entries[0];
  for (const [label, value] of entries.slice(1)) {
    if (placeholderSignature(value) !== placeholderSignature(referenceValue)) {
      const describe = (text) => extractPlaceholders(text).join(' ') || 'none';
      warnings.push(
        `Placeholders differ: ${label} has ${describe(value)}, ${referenceLabel} has ${describe(referenceValue)}.`,
      );
    }
    if (markupSignature(value) !== markupSignature(referenceValue)) {
      warnings.push(`HTML tags differ between ${label} and ${referenceLabel}.`);
    }
  }
  return warnings;
}
