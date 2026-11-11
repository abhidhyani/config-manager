import { PAGE_SIZES } from '../../settings/PreferencesStore.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

export function renderPagination({ pageInfo, total, pageSize }, { controller }) {
  const { page, pageCount, start, end } = pageInfo;
  const pageButton = ({ label, iconName, target, disabled, focusId }) =>
    h('button', {
      type: 'button',
      class: 'btn btn--small',
      disabled,
      'aria-label': label,
      'data-focus-id': focusId,
      onClick: () => controller.setPage(target),
    }, iconName === 'chevron-left' ? icon(iconName, { size: 16 }) : null, h('span', { class: 'pagination__button-label' }, label),
    iconName === 'chevron-right' ? icon(iconName, { size: 16 }) : null);

  return h('nav', { class: 'pagination', 'aria-label': 'Pagination' },
    h('p', { class: 'pagination__summary', 'aria-live': 'polite' },
      total === 0 ? 'No strings' : `Showing ${(start + 1).toLocaleString()}\u2013${end.toLocaleString()} of ${total.toLocaleString()}`,
    ),
    h('div', { class: 'pagination__controls' },
      h('label', { class: 'pagination__size' },
        'Per page',
        h('select', {
          class: 'select select--small',
          'data-focus-id': 'page-size',
          onChange: (event) => controller.setPageSize(Number(event.target.value)),
        }, PAGE_SIZES.map((size) => h('option', { value: size, selected: size === pageSize }, size))),
      ),
      pageButton({ label: 'Previous', iconName: 'chevron-left', target: page - 1, disabled: page <= 1, focusId: 'page-prev' }),
      h('span', { class: 'pagination__page' }, `Page ${page} of ${pageCount}`),
      pageButton({ label: 'Next', iconName: 'chevron-right', target: page + 1, disabled: page >= pageCount, focusId: 'page-next' }),
    ),
  );
}
