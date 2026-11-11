import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeCatalogs } from '../../src/analysis/analyzeCatalogs.js';
import { applyChanges, resolveChanges } from '../../src/changes/ChangeSet.js';
import { buildPullRequestDraft, normalizeJiraKey } from '../../src/pullrequest/PullRequestDraft.js';
import { inlineCode } from '../../src/pullrequest/markdown.js';
import { trio } from '../helpers/fixtures.js';

const NOW = new Date('2026-11-05T13:30:45.123Z');
const JIRA_URL = 'https://teamfox.atlassian.net/browse/';

const qa = trio('qa', {
  usa: { greeting: 'Hello', farewell: 'Bye' },
  mexico: { greeting: 'Hola', farewell: 'Adiós' },
  nation: { greeting: 'Hey', farewell: 'See ya' },
});
const prod = trio('prod', {
  usa: { greeting: 'Hello' },
  mexico: { greeting: 'Hola' },
  nation: { greeting: 'Hey' },
});
const base = new Map([...qa, ...prod]);

function draftFor(pending, options = {}) {
  const resolved = resolveChanges(pending, base);
  const issues = analyzeCatalogs({ catalogs: applyChanges(base, resolved) });
  return buildPullRequestDraft({ resolvedChanges: resolved, issues, now: NOW, jiraBaseUrl: JIRA_URL, ...options });
}

const addToAll = (key, values, envId = 'qa') =>
  ['usa', 'mexico', 'nation'].map((appId, index) => ({ fileKey: `${appId}:${envId}`, key, value: values[index] }));

describe('title', () => {
  it('names a single added key and says which apps and environment it is for', () => {
    const { title } = draftFor(addToAll('offer_title', ['Offer', 'Oferta', 'Deal']));

    assert.equal(title, 'Add string `offer_title` for all apps (QA)');
  });

  it('says "Update" when every change replaces an existing value', () => {
    const { title } = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }]);

    assert.equal(title, 'Update string `greeting` for FOX One USA (QA)');
  });

  it('says "Add/update" for a mix, and names two apps with "and"', () => {
    const { title } = draftFor([
      { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
      { fileKey: 'mexico:qa', key: 'brand_new', value: 'Nuevo' },
    ]);

    assert.equal(title, 'Add/update strings `brand_new`, `greeting` for FOX One USA and FOX One Mexico (QA)');
  });

  it('lists the environments in the title when both are changed', () => {
    const { title } = draftFor([
      { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
      { fileKey: 'usa:prod', key: 'greeting', value: 'Howdy' },
    ]);

    assert.match(title, /\(QA \+ Prod\)$/);
  });

  it('switches to a count once more than three strings are involved', () => {
    const { title } = draftFor(['a', 'b', 'c', 'd'].map((key) => ({ fileKey: 'usa:qa', key, value: 'x' })));

    assert.equal(title, 'Add 4 strings for FOX One USA (QA)');
  });

  it('prefixes a valid Jira key and ignores an invalid one', () => {
    const pending = [{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }];

    assert.match(draftFor(pending, { jiraKey: 'dtcand-1234' }).title, /^DTCAND-1234: Update string/);
    assert.doesNotMatch(draftFor(pending, { jiraKey: 'not a key' }).title, /: /);
  });
});

describe('branch and commit message', () => {
  it('builds a predictable branch name from the change and the clock', () => {
    const { branch } = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }]);

    assert.equal(branch, 'config-manager/update-greeting-20261105-1330');
  });

  it('includes the Jira key in the branch', () => {
    const { branch } = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }], { jiraKey: 'DTCAND-7' });

    assert.equal(branch, 'config-manager/DTCAND-7-update-greeting-20261105-1330');
  });

  it('keeps branch names valid however odd the key', () => {
    const { branch } = draftFor(['a'.repeat(80), 'b'].map((key) => ({ fileKey: 'usa:qa', key, value: 'x' })));

    assert.match(branch, /^config-manager\/[a-z0-9-]+-\d{8}-\d{4}$/);
    assert.ok(branch.length < 100);
  });

  it('starts the commit message with the title and lists what changed', () => {
    const { title, commitMessage } = draftFor(addToAll('offer_title', ['Same', 'Same', 'Same']));

    assert.ok(commitMessage.startsWith(`${title}\n\n`));
    assert.match(commitMessage, /- add offer_title \(QA\): USA, Mexico, Nation/);
  });

  it('lists apps separately in the commit message when each gets different text', () => {
    const { commitMessage } = draftFor(addToAll('offer_title', ['Offer', 'Oferta', 'Deal']));

    assert.match(commitMessage, /- add offer_title \(QA\): Mexico\n/);
    assert.match(commitMessage, /- add offer_title \(QA\): Nation\n/);
  });
});

