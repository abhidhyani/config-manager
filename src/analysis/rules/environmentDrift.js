import { createIssue } from '../IssueTypes.js';

const PROD = 'prod';
const QA = 'qa';

/**
 * QA / Stage is where copy is staged ahead of production, so the two catalogues of one app are
 * expected to differ in one direction only: QA may be ahead, but a key that exists in Prod and
 * is absent from QA means QA builds are testing against an incomplete catalogue.
 */
export function environmentDrift(ctx) {
  const issues = [];
  for (const app of ctx.apps) {
    const prod = ctx.catalog(app.id, PROD);
    const qa = ctx.catalog(app.id, QA);
    if (!prod || !qa) continue;

    for (const [key, prodValue] of prod.entries) {
      if (!qa.has(key)) {
        issues.push(
          createIssue({
            type: 'prod-only',
            envId: PROD,
            appId: app.id,
            key,
            message: 'Exists in Prod but is missing from QA / Stage.',
          }),
        );
      } else if (qa.get(key) !== prodValue) {
        issues.push(
          createIssue({
            type: 'env-value-differs',
            envId: PROD,
            appId: app.id,
            key,
            message: 'Value differs from QA / Stage.',
          }),
          createIssue({
            type: 'env-value-differs',
            envId: QA,
            appId: app.id,
            key,
            message: 'Value differs from Prod.',
          }),
        );
      }
    }

    for (const key of qa.entries.keys()) {
      if (prod.has(key)) continue;
      issues.push(
        createIssue({
          type: 'qa-only',
          envId: QA,
          appId: app.id,
          key,
          message: 'Only in QA / Stage; not published to Prod yet.',
        }),
      );
    }
  }
  return issues;
}
