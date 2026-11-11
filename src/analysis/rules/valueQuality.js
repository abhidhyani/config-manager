import { createIssue } from '../IssueTypes.js';
import { hasMarkup } from '../text/markup.js';

const INVISIBLE = /[\u00A0\u200B-\u200D\u2060\uFEFF\u2028\u2029]/g;
const PLACEHOLDER_ONLY = /^\s*(?:todo|fixme|null|undefined|lorem ipsum.*)\s*$/i;
const PLACEHOLDER_INSIDE = /\blorem ipsum\b|\bFIXME\b|\bTODO\s*[:-]/i;
const ENTITY = /&(?:amp|lt|gt|quot|apos);/;
const ANDROID_ESCAPE = /\\['"]/;

const edgeWhitespace = (value) => ({
  leading: value.match(/^\s*/)[0],
  trailing: value.match(/\s*$/)[0],
});

const sameEdges = (a, b) => a.leading === b.leading && a.trailing === b.trailing;
const hasEdges = (edges) => edges.leading !== '' || edges.trailing !== '';

const codePointLabel = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

function emptyOrBlank({ env, app, key, value }) {
  if (value === '') {
    return createIssue({
      type: 'empty-value',
      envId: env.id,
      appId: app.id,
      key,
      message: 'Value is empty.',
    });
  }
  if (value.trim() === '') {
    return createIssue({
      type: 'blank-value',
      envId: env.id,
      appId: app.id,
      key,
      message: 'Value contains only whitespace.',
    });
  }
  return null;
}

/**
 * Leading/trailing spaces are legitimate here: some strings are sentence fragments the app
 * concatenates. So they are only a warning when the apps disagree about them.
 */
function edgeWhitespaceIssue(ctx, { env, app, key, value }) {
  const edges = edgeWhitespace(value);
  const reference = ctx.reference(env.id, key);
  if (reference && reference !== app) {
    const referenceEdges = edgeWhitespace(ctx.catalog(reference.id, env.id).get(key));
    if (!sameEdges(edges, referenceEdges)) {
      return createIssue({
        type: 'edge-whitespace-mismatch',
        envId: env.id,
        appId: app.id,
        key,
        message: `Leading/trailing whitespace differs from ${reference.label}.`,
      });
    }
  }
  if (!hasEdges(edges)) return null;
  return createIssue({
    type: 'edge-whitespace',
    envId: env.id,
    appId: app.id,
    key,
    message: 'Has leading or trailing whitespace (fine for concatenated fragments).',
  });
}

function invisibleCharactersIssue({ env, app, key, value }) {
  const found = [...new Set(value.match(INVISIBLE) ?? [])];
  if (found.length === 0) return null;
  return createIssue({
    type: 'invisible-characters',
    envId: env.id,
    appId: app.id,
    key,
    message: `Contains invisible characters: ${found.map(codePointLabel).join(', ')}.`,
  });
}

function placeholderTextIssue({ env, app, key, value }) {
  if (!PLACEHOLDER_ONLY.test(value) && !PLACEHOLDER_INSIDE.test(value)) return null;
  return createIssue({
    type: 'placeholder-text',
    envId: env.id,
    appId: app.id,
    key,
    message: 'Looks like placeholder or unfinished copy.',
  });
}

/** `&amp;` is correct inside HTML values; elsewhere it means the XML unescape step was skipped. */
function escapeLeftoverIssue({ env, app, key, value }) {
  const entity = !hasMarkup(value) && ENTITY.test(value);
  if (!entity && !ANDROID_ESCAPE.test(value)) return null;
  return createIssue({
    type: 'escape-leftover',
    envId: env.id,
    appId: app.id,
    key,
    message: 'Contains an Android/XML escape (\\\' or &amp;) that the config pipeline normally unescapes.',
  });
}

export function valueQuality(ctx) {
  const issues = [];
  ctx.forEachString((entry) => {
    const emptiness = emptyOrBlank(entry);
    if (emptiness) {
      issues.push(emptiness);
      return;
    }
    for (const issue of [
      edgeWhitespaceIssue(ctx, entry),
      invisibleCharactersIssue(entry),
      placeholderTextIssue(entry),
      escapeLeftoverIssue(entry),
    ]) {
      if (issue) issues.push(issue);
    }
  });
  return issues;
}
