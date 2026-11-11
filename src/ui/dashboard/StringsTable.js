import { APPS } from '../../app/AppRegistry.js';
import { appDot } from '../appTheme.js';
import { badge, issueBadge, SEVERITY_ICONS } from '../badges.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { renderKey, renderValue } from '../valueRenderer.js';

const MAX_CELL_BADGES = 3;

function pendingNote(cell) {
  if (cell.baseValue === null) return h('p', { class: 'cell__note' }, badge('New', 'pending', null, 'plus'));
  return h('p', { class: 'cell__note' },
    badge('Pending', 'pending', null, 'pencil'),
    h('span', { class: 'cell__previous' }, 'was ', h('span', { class: 'cell__previous-value' }, renderValue(cell.baseValue))),
  );
}

function issueBadges(issues) {
  if (issues.length === 0) return null;
  const shown = issues.slice(0, MAX_CELL_BADGES);
  const extra = issues.length - shown.length;
  return h('div', { class: 'cell__badges' },
    shown.map(issueBadge),
    extra > 0 ? badge(`+${extra} more`, 'info', issues.slice(MAX_CELL_BADGES).map((issue) => issue.message).join('\n')) : null,
  );
}

function renderCell({ row, app, hiddenTypes, dialogs }) {
  const cell = row.cells[app.id];
  if (!cell.loaded) {
    return h('td', { class: 'cell cell--unavailable' }, icon('circle-alert', { size: 14 }), 'File unavailable');
  }
  if (!cell.present) {
    return h('td', { class: 'cell cell--missing' },
      h('div', { class: 'missing-slot' },
        h('span', { class: 'missing-slot__label' }, 'Missing'),
        h('button', {
          type: 'button',
          class: 'btn btn--small',
          'aria-label': `Add ${row.key} to ${app.label}`,
          onClick: () => dialogs.addString({ key: row.key, appIds: [app.id] }),
        }, icon('plus', { size: 14 }), 'Add'),
      ),
    );
  }
  const visibleIssues = cell.issues.filter((issue) => !hiddenTypes.has(issue.type));
  return h('td', { class: `cell${cell.pending ? ' cell--pending' : ''}` },
    renderValue(cell.value),
    cell.pending ? pendingNote(cell) : null,
    issueBadges(visibleIssues),
  );
}

function keyCell(row, severity) {
  return h('th', { scope: 'row', class: 'cell cell--key' },
    h('div', { class: 'key-cell' },
      severity
        ? icon(SEVERITY_ICONS[severity], { size: 14, className: `key-cell__status key-cell__status--${severity}` })
        : h('span', { class: 'key-cell__status-spacer' }),
      renderKey(row.key),
    ),
  );
}

function renderRow({ row, hiddenTypes, dialogs }) {
  const hasVisibleIssues = row.issues.some((issue) => !hiddenTypes.has(issue.type));
  const visibleSeverity = hasVisibleIssues ? row.severity : null;
  const presentAppIds = APPS.filter((app) => row.cells[app.id].present).map((app) => app.id);
  return h('tr', { class: `row row--${visibleSeverity ?? 'ok'}${row.hasPending ? ' row--pending' : ''}` },
    keyCell(row, visibleSeverity === 'info' ? null : visibleSeverity),
    APPS.map((app) => renderCell({ row, app, hiddenTypes, dialogs })),
    h('td', { class: 'cell cell--actions' },
      presentAppIds.length > 0
        ? h('button', {
          type: 'button',
          class: 'icon-button icon-button--subtle',
          'aria-label': `Edit ${row.key}`,
          title: 'Edit this string',
          onClick: () => dialogs.editString({ key: row.key, appIds: presentAppIds }),
        }, icon('pencil', { size: 16 }))
        : null,
    ),
  );
}

/** One page of the key-by-app matrix: values with their issues, pending edits and add/edit actions. */
export function renderStringsTable({ rows, hiddenTypes, dialogs }) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'strings-table' },
      h('thead', null,
        h('tr', null,
          h('th', { scope: 'col', class: 'cell cell--key' }, 'Key'),
          APPS.map((app) => h('th', { scope: 'col', class: `cell app--${app.id}` },
            h('span', { class: 'th-app' }, appDot(app), app.label, h('span', { class: 'th-locale' }, app.locale)),
          )),
          h('th', { scope: 'col', class: 'cell cell--actions' }, h('span', { class: 'visually-hidden' }, 'Actions')),
        ),
      ),
      h('tbody', null, rows.map((row) => renderRow({ row, hiddenTypes, dialogs }))),
    ),
  );
}
