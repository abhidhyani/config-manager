import { h } from './dom.js';

const MONOGRAMS = Object.freeze({ usa: 'US', mexico: 'MX', nation: 'FN' });

/** A small coloured disc with the app's initials; colour comes from the `app--<id>` class. */
export function appAvatar(app) {
  return h('span', { class: `avatar app--${app.id}`, 'aria-hidden': 'true' }, MONOGRAMS[app.id] ?? app.shortLabel.slice(0, 2).toUpperCase());
}

export function appDot(app) {
  return h('span', { class: `dot app--${app.id}`, 'aria-hidden': 'true' });
}
