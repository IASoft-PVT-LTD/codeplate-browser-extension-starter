// The template's placeholder values, which must not reach a store: the name
// Marginalia, the homepage (codeplate.io is the template's site, not the
// user's), the Firefox add-on id at example.com. `npm run zip` refuses to pack
// while any is left (`--allow-placeholders` makes a draft zip for testing,
// named *-draft.zip, never for upload).
//
// TEMPLATE lists the values this template shipped with. Leave it as it is when
// you rebrand: it is what the check compares against.
import { BRAND, CREDIT } from '../src/shared/brand.ts';
import { GECKO_ID } from '../src/manifest.ts';

export const TEMPLATE = {
  name: 'Marginalia',
  packageName: 'marginalia',
  homepage: 'https://codeplate.io',
  geckoId: 'marginalia@example.com',
};

const EXAMPLE_HOST = /(^|\.)example\.(com|org|net)$/i;

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Returns what is still a placeholder, as sentences that say where to fix it.
 * `firefox`: also check the Firefox add-on id (only the Firefox zip uses it).
 */
export function findPlaceholders({ brand = BRAND, geckoId = GECKO_ID, packageName, firefox = false } = {}) {
  const found = [];
  if (brand.name.trim().toLowerCase() === TEMPLATE.name.toLowerCase()) {
    found.push(`the name is still the template's "${TEMPLATE.name}": set BRAND.name in src/shared/brand.ts (docs/recipes/rename-and-rebrand.md)`);
  }
  if (packageName !== undefined && packageName === TEMPLATE.packageName) {
    found.push(`package.json "name" is still "${TEMPLATE.packageName}": it names the zip; use the extension's name in lower case with dashes`);
  }
  const host = hostOf(brand.homepage);
  if (!host || brand.homepage === CREDIT.url || host === 'codeplate.io' || host.endsWith('.codeplate.io') || EXAMPLE_HOST.test(host)) {
    found.push(
      `BRAND.homepage in src/shared/brand.ts is "${brand.homepage}", the template's placeholder: set the user's own site or support page (the store shows it as the extension's homepage, and "Get help" opens it). The CodePlate credit stays in About either way.`,
    );
  }
  if (firefox && (geckoId === TEMPLATE.geckoId || EXAMPLE_HOST.test(geckoId.split('@')[1] ?? ''))) {
    found.push(`GECKO_ID in src/manifest.ts is "${geckoId}": use an address or domain the user owns (docs/recipes/firefox-and-safari.md)`);
  }
  return found;
}
