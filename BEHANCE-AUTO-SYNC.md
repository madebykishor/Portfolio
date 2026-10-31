# Automatic Behance projects and video sync

Profile: https://www.behance.net/madebykishor

## Already wired up
- `config/behance.json` selects the profile, known collections, timeouts and cache.
- `api/behance.mjs` is the same-origin read-only JSON endpoint.
- `lib/behance.mjs` discovers public projects and parses supported embedded video players.
- `sync-client.js` refreshes on page load, periodically while a tab is visible, and when returning online.
- `data/portfolio.json` is the saved fallback if Behance is unavailable.

## Run locally
Requires Node.js 22. In this folder run `npm run dev`, then visit http://localhost:3000/work.html and http://localhost:3000/sync-status.html. Do not open the HTML with file:// if you expect live synchronization.

## Deploy
Deploy to a host that executes the Node server (`npm start`) or supports the `/api/behance` serverless route. A static-only HTML host cannot perform the server-side Behance fetch. After deploying, visit `/sync-status.html` to verify status. The server response must be live or partial for fresh imports; unavailable means the saved fallback is displayed.

## New projects
Publish publicly to the same Behance profile. The adapter tries to discover new public projects; if Behance blocks discovery or changes its page structure, new projects may not appear. In that case add the published project ID and URL to `projectSources` in `config/behance.json`, and confirm the sync status. Existing configured collections are already checked.

## Videos
Supported public embedded video players: Adobe CCV, YouTube, Vimeo and Google Drive preview. Unsupported video modules, Behance-native video formats or restricted videos cannot be guaranteed to import or play. The system uses the actual source title or original filename when metadata is available, not invented names.

## Timing
Browser checks are periodic while a tab is visible, not a webhook or guaranteed background job. Server responses are cached for 15 minutes by default. For automatic background updates even without visitors, configure a scheduled server-side refresh separately.

## Troubleshooting
- `file://` local preview: start the Node server.
- `unavailable`: inspect server logs and check Behance accessibility.
- Video missing: verify its embed player is supported and publicly accessible.
- Project missing: verify ownership, public visibility and profile discovery; optionally add to `projectSources`.
