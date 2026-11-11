const TAG_PATTERN = /<(\/?)([a-zA-Z][\w-]*)(?:\s[^<>]*)?(\/?)>/g;
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr']);

export function extractTags(value) {
  return [...String(value).matchAll(TAG_PATTERN)].map((match) => ({
    name: match[2].toLowerCase(),
    closing: match[1] === '/',
    selfClosing: match[3] === '/' || VOID_TAGS.has(match[2].toLowerCase()),
  }));
}

export function hasMarkup(value) {
  return extractTags(value).length > 0;
}

/** Order-independent fingerprint of the tags in a value, ignoring attributes. */
export function markupSignature(value) {
  return extractTags(value)
    .map((tag) => (tag.closing ? `</${tag.name}>` : `<${tag.name}>`))
    .sort()
    .join('');
}

/** Human-readable problems: tags that are never closed, or closed without being opened. */
export function findMarkupProblems(value) {
  const stack = [];
  const problems = [];
  for (const tag of extractTags(value)) {
    if (tag.selfClosing) continue;
    if (!tag.closing) {
      stack.push(tag.name);
    } else if (stack[stack.length - 1] === tag.name) {
      stack.pop();
    } else {
      problems.push(`Unexpected </${tag.name}>`);
    }
  }
  for (const name of stack) {
    problems.push(`<${name}> is never closed`);
  }
  return problems;
}
