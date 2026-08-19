'use strict';

const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const app = express();
app.use(express.json({ limit: '64kb' }));

const PORT = process.env.PORT || 3000;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const LOG_TAB = 'Log';

const HEADERS = [
  'Timestamp', 'User', 'Channel', 'Campaign Type', 'UTM Campaign',
  'UTM Medium', 'UTM Source', 'UTM Content', 'UTM Term',
  'Destination URL', 'Final Tagged URL',
];

const REQUIRED_FIELDS = ['user', 'channel', 'utm_campaign', 'utm_medium', 'utm_source', 'finalUrl'];

function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureLogSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === LOG_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: LOG_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${LOG_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

const trim = v => (v == null ? '' : String(v).trim().slice(0, 500));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/log', async (req, res) => {
  try {
    const { rows } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ status: 'error', message: 'rows must be a non-empty array' });
    if (rows.length > 50)
      return res.status(400).json({ status: 'error', message: 'max 50 rows per request' });

    for (const row of rows) {
      for (const field of REQUIRED_FIELDS) {
        if (!row[field] || !String(row[field]).trim())
          return res.status(400).json({ status: 'error', message: `missing required field: ${field}` });
      }
    }

    const sheets = getSheetsClient();
    await ensureLogSheet(sheets);

    const now = new Date().toISOString();
    const values = rows.map(r => [
      now,
      trim(r.user),
      trim(r.channel),
      trim(r.campaignType),
      trim(r.utm_campaign),
      trim(r.utm_medium),
      trim(r.utm_source),
      trim(r.utm_content),
      trim(r.utm_term),
      trim(r.destinationUrl),
      trim(r.finalUrl),
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${LOG_TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    res.json({ status: 'ok', logged: rows.length });
  } catch (err) {
    console.error('POST /api/log error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to write to sheet' });
  }
});

app.listen(PORT, () => console.log(`UTM Builder listening on :${PORT}`));
