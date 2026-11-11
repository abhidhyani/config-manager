import { APPS, ENVIRONMENTS } from '../app/AppRegistry.js';
import { normalizePath } from '../app/filePaths.js';

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Accepts what people actually paste: `owner/repo`, a github.com URL (optionally a `/tree/<branch>/<path>`
 * link, which also yields the branch and path) or an SSH remote. Returns null when it is none of those.
 */
export function parseRepositoryInput(input) {
  const value = String(input ?? '').trim();
  if (!value) return null;

  const ssh = value.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  const url = value.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s#?]+)(?:\/([^\s#?]*))?)?\/?(?:[#?].*)?$/i,
  );
  if (url) {
    const parsed = { owner: url[1], repo: url[2] };
    if (url[3]) parsed.branch = decodeURIComponent(url[3]);
    if (url[4]) parsed.path = normalizePath(decodeURIComponent(url[4]));
    return parsed;
  }

  const short = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  return short ? { owner: short[1], repo: short[2] } : null;
}

export function splitRepository(repository) {
  const [owner = '', repo = ''] = String(repository).trim().split('/');
  return { owner, repo };
}

const hasTraversal = (path) => normalizePath(path).split('/').includes('..');

export function isValidBranchName(branch) {
  return (
    branch !== '' &&
    !/\s/.test(branch) &&
    !branch.includes('..') &&
    !branch.startsWith('-') &&
    !branch.startsWith('/') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.lock')
  );
}

/** Field-level problems keyed by field name (`directories.usa`, `fileNames.qa`, ...). */
export function validateSettings(settings) {
  const errors = {};

  if (!REPOSITORY.test(String(settings.repository ?? '').trim())) {
    errors.repository = 'Use owner/repository, e.g. foxcorp-product/product-client-config.';
  }
  if (!isValidBranchName(String(settings.branch ?? '').trim())) {
    errors.branch = 'Enter a valid branch name, e.g. develop.';
  }
  if (hasTraversal(settings.basePath)) {
    errors.basePath = 'The base path cannot contain "..".';
  }
  for (const app of APPS) {
    const directory = settings.directories?.[app.id] ?? '';
    if (normalizePath(directory) === '') {
      errors[`directories.${app.id}`] = `Enter the folder holding ${app.label} strings.`;
    } else if (hasTraversal(directory)) {
      errors[`directories.${app.id}`] = 'The folder cannot contain "..".';
    }
  }
  for (const env of ENVIRONMENTS) {
    const fileName = String(settings.fileNames?.[env.id] ?? '').trim();
    if (!fileName.endsWith('.json') || fileName.includes('/')) {
      errors[`fileNames.${env.id}`] = 'Enter a file name ending in .json, without folders.';
    }
  }
  const jira = String(settings.jiraBaseUrl ?? '').trim();
  if (jira !== '' && !/^https?:\/\/\S+$/.test(jira)) {
    errors.jiraBaseUrl = 'Enter a full URL such as https://example.atlassian.net/browse/.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Trims and normalises every field so what is stored and what is requested are identical. */
export function normalizeSettings(settings) {
  return {
    repository: String(settings.repository ?? '').trim(),
    branch: String(settings.branch ?? '').trim(),
    basePath: normalizePath(settings.basePath),
    directories: Object.fromEntries(
      APPS.map((app) => [app.id, normalizePath(settings.directories?.[app.id])]),
    ),
    fileNames: Object.fromEntries(
      ENVIRONMENTS.map((env) => [env.id, String(settings.fileNames?.[env.id] ?? '').trim()]),
    ),
    jiraBaseUrl: String(settings.jiraBaseUrl ?? '').trim(),
  };
}
