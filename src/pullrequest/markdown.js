/**
 * Wraps `text` in a code span that survives any content: the fence is longer than the longest
 * backtick run inside, newlines are shown as a literal `\n`, and long values are truncated.
 */
export function inlineCode(text, maxLength = 120) {
  const flat = String(text).replace(/\r?\n/g, '\\n');
  const shown = flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
  const longestRun = Math.max(0, ...(shown.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const pad = shown.startsWith('`') || shown.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${shown}${pad}${fence}`;
}

/** A pipe ends a GFM table cell even inside a code span, so it must be escaped. */
export function escapeTableCell(text) {
  return String(text).replace(/\|/g, '\\|');
}

/** A string shown with its quotes so leading and trailing spaces stay visible. */
export function quotedCode(value, maxLength) {
  return inlineCode(`"${value}"`, maxLength);
}
