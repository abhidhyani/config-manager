import { ENVIRONMENTS } from '../app/AppRegistry.js';
import { h } from './dom.js';
import { brandMark, icon } from './icons.js';

function navButton({ view, label, iconName }, state, controller) {
  const current = state.view === view;
  return h('button', {
    type: 'button',
    class: `nav-tab${current ? ' is-current' : ''}`,
    'aria-current': current ? 'page' : null,
    'data-focus-id': `nav-${view}`,
    onClick: () => controller.setView(view),
  }, icon(iconName, { size: 16 }), label);
}

function environmentSwitch(state, controller) {
  const selected = state.preferences.environment;
  return h('div', { class: 'env-switch', role: 'radiogroup', 'aria-label': 'Environment' },
    ENVIRONMENTS.map((environment) => {
      const checked = environment.id === selected;
      return h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(checked),
        class: `env-switch__option${checked ? ' is-selected' : ''}${environment.isProduction ? ' is-production' : ''}`,
        'data-focus-id': `env-${environment.id}`,
        onClick: () => controller.setEnvironment(environment.id),
      }, h('span', { class: 'env-switch__dot', 'aria-hidden': 'true' }), environment.label);
    }),
  );
}

function pendingButton(state) {
  const count = state.pending.length;
  return h('button', {
    type: 'button',
    class: `header-button${count > 0 ? ' has-pending' : ''}`,
    'aria-label': `Pending changes (${count})`,
    'data-focus-id': 'header-pending',
    onClick: () => {
      const panel = document.getElementById('pending-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel?.focus({ preventScroll: true });
    },
  },
  icon('git-pull-request', { size: 16 }),
  h('span', { class: 'header-button__label' }, 'Pending'),
  h('span', { class: 'header-button__count' }, count));
}

export function renderHeader(state, { controller }) {
  const showTools = state.view === 'dashboard' && state.hasToken;
  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header__inner' },
      h('div', { class: 'app-header__brand' },
        brandMark({ size: 38 }),
        h('div', { class: 'app-header__titles' },
          h('h1', { class: 'app-title' }, 'Config Manager'),
          h('p', { class: 'app-subtitle' }, 'Strings for FOX One USA, Mexico and FOX Nation'),
        ),
      ),
      h('nav', { class: 'app-nav', 'aria-label': 'Primary' },
        navButton({ view: 'dashboard', label: 'Dashboard', iconName: 'dashboard' }, state, controller),
        navButton({ view: 'settings', label: 'Settings', iconName: 'sliders' }, state, controller),
      ),
      h('div', { class: 'app-header__tools' },
        showTools ? environmentSwitch(state, controller) : null,
        showTools ? pendingButton(state) : null,
      ),
    ),
  );
}
