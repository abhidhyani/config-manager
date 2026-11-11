import { parseCatalogText } from './catalogParser.js';

const INDENT = '  ';

/**
 * One `strings.json` / `strings_qa.json` document: an ordered map of key to string value.
 *
 * The serializer reproduces the repository's formatting exactly (two-space indent, source key
 * order, new keys appended, trailing newline preserved). `roundTripSafe` records whether that
 * holds for the text this catalogue was parsed from; when it does not, writing the file back
 * would bury the real change in unrelated formatting churn, so callers must refuse to write.
 */
export class StringCatalog {
  constructor({
    fileKey,
    appId,
    envId,
    path,
    sha = '',
    htmlUrl = '',
    entries,
    duplicateKeys = [],
    endsWithNewline = true,
    roundTripSafe = true,
  }) {
    this.fileKey = fileKey;
    this.appId = appId;
    this.envId = envId;
    this.path = path;
    this.sha = sha;
    this.htmlUrl = htmlUrl;
    this.entries = entries;
    this.duplicateKeys = duplicateKeys;
    this.endsWithNewline = endsWithNewline;
    this.roundTripSafe = roundTripSafe;
  }

  /** Parses `text`; throws `CatalogParseError` when it is not a JSON object. */
  static fromText(meta, text) {
    const { entries, duplicateKeys } = parseCatalogText(text);
    const catalog = new StringCatalog({
      ...meta,
      entries,
      duplicateKeys,
      endsWithNewline: text.endsWith('\n'),
    });
    catalog.roundTripSafe = catalog.serialize() === text;
    return catalog;
  }

  get size() {
    return this.entries.size;
  }

  has(key) {
    return this.entries.has(key);
  }

  get(key) {
    return this.entries.get(key);
  }

  keys() {
    return [...this.entries.keys()];
  }

  /** A copy with `changes` applied: existing keys keep their position, new keys are appended. */
  withValues(changes) {
    const entries = new Map(this.entries);
    for (const [key, value] of changes instanceof Map ? changes : new Map(changes)) {
      entries.set(key, value);
    }
    return new StringCatalog({ ...this, entries });
  }

  serialize() {
    const newline = this.endsWithNewline ? '\n' : '';
    if (this.entries.size === 0) return `{}${newline}`;
    const lines = [...this.entries].map(
      ([key, value]) => `${INDENT}${JSON.stringify(key)}: ${JSON.stringify(value)}`,
    );
    return `{\n${lines.join(',\n')}\n}${newline}`;
  }
}
