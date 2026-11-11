import { APPS, ENVIRONMENTS } from '../app/AppRegistry.js';

export const DEFAULT_REPOSITORY = 'foxcorp-product/product-client-config';
export const DEFAULT_BRANCH = 'develop';
export const DEFAULT_BASE_PATH = 'foxplus/android';
export const DEFAULT_JIRA_BASE_URL = 'https://teamfox.atlassian.net/browse/';

/** A fresh, independent copy of the settings a first-time visitor starts with. */
export function createDefaultSettings() {
  return {
    repository: DEFAULT_REPOSITORY,
    branch: DEFAULT_BRANCH,
    basePath: DEFAULT_BASE_PATH,
    directories: Object.fromEntries(APPS.map((app) => [app.id, app.defaultDirectory])),
    fileNames: Object.fromEntries(ENVIRONMENTS.map((env) => [env.id, env.defaultFileName])),
    jiraBaseUrl: DEFAULT_JIRA_BASE_URL,
  };
}
