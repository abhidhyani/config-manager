import { makeFileKey } from '../../src/app/AppRegistry.js';
import { StringCatalog } from '../../src/strings/StringCatalog.js';

/** An in-memory catalogue for `appId` / `envId` holding the given key/value object. */
export function catalog(appId, envId, entries, extra = {}) {
  return new StringCatalog({
    fileKey: makeFileKey(appId, envId),
    appId,
    envId,
    path: `${appId}/${envId}/strings.json`,
    entries: new Map(Object.entries(entries)),
    ...extra,
  });
}

export function catalogMap(...catalogs) {
  return new Map(catalogs.map((item) => [item.fileKey, item]));
}

/** All three apps in one environment; omitted apps are simply not loaded. */
export function trio(envId, { usa, mexico, nation }) {
  return catalogMap(
    ...[
      usa && catalog('usa', envId, usa),
      mexico && catalog('mexico', envId, mexico),
      nation && catalog('nation', envId, nation),
    ].filter(Boolean),
  );
}

export const ofType = (issues, type) => issues.filter((issue) => issue.type === type);
