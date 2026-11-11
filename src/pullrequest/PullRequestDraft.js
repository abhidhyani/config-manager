import { APPS, ENVIRONMENTS, getApp, getEnvironment } from '../app/AppRegistry.js';
import { CHANGE_KIND, effectiveChanges, groupByFile, summarizeChanges } from '../changes/ChangeSet.js';
import { SEVERITY } from '../analysis/IssueTypes.js';
import { escapeTableCell, inlineCode, quotedCode } from './markdown.js';

const MAX_TITLE_LENGTH = 100;
const MAX_NAMED_KEYS = 3;
const MAX_LISTED_ISSUES = 20;
const MAX_COMMIT_LINES = 20;
const MAX_BRANCH_SLUG = 48;

/** `dtcand-123`, ` DTCAND-123 ` and `DTCAND-123` all become `DTCAND-123`; anything else becomes ''. */
export function normalizeJiraKey(input) {
  const key = String(input ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9]+-\d+$/.test(key) ? key : '';
}

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function joinNatural(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const orderedApps = (appIds) => APPS.filter((app) => appIds.includes(app.id));
const orderedEnvs = (envIds) => ENVIRONMENTS.filter((env) => envIds.includes(env.id));

function describeApps(appIds) {
  const apps = orderedApps(appIds);
  return apps.length === APPS.length ? 'all apps' : joinNatural(apps.map((app) => app.label));
}

function distinctKeysOfKind(effective, kind) {
  return new Set(effective.filter((change) => change.kind === kind).map((change) => change.key));
}

function describeVerb(adds, updates) {
  if (adds > 0 && updates > 0) return 'Add/update';
  return adds > 0 ? 'Add' : 'Update';
}

function buildTitle({ summary, jiraKey, verb }) {
  const prefix = jiraKey ? `${jiraKey}: ` : '';
  const scope = `for ${describeApps(summary.appIds)} (${orderedEnvs(summary.envIds).map((env) => env.shortLabel).join(' + ')})`;
  const named = summary.keys.map((key) => `\`${key}\``).join(', ');
  const countForm = `${prefix}${verb} ${plural(summary.keys.length, 'string')} ${scope}`;
  if (summary.keys.length > MAX_NAMED_KEYS) return countForm;
  const namedForm = `${prefix}${verb} ${summary.keys.length === 1 ? 'string' : 'strings'} ${named} ${scope}`;
  return namedForm.length <= MAX_TITLE_LENGTH ? namedForm : countForm;
}

function buildBranch({ summary, jiraKey, verb, now }) {
  const subject =
    summary.keys.length <= 2
      ? summary.keys.map(slugify).join('-')
      : `${summary.keys.length}-strings`;
  const slug = `${slugify(verb)}-${subject}`.slice(0, MAX_BRANCH_SLUG).replace(/-+$/, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  return `config-manager/${jiraKey ? `${jiraKey}-` : ''}${slug}-${stamp}`;
}

/** Rows of identical before/after for one key and environment collapse into one row listing the apps. */
function aggregateRows(effective) {
  const rows = new Map();
  for (const change of effective) {
    const signature = [change.key, change.envId, change.before, change.after].join('\u0000');
    const row = rows.get(signature) ?? {
      key: change.key,
      envId: change.envId,
      kind: change.kind,
      before: change.before,
      after: change.after,
      appIds: [],
    };
    row.appIds.push(change.appId);
    rows.set(signature, row);
  }
  const envRank = (envId) => ENVIRONMENTS.findIndex((env) => env.id === envId);
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key) || envRank(a.envId) - envRank(b.envId));
}

function changeCell(row) {
  return row.kind === CHANGE_KIND.ADD
    ? `**Added** ${quotedCode(row.after)}`
    : `${quotedCode(row.before)} → ${quotedCode(row.after)}`;
}

function buildChangesTable(rows) {
  const lines = ['| Key | Environment | Apps | Change |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    const apps = orderedApps(row.appIds).map((app) => app.label).join(', ');
    lines.push(
      `| ${inlineCode(row.key)} | ${getEnvironment(row.envId).label} | ${apps} | ${escapeTableCell(changeCell(row))} |`,
    );
  }
  return lines.join('\n');
}

function buildFilesSection(resolved) {
  return groupByFile(resolved)
    .map((group) => {
      const added = group.changes.filter((change) => change.kind === CHANGE_KIND.ADD).length;
      const updated = group.changes.length - added;
      const counts = [added && `${added} added`, updated && `${updated} updated`].filter(Boolean).join(', ');
      return `- ${inlineCode(group.path)} — ${counts}`;
    })
    .join('\n');
}

