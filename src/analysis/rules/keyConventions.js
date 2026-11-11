import { createIssue } from '../IssueTypes.js';
import { areKeysSimilar, isSnakeCase, normalizeKey } from '../text/keys.js';

function namingIssues(ctx) {
  const issues = [];
  for (const env of ctx.environments) {
    for (const app of ctx.appsWithCatalog(env.id)) {
      for (const key of ctx.catalog(app.id, env.id).entries.keys()) {
        if (isSnakeCase(key)) continue;
        issues.push(
          createIssue({
            type: 'key-naming',
            envId: env.id,
            appId: app.id,
            key,
            message: 'Key is not snake_case like the rest of the catalogue.',
          }),
        );
      }
    }
  }
  return issues;
}

/** Two keys inside one file that differ only by case or separators: probably one string twice. */
function nearDuplicateIssues(ctx) {
  const issues = [];
  for (const env of ctx.environments) {
    for (const app of ctx.appsWithCatalog(env.id)) {
      const groups = new Map();
      for (const key of ctx.catalog(app.id, env.id).entries.keys()) {
        const normalized = normalizeKey(key);
        groups.set(normalized, [...(groups.get(normalized) ?? []), key]);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const key of group) {
          const others = group.filter((other) => other !== key).map((other) => `\`${other}\``);
          issues.push(
            createIssue({
              type: 'key-near-duplicate',
              envId: env.id,
              appId: app.id,
              key,
              message: `Looks like a duplicate of ${others.join(', ')} in the same file.`,
            }),
          );
        }
      }
    }
  }
  return issues;
}

const labels = (apps) => apps.map((app) => app.label).join(', ');

/**
 * The same string spelled differently in different apps: `K` is held by some apps, `C` by
 * others, no app holds both, and the two keys differ only by casing, separators or a typo.
 *
 * The issue sits on the cells that actually hold each spelling; the cells that lack one are
 * already covered by `missing-key`. Only keys not shared by every app are candidates, so this
 * stays cheap on a catalogue of ~900 keys.
 */
function crossAppMismatchIssues(ctx) {
  const issues = [];
  for (const env of ctx.environments) {
    const loaded = ctx.appsWithCatalog(env.id);
    if (loaded.length < 2) continue;

    const unmatched = [...ctx.keyUnion(env.id)]
      .filter((key) => ctx.holders(env.id, key).length < loaded.length)
      .sort();

    for (let first = 0; first < unmatched.length; first += 1) {
      for (let second = first + 1; second < unmatched.length; second += 1) {
        const [keyA, keyB] = [unmatched[first], unmatched[second]];
        if (!areKeysSimilar(keyA, keyB)) continue;
        const holdersA = ctx.holders(env.id, keyA);
        const holdersB = ctx.holders(env.id, keyB);
        if (holdersA.some((app) => holdersB.includes(app))) continue;

        for (const [key, holders, otherKey, otherHolders] of [
          [keyA, holdersA, keyB, holdersB],
          [keyB, holdersB, keyA, holdersA],
        ]) {
          const message =
            `${labels(otherHolders)} use${otherHolders.length === 1 ? 's' : ''} \`${otherKey}\` ` +
            'for what is probably the same string.';
          for (const app of holders) {
            issues.push(
              createIssue({ type: 'key-mismatch', envId: env.id, appId: app.id, key, message, related: otherKey }),
            );
          }
        }
      }
    }
  }
  return issues;
}

export function keyConventions(ctx) {
  return [...namingIssues(ctx), ...nearDuplicateIssues(ctx), ...crossAppMismatchIssues(ctx)];
}
