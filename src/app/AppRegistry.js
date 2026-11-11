/**
 * The three apps that share one codebase, and the two string catalogues each of them has.
 *
 * Layout in product-client-config (verified against `ConfigEndpoints` / `FoxNationBuildConfig`
 * in the Android build logic):
 *  - FOX One USA and FOX One Mexico share `lang/v2/` and differ by locale directory.
 *  - FOX Nation has its own tree under `foxnation/lang/v2/`.
 *  - `strings.json` is served to shipped builds, `strings_qa.json` to QA / Staging builds.
 */
export const ENVIRONMENTS = Object.freeze([
  Object.freeze({
    id: 'qa',
    label: 'QA / Stage',
    shortLabel: 'QA',
    defaultFileName: 'strings_qa.json',
    isProduction: false,
  }),
  Object.freeze({
    id: 'prod',
    label: 'Prod',
    shortLabel: 'Prod',
    defaultFileName: 'strings.json',
    isProduction: true,
  }),
]);

export const APPS = Object.freeze([
  Object.freeze({
    id: 'usa',
    label: 'FOX One USA',
    shortLabel: 'USA',
    locale: 'en-US',
    defaultDirectory: 'lang/v2/en-US',
    translationOf: null,
  }),
  Object.freeze({
    id: 'mexico',
    label: 'FOX One Mexico',
    shortLabel: 'Mexico',
    locale: 'es-MX',
    defaultDirectory: 'lang/v2/es-MX',
    translationOf: 'usa',
  }),
  Object.freeze({
    id: 'nation',
    label: 'FOX Nation',
    shortLabel: 'Nation',
    locale: 'en-US',
    defaultDirectory: 'foxnation/lang/v2/en-US',
    translationOf: null,
  }),
]);

/** QA first so that nothing reaches production unless the user switches there on purpose. */
export const DEFAULT_ENVIRONMENT_ID = 'qa';

export function getApp(appId) {
  return APPS.find((app) => app.id === appId) ?? null;
}

export function getEnvironment(envId) {
  return ENVIRONMENTS.find((env) => env.id === envId) ?? null;
}

export function makeFileKey(appId, envId) {
  return `${appId}:${envId}`;
}

export function parseFileKey(fileKey) {
  const [appId, envId] = String(fileKey).split(':');
  return { appId, envId };
}
