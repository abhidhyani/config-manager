import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMarkupProblems, markupSignature } from '../../src/analysis/text/markup.js';
import {
  extractPlaceholders,
  hasUnbalancedBraces,
  mixesPlaceholderStyles,
  placeholderSignature,
  visibleLetters,
} from '../../src/analysis/text/placeholders.js';
import { areKeysSimilar, editDistance, isSnakeCase, normalizeKey } from '../../src/analysis/text/keys.js';

describe('placeholders', () => {
  it('finds printf-style and brace-style arguments', () => {
    assert.deepEqual(extractPlaceholders('%s, %1$d, %.1f, {title}, {{ user }}, ${count}'), [
      '%s',
      '%1$d',
      '%.1f',
      '{title}',
      '{{user}}',
      '${count}',
    ]);
  });

  it('does not mistake a percentage for an argument', () => {
    assert.deepEqual(extractPlaceholders('Save 50% today, 100% free'), []);
  });

  it('gives equal signatures regardless of argument order', () => {
    assert.equal(placeholderSignature('%1$s then %2$s'), placeholderSignature('%2$s then %1$s'));
    assert.notEqual(placeholderSignature('%s'), placeholderSignature('%s %s'));
  });

  it('detects mixed positional and plain arguments reliably across repeated calls', () => {
    // Guards against shared global regex state: the second call used to depend on the first.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(mixesPlaceholderStyles('%1$s and %s'), true);
      assert.equal(mixesPlaceholderStyles('%1$s and %2$s'), false);
      assert.equal(mixesPlaceholderStyles('%s and %s'), false);
    }
  });

  it('detects unbalanced braces', () => {
    assert.equal(hasUnbalancedBraces('Hi {name'), true);
    assert.equal(hasUnbalancedBraces('Hi {name}'), false);
  });

  it('ignores placeholders, tags and entities when counting translatable letters', () => {
    assert.equal(visibleLetters('<b>%1$s</b> &amp; 24/7'), '');
    assert.equal(visibleLetters('Ver {title} ahora'), 'Verahora');
  });
});

describe('markup', () => {
  it('has the same signature for the same tags regardless of attributes and order', () => {
    assert.equal(
      markupSignature('<a href="x">Link</a> and <b>bold</b>'),
      markupSignature('<b class="y">negrita</b> y <a href="z">enlace</a>'),
    );
  });

  it('reports unclosed and stray tags but accepts void tags', () => {
    assert.deepEqual(findMarkupProblems('line<br>break <b>bold</b>'), []);
    assert.deepEqual(findMarkupProblems('<b>open'), ['<b> is never closed']);
    assert.deepEqual(findMarkupProblems('close</i>'), ['Unexpected </i>']);
    assert.deepEqual(findMarkupProblems('<b><i>bad</b></i>').length > 0, true);
  });
});

describe('keys', () => {
  it('recognises snake_case', () => {
    assert.equal(isSnakeCase('watch_now_2'), true);
    assert.equal(isSnakeCase('watchNow'), false);
    assert.equal(isSnakeCase('Watch_now'), false);
  });

  it('normalises away case and separators', () => {
    assert.equal(normalizeKey('reAir_badge'), normalizeKey('re_air_badge'));
  });

  it('stops measuring once the distance exceeds the limit', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('kitten', 'sitting', 1), 2);
  });

  it('treats near spellings of a long key as the same key but not short or unrelated keys', () => {
    assert.equal(areKeysSimilar('subscription_title', 'subscription_titel'), true);
    assert.equal(areKeysSimilar('sign_in', 'signIn'), true);
    assert.equal(areKeysSimilar('play', 'plan'), false);
    assert.equal(areKeysSimilar('player_label', 'profile_label'), false);
    assert.equal(areKeysSimilar('same_key', 'same_key'), false);
  });
});
