import { createIssue } from '../IssueTypes.js';
import { visibleLetters } from '../text/placeholders.js';

/** Fewer letters than this ("OK", "%s", "24/7") reads the same in every language. */
const MIN_TRANSLATABLE_LETTERS = 3;

/** A translated app whose value is byte-for-byte its source app's: it was never translated. */
export function translations(ctx) {
  const issues = [];
  ctx.forEachString(({ env, app, key, value }) => {
    if (!app.translationOf) return;
    const source = ctx.getApp(app.translationOf);
    const sourceCatalog = source && ctx.catalog(source.id, env.id);
    if (!sourceCatalog || sourceCatalog.get(key) !== value) return;
    if (visibleLetters(value).length < MIN_TRANSLATABLE_LETTERS) return;
    issues.push(
      createIssue({
        type: 'untranslated',
        envId: env.id,
        appId: app.id,
        key,
        message: `Identical to ${source.label} (${source.locale}); not translated to ${app.locale}.`,
      }),
    );
  });
  return issues;
}
