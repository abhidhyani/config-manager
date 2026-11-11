const SVG_NS = 'http://www.w3.org/2000/svg';

const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
const path = (d) => ['path', { d }];
const rect = (x, y, width, height, rx = 0) => ['rect', { x, y, width, height, rx }];

/** Simple 24x24 stroke icons (Lucide-style geometry), drawn with `currentColor`. */
const ICONS = Object.freeze({
  search: [circle(11, 11, 8), path('m21 21-4.3-4.3')],
  plus: [path('M5 12h14'), path('M12 5v14')],
  x: [path('M18 6 6 18'), path('m6 6 12 12')],
  check: [path('M20 6 9 17l-5-5')],
  pencil: [path('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'), path('m15 5 4 4')],
  refresh: [
    path('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'),
    path('M21 3v5h-5'),
    path('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'),
    path('M8 16H3v5'),
  ],
  circle: [circle(12, 12, 10)],
  'circle-alert': [circle(12, 12, 10), path('M12 8v4'), path('M12 16h.01')],
  'triangle-alert': [path('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'), path('M12 9v4'), path('M12 17h.01')],
  info: [circle(12, 12, 10), path('M12 16v-4'), path('M12 8h.01')],
  'circle-check': [circle(12, 12, 10), path('m9 12 2 2 4-4')],
  'shield-alert': [
    path('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
    path('M12 8v4'),
    path('M12 16h.01'),
  ],
  'git-pull-request': [circle(18, 18, 3), circle(6, 6, 3), path('M13 6h3a2 2 0 0 1 2 2v7'), path('M6 9v12')],
  'git-branch': [path('M6 3v12'), circle(18, 6, 3), circle(6, 18, 3), path('M18 9a9 9 0 0 1-9 9')],
  sliders: [
    path('M21 4h-7'), path('M10 4H3'), path('M21 12h-9'), path('M8 12H3'), path('M21 20h-5'), path('M12 20H3'),
    path('M14 2v4'), path('M8 10v4'), path('M16 18v4'),
  ],
  dashboard: [rect(3, 3, 7, 9, 2), rect(14, 3, 7, 5, 2), rect(14, 12, 7, 9, 2), rect(3, 16, 7, 5, 2)],
  list: [path('M3 6h18'), path('M3 12h18'), path('M3 18h18')],
  key: [path('m21 2-9.6 9.6'), circle(7.5, 15.5, 5.5), path('m15.5 7.5 3 3L22 7l-3-3')],
  eye: [path('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'), circle(12, 12, 3)],
  'eye-off': [
    path('M9.88 9.88a3 3 0 1 0 4.24 4.24'),
    path('M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68'),
    path('M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61'),
    path('m2 2 20 20'),
  ],
  'external-link': [path('M15 3h6v6'), path('M10 14 21 3'), path('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')],
  'arrow-right': [path('M5 12h14'), path('m13 6 6 6-6 6')],
  'arrow-up-right': [path('M7 17 17 7'), path('M8 7h9v9')],
  'chevron-down': [path('m6 9 6 6 6-6')],
  'chevron-left': [path('m15 18-6-6 6-6')],
  'chevron-right': [path('m9 18 6-6-6-6')],
  filter: [path('M3 6h18'), path('M7 12h10'), path('M10 18h4')],
  trash: [path('M3 6h18'), path('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'), path('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')],
  'file-text': [
    path('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'),
    path('M14 2v4a2 2 0 0 0 2 2h4'),
    path('M10 9H8'), path('M16 13H8'), path('M16 17H8'),
  ],
  clock: [circle(12, 12, 10), path('M12 6v6l4 2')],
  inbox: [
    path('M22 12h-6l-2 3h-4l-2-3H2'),
    path('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'),
  ],
  plug: [path('M12 22v-5'), path('M9 8V2'), path('M15 8V2'), path('M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z')],
});

/** An inline SVG icon that inherits the surrounding text colour and is hidden from assistive tech. */
export function icon(name, { size = 18, className = '' } = {}) {
  const shapes = ICONS[name];
  if (!shapes) throw new Error(`Unknown icon: ${name}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.85,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: `icon${className ? ` ${className}` : ''}`,
  };
  for (const [name_, value] of Object.entries(attributes)) svg.setAttribute(name_, value);
  for (const [tag, shapeAttributes] of shapes) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [attribute, value] of Object.entries(shapeAttributes)) element.setAttribute(attribute, value);
    svg.append(element);
  }
  return svg;
}

/** Matte circular monogram mark inspired by editorial dashboard badges (no gradients or gloss). */
export function brandMark({ size = 42 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 42 42');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'brand-mark');

  const make = (tag, attributes) => {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    svg.append(element);
  };
  make('circle', { cx: 21, cy: 21, r: 21, class: 'brand-mark__bg' });
  const stroke = { fill: 'none', class: 'brand-mark__fg', 'stroke-width': 2.4, 'stroke-linecap': 'round' };
  make('path', { d: 'M12.5 15.5h17', ...stroke });
  make('path', { d: 'M12.5 21h17', ...stroke });
  make('path', { d: 'M12.5 26.5h10', ...stroke });
  make('circle', { cx: 27.5, cy: 26.5, r: 2.7, class: 'brand-mark__dot' });
  return svg;
}
