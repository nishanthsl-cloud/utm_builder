'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

function loadApp() {
  return new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://utm-builder.test/' });
}

function withApp(fn) {
  const dom = loadApp();
  try {
    fn(dom.window.document, dom.window);
  } finally {
    dom.window.close(); // cancels pending timers (e.g. the auto-log setTimeout) before the test ends
  }
}

function fireEvent(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true }));
}

function setValue(doc, win, id, value) {
  const el = doc.getElementById(id);
  el.value = value;
  fireEvent(win, el, 'input');
  fireEvent(win, el, 'change');
}

function checkChannel(doc, win, chanId, checked = true) {
  const cb = doc.querySelector(`input[data-chan="${chanId}"]`);
  cb.checked = checked;
  fireEvent(win, cb, 'change');
}

function setSubfield(doc, win, chanId, field, value) {
  const el = doc.querySelector(`[data-field="${field}"][data-chan="${chanId}"]`);
  el.value = value;
  fireEvent(win, el, 'input');
  fireEvent(win, el, 'change');
}

function getFinalUrls(doc) {
  return Array.from(doc.querySelectorAll('.url-mono')).map(el => el.textContent);
}

function fillBaseForm(doc, win, { campaignType, destUrl, campaignName }) {
  setValue(doc, win, 'userName', 'jane@thoughtspot.com');
  setValue(doc, win, 'campaignType', campaignType);
  setValue(doc, win, 'campaignName', campaignName || 'q3-podcast-launch');
  setValue(doc, win, 'destUrl', destUrl || 'https://example.com/podcast/episode-2');
}

test('Campaign Type dropdown is config-driven and includes Podcast + Blog while preserving existing options', () => {
  withApp((doc) => {
    const values = Array.from(doc.getElementById('campaignType').options).map(o => o.value);
    assert.deepEqual(values, ['', 'Event', 'Webinar', 'Content Syndication', 'Newsletter', 'Website', 'Podcast', 'Blog']);
  });
});

test('Campaign Type helper copy reflects that some types prefill UTM fields', () => {
  withApp((doc) => {
    const hints = Array.from(doc.querySelectorAll('.hint')).map(h => h.textContent);
    assert.ok(hints.some(h => h.includes('Some campaign types may prefill recommended UTM fields')));
  });
});

test('Podcast Details section and Blog hint toggle correctly by Campaign Type, no Podcast/Blog channel tiles exist', () => {
  withApp((doc, win) => {
    assert.equal(doc.querySelector('[data-chan="podcast"]'), null);
    assert.equal(doc.querySelector('[data-chan="blog"]'), null);

    setValue(doc, win, 'campaignType', 'Webinar');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'none');
    assert.equal(doc.getElementById('blogHint').style.display, 'none');

    setValue(doc, win, 'campaignType', 'Podcast');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'block');
    assert.equal(doc.getElementById('blogHint').style.display, 'none');

    setValue(doc, win, 'campaignType', 'Blog');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'none');
    assert.equal(doc.getElementById('blogHint').style.display, 'block');
  });
});

test('Episode number validation rejects missing/0/negative/non-numeric and accepts positive integers', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    const cases = ['', '0', '-1', 'abc', '2.5', ' '];
    cases.forEach(v => {
      setValue(doc, win, 'episodeNumber', v);
      assert.equal(doc.getElementById('err-episodeNumber').classList.contains('show'), true, `expected error for "${v}"`);
      assert.equal(getFinalUrls(doc).length, 0, `expected no rows for "${v}"`);
    });

    ['1', '2', '17', '100'].forEach(v => {
      setValue(doc, win, 'episodeNumber', v);
      assert.equal(doc.getElementById('err-episodeNumber').classList.contains('show'), false, `expected no error for "${v}"`);
      assert.equal(getFinalUrls(doc).length, 1, `expected a row for "${v}"`);
    });
  });
});

test('Podcast term auto-fills as ep-{n} and flows into the generated URL alongside channel source/medium', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast', campaignName: 'data-ai-chief', destUrl: 'https://example.com/podcast/episode-2' });
    setValue(doc, win, 'episodeNumber', '2');
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    const termInput = doc.querySelector('[data-field="term"][data-chan="organic_social"]');
    assert.equal(termInput.value, 'ep-2');

    const urls = getFinalUrls(doc);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /utm_source=linkedin/);
    assert.match(urls[0], /utm_medium=social/);
    assert.match(urls[0], /utm_term=ep-2/);
    assert.match(urls[0], /utm_campaign=data-ai-chief/);
  });
});

test('Episode number change refreshes auto-filled Terms but never overwrites a manually edited Term', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    setValue(doc, win, 'episodeNumber', '2');

    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');
    checkChannel(doc, win, 'paid_social');
    setSubfield(doc, win, 'paid_social', 'source', 'linkedin');

    setSubfield(doc, win, 'paid_social', 'term', 'ep-2-linkedin-clip'); // manual override

    setValue(doc, win, 'episodeNumber', '3');

    assert.equal(doc.querySelector('[data-field="term"][data-chan="organic_social"]').value, 'ep-3');
    assert.equal(doc.querySelector('[data-field="term"][data-chan="paid_social"]').value, 'ep-2-linkedin-clip');
  });
});

