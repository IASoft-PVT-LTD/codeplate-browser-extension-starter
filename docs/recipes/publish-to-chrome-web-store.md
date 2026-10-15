# Publish to the Chrome Web Store

Use when the user is ready to put the extension in the Chrome Web Store (and Microsoft Edge Add-ons). Publishing is the user's action: prepare everything, then hand over.

## 1. Before the upload

1. `package.json` `version`: higher than the last published one (the store rejects the same version twice), and `name` (it names the zip).
2. `src/shared/brand.ts`: final `name`, `description` (≤ 132 characters), `homepage` (their site, not codeplate.io), and a true `privacy` sentence (the options page's About shows it).
3. The options page's About keeps the credit (rule 11).
4. Firefox too: `GECKO_ID` in `src/manifest.ts` is an address or domain the user owns.
5. Remove anything only for development; there's no debug code in this template, but check what you added. The test build `dist/chrome-e2e/` (allowed on `localhost` and `*.test`) is never zipped; nothing to do.
6. `npm run check` passes.

`npm run zip` refuses to pack while any template placeholder is left (the name Marginalia, the `marginalia` package name, the codeplate.io homepage, the `example.com` Firefox id: `checks/placeholders.mjs`) and says where to fix each. `--allow-placeholders` makes a `*-draft.zip` for testing the package; never upload a draft.

## 2. Build the files

```
npm run listing   # docs/store-listing.md + docs/privacy-policy.md: drafts from the manifest
npm run zip       # dist/<name>-<version>-chrome.zip: the upload (checked like a store would)
npm run store     # shots/store/: three 1280×800 screenshots, the 440×280 promo tile, the 128 px icon
```

Open every image in `shots/store/` before giving them to the user. Change the headlines in `SLIDES` in `scripts/store-assets.mjs` to the user's words; use the user's demo data (`scripts/lib/demo.mjs`) so screenshots show their extension, not Marginalia.

## 3. The listing (the user fills it in at the Developer Dashboard)

`npm run listing` writes two drafts from `src/manifest.ts` and `src/shared/brand.ts`:

- `docs/store-listing.md`: the store listing tab (title, summary, homepage, the shortcuts) and the privacy practices tab (a justification for every permission and host pattern, taken from `REASONS`; remote code: no).
- `docs/privacy-policy.md`: a privacy policy draft, starting from `BRAND.privacy` and listing what each permission lets the extension do, in plain words.

The blocks between `<!-- listing:auto … -->` markers are rewritten on every run (run it again after any permission change; `npm run zip` notes when a draft is missing or out of date). Fill in every `[TODO]` with the user, in their words:
- **Description**: what it does, how to use it, what it stores. Plain, no keyword stuffing (it's a policy violation).
- **Category**, **language**, **support URL** or email.
- **Screenshots** (1280×800 or 640×400, up to 5), **small promo tile** (440×280), **store icon** (128×128): `npm run store`.

Record in `docs/project.md` that the drafts exist and what's still open.

## 4. The privacy tab (where reviews fail most)

- **Single purpose:** one sentence. For Marginalia: "Lets users highlight text and keep notes on web pages, and find them again."
- **Permission justifications:** paste each line of the "Permission justifications" block of `docs/store-listing.md` (from `REASONS` in `src/manifest.ts`), one per permission, and the host lines into the one host permission field.
- **Remote code:** "No, I am not using remote code."
- **Data usage:** tick what the extension collects. Marginalia stores data only in the browser and sends nothing, so: none collected. If the extension sends anything to a server (`sync-with-a-backend.md`), tick the types (e.g. "Website content", "Personally identifiable information") and certify the limited-use statements honestly.
- **Privacy policy URL:** required whenever any user data is collected or transmitted. Publish `docs/privacy-policy.md` (filled in) on the user's site: what is collected, why, where it goes, how to delete it. Publishing it is the user's step.

## 5. Review tips

- Broad host access (`http://*/*`, `https://*/*`, `<all_urls>`) means an in-depth review: days instead of hours. If the extension only needs pages on click, switch to `activeTab` before publishing (`add-a-permission.md`).
- Every permission must be used by the code you ship; unused ones get rejected.
- No obfuscated code. Minified is fine (the build minifies pages; the service worker stays readable).
- Descriptions must match what the extension does; screenshots must show the real extension.
- After a rejection, the email names the policy: fix that, bump the version, re-upload.

## 6. Edge Add-ons

The same zip works. The user signs in at Microsoft Partner Center (free developer account), creates a new extension, uploads `dist/<name>-<version>-chrome.zip`, and fills in a similar listing and privacy section. Review usually takes a few business days.

## 7. Updates

Bump the version, `npm run zip`, upload the new zip in the dashboard's Package tab. Settings migrations (`options-and-storage-migrations.md`) run on the users' browsers after the update.

## Verify

1. `npm run zip` printed the zip path with no `FAIL` lines and no `draft` lines; unzip it somewhere and load that folder unpacked once, to test exactly what will be uploaded.
2. Every image in `shots/store/` opened and checked: right size, the user's name and words, readable.
3. `docs/store-listing.md` and `docs/privacy-policy.md` have no `[TODO]` left and are true (`npm run listing -- --check` says `ok` for both); `docs/project.md` records where the privacy policy is published.
4. Tell the user the steps they take themselves: the developer account (one-time US$5), the upload, submitting for review.
