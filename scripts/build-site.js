import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Everything the published site needs. Tests, scripts, docs and package files stay behind. */
export const SITE_ENTRIES = Object.freeze(['index.html', '.nojekyll', 'assets', 'src', 'styles']);

const EXTERNAL_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Local files referenced from the HTML via `href` / `src`, relative to the HTML file. */
function htmlReferences(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map(([, reference]) => reference.split(/[?#]/)[0])
    .filter((reference) => reference !== '' && !EXTERNAL_REFERENCE.test(reference));
}

/** Relative `from './x.js'`, `import './x.js'` and `import('./x.js')` specifiers in a module. */
function importSpecifiers(source) {
  return [...source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(([, specifier]) => specifier);
}

function contains(parent, child) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Problems that would only show up as a blank page after publishing: unresolved files and imports. */
export function findProblems(siteDirectory) {
  const problems = [];
  const htmlPath = join(siteDirectory, 'index.html');
  if (!existsSync(htmlPath)) return ['index.html is missing'];

  for (const reference of htmlReferences(readFileSync(htmlPath, 'utf8'))) {
    if (!existsSync(join(siteDirectory, reference))) problems.push(`index.html references missing file ${reference}`);
  }
  const sourceDirectory = join(siteDirectory, 'src');
  for (const file of existsSync(sourceDirectory) ? listFiles(sourceDirectory).filter((path) => path.endsWith('.js')) : []) {
    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (!existsSync(resolve(dirname(file), specifier))) {
        problems.push(`${relative(siteDirectory, file)} imports missing module ${specifier}`);
      }
    }
  }
  return problems;
}

/**
 * Copies the site into `outDirectory` (replacing whatever was there) and verifies the result.
 * Refuses an output directory that contains the project itself, since it is emptied first.
 */
export function buildSite({ root, outDirectory }) {
  const projectRoot = resolve(root);
  const target = resolve(outDirectory);
  if (contains(target, projectRoot)) throw new Error(`Refusing to build into ${target}: it contains the project.`);

  for (const entry of SITE_ENTRIES) {
    if (!existsSync(join(projectRoot, entry))) throw new Error(`Cannot build: ${entry} is missing.`);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const entry of SITE_ENTRIES) cpSync(join(projectRoot, entry), join(target, entry), { recursive: true });

  const problems = findProblems(target);
  if (problems.length > 0) throw new Error(`The built site is broken:\n - ${problems.join('\n - ')}`);

  const files = listFiles(target);
  return { files: files.length, bytes: files.reduce((total, file) => total + statSync(file).size, 0) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outDirectory = join(root, 'dist');
  try {
    const { files, bytes } = buildSite({ root, outDirectory });
    console.log(`Built ${files} files (${(bytes / 1024).toFixed(0)} KiB) into ${relative(process.cwd(), outDirectory) || '.'}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
