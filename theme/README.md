# Closet Republic theme for Wiki.js

CSS and HTML injections that make the wiki look like closetrepublic.com and the forum: dark only, black and white, soft prism when nature mode is on (default), monochrome when it is off.

| File | Pasted into (Wiki.js administration) |
| --- | --- |
| `css-override.css` | Theme > Code Injection > **CSS Override** |
| `head-injection.html` | Theme > Code Injection > **Head HTML Injection** |
| `body-injection.html` | Theme > Code Injection > **Body HTML Injection** |
| `templates/page-template.html` | Content of a new wiki page, Raw HTML editor (see below) |
| `templates/basic-page.md` | Content of a short wiki page, Markdown editor |
| `logo.svg` | General > **Logo** (upload) |

## Install

1. Log in to https://wiki.closetrepublic.com as administrator and open **Administration** (the gear icon).
2. Open **Theme** and set:
   - **Dark Mode**: on
   - **Primary Color**: `#FFFFFF`
   - **Secondary Color**: `#2A2A2E`
   - **Header Color**: `#000000`
   - **Sidebar Color**: `#000000`
3. In the **Code Injection** section of the same page, paste the three files into their fields (open each file, select all, copy):
   - `css-override.css` into **CSS Override**
   - `head-injection.html` into **Head HTML Injection**
   - `body-injection.html` into **Body HTML Injection**
4. Click **Apply** (top right).
5. Open **General**, upload `logo.svg` as the **Logo**, set the **Site Title** to `Closet Republic Wiki`, click **Apply**.
6. Reload any wiki page with a hard refresh (Ctrl+Shift+R). Injections are cached by the browser.

## What it adds

| Part | Result |
| --- | --- |
| Colours and type | Black page, white text, grey panels, the site's rounded font, 14px corners. |
| Header and sidebar | Black with a strong white line; a soft spectrum line in nature mode. |
| Buttons | White pills that invert on hover; outlined buttons for secondary actions. |
| Page content | White underlined links, dark code blocks, panels for info/warning blocks, dark tables. |
| Nature mode | Soft blended prism near the top and bottom of the screen and around the pointer. On by default. |
| Nature switch | Button at the bottom left (a real switch for keyboard and screen readers), a quick sideways swipe on a phone, or `?nature=true` / `?nature=false` on any link. The choice is stored in the `cr_nature` cookie. |
| Footer | Correction notice ("may contain mistakes, not professional advice, report to corrections@closetrepublic.com"), Closet Republic links, legal links, parody disclaimer and the credit "Created by amaya@veronami", placed above the Wiki.js footer. |
| Accessibility | Screen-reader description of the current mode, announcements on change, thick focus outlines, no motion with "reduce motion", prism layers hidden from assistive tech and never block clicks. |
| Forced themes | If the browser or an extension forces its own colours, an in-page notice asks for it to be turned off. A pop-up dialog is deliberately not used (Google Safe Browsing flagged the main site for that). |

The "Powered by Wiki.js" footer is kept.

## Change the look later

Edit the files here, then paste the new content into the same fields and click **Apply**.

| To change | Edit |
| --- | --- |
| Colours, font, corners | the `:root` block at the top of `css-override.css` |
| Prism softness and strength | `--cr-prism-blur`, `--cr-prism-period`, `--cr-prism-strength` in `:root` |
| Footer links and text | `footerHtml()` in `body-injection.html` |
| Address for correction reports | `REPORT_EMAIL` in `body-injection.html` |
| Main site address | `SITE` in `body-injection.html` |

## Notes

- The nature choice is stored per address (cookie `cr_nature` on wiki.closetrepublic.com). The main site and the forum keep their own copies; the same `?nature=` link works on all three.
- Selectors target Wiki.js 2.x (Vuetify) class names. After a Wiki.js upgrade, check the page, the editor and the login screen. The admin area is restyled by the same CSS; if a screen is hard to read there, add an exception at the bottom of `css-override.css`.
- The prism and footer logic is tested against a mock page, not against a running Wiki.js; verify the appearance after installing and report any screen that looks off.

## Page template

`templates/page-template.html` is a ready-made wiki page: hero title, "At a glance" box, summary, callouts (note, tip, caution, help), key-point cards, steps, table, FAQ and a sources section.

1. Install `css-override.css` first (it holds the `cr-*` styles used by the template).
2. In Wiki.js choose **New page**, pick the path and title, then select the **Web Page** (HTML) editor.
3. Paste the template, replace the text in CAPITALS and delete blocks that are not needed.
4. Keep one `<h1>`; use `<h2>` and `<h3>` below it so the table of contents is generated.
5. Do not add `<script>`, `<style>` or inline `style` attributes; Wiki.js strips them. Use the `cr-*` classes instead.

Wiki.js can also save a finished page as a template by duplicating it (page actions > **Duplicate**).

## Basic Markdown template

`templates/basic-page.md` is a simpler page for glossary terms, explainers and short guides: draft notice, status line, summary, details, "In India", related pages, sources, and the correction line.

1. In Wiki.js choose **New page**, use a path under `drafts/new/`, and select the **Markdown** editor.
2. Paste the template and replace the text in CAPITALS.
3. Callouts use Wiki.js blockquote classes (`{.is-info}`, `{.is-warning}`, `{.is-danger}`) on the line after the quote.
4. A reviewer publishes it by following `content/IMPORT-POLICY.md`, section 3.

Both templates include a fact-check status and a "Sources" section. Pages are not published until a reviewer has checked every claim.
