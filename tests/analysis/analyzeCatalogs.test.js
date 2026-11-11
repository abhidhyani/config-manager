import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeCatalogs } from '../../src/analysis/analyzeCatalogs.js';
import { SEVERITY } from '../../src/analysis/IssueTypes.js';
import { catalog, catalogMap, ofType, trio } from '../helpers/fixtures.js';

const analyze = (catalogs, failures = []) => analyzeCatalogs({ catalogs, failures });
const only = (issues) => {
  assert.equal(issues.length, 1, `expected exactly one issue, got ${JSON.stringify(issues.map((i) => i.id))}`);
  return issues[0];
};

describe('missing strings', () => {
  it('flags the app that lacks a key the other apps have, naming who has it', () => {
    const issues = analyze(
      trio('qa', {
        usa: { a: 'A', b: 'B' },
        mexico: { a: 'A', b: 'B' },
        nation: { a: 'A' },
      }),
    );

    const issue = only(ofType(issues, 'missing-key'));
    assert.equal(issue.appId, 'nation');
    assert.equal(issue.key, 'b');
    assert.equal(issue.severity, SEVERITY.ERROR);
    assert.match(issue.message, /FOX One USA, FOX One Mexico/);
  });

  it('reports each environment on its own', () => {
    const catalogs = new Map([
      ...trio('qa', { usa: { a: 'A' }, mexico: { a: 'A' }, nation: { a: 'A' } }),
      ...trio('prod', { usa: { a: 'A', b: 'B' }, mexico: { a: 'A', b: 'B' }, nation: { a: 'A', b: 'B' } }),
    ]);

    assert.equal(ofType(analyze(catalogs), 'missing-key').length, 0);
  });

  it('does not call a string missing from an app whose file could not be loaded', () => {
    const issues = analyze(trio('qa', { usa: { a: 'A', b: 'B' }, mexico: { a: 'A', b: 'B' } }));

    assert.equal(ofType(issues, 'missing-key').length, 0);
  });
});

describe('empty and invalid values', () => {
  it('flags an empty string and a whitespace-only string as errors', () => {
    const issues = analyze(
      trio('qa', {
        usa: { empty: '', blank: '   ', fine: 'x' },
        mexico: { empty: 'x', blank: 'x', fine: 'x' },
        nation: { empty: 'x', blank: 'x', fine: 'x' },
      }),
    );

    assert.equal(only(ofType(issues, 'empty-value')).key, 'empty');
    assert.equal(only(ofType(issues, 'blank-value')).key, 'blank');
    assert.ok([...ofType(issues, 'empty-value'), ...ofType(issues, 'blank-value')].every((i) => i.severity === SEVERITY.ERROR));
  });

  it('flags values that are not strings', () => {
    const catalogs = catalogMap(catalog('usa', 'qa', { count: 5, nothing: null, list: ['x'] }));

    const keys = ofType(analyze(catalogs), 'invalid-type').map((issue) => issue.key);

    assert.deepEqual(keys.sort(), ['count', 'list', 'nothing']);
  });

  it('flags invisible characters such as a non-breaking space', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Terms\u00a0apply' }, mexico: { a: 'Terms\u00a0apply' }, nation: { a: 'Terms\u00a0apply' } }));

    const found = ofType(issues, 'invisible-characters');
    assert.equal(found.length, 3);
    assert.match(found[0].message, /U\+00A0/);
  });

  it('flags unfinished copy but not words that merely resemble it', () => {
    const issues = analyze(
      trio('qa', {
        usa: { draft: 'TODO: write this', abbreviation: 'TBD', sentence: 'We have a lot to do.' },
        mexico: { draft: 'x', abbreviation: 'TBD', sentence: 'y' },
        nation: { draft: 'x', abbreviation: 'TBD', sentence: 'y' },
      }),
    );

    assert.equal(only(ofType(issues, 'placeholder-text')).key, 'draft');
  });

  it('flags an Android escape left in a plain value but allows an entity inside HTML', () => {
    const issues = analyze(
      trio('qa', {
        usa: { plain: 'Don\\\'t miss it', html: '<b>Tom &amp; Jerry</b>', amp: 'Tom &amp; Jerry' },
        mexico: { plain: 'x', html: '<b>x</b>', amp: 'x' },
        nation: { plain: 'x', html: '<b>x</b>', amp: 'x' },
      }),
    );

    assert.deepEqual(
      ofType(issues, 'escape-leftover').map((issue) => issue.key).sort(),
      ['amp', 'plain'],
    );
  });
});

describe('leading and trailing whitespace', () => {
  it('is only informational when every app agrees, since fragments are concatenated', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Hello ' }, mexico: { a: 'Hello ' }, nation: { a: 'Hello ' } }));

    assert.equal(ofType(issues, 'edge-whitespace-mismatch').length, 0);
    assert.ok(ofType(issues, 'edge-whitespace').every((issue) => issue.severity === SEVERITY.INFO));
  });

  it('warns on the app whose whitespace differs from the reference app', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Hello ' }, mexico: { a: 'Hello' }, nation: { a: 'Hello ' } }));

    const issue = only(ofType(issues, 'edge-whitespace-mismatch'));
    assert.equal(issue.appId, 'mexico');
    assert.equal(issue.severity, SEVERITY.WARNING);
  });
});

