# Kixor — Editorial Portfolio

A restrained, responsive portfolio with premium day/night themes and motion.

## Run locally

Requires Node.js 22. Run `npm install` then `npm run dev`. Open the localhost URL printed in the terminal.

## Edit quickly

- `index.html` — homepage text and sections
- `work.html` — project gallery page
- `data/portfolio.json` — portfolio content and video links
- `css/editorial.css` — editorial palette, typography and finishing touches
- `css/theme.css` — day/night switch styling
- `css/enhancements.css` — motion styling
- `js/theme.js`, `js/enhancements.js` — interactions
- `assets/` — actual image, icon and resume files; keep original descriptive filenames

## Important supporting files

The root JavaScript modules, `api/`, `lib/`, `config/`, `tools/`, `tests/`, and `server.mjs` are retained because they support the portfolio gallery, external video links, Behance sync, builds or regression tests. Do not delete them without checking references.

## Verify

Run `npm test` and `npm run build`. Check both themes on mobile and desktop before publishing.

No original video files were supplied; external links remain unchanged.


## Daylight editorial edition
The night-mode toggle and theme scripts have been removed. Edit `css/contrast-gradient.css` for daylight colors and `css/daylight-motion.css` for premium animations.

### Video titles
Original owner-provided filenames are preserved in `original-video-names.js`. Existing `video-titles.js` matches only verified video identities; hosted videos without a confirmed match are deliberately not renamed. Update the mapping only when the original video identity is known.


## Premium buttons and video popup
Edit `css/premium-ui.css` for button colors, border radius, hover motion, dialog entrance and overlay blur. Run `npm run build` to generate the deployment files automatically. Reduced-motion settings are respected.


### Work cards and popup styling
Edit `css/work-polish.css` for card borders, typography contrast, hover motion, and video popup transitions. Run `npm run build` to generate the deployment files automatically.


## Clean folder structure

- `index.html`, `work.html`: main pages
- `style.css`, `css/`: base styles and editorial motion styling
- `script.js`, `js/`: website interactions
- `assets/`: original named media, cover images, optimized thumbnails and resume
- `data/`, `config/`: portfolio content and Behance settings
- `api/`, `lib/`: Behance integration (do not delete if using sync)
- `tools/`, `tests/`: build and validation tools (not deployed)
- `public/`: **generated** deployment folder; not included in source ZIP. Run `npm run build` to recreate.

To preview locally: `npm run dev`. To validate: `npm test`. To deploy on Vercel: `npm run build`. Keep the original content-based video filenames and external video URLs intact.
