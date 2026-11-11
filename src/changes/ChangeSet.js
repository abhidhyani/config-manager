import { getApp, getEnvironment, parseFileKey } from '../app/AppRegistry.js';

export const CHANGE_KIND = Object.freeze({
  ADD: 'add',
  UPDATE: 'update',
  UNCHANGED: 'unchanged',
  FILE_MISSING: 'file-missing',
});

const isEffective = (change) => change.kind === CHANGE_KIND.ADD || change.kind === CHANGE_KIND.UPDATE;

/** Pending intents resolved against the loaded catalogues: what each one would actually do. */
export function resolveChanges(pendingList, baseCatalogs) {
  return pendingList.map(({ fileKey, key, value }) => {
    const { appId, envId } = parseFileKey(fileKey);
    const catalog = baseCatalogs.get(fileKey);
    const before = catalog?.get(key);
    let kind = CHANGE_KIND.UPDATE;
    if (!catalog) kind = CHANGE_KIND.FILE_MISSING;
    else if (before === undefined) kind = CHANGE_KIND.ADD;
    else if (before === value) kind = CHANGE_KIND.UNCHANGED;
    return {
      fileKey,
      appId,
      envId,
      key,
      kind,
      before: before === undefined ? null : before,
      after: value,
      path: catalog?.path ?? '',
    };
  });
}

export function effectiveChanges(resolved) {
  return resolved.filter(isEffective);
}

/** The catalogues as they would look once every effective pending change is written. */
export function applyChanges(baseCatalogs, resolved) {
  const result = new Map(baseCatalogs);
  const byFile = new Map();
  for (const change of effectiveChanges(resolved)) {
    byFile.set(change.fileKey, [...(byFile.get(change.fileKey) ?? []), [change.key, change.after]]);
  }
  for (const [fileKey, entries] of byFile) {
    result.set(fileKey, baseCatalogs.get(fileKey).withValues(entries));
  }
  return result;
}

/** Effective changes grouped per file, in a stable order, ready to hand to the publisher. */
export function groupByFile(resolved) {
  const groups = new Map();
  for (const change of effectiveChanges(resolved)) {
    const group = groups.get(change.fileKey) ?? {
      fileKey: change.fileKey,
      appId: change.appId,
      envId: change.envId,
      path: change.path,
      changes: [],
    };
    group.changes.push(change);
    groups.set(change.fileKey, group);
  }
  return [...groups.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function summarizeChanges(resolved) {
  const effective = effectiveChanges(resolved);
  const keys = new Set(effective.map((change) => change.key));
  const appIds = new Set(effective.map((change) => change.appId));
  const envIds = new Set(effective.map((change) => change.envId));
  return {
    adds: effective.filter((change) => change.kind === CHANGE_KIND.ADD).length,
    updates: effective.filter((change) => change.kind === CHANGE_KIND.UPDATE).length,
    unchanged: resolved.filter((change) => change.kind === CHANGE_KIND.UNCHANGED).length,
    missingFiles: resolved.filter((change) => change.kind === CHANGE_KIND.FILE_MISSING).length,
    keys: [...keys].sort(),
    appIds: [...appIds],
    envIds: [...envIds],
    touchesProduction: [...envIds].some((envId) => getEnvironment(envId)?.isProduction),
    appLabels: [...appIds].map((appId) => getApp(appId)?.label ?? appId),
  };
}