describe('placeholders and markup', () => {
  it('is an error when a translation drops a format argument its source has', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Hi %s' }, mexico: { a: 'Hola' }, nation: { a: 'Hi %s' } }));

    const issue = only(ofType(issues, 'placeholder-mismatch'));
    assert.equal(issue.appId, 'mexico');
    assert.equal(issue.severity, SEVERITY.ERROR);
  });

  it('is only a warning between independent copy decks that are not translations of each other', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Hi %s' }, mexico: { a: 'Hi %s' }, nation: { a: 'Hi' } }));

    const issue = only(ofType(issues, 'placeholder-mismatch'));
    assert.equal(issue.appId, 'nation');
    assert.equal(issue.severity, SEVERITY.WARNING);
  });

  it('treats reordered positional arguments as the same set of placeholders', () => {
    const issues = analyze(
      trio('qa', {
        usa: { a: '%1$s of %2$d' },
        mexico: { a: '%2$d de %1$s' },
        nation: { a: '%1$s of %2$d' },
      }),
    );

    assert.equal(ofType(issues, 'placeholder-mismatch').length, 0);
  });

  it('understands brace-style placeholders', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Watch {title}' }, mexico: { a: 'Ver {titulo}' }, nation: { a: 'Watch {title}' } }));

    assert.equal(only(ofType(issues, 'placeholder-mismatch')).appId, 'mexico');
  });

  it('warns about mixing positional and plain arguments and about unbalanced braces', () => {
    const issues = analyze(
      trio('qa', {
        usa: { mixed: '%1$s and %s', braces: 'Hi {name' },
        mexico: { mixed: '%1$s and %s', braces: 'Hi {name' },
        nation: { mixed: '%1$s and %s', braces: 'Hi {name' },
      }),
    );

    assert.deepEqual(
      [...new Set(ofType(issues, 'malformed-placeholder').map((issue) => issue.key))].sort(),
      ['braces', 'mixed'],
    );
  });

  it('warns when an app drops HTML tags that the reference app has', () => {
    const issues = analyze(
      trio('qa', {
        usa: { a: '<b>Bold</b>' },
        mexico: { a: 'Negrita' },
        nation: { a: '<b>Bold</b>' },
      }),
    );

    assert.equal(only(ofType(issues, 'markup-mismatch')).appId, 'mexico');
  });

  it('warns about a tag that is never closed, and about one closed without being opened', () => {
    const issues = analyze(
      trio('qa', {
        usa: { open: '<i>never closed', stray: 'oops</b>' },
        mexico: { open: '<i>nunca cerrado', stray: 'vaya</b>' },
        nation: { open: '<i>never closed', stray: 'oops</b>' },
      }),
    );

    const invalid = ofType(issues, 'invalid-markup');
    assert.deepEqual([...new Set(invalid.map((issue) => issue.key))].sort(), ['open', 'stray']);
    assert.equal(invalid.length, 6);
    assert.equal(ofType(issues, 'markup-mismatch').length, 0);
  });
});

describe('untranslated Mexico strings', () => {
  it('flags a Mexico value identical to the USA value', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Watch now' }, mexico: { a: 'Watch now' }, nation: { a: 'Watch now' } }));

    const issue = only(ofType(issues, 'untranslated'));
    assert.equal(issue.appId, 'mexico');
    assert.equal(issue.severity, SEVERITY.WARNING);
  });

  it('does not flag a translated value', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Watch now' }, mexico: { a: 'Ver ahora' }, nation: { a: 'Watch now' } }));

    assert.equal(ofType(issues, 'untranslated').length, 0);
  });

  it('does not flag values with too little text to translate, such as "OK" or a bare placeholder', () => {
    const issues = analyze(
      trio('qa', {
        usa: { ok: 'OK', arg: '%1$s', num: '24/7' },
        mexico: { ok: 'OK', arg: '%1$s', num: '24/7' },
        nation: { ok: 'OK', arg: '%1$s', num: '24/7' },
      }),
    );

    assert.equal(ofType(issues, 'untranslated').length, 0);
  });

  it('never compares FOX Nation to USA, because both are en-US', () => {
    const issues = analyze(trio('qa', { usa: { a: 'Watch now' }, mexico: { a: 'Ver ahora' }, nation: { a: 'Watch now' } }));

    assert.equal(ofType(issues, 'untranslated').filter((issue) => issue.appId === 'nation').length, 0);
  });
});

