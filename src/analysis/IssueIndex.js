import { ISSUE_TYPES, SEVERITY } from './IssueTypes.js';

const cellId = (envId, appId, key) => `${envId}\u0000${appId}\u0000${key}`;

/** Lookup structures over a flat issue list, so rendering a row never scans every issue. */
export class IssueIndex {
  #all;
  #byCell = new Map();
  #byEnv = new Map();

  constructor(issues) {
    this.#all = issues;
    for (const issue of issues) {
      const id = cellId(issue.envId, issue.appId, issue.key);
      this.#byCell.set(id, [...(this.#byCell.get(id) ?? []), issue]);
      this.#byEnv.set(issue.envId, [...(this.#byEnv.get(issue.envId) ?? []), issue]);
    }
  }

  get all() {
    return this.#all;
  }

  forCell(envId, appId, key) {
    return this.#byCell.get(cellId(envId, appId, key)) ?? [];
  }

  forEnvironment(envId) {
    return this.#byEnv.get(envId) ?? [];
  }

  /** `{ error, warning, info }` counts for one app in one environment. */
  countsForApp(envId, appId) {
    const counts = { [SEVERITY.ERROR]: 0, [SEVERITY.WARNING]: 0, [SEVERITY.INFO]: 0 };
    for (const issue of this.forEnvironment(envId)) {
      if (issue.appId === appId) counts[issue.severity] += 1;
    }
    return counts;
  }

  /** Issue types present in an environment with how many times each occurs, most severe first. */
  typeCounts(envId) {
    const counts = new Map();
    for (const issue of this.forEnvironment(envId)) {
      counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
    }
    return [...counts].map(([type, count]) => ({ type, count, ...ISSUE_TYPES[type] }));
  }
}
