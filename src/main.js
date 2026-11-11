import { createApp } from './app/createApp.js';
import { createBrowserStorage } from './storage/BrowserStorage.js';

const app = createApp({
  root: document.getElementById('app'),
  toastRoot: document.getElementById('toasts'),
  local: createBrowserStorage('local'),
  session: createBrowserStorage('session'),
});

app.start();
