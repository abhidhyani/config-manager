import { APPS, ENVIRONMENTS, makeFileKey } from './AppRegistry.js';

export function normalizePath(path) {
  return String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

export function joinPath(...segments) {
  return normalizePath(segments.map(normalizePath).filter(Boolean).join('/'));
}

export function resolveFilePath(settings, appId, envId) {
  return joinPath(settings.basePath, settings.directories[appId], settings.fileNames[envId]);
}

/** Every (app, environment) file the dashboard reads, in a stable order. */
export function listFileTargets(settings) {
  return APPS.flatMap((app) =>
    ENVIRONMENTS.map((env) => ({
      fileKey: makeFileKey(app.id, env.id),
      appId: app.id,
      envId: env.id,
      path: resolveFilePath(settings, app.id, env.id),
    })),
  );
}
