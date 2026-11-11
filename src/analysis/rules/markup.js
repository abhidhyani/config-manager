import { createIssue } from '../IssueTypes.js';
import { findMarkupProblems, markupSignature } from '../text/markup.js';

function mismatchIssue(ctx, { env, app, key, value }) {
  const reference = ctx.reference(env.id, key);
  if (!reference || reference === app) return null;
  const referenceValue = ctx.catalog(reference.id, env.id).get(key);
  if (markupSignature(value) === markupSignature(referenceValue)) return null;
  return createIssue({
    type: 'markup-mismatch',
    envId: env.id,
    appId: app.id,
    key,
    message: `HTML tags differ from ${reference.label}.`,
  });
}

function invalidIssue({ env, app, key, value }) {
  const problems = findMarkupProblems(value);
  if (problems.length === 0) return null;
  return createIssue({
    type: 'invalid-markup',
    envId: env.id,
    appId: app.id,
    key,
    message: `Invalid HTML: ${problems.join('; ')}.`,
  });
}

export function markup(ctx) {
  const issues = [];
  ctx.forEachString((entry) => {
    for (const issue of [mismatchIssue(ctx, entry), invalidIssue(entry)]) {
      if (issue) issues.push(issue);
    }
  });
  return issues;
}
