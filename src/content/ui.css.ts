// Styles of the in-page UI (src/content/ui.ts), inside its shadow root. The
// tokens at the top mirror src/ui/styles.css: change both when you rebrand.
// The highlight colors themselves are in src/content/content.css (::highlight).
export const UI_CSS = `
:host {
  --bg: #ffffff; --ink: #1d2033; --ink-soft: #5b6078; --line: #e3e5ee; --brand: #3b3f8f; --on-brand: #ffffff;
  --danger: #b4233a; --shadow: 0 10px 30px rgb(20 22 50 / .18), 0 2px 6px rgb(20 22 50 / .12);
  --hl-yellow: #ffd43b; --hl-green: #69db7c; --hl-blue: #74c0fc; --hl-pink: #f783ac;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
}
:host([data-theme="dark"]) {
  --bg: #1f2233; --ink: #eceefa; --ink-soft: #a7acc6; --line: #34384f; --brand: #a9adff; --on-brand: #15172a;
  --danger: #ff8fa0; --shadow: 0 10px 30px rgb(0 0 0 / .5), 0 2px 6px rgb(0 0 0 / .4);
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="system"]) {
    --bg: #1f2233; --ink: #eceefa; --ink-soft: #a7acc6; --line: #34384f; --brand: #a9adff; --on-brand: #15172a;
    --danger: #ff8fa0; --shadow: 0 10px 30px rgb(0 0 0 / .5), 0 2px 6px rgb(0 0 0 / .4);
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.toolbar, .editor {
  /* The host has all: initial (page styles can't reach in), so fonts are set here. */
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left;
  position: fixed; background: var(--bg); color: var(--ink); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow); animation: pop .12s ease-out;
}
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .toolbar, .editor { animation: none; } }
.toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 2px; }
button { font: inherit; color: inherit; cursor: pointer; }
.swatch {
  width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--bg); padding: 0;
  box-shadow: 0 0 0 1px var(--line);
}
.swatch:hover { transform: scale(1.12); }
.swatch.is-default, .swatch[aria-checked="true"] { box-shadow: 0 0 0 2px var(--brand); }
.swatch-yellow { background: var(--hl-yellow); }
.swatch-green { background: var(--hl-green); }
.swatch-blue { background: var(--hl-blue); }
.swatch-pink { background: var(--hl-pink); }
.tool {
  display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 8px;
  border: 0; background: transparent; color: var(--ink-soft);
}
.tool:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.tool.danger:hover { color: var(--danger); }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.editor { width: 320px; padding: 12px; display: grid; gap: 10px; }
.quote {
  margin: 0; padding: 2px 0 2px 10px; border-left: 3px solid var(--hl-yellow); color: var(--ink-soft);
  font-size: 13px; max-height: 4.2em; overflow: hidden;
}
.note {
  width: 100%; resize: vertical; min-height: 84px; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit;
}
.row { display: flex; align-items: center; gap: 6px; }
.swatches { display: flex; gap: 6px; }
.swatches .swatch { width: 20px; height: 20px; }
.grow { flex: 1; }
.btn {
  height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent;
  font-weight: 500;
}
.btn.primary { background: var(--brand); color: var(--on-brand); border-color: var(--brand); }
`;
