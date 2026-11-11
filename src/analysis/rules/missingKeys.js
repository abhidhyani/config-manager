import { createIssue } from '../IssueTypes.js';

/** A key that exists in at least one app of an environment but not in all of them. */
export function missingKeys(ctx) {
  const issues = [];
  for (const env of ctx.environments) {
    const loaded = ctx.appsWithCatalog(env.id);
    if (loaded.length < 2) continue;

    for (const key of ctx.keyUnion(env.id)) {
      const present = ctx.holders(env.id, key);
      if (present.length === loaded.length) continue;
      const presentLabels = present.map((app) => app.label).join(', ');
      for (const app of loaded) {
        if (present.includes(app)) continue;
        issues.push(
          createIssue({
            type: 'missing-key',
            envId: env.id,
            appId: app.id,
            key,
            message: `Missing in ${app.label}. Present in ${presentLabels}.`,
          }),
        );
      }
    }
  }
  return issues;
}
