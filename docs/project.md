# Project decisions

<!-- codeplate:project-stub -->

This file is still the template stub. The agent replaces it after interviewing the user (see "Interview" in AGENTS.md), then adds every later decision here, so a future session knows what was agreed.

Suggested layout once filled in:

- **Name and one-line pitch:**
- **What it does:** the user's itch, in one or two sentences; what the popup, side panel, page script and options are for
- **Where it runs:** every site, some sites (which), or only when the user clicks
- **Data it touches:** what it reads from pages, what it stores (where: local, sync, a server), what it sends anywhere (never without saying so)
- **Permissions:** each one and why (mirrors REASONS in src/manifest.ts)
- **Browsers:** Chrome, Edge, Firefox, Safari; store accounts the user has
- **Brand:** colors, icon (source and owner), tone
- **Open questions:** placeholders to replace before publishing (homepage, gecko id, privacy policy URL…)
- **Log:** one dated line per notable change
