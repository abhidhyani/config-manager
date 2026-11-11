import { PendingChangesStorage } from '../changes/PendingChangesStorage.js';
import { PreferencesStore } from '../settings/PreferencesStore.js';
import { SettingsStore } from '../settings/SettingsStore.js';
import { TokenStore } from '../settings/TokenStore.js';
import { JsonStorage } from '../storage/BrowserStorage.js';
import { DashboardView } from '../ui/dashboard/DashboardView.js';
import { openPullRequestDialog } from '../ui/dialogs/PullRequestDialog.js';
import { openStringEditor } from '../ui/dialogs/StringEditorDialog.js';
import { h, preserveFocus, replaceChildren } from '../ui/dom.js';
import { renderHeader } from '../ui/HeaderView.js';
import { renderPendingPanel } from '../ui/PendingPanel.js';
import { SettingsView } from '../ui/SettingsView.js';
import { Toaster } from '../ui/Toasts.js';
import { AppController } from './AppController.js';
import { AppState } from './AppState.js';
import { createGitHub } from './gitHubFactory.js';
import { createInitialState } from './initialState.js';

/**
 * Composition root: builds the stores, controller and views, and re-renders on every state change.
 * `local` and `session` are `Storage`-shaped objects so the app never touches globals itself.
 */
export function createApp({ root, toastRoot, local, session }) {
  const state = new AppState(createInitialState());
  const controller = new AppController({
    state,
    settingsStore: new SettingsStore(new JsonStorage(local)),
    tokenStore: new TokenStore({ session, local }),
    preferencesStore: new PreferencesStore(new JsonStorage(local)),
    pendingStorage: new PendingChangesStorage(new JsonStorage(local)),
    createGitHub,
  });
  const toaster = new Toaster(toastRoot);

  const dialogs = {
    addString: ({ key = '', appIds = null } = {}) =>
      openStringEditor({ state: state.get(), controller, toaster, mode: 'add', key, appIds }),
    editString: ({ key, appIds }) =>
      openStringEditor({ state: state.get(), controller, toaster, mode: 'edit', key, appIds }),
    createPullRequest: () => openPullRequestDialog({ state: state.get(), controller, toaster }),
  };
  const context = { controller, dialogs };

  const headerSlot = h('div');
  const mainSlot = h('main', { id: 'main', class: 'layout__main', tabindex: '-1' });
  const asideSlot = h('div', { class: 'layout__aside' });
  const layout = h('div', { class: 'layout' }, mainSlot, asideSlot);
  replaceChildren(root, h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'), headerSlot, layout);

  const settingsView = new SettingsView({ controller, toaster });
  const dashboardView = new DashboardView({ controller, dialogs, requestRender: () => render(state.get()) });
  let lastView = null;

  function render(current) {
    preserveFocus(root, () => {
      replaceChildren(headerSlot, renderHeader(current, context));
      const onSettings = current.view === 'settings';
      layout.classList.toggle('layout--single', onSettings);
      if (onSettings) {
        // The form keeps its own field state; only rebuild it on entering the view.
        if (lastView !== 'settings') settingsView.show(current);
        if (mainSlot.firstElementChild !== settingsView.element) replaceChildren(mainSlot, settingsView.element);
        replaceChildren(asideSlot);
      } else {
        replaceChildren(mainSlot, dashboardView.render(current));
        replaceChildren(asideSlot, current.hasToken ? renderPendingPanel(current, context) : null);
      }
      lastView = current.view;
    });
  }

  state.subscribe(render);
  render(state.get());

  return { start: () => controller.start() };
}
