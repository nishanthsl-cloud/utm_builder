/**
 * UTM Builder — logging backend.
 *
 * Setup:
 * 1. Create a new Google Sheet (this becomes your tracking log).
 * 2. Extensions > Apps Script.
 * 3. Delete any placeholder code, paste this file's contents in.
 * 4. Save. Deploy > New deployment > Type: Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone (required so the tool can POST without a Google login)
 * 5. Click Deploy, copy the Web App URL.
 * 6. Paste that URL into CONFIG.ENDPOINT_URL in index.html.
 */

const LOG_SHEET_NAME = "Log";
const HEADERS = [
  "Timestamp", "User", "Channel", "Campaign Type", "UTM Campaign",
  "UTM Medium", "UTM Source", "UTM Content", "UTM Term",
  "Destination URL", "Final Tagged URL"
];

function doPost(e) {
  try {
    const sheet = getOrCreateLogSheet();
    const data = JSON.parse(e.postData.contents);
    const rows = Array.isArray(data.rows) ? data.rows : [data];

    rows.forEach(r => {
      sheet.appendRow([
        new Date(),
        r.user || "",
        r.channel || "",
        r.campaignType || "",
        r.utm_campaign || "",
        r.utm_medium || "",
        r.utm_source || "",
        r.utm_content || "",
        r.utm_term || "",
        r.destinationUrl || "",
        r.finalUrl || ""
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", logged: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Optional: run this once manually from the Apps Script editor to pre-create
// the Log sheet + headers without waiting for the first real submission.
function initLogSheet() {
  getOrCreateLogSheet();
}
