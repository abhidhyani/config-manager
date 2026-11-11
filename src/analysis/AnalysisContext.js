import { makeFileKey } from '../app/AppRegistry.js';

/**
 * Read-only view over the loaded catalogues that every rule shares.
 *
 * "Reference app" is the first app, in registry order, that holds a string value for a key. Rules
 * that compare apps measure the others against it so a disagreement is reported once, on the app
 * that deviates, rather than on every pair.
 */
export function createAnalysisContext({ catalogs, failures = [], apps, environments }) {
  const catalog = (appId, envId) => catalogs.get(makeFileKey(appId, envId)) ?? null;
  const appsWithCatalog = (envId) => apps.filter((app) => catalog(app.id, envId));
  const holders = (envId, key) =>
    appsWithCatalog(envId).filter((app) => catalog(app.id, envId).has(key));

  return {
    apps,
    environments,
    failures,
    catalog,
    appsWithCatalog,
    holders,
    getApp: (appId) => apps.find((app) => app.id === appId),
    keyUnion(envId) {
      const keys = new Set();
      for (const app of appsWithCatalog(envId)) {
        for (const key of catalog(app.id, envId).entries.keys()) keys.add(key);
      }
      return keys;
    },
    reference(envId, key) {
      return (
        holders(envId, key).find((app) => typeof catalog(app.id, envId).get(key) === 'string') ?? null
      );
    },
    /** Calls `visit` for every string value of every loaded catalogue. */
    forEachString(visit) {
      for (const env of environments) {
        for (const app of appsWithCatalog(env.id)) {
          const source = catalog(app.id, env.id);
          for (const [key, value] of source.entries) {
            if (typeof value === 'string') visit({ env, app, catalog: source, key, value });
          }
        }
      }
    },
  };
}
