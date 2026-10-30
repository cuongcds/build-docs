# build-docs

Builds folders of Markdown into a static HTML docs site, styled by your project's CSS tokens. All project-specific settings live in one JSON config.

## Quick start

```bash
cd build-docs
npm install
cp docs.config.example.json docs.config.json   # then set your own paths
npm run build
```

`docs.config.json` is git-ignored (it is per-project/per-machine); `docs.config.example.json` is the committed template.

To build for another project, keep a separate config and point at it:

```bash
node build.mjs --config ./other-project.config.json
npm run build -- --config ./other-project.config.json
```

All paths in a config are relative to **the config file's folder**.

## Config reference

| Key | Required | Description |
| --- | --- | --- |
| `cleanUrls` | no | `true` writes pages as `<id>/<page>/index.html` and links them as `<id>/<page>/` (no `.html`). Needs a web server (a folder URL does not open from `file://`). Default `false`. |
| `output` | yes | Folder the site is written to. Section folders (`<id>/`), `assets/`, `index.html` and `search-index.js` inside it are deleted and regenerated each build; other files are left alone. |
| `site.name` | no | Text next to the logo in the header (default `Docs`). |
| `site.titleSuffix` | no | Suffix of every page `<title>` (`Page — <suffix>`). |
| `site.lang` | no | `<html lang>` (default `en`). |
| `site.homeTitle` / `site.homeLead` | no | Heading and subtitle of the home page. |
| `theme.css` | no | CSS file (see `theme.example.css` for a starter) whose `:root { ... }` blocks are copied to `assets/tokens.css`. Other rules in the file are ignored. |
| `theme.fontUrl` | no | Web-font stylesheet URL (e.g. Google Fonts) to load. |
| `logo` / `favicon` | no | Image files copied into `assets/`. Omit to hide. |
| `sections` | yes | List of doc folders (below). Each becomes a sidebar group and a card on the home page. |

### Section

| Key | Required | Description |
| --- | --- | --- |
| `id` | yes | Output sub-folder name, e.g. `guides` → `guides/*.html`. Must be unique. |
| `title` | yes | Sidebar heading and home-card title. |
| `description` | no | Home-card text. |
| `dir` | yes | Folder with the `.md` files (not recursive). |
| `index` | no | Markdown file used as the section home (`<id>/index.html`, listed first). Can live outside `dir`. |
| `indexTitle` | no | Sidebar title for the index page (default: its front-matter `title` or H1). |
| `exclude` | no | File names in `dir` to skip, e.g. `["CHANGELOG.md"]`. |
| `last` | no | File names to push to the end of the sidebar. |
| `assets` | no | Folders of non-Markdown files (e.g. JSON, PDF, zip) copied to `<id>/<folder-name>/` so relative links to them keep working. |

### Page title, order and nesting

- Title: front-matter `title`, else the first `# H1`, else the file name.
- Order: front-matter `nav_order`, then file name.
- Nesting: front-matter `parent: <title of another page>` shows the page indented under that page.

### Links

Relative links between `.md` files (and to `assets` files, or to a section's `dir`) are rewritten to the built `.html` paths. Links to anything not part of the build render as a dotted, non-clickable label rather than a broken link.

## Tokens your theme CSS should define

`docs.css` uses only these semantic tokens, so any theme that defines them will work:

`--color-background`, `--color-surface`, `--color-surface-strong`, `--color-muted`, `--color-muted-foreground`, `--color-text-primary`, `--color-text-tertiary`, `--color-text-inverse`, `--color-border-default`, `--color-border-focus`, `--color-primary`, `--color-primary-hover`, `--color-primary-active`, `--color-primary-subtle`, `--color-destructive`, `--color-warning`, `--font-family-base`, `--font-size-body`, `--font-size-caption`, `--font-size-heading-sm|md|lg`, `--spacing-xs|sm|md|lg|xl`, `--radius-control|pill|card`, `--shadow-card`, `--shadow-popover`, `--ring-width`, `--ring-offset`, `--ring-color`.

## Config and assets next to `build.mjs`

The config, theme and branding assets of a site sit directly in this folder (the Open SNS site):

```
docs.config.json     # the build config (paths are relative to this folder)
theme.css            # brand tokens: the :root { ... } blocks are copied to <output>/assets/tokens.css
assets/
  logo.png           # header logo
  favicon.ico        # browser tab icon
```

| File | Used by | What it is |
| --- | --- | --- |
| `docs.config.json` | `build.mjs --config` | Site name, output folder, theme, logo, favicon and sections. Git-ignored by this repo (see `.gitignore`). |
| `theme.css` | `theme.css` key | Defines the semantic tokens listed below. Any other rule in the file is ignored. |
| `assets/logo.png` | `logo` key | Copied to `<output>/assets/logo.png`, shown at 28 px height in the header. Use a transparent PNG that reads on the page background. |
| `assets/favicon.ico` | `favicon` key | Copied to `<output>/assets/favicon.ico` and linked as the page icon. |

`assets/` here is only for the site chrome (logo, favicon, other branding). Files that docs link to (OpenAPI specs, PDFs, zips) are not kept there: list their source folders in a section's `assets` key and they are copied to `<output>/<section-id>/<folder-name>/`.

A second site gets its own config (for example `docs-partner.config.json`, referencing its own theme and logo files), selected with `--config`.

## Adding another build script

`build.mjs` builds one config. When a site needs extra steps (here: keep only some files of a copied asset folder), wrap it in a `build-<name>.mjs` next to `build.mjs`:

1. Copy the template: `cp build-script.mjs.example build-partner.mjs`.
2. Set `CONFIG` to your config (for example `docs-partner.config.json`) and `OUT` to the same folder as the config's `output`.
3. Fill `KEEP` if some copied asset folders must only publish certain files (key: folder relative to `OUT`, value: file names to keep), or leave it `{}`.
4. Add any other step after the `execFileSync` call (copy files, write a version stamp, ...). Keep the build call first, since it recreates the output sections.
5. Run `node build-partner.mjs`.

`build-*.mjs` scripts and `docs.config.json` are git-ignored in this repo (they are per-project); `build-script.mjs.example` is the tracked template. `build-user-guides.mjs` is the working example (Open SNS user guide, output `backend/user-guides/`). Optional: add an npm script in `package.json`, for example `"build:partner": "node build-partner.mjs"`.

## Notes

- Mermaid diagrams are rendered in the browser; the script is loaded from the jsDelivr CDN only on pages that contain a `mermaid` code block.
- Serve the output folder from any static web server (or open `index.html` directly).
