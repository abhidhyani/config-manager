import { StringCatalog } from './StringCatalog.js';

/**
 * Reads every target file at one fixed commit so all six catalogues are a consistent snapshot.
 *
 * A file that is missing or malformed does not fail the whole load: it is reported as a
 * failure so the dashboard can still compare the catalogues that did load.
 */
export async function loadCatalogs({ reader, targets, ref }) {
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const file = await reader.readTextFile(target.path, ref);
        const catalog = StringCatalog.fromText(
          {
            fileKey: target.fileKey,
            appId: target.appId,
            envId: target.envId,
            path: target.path,
            sha: file.sha,
            htmlUrl: file.htmlUrl,
          },
          file.text,
        );
        return { target, catalog };
      } catch (error) {
        return { target, message: error?.message ?? String(error) };
      }
    }),
  );

  const catalogs = new Map();
  const failures = [];
  for (const result of results) {
    if (result.catalog) {
      catalogs.set(result.target.fileKey, result.catalog);
    } else {
      failures.push({ target: result.target, message: result.message });
    }
  }
  return { catalogs, failures };
}