describe('description', () => {
  const draft = draftFor([
    ...addToAll('offer_title', ['Offer', 'Oferta', 'Deal']),
    { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
  ]);

  it('summarises how many strings were added and updated across which apps', () => {
    assert.match(
      draft.body,
      /Adds 1 string and updates 1 string for FOX One USA, FOX One Mexico and FOX Nation \(QA \/ Stage\)\./,
    );
  });

  it('shows a before/after for updates and the new text for additions', () => {
    assert.match(draft.body, /`"Hello"` → `"Howdy"`/);
    assert.match(draft.body, /\*\*Added\*\* `"Oferta"`/);
  });

  it('merges apps with identical changes into a single row', () => {
    const merged = draftFor(addToAll('same_everywhere', ['Same', 'Same', 'Same']));

    const rows = merged.body.split('\n').filter((line) => line.startsWith('| `same_everywhere`'));
    assert.equal(rows.length, 1);
    assert.match(rows[0], /FOX One USA, FOX One Mexico, FOX Nation/);
  });

  it('lists every changed file with how many strings were added and updated', () => {
    assert.match(draft.body, /- `usa\/qa\/strings\.json` — 1 added, 1 updated/);
    assert.match(draft.body, /- `mexico\/qa\/strings\.json` — 1 added\n/);
  });

  it('flags production impact only when a Prod file changes', () => {
    const qaOnly = draft.body;
    const withProd = draftFor([{ fileKey: 'usa:prod', key: 'greeting', value: 'Howdy' }]).body;

    assert.doesNotMatch(qaOnly, /Production impact/);
    assert.match(qaOnly, /Only \*\*QA \/ Stage\*\* files change/);
    assert.match(withProd, /## ⚠️ Production impact/);
    assert.match(withProd, /Copy approved by the content owner/);
  });

  it('reports remaining warnings on the changed keys so reviewers see them', () => {
    const untranslated = draftFor([
      { fileKey: 'usa:qa', key: 'promo', value: 'Watch now' },
      { fileKey: 'mexico:qa', key: 'promo', value: 'Watch now' },
      { fileKey: 'nation:qa', key: 'promo', value: 'Watch now' },
    ]);

    assert.match(untranslated.body, /⚠️ `promo` \(QA \/ Stage, FOX One Mexico\) — Identical to FOX One USA/);
  });

  it('says so when there is nothing left to warn about', () => {
    assert.match(draft.body, /✅ No errors or warnings on the changed keys/);
  });

  it('links the Jira ticket when one is given', () => {
    const withJira = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }], { jiraKey: 'DTCAND-1234' });

    assert.match(withJira.body, /Jira: \[DTCAND-1234\]\(https:\/\/teamfox\.atlassian\.net\/browse\/DTCAND-1234\)/);
    assert.doesNotMatch(draft.body, /Jira:/);
  });

  it('keeps a value containing pipes and backticks from breaking the table', () => {
    const tricky = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'a | b `code`' }]);

    const row = tricky.body.split('\n').find((line) => line.startsWith('| `greeting`'));
    assert.match(row, /a \\\| b/);
    assert.equal(row.replace(/\\\|/g, '').split('|').length, 6, 'a row must still have exactly four cells');
  });
});

describe('empty drafts', () => {
  it('returns nothing to submit when no change would alter a file', () => {
    const draft = draftFor([{ fileKey: 'usa:qa', key: 'greeting', value: 'Hello' }]);

    assert.deepEqual(draft, { title: '', body: '', branch: '', commitMessage: '' });
  });
});

describe('normalizeJiraKey', () => {
  it('upper-cases and trims valid keys and rejects the rest', () => {
    assert.equal(normalizeJiraKey(' dtcand-12 '), 'DTCAND-12');
    assert.equal(normalizeJiraKey('DTCAND12'), '');
    assert.equal(normalizeJiraKey('12-DTCAND'), '');
    assert.equal(normalizeJiraKey(''), '');
  });
});

describe('inlineCode', () => {
  it('uses a longer fence when the text contains backticks', () => {
    assert.equal(inlineCode('a `b` c'), '``a `b` c``');
  });

  it('shows newlines literally and truncates long text', () => {
    assert.equal(inlineCode('a\nb'), '`a\\nb`');
    assert.equal(inlineCode('x'.repeat(10), 5), '`xxxx…`');
  });
});