describe('key problems', () => {
  it('marks the cells holding each spelling when one app spells a key differently', () => {
    const issues = analyze(
      trio('qa', {
        usa: { reAir_badge: 'Re-air' },
        mexico: { reAir_badge: 'Re-air' },
        nation: { re_air_badge: 'Re-air' },
      }),
    );

    const mismatches = ofType(issues, 'key-mismatch');
    assert.deepEqual(
      mismatches.map((issue) => `${issue.appId}:${issue.key}`).sort(),
      ['mexico:reAir_badge', 'nation:re_air_badge', 'usa:reAir_badge'],
    );
    const nation = mismatches.find((issue) => issue.appId === 'nation');
    assert.match(nation.message, /FOX One USA, FOX One Mexico use `reAir_badge`/);
    assert.equal(nation.related, 'reAir_badge');
  });

  it('leaves the empty cells to the missing-string rule instead of reporting them twice', () => {
    const issues = analyze(
      trio('qa', {
        usa: { reAir_badge: 'Re-air' },
        mexico: { reAir_badge: 'Re-air' },
        nation: { re_air_badge: 'Re-air' },
      }),
    );

    const cellsWithMissing = ofType(issues, 'missing-key').map((issue) => `${issue.appId}:${issue.key}`);
    assert.deepEqual(cellsWithMissing.sort(), ['mexico:re_air_badge', 'nation:reAir_badge', 'usa:re_air_badge']);
  });

  it('catches a typo between apps but not two unrelated keys', () => {
    const typo = analyze(
      trio('qa', {
        usa: { subscription_title: 'A' },
        mexico: { subscription_title: 'A' },
        nation: { subscription_titel: 'A' },
      }),
    );
    const unrelated = analyze(
      trio('qa', {
        usa: { subscription_title: 'A' },
        mexico: { subscription_title: 'A' },
        nation: { player_controls_label: 'A' },
      }),
    );

    assert.equal(ofType(typo, 'key-mismatch').length, 3);
    assert.equal(ofType(unrelated, 'key-mismatch').length, 0);
  });

  it('does not call two keys a mismatch when one app holds both of them', () => {
    const issues = analyze(
      trio('qa', {
        usa: { sign_in: 'A', signIn: 'A' },
        mexico: { sign_in: 'A' },
        nation: { signIn: 'A' },
      }),
    );

    assert.equal(ofType(issues, 'key-mismatch').length, 0);
  });

  it('flags two keys in one file that differ only by case or separators', () => {
    const issues = analyze(catalogMap(catalog('usa', 'qa', { sign_in: 'A', signIn: 'A' })));

    assert.deepEqual(ofType(issues, 'key-near-duplicate').map((issue) => issue.key).sort(), ['signIn', 'sign_in']);
  });

  it('notes keys that are not snake_case without making them an error', () => {
    const issues = analyze(catalogMap(catalog('usa', 'qa', { good_key: 'A', badKey: 'A' })));

    const issue = only(ofType(issues, 'key-naming'));
    assert.equal(issue.key, 'badKey');
    assert.equal(issue.severity, SEVERITY.INFO);
  });
});

describe('QA versus Prod drift', () => {
  const catalogs = new Map([
    ...catalogMap(catalog('usa', 'qa', { shared: 'qa text', staged: 'new' })),
    ...catalogMap(catalog('usa', 'prod', { shared: 'prod text', legacy: 'old' })),
  ]);
  const issues = analyze(catalogs);

  it('treats a key only in QA as staged copy, not a problem', () => {
    const issue = only(ofType(issues, 'qa-only'));
    assert.equal(issue.key, 'staged');
    assert.equal(issue.severity, SEVERITY.INFO);
  });

  it('warns about a key in Prod that QA builds do not have', () => {
    const issue = only(ofType(issues, 'prod-only'));
    assert.equal(issue.key, 'legacy');
    assert.equal(issue.envId, 'prod');
    assert.equal(issue.severity, SEVERITY.WARNING);
  });

  it('notes a value that differs between environments, visible from either one', () => {
    assert.deepEqual(ofType(issues, 'env-value-differs').map((issue) => issue.envId).sort(), ['prod', 'qa']);
  });
});

describe('file-level problems', () => {
  it('reports a file that failed to load', () => {
    const issues = analyze(new Map(), [
      { target: { appId: 'mexico', envId: 'qa', path: 'x/strings_qa.json' }, message: 'Not found.' },
    ]);

    const issue = only(ofType(issues, 'file-unavailable'));
    assert.equal(issue.appId, 'mexico');
    assert.match(issue.message, /x\/strings_qa\.json: Not found\./);
  });

  it('blocks editing a file whose formatting could not be reproduced', () => {
    const unsafe = catalog('usa', 'qa', { a: 'A' }, { roundTripSafe: false });

    assert.equal(only(ofType(analyze(catalogMap(unsafe)), 'unsafe-formatting')).severity, SEVERITY.ERROR);
  });

  it('surfaces duplicate keys found in the raw file', () => {
    const duplicated = catalog('usa', 'qa', { a: 'A' }, { duplicateKeys: ['a'] });

    assert.equal(only(ofType(analyze(catalogMap(duplicated)), 'duplicate-key')).key, 'a');
  });
});

describe('ordering', () => {
  it('lists errors before warnings before notes', () => {
    const issues = analyze(
      trio('qa', {
        usa: { a: 'Watch now', b: '' },
        mexico: { a: 'Watch now', b: 'x' },
        nation: { a: 'Watch now', b: 'x', badKey: 'x' },
      }),
    );

    const ranks = issues.map((issue) => ({ error: 3, warning: 2, info: 1 })[issue.severity]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  });
});
