# UTM Builder — Standalone Setup

Two files, no server required:
- `index.html` — the tool itself. Open it in a browser, or host it anywhere static (internal site, S3, Google Sites, etc.) so your team can reach it.
- `Code.gs` — a small Google Apps Script backend that logs every copied UTM into a Google Sheet.

## 1. Create the tracking sheet

1. Create a new Google Sheet — this will hold the log. Name it something like "UTM Builder Log."
2. In that sheet, go to **Extensions > Apps Script**.
3. Delete the placeholder code in the editor, and paste in the full contents of `Code.gs`.
4. Save (Ctrl/Cmd+S).
5. (Optional) Run the `initLogSheet` function once from the editor (▶ button, select `initLogSheet` from the dropdown) to pre-create the "Log" tab with headers. Otherwise it's created automatically on the first real submission.

## 2. Deploy it as a Web App

1. In the Apps Script editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**. Google will ask you to authorize the script — approve it (it's your own script, acting on your own Sheet).
5. Copy the **Web app URL** it gives you. It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

## 3. Connect the tool to that URL

1. Open `index.html` in a text editor.
2. Find this line near the top of the `<script>` block:
   ```js
   const CONFIG = {
     ENDPOINT_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE"
   };
   ```
3. Replace the placeholder with the URL you copied. Save the file.

## 4. Distribute it

- Host `index.html` wherever your team can reach it (internal wiki page, static site, shared drive with instructions to download-and-open, etc.) — it's a single self-contained file, no build step, no dependencies.
- Every teammate who uses the same file will log to the same Sheet.

## What gets logged, and when

- Logging happens when someone clicks **Copy** on an individual row, or **Copy all & log**. It does not log on every keystroke — only on an actual copy action, so the sheet reflects real usage rather than in-progress edits.
- Each log row captures: timestamp, the name/email typed into "Your Name / Email," channel, campaign type, and the full UTM breakdown plus final tagged URL.

## Updating the taxonomy later

All channel definitions, source options, and the Content dropdown list live near the top of `index.html` in the `CHANNELS` and `CONTENT_OPTIONS` constants. Editing the taxonomy means editing this file directly and re-distributing it — there's no separate admin UI. If that becomes a bottleneck, consider migrating `CHANNELS`/`CONTENT_OPTIONS` to read from a tab in the same Google Sheet instead of being hardcoded — that's a bigger change than this version supports today, but reasonably concrete: same Sheet, same Apps Script, an added `doGet` endpoint the page calls on load.

## Notes / limitations carried over from the AgentSpot version

- One destination URL per run. Campaigns that hit multiple landing pages (e.g. a newsletter tagging 8 different pages) need multiple runs.
- Duplicate detection only compares the final assembled URL, not individual fields.
- There's no authentication — anyone with the file and the endpoint URL can submit rows. Fine for an internal trusted team; if that's a concern, restrict distribution of `index.html` rather than relying on the Apps Script's own access controls.