function buildChecksSection({ issues, summary }) {
  const relevant = issues.filter(
    (issue) =>
      issue.severity !== SEVERITY.INFO &&
      summary.keys.includes(issue.key) &&
      summary.envIds.includes(issue.envId),
  );
  if (relevant.length === 0) {
    return '- ✅ No errors or warnings on the changed keys after this change.';
  }
  const lines = relevant.slice(0, MAX_LISTED_ISSUES).map((issue) => {
    const icon = issue.severity === SEVERITY.ERROR ? '❌' : '⚠️';
    return `- ${icon} ${inlineCode(issue.key)} (${getEnvironment(issue.envId).label}, ${getApp(issue.appId).label}) — ${issue.message}`;
  });
  if (relevant.length > MAX_LISTED_ISSUES) {
    lines.push(`- …and ${relevant.length - MAX_LISTED_ISSUES} more.`);
  }
  return lines.join('\n');
}

function buildImpactSection(summary) {
  if (summary.touchesProduction) {
    return [
      '## ⚠️ Production impact',
      'This PR changes **Prod** string files, which shipped builds read. ' +
        'Merging to `develop` publishes them to the production config buckets.',
    ].join('\n\n');
  }
  return [
    '## Impact',
    'Only **QA / Stage** files change; QA and Staging builds read them, shipped builds do not. ' +
      'Merging to `develop` still publishes them to the config bucket.',
  ].join('\n\n');
}

function buildTestPlan({ summary }) {
  const envLabels = orderedEnvs(summary.envIds).map((env) => env.label).join(' and ');
  const lines = [
    '- [ ] `JSON Validation` check passes',
    `- [ ] Changed strings look right on a ${envLabels} build of ${describeApps(summary.appIds)}`,
  ];
  if (summary.touchesProduction) {
    lines.push('- [ ] Copy approved by the content owner before merging to Prod');
  }
  return lines.join('\n');
}

function buildSummarySentence({ effective, summary }) {
  const added = distinctKeysOfKind(effective, CHANGE_KIND.ADD).size;
  const updated = distinctKeysOfKind(effective, CHANGE_KIND.UPDATE).size;
  const parts = [
    added > 0 && `adds ${plural(added, 'string')}`,
    updated > 0 && `updates ${plural(updated, 'string')}`,
  ].filter(Boolean);
  const apps = joinNatural(orderedApps(summary.appIds).map((app) => app.label));
  const envs = orderedEnvs(summary.envIds).map((env) => env.label).join(' and ');
  const sentence = `${parts.join(' and ')} for ${apps} (${envs})`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function buildJiraLine(jiraKey, jiraBaseUrl) {
  if (!jiraKey) return '';
  const base = String(jiraBaseUrl ?? '').trim();
  if (!base) return `Jira: ${jiraKey}`;
  return `Jira: [${jiraKey}](${base.endsWith('/') ? base : `${base}/`}${jiraKey})`;
}

function buildCommitMessage({ title, rows }) {
  const lines = rows.slice(0, MAX_COMMIT_LINES).map((row) => {
    const verb = row.kind === CHANGE_KIND.ADD ? 'add' : 'update';
    return `- ${verb} ${row.key} (${getEnvironment(row.envId).shortLabel}): ${orderedApps(row.appIds).map((app) => app.shortLabel).join(', ')}`;
  });
  if (rows.length > MAX_COMMIT_LINES) lines.push(`- …and ${rows.length - MAX_COMMIT_LINES} more`);
  return `${title}\n\n${lines.join('\n')}\n\nGenerated with Config Manager.`;
}

/**
 * Builds an editable starting point for the pull request from the pending changes. Pure: the
 * clock is passed in, so the same input always yields the same draft.
 */
export function buildPullRequestDraft({
  resolvedChanges,
  issues = [],
  jiraKey = '',
  jiraBaseUrl = '',
  now = new Date(),
}) {
  const effective = effectiveChanges(resolvedChanges);
  if (effective.length === 0) {
    return { title: '', body: '', branch: '', commitMessage: '' };
  }

  const summary = summarizeChanges(resolvedChanges);
  const normalizedJira = normalizeJiraKey(jiraKey);
  const verb = describeVerb(
    distinctKeysOfKind(effective, CHANGE_KIND.ADD).size,
    distinctKeysOfKind(effective, CHANGE_KIND.UPDATE).size,
  );
  const rows = aggregateRows(effective);
  const title = buildTitle({ summary, jiraKey: normalizedJira, verb });

  const body = [
    '## Summary',
    buildSummarySentence({ effective, summary }),
    buildJiraLine(normalizedJira, jiraBaseUrl),
    '## Changes',
    buildChangesTable(rows),
    '## Files changed',
    buildFilesSection(resolvedChanges),
    buildImpactSection(summary),
    '## Consistency checks',
    buildChecksSection({ issues, summary }),
    '## Test plan',
    buildTestPlan({ summary }),
    '---\n_Created with Config Manager._',
  ]
    .filter((section) => section !== '')
    .join('\n\n');

  return {
    title,
    body,
    branch: buildBranch({ summary, jiraKey: normalizedJira, verb, now }),
    commitMessage: buildCommitMessage({ title, rows }),
  };
}