test('Selecting a new channel after the episode number is set prefills that channel Term too', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    setValue(doc, win, 'episodeNumber', '2');
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    checkChannel(doc, win, 'paid_social');
    setSubfield(doc, win, 'paid_social', 'source', 'twitter');

    assert.equal(doc.querySelector('[data-field="term"][data-chan="paid_social"]').value, 'ep-2');
  });
});

test('Blog does not force utm_source/medium/content=blog; the selected channel mapping is used as-is', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Blog', destUrl: 'https://example.com/blog/my-post' });
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    const urls = getFinalUrls(doc);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /utm_source=linkedin/);
    assert.match(urls[0], /utm_medium=social/);
    assert.ok(!urls[0].includes('utm_source=blog'));
    assert.ok(!urls[0].includes('utm_medium=blog'));
    assert.ok(!urls[0].includes('utm_content=blog'));
  });
});

test('Blog across Email and Partner channels uses the existing channel mapping unchanged', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Blog', destUrl: 'https://example.com/blog/my-post' });
    checkChannel(doc, win, 'email_invite_hubspot');
    setSubfield(doc, win, 'email_invite_hubspot', 'content', 'newsletter');
    checkChannel(doc, win, 'partner_website');

    const urls = getFinalUrls(doc);
    assert.equal(urls.length, 2);
    assert.ok(urls.some(u => u.includes('utm_source=hubspot') && u.includes('utm_medium=email')));
    assert.ok(urls.some(u => u.includes('utm_source=partner') && u.includes('utm_medium=referral')));
  });
});

test('Switching Podcast -> another Campaign Type preserves existing Term values and hides Podcast Details', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    setValue(doc, win, 'episodeNumber', '2');
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');
    assert.equal(doc.querySelector('[data-field="term"][data-chan="organic_social"]').value, 'ep-2');

    setValue(doc, win, 'campaignType', 'Newsletter');

    assert.equal(doc.querySelector('[data-field="term"][data-chan="organic_social"]').value, 'ep-2');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'none');
  });
});

test('Blog -> Podcast: entering an episode number prefills empty Terms for already-checked channels', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Blog', destUrl: 'https://example.com/blog/my-post' });
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    setValue(doc, win, 'campaignType', 'Podcast');
    setValue(doc, win, 'episodeNumber', '5');

    assert.equal(doc.querySelector('[data-field="term"][data-chan="organic_social"]').value, 'ep-5');
  });
});

test('Existing non-Podcast/Blog channel behavior is unaffected (regression)', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Webinar', destUrl: 'https://go.thoughtspot.com/webinar', campaignName: 'tableautakeout' });
    checkChannel(doc, win, 'email_invite_hubspot');
    setSubfield(doc, win, 'email_invite_hubspot', 'content', 'pre-webinar');

    const urls = getFinalUrls(doc);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /utm_source=hubspot/);
    assert.match(urls[0], /utm_medium=email/);
    assert.match(urls[0], /utm_content=pre-webinar/);
    assert.match(urls[0], /utm_campaign=tableautakeout/);
  });
});

test('Reset clears episode number, hides Podcast Details, and clears channel state', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    setValue(doc, win, 'episodeNumber', '2');
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    fireEvent(win, doc.getElementById('resetBtn'), 'click');

    assert.equal(doc.getElementById('campaignType').value, '');
    assert.equal(doc.getElementById('episodeNumber').value, '');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'none');
    assert.equal(doc.querySelector('input[data-chan="organic_social"]').checked, false);
  });
});

test('Load Example does not leave the app in an invalid Podcast state', () => {
  withApp((doc, win) => {
    // put the app into Podcast state first, then load the example
    fillBaseForm(doc, win, { campaignType: 'Podcast' });
    setValue(doc, win, 'episodeNumber', '2');

    fireEvent(win, doc.getElementById('loadExampleBtn'), 'click');

    assert.notEqual(doc.getElementById('campaignType').value, 'Podcast');
    assert.equal(doc.getElementById('podcastDetails').style.display, 'none');
    assert.equal(doc.getElementById('err-episodeNumber').classList.contains('show'), false);
    assert.ok(getFinalUrls(doc).length >= 1);
  });
});

test('Destination URLs that already contain query parameters still append utm params with "&"', () => {
  withApp((doc, win) => {
    fillBaseForm(doc, win, { campaignType: 'Podcast', destUrl: 'https://example.com/podcast?ref=homepage' });
    setValue(doc, win, 'episodeNumber', '2');
    checkChannel(doc, win, 'organic_social');
    setSubfield(doc, win, 'organic_social', 'source', 'linkedin');

    const urls = getFinalUrls(doc);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith('https://example.com/podcast?ref=homepage&'));
    assert.match(urls[0], /utm_term=ep-2/);
  });
});
