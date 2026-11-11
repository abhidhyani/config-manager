import { createIssue, SEVERITY } from '../IssueTypes.js';
import {
  extractPlaceholders,
  hasUnbalancedBraces,
  mixesPlaceholderStyles,
  placeholderSignature,
} from '../text/placeholders.js';

const describe = (value) => {
  const tokens = extractPlaceholders(value);
  return tokens.length === 0 ? 'none' : tokens.join(' ');
};

/**
 * A runtime format argument that one app has and another lacks crashes or garbles the string
 * on screen. Between a translation and its source that is an error; between independent copy
 * decks (USA vs Nation) it may be deliberate, so it is a warning there.
 */
function mismatchIssue(ctx, { env, app, key, value }) {
  const reference = ctx.reference(env.id, key);
  if (!reference || reference === app) return null;
  const referenceValue = ctx.catalog(reference.id, env.id).get(key);
  if (placeholderSignature(value) === placeholderSignature(referenceValue)) return null;
  return createIssue({
    type: 'placeholder-mismatch',
    envId: env.id,
    appId: app.id,
    key,
    severity: app.translationOf === reference.id ? SEVERITY.ERROR : SEVERITY.WARNING,
    message:
      `Placeholders differ from ${reference.label}: ` +
      `${app.shortLabel} has ${describe(value)}, ${reference.shortLabel} has ${describe(referenceValue)}.`,
  });
}

function malformedIssue({ env, app, key, value }) {
  const problems = [];
  if (mixesPlaceholderStyles(value)) problems.push('mixes positional (%1$s) and plain (%s) placeholders');
  if (hasUnbalancedBraces(value)) problems.push('has unbalanced { }');
  if (problems.length === 0) return null;
  return createIssue({
    type: 'malformed-placeholder',
    envId: env.id,
    appId: app.id,
    key,
    message: `Value ${problems.join(' and ')}.`,
  });
}

export function placeholders(ctx) {
  const issues = [];
  ctx.forEachString((entry) => {
    for (const issue of [mismatchIssue(ctx, entry), malformedIssue(entry)]) {
      if (issue) issues.push(issue);
    }
  });
  return issues;
}
