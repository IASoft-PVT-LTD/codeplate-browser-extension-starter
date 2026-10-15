// The extension's name and words, in one place. The manifest (src/manifest.ts),
// the popup, the side panel, the options page and the exports read them from here.
// docs/recipes/rename-and-rebrand.md changes them.
export const BRAND = {
  name: 'Marginalia',
  /** One line, shown under the name in the options page and used as the store summary. */
  tagline: 'Highlight text on any page, add notes, find them again.',
  /** The manifest description: 132 characters at most (Chrome Web Store limit). */
  description: 'Highlight text on any web page, add notes, and find them again in the side panel. Everything stays in your browser.',
  /** Where "Get help" in the options page points. Replace with the user's site or support address (`npm run zip` refuses this placeholder). */
  homepage: 'https://codeplate.io',
  /**
   * What happens to the user's data, in one or two plain sentences: shown in the options page's
   * About section ("Privacy: …", so it starts in lower case), and the start of docs/privacy-policy.md
   * (`npm run listing`). Keep it true.
   */
  privacy: 'highlights, notes and settings stay in your browser (settings follow your browser account if sync is on). Nothing is collected or sent to a server.',
  /** Background of the count on the toolbar button (it's drawn by the browser, outside the pages' CSS). */
  badgeColor: '#3b3f8f',
} as const;

/**
 * The free CodePlate license asks for this credit where people can see it:
 * it's in the options page's About section. Keep it (AGENTS.md, rule 11).
 */
export const CREDIT = { text: 'Built with CodePlate (codeplate.io)', url: 'https://codeplate.io' } as const;
