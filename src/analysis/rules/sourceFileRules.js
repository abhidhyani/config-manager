import { createIssue } from '../IssueTypes.js';

function describeType(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}

/** Problems with the file itself, found before any string is compared. */
export function sourceFileRules(ctx) {
  const issues = [];

  for (const { target, message } of ctx.failures) {
    issues.push(
      createIssue({
        type: 'file-unavailable',
        envId: target.envId,
        appId: target.appId,
        key: '',
        message: `${target.path}: ${message}`,
      }),
    );
  }

  for (const env of ctx.environments) {
    for (const app of ctx.appsWithCatalog(env.id)) {
      const catalog = ctx.catalog(app.id, env.id);

      if (!catalog.roundTripSafe) {
        issues.push(
          createIssue({
            type: 'unsafe-formatting',
            envId: env.id,
            appId: app.id,
            key: '',
            message:
              'Formatting differs from what Config Manager writes (indent, key order or trailing ' +
              'newline). Editing this file would rewrite unrelated lines, so pull requests are blocked for it.',
          }),
        );
      }

      for (const key of catalog.duplicateKeys) {
        issues.push(
          createIssue({
            type: 'duplicate-key',
            envId: env.id,
            appId: app.id,
            key,
            message: 'Key appears more than once in the file; only the last value is used.',
          }),
        );
      }

      for (const [key, value] of catalog.entries) {
        if (typeof value !== 'string') {
          issues.push(
            createIssue({
              type: 'invalid-type',
              envId: env.id,
              appId: app.id,
              key,
              message: `Value is ${describeType(value)}; string catalogues only hold strings.`,
            }),
          );
        }
      }
    }
  }
  return issues;
}
