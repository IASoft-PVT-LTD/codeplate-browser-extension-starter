// The interface icons: original 24×24 line drawings, built as SVG elements (no
// innerHTML, so they work inside pages with strict Trusted Types too).
// To add one: add its path data here (stroke-only, 2px lines, round caps) and
// use icon('name'). docs/recipes/rename-and-rebrand.md covers the logo.

const PATHS = {
  search: ['M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', 'M20 20l-4-4'],
  note: ['M5 4h10l4 4v12H5z', 'M15 4v4h4', 'M8 12h8', 'M8 16h5'],
  pencil: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  trash: ['M5 7h14', 'M10 7V5h4v2', 'M7 7l1 13h8l1-13', 'M10 11v6', 'M14 11v6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  panel: ['M4 5h16v14H4z', 'M14 5v14'],
  settings: ['M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  target: ['M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', 'M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  globe: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  keyboard: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14h8'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
} as const;

export type IconName = keyof typeof PATHS;
const NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(k, String(v));
  }
  for (const d of PATHS[name]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/**
 * The logo: the same drawing as the toolbar icon (scripts/make-icons.mjs):
 * lines of text on an ink square, the middle one highlighted.
 */
export function logo(size = 28): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'logo');
  const shape = (tag: string, attrs: Record<string, string | number>) => {
    const s = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v));
    svg.appendChild(s);
  };
  shape('rect', { x: 0, y: 0, width: 100, height: 100, rx: 24, fill: 'var(--logo-bg, #2b2f6b)' });
  shape('rect', { x: 18, y: 41, width: 64, height: 18, rx: 5, fill: 'var(--logo-mark, #ffd43b)' });
  shape('rect', { x: 24, y: 25, width: 52, height: 7, rx: 3.5, fill: 'var(--logo-line, #e9ebff)' });
  shape('rect', { x: 24, y: 46.5, width: 52, height: 7, rx: 3.5, fill: 'var(--logo-ink, #2b2f6b)' });
  shape('rect', { x: 24, y: 68, width: 34, height: 7, rx: 3.5, fill: 'var(--logo-line, #e9ebff)' });
  return svg;
}
