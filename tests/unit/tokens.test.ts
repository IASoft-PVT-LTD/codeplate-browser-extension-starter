// Color contrast of the design tokens in src/ui/styles.css, light and dark:
// text must stay readable (WCAG AA, 4.5:1) after a rebrand.
// When this fails after a color change, darken (light theme) or lighten (dark
// theme) the token used for text, and keep the brand color for fills.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in styles.css`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAIRS: [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink-soft', 'bg'],
  ['ink-soft', 'surface'],
  ['brand', 'surface'],
  ['on-brand', 'brand'],
  ['danger', 'surface'],
];

describe('token contrast', () => {
  for (const [name, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg] of PAIRS) {
      it(`${name}: --${fg} on --${bg} is at least 4.5:1`, () => {
        expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('the dark theme is the same in both places it is written', () => {
    const system = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(block(":root[data-theme='system']")).toEqual(block(":root[data-theme='dark']"));
    expect(system).toContain(":root[data-theme='system']");
  });
});
