# Config Manager

A small static web app for managing the Android string configuration shared by **FOX One USA**,
**FOX One Mexico** and **FOX Nation**. It reads the string files from the config repository,
compares the three apps side by side, lets you stage additions and edits, and opens a pull
request for you to review.

There is no backend and no runtime dependencies. It is plain ES modules, so the folder can be
served as-is, and `npm run build` stages exactly the files to publish (see
[Publishing to GitHub Pages](#publishing-to-github-pages)). Everything it stores stays in your
browser; the only server it talks to is `api.github.com`.

## What it manages

The strings live in
[`foxcorp-product/product-client-config`](https://github.com/foxcorp-product/product-client-config/tree/develop/foxplus/android)
under `foxplus/android`:

| App | QA / Stage | Prod |
|---|---|---|
| FOX One USA (`en-US`) | `lang/v2/en-US/strings_qa.json` | `lang/v2/en-US/strings.json` |
| FOX One Mexico (`es-MX`) | `lang/v2/es-MX/strings_qa.json` | `lang/v2/es-MX/strings.json` |
| FOX Nation (`en-US`) | `foxnation/lang/v2/en-US/strings_qa.json` | `foxnation/lang/v2/en-US/strings.json` |

Each file is a flat JSON object of `"key": "text"`. The legacy `lang/strings_en*.json` files are not
managed. Folders and file names are editable under **Settings → Advanced** if the layout changes.

> Merging a pull request to `develop` in that repository deploys to production, and a human
> review is required. Config Manager only ever opens a pull request; it never merges.

## Getting started

1. Open the app and go to **Settings**.
2. Paste a GitHub personal access token (see below). Repository, branch and base path are
   pre-filled; you can also paste a `github.com/.../tree/<branch>/<path>` URL and it fills them in.
3. **Test connection** checks the repository, the branch and one file, and tells you if the
   token can read but not push.
4. **Save and load strings**.

### Token

GitHub OAuth needs a server, so this app uses a personal access token you create yourself.

- **Fine-grained (recommended):** select the config repository with *Contents: read and write*,
  *Pull requests: read and write* and *Metadata: read*.
- **Classic:** the `repo` scope.
- If the organization enforces SAML SSO, authorize the token for it (token settings →
  *Configure SSO*). The app shows a direct link when GitHub reports this.

Storage: the token is kept in `sessionStorage` and forgotten when the tab closes. Ticking
**Remember token on this device** also writes it, unencrypted, to `localStorage`; leave that
off on a shared machine. **Clear saved token** removes both. Repository, branch and path
settings, your environment choice and filters are always remembered in `localStorage`.

## Using it

**Dashboard.** Switch between **QA / Stage** and **Prod** at the top (QA is the default; Prod is
marked in red). Each app gets a card with its string count, a health bar and issue counts, then
two tabs:

- **Strings:** one row per key, one column per app. Search keys and values, filter by status
  (the pills show how many strings each one would list: missing, empty/invalid, differs within
  a locale, pending, ...), and hide kinds of issue you do not care about from the
  **Issue types** menu. Leading/trailing spaces, line breaks and invisible characters are drawn
  visibly (`·`, `↵`, `⍽`).
- **Issues:** every finding for the environment, grouped by type, most severe first.
  Click a key to jump to it.

**Adding or editing.** *Add string* (or *Edit* / *Add* on a row) opens an editor where you choose:

- the **environments** (QA, Prod, or both; defaults to the one you are viewing),
- the **apps**,
- one shared text, or different text per app (for example a Spanish translation for Mexico).

The editor validates as you type. Nothing is written to GitHub at this point: edits become
**pending changes**.

**Pending changes** (right panel) lists every edit grouped by app and environment, with the old
text struck through next to the new text. Remove one, or clear all. Pending edits survive a
reload and are tied to the repository and branch they were made against. Changing either
in Settings starts clean, and refreshing from GitHub re-applies them to the new data.

**Generate Pull Request** opens a review dialog:

- A title, branch name and Markdown description are generated from the changes. All three are
  editable, and **Regenerate** rebuilds them.
- An optional **Jira ticket** (`DTCAND-1234`) prefixes the title and branch and links the
  ticket in the description.
- The description includes a changes table, the files touched, whether production is affected,
  and any consistency problems found on exactly the strings you changed.
- The PR is a **draft** by default; untick *Open as draft* for a ready PR.
- If a production file is included you must tick a confirmation first.

On success you get a link to the PR. If something fails, the dialog says which step failed and
whether a branch was left behind, and **Back to edit** keeps everything you typed.

## What it checks

Checks run on the *effective* data (loaded strings plus your pending edits), so fixing a problem
makes it disappear immediately. "Reference app" below means the first app that has the string.

| Check | Severity | Flags |
|---|---|---|
| File unavailable | error | A file could not be fetched or is not a JSON object. |
| Unsafe to edit | error | The file's formatting would change if rewritten; editing is blocked. |
| Duplicate key | error | The same key twice in one file (only the last value counts). |
| Not a string | error | A value that is a number, object, array, `null`... |
| Missing string | error | Present in some apps in this environment but not in another. |
| Empty value / Whitespace only | error | `""` or blank text. |
| Placeholder mismatch | error / warning | `%s`, `%1$s`, `%d`, `{name}`, `{{name}}`, `${name}` differ from the reference. An error for Mexico vs USA, a warning between USA and Nation. |
| Malformed placeholder | warning | Mixed `%1$s` and `%s`, or unbalanced braces. |
| Markup mismatch / Invalid markup | warning | HTML tags differ from the reference, or are unbalanced. |
| Untranslated | warning | Mexico text is identical to USA (3+ letters). Hide it from the **Issue types** menu if Mexico copy is still English by design. |
| Key mismatch | warning | Near-identical keys held by different apps (`reAir_badge` vs `re_air_badge`). |
| Near-duplicate key | warning | Two similar keys in one file. |
| Edge whitespace differs | warning | Leading/trailing spaces differ between apps. |
| Invisible characters | warning | Non-breaking space, zero-width or bidi control characters. |
| Leftover escape | warning | `\'` or `&amp;` outside HTML; the pipeline normally unescapes these. |
| Placeholder text | warning | `TODO`, `FIXME`, `lorem ipsum`, `null`, `undefined`. |
| Missing from QA | warning | In Prod but not in QA / Stage. |
| Edge whitespace | info | Leading/trailing whitespace (valid for concatenated fragments). |
| Key naming | info | Not `snake_case`. |
| Only in QA | info | Not published to Prod yet. |
| Differs from other environment | info | Same key, different text in QA and Prod. |

Findings are suggestions: Config Manager does not block a PR for a warning, but the review dialog
and the PR description surface them so a reviewer sees them too.

## How edits are written

- Files are parsed and written back with the repository's exact formatting: two-space indent,
  existing key order, new keys appended, trailing newline preserved. Unrelated lines never change.
  If a file would not round-trip byte-for-byte, it is flagged **Unsafe to edit** and refused.
- At submit time the changes are applied to each file **as it is on the base branch right now**,
  not to the copy loaded earlier, so strings merged by someone else in the meantime are kept.
- All files go into **one commit** on a **new branch** (`config-manager/[JIRA-]add-...-YYYYMMDD-HHMM`)
  through the Git Data API, then the PR is opened. A failed run never leaves a half-written
  commit on `develop`.
- Only additions and value updates are supported. Deleting or renaming keys is not.

## Publishing to GitHub Pages

Yes, it publishes as-is. It is a static site with relative paths, so it works at a project URL
(`https://<org>.github.io/<repo>/`), at a custom domain, or on any other static host.

### Option A: GitHub Actions (recommended)

1. Copy [`deploy/github-pages.yml`](deploy/github-pages.yml) to
   `.github/workflows/config-manager-pages.yml` at the root of the repository that contains this
   folder. It runs on pushes to `develop` that touch `config-manager/` (change the branch there
   if needed) and can also be started by hand from the **Actions** tab.
2. In that repository open **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**.
3. Push. The workflow runs the tests, builds `dist/`, and deploys only that folder. The address
   is shown in the workflow run and under **Settings → Pages**.

The template is kept here rather than in `.github/workflows/` so that nothing publishes until
you decide where it should.

### Option B: any other repository or branch

`npm run build` writes the site into `dist/`: `index.html`, `src/`, `styles/`, `assets/` and
`.nojekyll`, and nothing else (no tests, scripts or docs). Copy the contents of `dist/` to the
root of a `gh-pages` branch (or to a `/docs` folder) and pick it under
**Settings → Pages → Deploy from a branch**.

The build fails if `index.html` points at a file that is not there or a module imports one that
is missing, so a broken site is caught before it is published.

### Before you publish

- **A Pages site is public on the internet**, even when the repository is private. Private
  repositories need a paid plan for Pages at all, and access-controlled Pages needs GitHub
  Enterprise Cloud. The site contains no secrets (each person types their own token and it stays
  in their browser), but it does show the default repository name. If that matters, serve the
  `dist/` folder from an internal static host instead.
- **Try it first:** `npm run preview` builds and serves `dist/` at http://localhost:8081.
- The page ships a strict Content-Security-Policy (`script-src 'self'`,
  `connect-src https://api.github.com`), uses no inline scripts or styles, and sets `noindex`.
  GitHub Enterprise Server hosts would need `connect-src` changed in `index.html`.

## Running locally

```
cd config-manager
npm start        # serves the source folder at http://localhost:8080 (needs python3)
npm run preview  # builds dist/ and serves it at http://localhost:8081
```

Any static server works, but ES modules need `http://`, not `file://`.

## Tests

```
npm test
```

Uses Node's built-in test runner (Node 22+), no installs. The suite covers parsing and exact
round-tripping, every analysis rule, change resolution, PR title/body generation, the GitHub
client and the commit/branch/PR publisher (against an in-memory fake of the API), settings and
token storage, the app controller that ties them together, and the site build.

The UI layer is verified in a browser rather than by unit tests, and no browser tests are
included in this folder because they would need a browser dependency.

## Layout

```
index.html, styles/, assets/   page shell and styling (design tokens, then one stylesheet per area)
src/main.js                    entry point
src/app/                       registry of apps and environments, state, controller, wiring
src/strings/                   parsing and exact serialization of a string file
src/analysis/                  issue rules, cross-app matrix, filters
src/changes/                   pending edits, resolving them against loaded data, validation
src/github/                    API client, reading files, creating the commit/branch/PR
src/pullrequest/               title, branch, description and commit message generation
src/settings/, src/storage/    settings, token and preferences persistence
src/ui/                        views, dialogs, icons and the small DOM helper
scripts/build-site.js          stages the publishable files into dist/ and checks them
deploy/github-pages.yml        GitHub Actions workflow template for Pages
tests/                         unit tests and an in-memory GitHub fake
```

## Limitations

- A personal access token is required; there is no sign-in flow without a backend.
- A token with the `repo` scope can write to every repository you can access. Prefer a
  fine-grained token limited to the config repository.
- Config Manager does not run the repository's own CI. Wait for the `json-validation` check on
  the PR before merging.
- GitHub API rate limits apply (the error message says when they reset).
