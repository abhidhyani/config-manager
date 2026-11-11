import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateAcrossApps, validateKey, validateValue } from '../../src/changes/ChangeValidator.js';

describe('validateKey', () => {
  it('requires a key', () => {
    assert.deepEqual(validateKey('').errors, ['Enter a key.']);
  });

  it('rejects names that cannot be Android resource names', () => {
    for (const key of ['has space', 'with-dash', '1starts_with_digit', 'dot.ted', 'ünïcode']) {
      assert.equal(validateKey(key).errors.length, 1, key);
    }
  });

  it('accepts snake_case without warnings', () => {
    assert.deepEqual(validateKey('subscription_offer_title'), { errors: [], warnings: [] });
  });

  it('warns, without blocking, about a key that is not snake_case', () => {
    const result = validateKey('subscriptionOffer');

    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, 1);
  });

  it('warns when a key is nearly identical to an existing one', () => {
    const result = validateKey('subscription_titel', { existingKeys: ['subscription_title', 'unrelated_key'] });

    assert.match(result.warnings[0], /`subscription_title`/);
    assert.doesNotMatch(result.warnings[0], /unrelated_key/);
  });
});

describe('validateValue', () => {
  it('blocks an empty value and a whitespace-only value', () => {
    assert.deepEqual(validateValue('').errors, ['Value is empty.']);
    assert.deepEqual(validateValue('   ').errors, ['Value contains only whitespace.']);
  });

  it('accepts ordinary text', () => {
    assert.deepEqual(validateValue('Watch live on FOX One'), { errors: [], warnings: [] });
  });

  it('warns about edge whitespace, leftover escapes and unclosed HTML', () => {
    assert.equal(validateValue('Hello ').warnings.length, 1);
    assert.equal(validateValue('Don\\\'t').warnings.length, 1);
    assert.match(validateValue('<b>bold').warnings[0], /never closed/);
  });

  it('allows an HTML entity inside markup', () => {
    assert.deepEqual(validateValue('<b>Tom &amp; Jerry</b>').warnings, []);
  });
});

describe('validateAcrossApps', () => {
  it('warns when apps would receive different format arguments', () => {
    const warnings = validateAcrossApps({ 'FOX One USA': 'Hi %s', 'FOX One Mexico': 'Hola' });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /FOX One Mexico has none, FOX One USA has %s/);
  });

  it('is quiet when arguments and tags agree', () => {
    assert.deepEqual(
      validateAcrossApps({ 'FOX One USA': '<b>%1$s</b>', 'FOX One Mexico': '<b>%1$s</b>' }),
      [],
    );
  });

  it('has nothing to compare for a single app or blank values', () => {
    assert.deepEqual(validateAcrossApps({ 'FOX One USA': 'Hi %s' }), []);
    assert.deepEqual(validateAcrossApps({ 'FOX One USA': 'Hi %s', 'FOX One Mexico': '  ' }), []);
  });
});
