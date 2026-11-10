import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { localFinderAnnouncementsManagementMarkup } from './admin-promotions.js';
import { bindLocalFinderLocationPicker, bindLocalFinderOpeningHours, bindLocalFinderPlacePhotoPreview, findLocalFinderDuplicate, localFinderAdminFormFields, normalizeLocalFinderPetAllowed, requestLocalFinderQuota, saveLocalFinderPlaceData, showLocalFinderDuplicateNotice } from './local-finder.js';

const categoryNames = { cafe: 'Cafe & Dining', park: 'Park or Mall', clinic: 'Pet Clinic', event: 'Pet Event' };
const categoryKeys = new Map([
  ['cafe', 'cafe'], ['cafe_dining', 'cafe'], ['park', 'park'], ['park_or_mall', 'park'],
  ['clinic', 'clinic'], ['pet_clinic', 'clinic'], ['event', 'event'], ['pet_event', 'event'],
]);

const coordinateCacheKey = 'furgo-local-finder-osm-coordinate-cache-v1';
const coordinateCacheTtl = 90 * 24 * 60 * 60 * 1000;
const osmLastRequestKey = 'furgo-local-finder-osm-last-request-at';
const osmMinimumRequestInterval = 1100;
const osmRequestTimeoutMs = 12000;
let lastOsmRequestAt = 0;
function coordinateLookupKey(place = {}) {
  return [place.name, place.address, place.city, place.state, 'Malaysia']
    .map((part) => String(part || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')).join('|');
}
function readCoordinateCache(place) {
  try {
    const cache = JSON.parse(localStorage.getItem(coordinateCacheKey) || '{}');
    const key = coordinateLookupKey(place);
    const entry = cache[key];
    if (!entry) return null;
    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
      delete cache[key];
      localStorage.setItem(coordinateCacheKey, JSON.stringify(cache));
      return null;
    }
    return entry;
  } catch { return null; }
}
function writeCoordinateCache(place, entry) {
  try {
    const cache = JSON.parse(localStorage.getItem(coordinateCacheKey) || '{}');
    const now = Date.now();
    for (const [key, cached] of Object.entries(cache)) if (!Number.isFinite(cached.expiresAt) || cached.expiresAt <= now) delete cache[key];
    cache[coordinateLookupKey(place)] = { ...entry, expiresAt: Math.min(entry.expiresAt || now + coordinateCacheTtl, now + coordinateCacheTtl) };
    localStorage.setItem(coordinateCacheKey, JSON.stringify(cache));
  } catch { /* The import still works if browser storage is unavailable. */ }
}
function applyCachedCoordinates(place) {
  const cached = readCoordinateCache(place);
  if (!cached?.coordinates) return cached;
  place.latitude = cached.coordinates.latitude;
  place.longitude = cached.coordinates.longitude;
  place.coordinates_source = 'openstreetmap_nominatim';
  place.coordinates_expires_at = null;
  return cached;
}
async function lookupOpenStreetMapCoordinates(place) {
  const address = String(place.address || '').trim();
  const addressKey = address.toLocaleLowerCase();
  const queryParts = [address];
  for (const part of [place.city, place.state, 'Malaysia']) {
    const value = String(part || '').trim();
    if (value && !addressKey.includes(value.toLocaleLowerCase())) queryParts.push(value);
  }
  const query = queryParts.join(', ');
  let storedLastRequestAt = 0;
  try { storedLastRequestAt = Number(localStorage.getItem(osmLastRequestKey)) || 0; } catch { /* In-memory pacing still applies. */ }
  const lastRequestAt = Math.max(lastOsmRequestAt, storedLastRequestAt);
  const waitMs = Math.max(0, osmMinimumRequestInterval - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), osmRequestTimeoutMs);
  try {
    lastOsmRequestAt = Date.now();
    try { localStorage.setItem(osmLastRequestKey, String(lastOsmRequestAt)); } catch { /* In-memory pacing still applies. */ }
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'my' }).toString();
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (response.status === 429) throw new Error('OpenStreetMap is rate-limiting lookups. Wait a little and retry.');
    if (!response.ok) throw new Error(`OpenStreetMap lookup returned HTTP ${response.status}. Retry later.`);
    const results = await response.json();
    const result = results.find((item) => item.address?.country_code?.toLowerCase() === 'my' && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)));
    if (!result) return null;
    return { latitude: Number(result.lat), longitude: Number(result.lon) };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('OpenStreetMap did not respond within 12 seconds. Check the connection and retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error('The CSV has an unclosed quote. Check quoted values and try again.');
  return rows;
}

function normalizeCsvHeader(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function csvBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || ['false', 'no', '0', 'inactive'].includes(normalized)) return false;
  if (['true', 'yes', '1', 'active'].includes(normalized)) return true;
  throw new Error('is_verified must be true/false, yes/no, or 1/0.');
}
function normalizedPlaceKey(name, address) { return `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${address.trim().toLowerCase().replace(/\s+/g, ' ')}`; }

function safeReviewUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function googleMapsReviewUrl(place = {}) {
  const hasCoordinates = place.latitude !== null && place.latitude !== undefined && place.latitude !== ''
    && place.longitude !== null && place.longitude !== undefined && place.longitude !== ''
    && Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude));
  const query = hasCoordinates ? `${place.latitude},${place.longitude}` : [place.name, place.address].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function reviewLinks(place = {}, { website = place.website, sourceUrl = place.source_url } = {}) {
  const links = [];
  const mapsUrl = googleMapsReviewUrl(place);
  const safeWebsite = safeReviewUrl(website);
  const safeSource = safeReviewUrl(sourceUrl);
  if (mapsUrl) links.push(`<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`);
  if (safeWebsite) links.push(`<a href="${escapeHTML(safeWebsite)}" target="_blank" rel="noopener noreferrer">Open website</a>`);
  if (safeSource && safeSource !== safeWebsite) links.push(`<a href="${escapeHTML(safeSource)}" target="_blank" rel="noopener noreferrer">Open source</a>`);
  return links.length ? `<nav class="admin-local-finder-review-links" aria-label="Place review links">${links.join('')}</nav>` : '';
}

function validatePlaceCsv(text) {
  const sourceRows = parseCsvRows(text);
  if (sourceRows.length < 2) throw new Error('Add a header row and at least one place row to the CSV.');
  if (sourceRows.length > 501) throw new Error('Import up to 500 places at a time. Split the CSV into smaller files.');
  const headers = sourceRows[0].map(normalizeCsvHeader);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  for (const required of ['name', 'category', 'address']) {
    if (!indexByHeader.has(required)) throw new Error(`The CSV is missing the required "${required}" column.`);
  }
  const parsed = [];
  const errors = [];
  for (let rowIndex = 1; rowIndex < sourceRows.length; rowIndex += 1) {
    const cells = sourceRows[rowIndex];
    const get = (key) => String(cells[indexByHeader.get(key)] || '').trim();
    const line = rowIndex + 1;
    try {
      const name = get('name');
      const categoryInput = normalizeCsvHeader(get('category'));
      const category = categoryKeys.get(categoryInput);
      const address = get('address');
      if (name.length < 2 || name.length > 140) throw new Error('name must be 2–140 characters.');
      if (!category) throw new Error('category must be Cafe & Dining, Park or Mall, Pet Clinic, or Pet Event.');
      if (address.length < 3 || address.length > 500) throw new Error('address must be 3–500 characters.');
      const petAllowedInput = get('pet_allowed');
      if (petAllowedInput && !['dog', 'cat', 'all'].includes(petAllowedInput.toLowerCase())) throw new Error('pet_allowed must be Dog, Cat, All, or blank.');
      const petAllowed = normalizeLocalFinderPetAllowed(petAllowedInput);
      const latitudeInput = get('latitude');
      const longitudeInput = get('longitude');
      if (Boolean(latitudeInput) !== Boolean(longitudeInput)) throw new Error('latitude and longitude must both be filled in or both be blank.');
      const latitude = latitudeInput ? Number(latitudeInput) : null;
      const longitude = longitudeInput ? Number(longitudeInput) : null;
      if (latitudeInput && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error('latitude must be between -90 and 90.');
      if (longitudeInput && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('longitude must be between -180 and 180.');
      const website = get('website');
      if (website && !['http:', 'https:'].includes(new URL(website).protocol)) throw new Error('website must start with http:// or https://.');
      const photoUrl = get('photo_url');
      if (photoUrl && !['http:', 'https:'].includes(new URL(photoUrl).protocol)) throw new Error('photo_url must start with http:// or https://.');
      const sourceUrl = get('source_url');
      if (sourceUrl && !['http:', 'https:'].includes(new URL(sourceUrl).protocol)) throw new Error('source_url must start with http:// or https://.');
      const sourceProvider = get('source_provider');
      const sourceLicense = get('source_license');
      if (sourceProvider.toLowerCase() === 'openstreetmap' && (!sourceUrl || sourceLicense.toLowerCase() !== 'odbl-1.0')) {
        throw new Error('OpenStreetMap rows need their per-place source_url and ODbL-1.0 source_license.');
      }
      parsed.push({
        line,
        key: normalizedPlaceKey(name, address),
        data: {
          name, category, address, city: get('city'), state: get('state'), latitude, longitude,
          coordinates_source: latitude === null ? null : 'imported', coordinates_expires_at: null,
          allowed_area: get('allowed_area'), pet_allowed: petAllowed, pet_size: get('pet_size'),
          conditions: get('conditions'), opening_hours: { raw: get('opening_hours') }, phone: get('phone'), website,
          photo_url: photoUrl, is_verified: csvBoolean(get('is_verified')),
          source_provider: sourceProvider, source_url: sourceUrl, source_license: sourceLicense,
        },
      });
    } catch (error) { errors.push(`Row ${line}: ${error.message || 'Invalid data.'}`); }
  }
  return { parsed, errors };
}

const localFinderCsvTemplate = 'name,category,address,city,state,latitude,longitude,allowed_area,pet_allowed,pet_size,conditions,opening_hours,phone,website,photo_url,is_verified,source_provider,source_url,source_license\n"Example Pet Cafe",cafe,"Example Street 1",Petaling Jaya,Selangor,3.107,101.606,Outdoor only,Dog,All sizes,Leash required,"Monday-Friday: 9:00am-6:00pm",+60312345678,https://example.com,,false,Furgo,https://example.com/pet-policy,\n';

function adminPlaceCard(place, counts = {}, view = 'review') {
  const status = place.is_hidden ? 'Hidden' : place.status === 'approved' ? 'Published' : 'Pending Review';
  const links = reviewLinks(place);
  const selection = view === 'review' ? `<label class="admin-local-finder-select"><input type="checkbox" data-local-place-select value="${escapeHTML(place.id)}" /><span>Select place</span></label>` : '';
  const actions = view === 'published' ? `<div class="admin-local-finder-actions"><button class="button button-light" type="button" data-local-edit-place> Edit Place </button><button class="button button-light" type="button" data-local-toggle-hidden>${place.is_hidden ? 'Unhide Place' : 'Hide Place'}</button><button class="button button-light" type="button" data-local-verify>${place.is_verified ? 'Remove Furgo Verified' : 'Mark Furgo Verified'}</button><button class="button button-light" type="button" data-local-delete-place>Delete Place</button></div>` : '';
  const editDialog = view === 'published' ? `<dialog class="local-finder-share-dialog" data-local-place-edit-dialog aria-labelledby="local-place-edit-title"><form class="local-finder-suggestion-form" data-local-place-edit-form data-place-id="${escapeHTML(place.id)}" data-existing-photo="${escapeHTML(place.photo_url || '')}"><header><div><span>Published listing</span><h2 id="local-place-edit-title">Edit Place</h2></div><button type="button" data-close-local-place-edit aria-label="Close">×</button></header>${localFinderAdminFormFields({ values: place })}<label class="admin-local-verified-input"><input type="checkbox" name="is_verified" ${place.is_verified ? 'checked' : ''} /> Furgo Verified</label><p class="local-finder-suggestion-feedback" data-local-place-edit-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Save Changes</button></form></dialog>` : '';
  return `<article class="admin-local-finder-card" data-local-place-card="${escapeHTML(place.id)}" data-place-category="${escapeHTML(place.category || '')}"><div class="admin-local-finder-card-main">${place.photo_url ? `<img src="${escapeHTML(place.photo_url)}" alt="" />` : '<div class="admin-local-finder-photo-placeholder">No Photo</div>'}<div><span>${escapeHTML(categoryNames[place.category] || place.category)} · <b class="admin-local-finder-status ${place.is_hidden ? 'is-hidden' : 'is-approved'}">${status}</b></span><h3>${escapeHTML(place.name)}</h3><p>${escapeHTML(place.address)}</p><p>Pets: ${escapeHTML(normalizeLocalFinderPetAllowed(place.pet_allowed) || 'Not specified')}</p><small>${counts[place.id] || 0} Furgomate Recommended${place.is_verified ? ' · Furgo Verified' : ''}</small>${place.source_provider ? `<p class="admin-local-finder-source">Source: ${escapeHTML(place.source_provider)}${place.source_license ? ` · ${escapeHTML(place.source_license)}` : ''}</p>` : ''}${links}</div></div>
    ${selection}${actions}${editDialog}</article>`;
}

function adminEditCard(edit, place) {
  const changes = edit.proposed_changes || {};
  const suggestedPlace = { ...place, ...changes, name: changes.name || place?.name, address: changes.address || place?.address };
  const links = reviewLinks(suggestedPlace, { website: changes.website || place?.website, sourceUrl: place?.source_url });
  const fields = [
    ['Place name', changes.name], ['Address', changes.address], ['Allowed Area', changes.allowed_area],
    ['Pets Allowed', normalizeLocalFinderPetAllowed(changes.pet_allowed)], ['Pet Size', changes.pet_size], ['Conditions', changes.conditions],
    ['Opening Hours', changes.opening_hours?.raw], ['Phone', changes.phone], ['Website', changes.website],
  ].filter(([, value]) => value);
  return `<article class="admin-local-finder-card" data-local-edit-card="${escapeHTML(edit.id)}" data-place-category="${escapeHTML(place?.category || '')}"><span>Edit suggestion · ${escapeHTML(categoryNames[place?.category] || '')}</span><h3>${escapeHTML(place?.name || 'Place')}</h3><dl class="admin-local-finder-change-list">${fields.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>${links}${safeReviewUrl(changes.photo_url) ? `<a href="${escapeHTML(safeReviewUrl(changes.photo_url))}" target="_blank" rel="noopener noreferrer">View suggested photo</a>` : ''}<div class="admin-local-finder-actions"><button class="button button-primary" type="button" data-local-review-edit="approve">Approve Edit</button><button class="button button-light" type="button" data-local-review-edit="reject">Reject</button></div></article>`;
}

export function adminLocalFinderPage(params = new URLSearchParams()) {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  if (!['manager', 'director', 'admin'].includes(profile.role)) return `<main class="admin-portal-page"><section class="admin-market-panel"><h1>Local Finder</h1><p>Manager or Director access is required.</p><a class="button button-primary" href="#admin">Back to Admin Home</a></section></main>`;
  const view = params.get('view') || 'home';
  const pageHeading = view === 'review' ? 'Review Places' : view === 'edits' ? 'Review Edit Suggestions' : view === 'published' ? 'Published Places' : view === 'add' ? 'Add a Place' : view === 'import' ? 'Import Places from CSV' : 'Places & Suggestions';
  const addPlaceSection = `<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Admin entry</span><h2>Add a Place</h2></div><p>Manager and Director entries publish immediately. Furgo Verified is optional.</p></div><form class="local-finder-suggestion-form admin-local-finder-direct-form" data-admin-local-place-form>${localFinderAdminFormFields()}<label class="admin-local-verified-input"><input type="checkbox" name="is_verified" /> Mark Furgo Verified</label><p data-admin-local-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Publish Place</button></form></section>`;
  const importPlacesSection = `<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Bulk entry</span><h2>Import Places from CSV</h2></div><p>Imported places stay pending until a Manager or Director approves them. Set pet_allowed to Dog, Cat, or All when specified; leave it blank when the source does not say.</p></div><div class="admin-local-finder-import"><div class="admin-local-finder-import-controls"><label>CSV file<input type="file" data-local-finder-csv-file accept=".csv,text/csv" /></label><a class="button button-light" href="data:text/csv;charset=utf-8,${encodeURIComponent(localFinderCsvTemplate)}" download="furgo-local-finder-template.csv">Download CSV Template</a></div><p class="admin-local-finder-import-help">Required columns: <b>name, category, address</b>. Optional columns: pet_allowed (Dog, Cat, All, or blank), city, state, latitude, longitude, allowed_area, pet_size, conditions, opening_hours, phone, website, photo_url, is_verified, source_provider, source_url, source_license. Categories: <b>cafe</b>, <b>park</b>, <b>clinic</b>, or <b>event</b>. Imports are unverified and pending review. Rows without coordinates are looked up with OpenStreetMap Nominatim, one request at a time; unresolved rows are not imported. OpenStreetMap data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</p><p data-local-finder-import-feedback role="status" aria-live="polite">Choose a CSV to check its rows before importing.</p><ul data-local-finder-import-errors class="admin-local-finder-import-errors" hidden></ul><button class="button button-primary" type="button" data-local-finder-import disabled>Import for Review</button></div></section>`;
  const adminEntryWorkspace = view === 'home' ? `
    <section class="local-finder-share-card admin-local-finder-entry-banner" aria-labelledby="admin-local-finder-entry-title">
      <img class="local-finder-share-art" src="Image/Icon/MVP%20Icon-06.png" alt="Furgo dog pointing out places on a map" />
      <div><h2 id="admin-local-finder-entry-title">Add or Import Places</h2><p>Add a place directly or import multiple listings from a CSV file.</p><div class="admin-local-finder-entry-actions"><button class="button button-primary" type="button" data-admin-local-entry-target="add" data-admin-local-entry-route="#admin-local-finder?view=add">Add a Place</button><button class="button button-light" type="button" data-admin-local-entry-target="import" data-admin-local-entry-route="#admin-local-finder?view=import">Import CSV</button></div></div>
    </section>
    ` : '';
  const backToOverview = '<a class="admin-local-finder-back" href="#admin-local-finder">‹ Back to Places &amp; Suggestions</a>';
  const workspace = view === 'review' ? `<a class="admin-local-finder-back" href="#admin-local-finder">‹ Back to Places &amp; Suggestions</a><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Community suggestions</span><h2>Places Awaiting Review</h2></div><p>Select one or more places, then approve or reject them together.</p></div><div class="admin-local-finder-bulk-actions"><label class="admin-local-finder-type-filter">Place type<select data-local-review-type-filter aria-label="Filter places by type"><option value="all">All types</option><option value="cafe">Cafe &amp; Dining</option><option value="park">Park or Mall</option><option value="clinic">Pet Clinic</option><option value="event">Pet Event</option></select></label><button class="button button-light" type="button" data-local-select-all>Select All</button><button class="button button-light" type="button" data-local-deselect-all>Deselect All</button><span data-local-selected-count>0 selected</span><button class="button button-primary" type="button" data-local-bulk-review="approve" disabled>Approve Selected</button><button class="button button-light" type="button" data-local-bulk-review="reject" disabled>Reject Selected</button></div><p data-local-review-feedback role="status" aria-live="polite"></p><div data-admin-local-pending class="admin-local-finder-list">Loading place submissions…</div><p class="admin-market-empty" data-local-review-filter-empty hidden>No pending places match this type.</p></section>`
    : view === 'edits' ? `${backToOverview}<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer corrections</span><h2>Edit Suggestions Awaiting Review</h2></div><p>Review each proposed change, then approve or reject it.</p></div><div class="admin-local-finder-filter-row"><label class="admin-local-finder-type-filter">Place type<select data-local-edit-type-filter aria-label="Filter edit suggestions by place type"><option value="all">All types</option><option value="cafe">Cafe &amp; Dining</option><option value="park">Park or Mall</option><option value="clinic">Pet Clinic</option><option value="event">Pet Event</option></select></label></div><div data-admin-local-edits class="admin-local-finder-list">Loading edit suggestions…</div><p class="admin-market-empty" data-local-edit-filter-empty hidden>No edit suggestions match this type.</p></section>`
    : view === 'published' ? `<a class="admin-local-finder-back" href="#admin-local-finder">‹ Back to Places &amp; Suggestions</a><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Furgo directory</span><h2>Published Places</h2></div><p>Edit details, hide a listing from customers, or delete it.</p></div><div class="admin-local-finder-filter-row"><label class="admin-local-finder-type-filter">Place type<select data-local-published-type-filter aria-label="Filter published places by type"><option value="all">All types</option><option value="cafe">Cafe &amp; Dining</option><option value="park">Park or Mall</option><option value="clinic">Pet Clinic</option><option value="event">Pet Event</option></select></label></div><div class="admin-local-finder-geocode-controls"><button class="button button-light" type="button" data-local-geocode-missing>Find Missing Coordinates</button><span data-local-geocode-feedback role="status" aria-live="polite"></span></div><p class="admin-local-finder-import-help">Coordinate lookups use OpenStreetMap and do not count toward Google Maps requests.</p><div data-admin-local-published class="admin-local-finder-list">Loading published places…</div><p class="admin-market-empty" data-local-published-filter-empty hidden>No published places match this type.</p></section>`
      : view === 'add' ? `${backToOverview}${addPlaceSection}`
        : view === 'import' ? `${backToOverview}${importPlacesSection}`
          : `${adminEntryWorkspace}
    <div class="admin-local-finder-overview-grid">
      <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Community suggestions</span><h2>Places Awaiting Review</h2></div><p><strong data-local-pending-count>Loading…</strong> place(s) are waiting for a decision.</p></div><a class="button button-primary admin-local-finder-overview-action" href="#admin-local-finder?view=review">Review</a></section>
      <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer corrections</span><h2>Edit Suggestions</h2></div><p><strong data-local-edit-count>Loading…</strong> suggestion(s) are waiting for a decision.</p></div><a class="button button-primary admin-local-finder-overview-action" href="#admin-local-finder?view=edits">Review</a></section>
    </div>
    <section class="admin-market-panel admin-local-finder-published-overview"><div class="admin-market-panel-heading"><div><span>Furgo directory</span><h2>Published Places</h2></div><p><strong data-local-published-count>Loading…</strong> published place(s) are in the directory.</p></div><a class="button button-primary" href="#admin-local-finder?view=published">See More</a></section>
    ${localFinderAnnouncementsManagementMarkup()}`;
  return `<main class="admin-portal-page admin-local-finder-page" data-local-finder-view="${escapeHTML(view)}"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Admin Home">‹</a><div><span>Local Finder management</span><h1>${escapeHTML(pageHeading)}</h1></div></header><section class="admin-market-panel admin-local-finder-quota" aria-labelledby="local-finder-quota-title"><div><span>Monthly usage</span><h2 id="local-finder-quota-title">Google Maps requests</h2><p>Customer place search uses Google. CSV imports and missing-coordinate lookups use OpenStreetMap and do not add to this meter.</p></div><div class="admin-local-finder-quota-meter"><strong><span data-local-finder-quota-used>Loading…</span> / <span data-local-finder-quota-limit>2,000</span></strong><div class="admin-local-finder-quota-track" role="progressbar" aria-label="Google Maps requests used this month" aria-valuemin="0" aria-valuemax="2000" aria-valuenow="0"><span data-local-finder-quota-fill></span></div><small data-local-finder-quota-reset>Checking monthly usage…</small></div></section>${workspace}${view === 'home' ? `<dialog class="local-finder-limit-dialog" data-admin-local-finder-limit-dialog aria-labelledby="admin-local-finder-limit-title"><div><h2 id="admin-local-finder-limit-title">Monthly place-sharing limit reached</h2><p data-admin-local-finder-limit-message>Sorry, this month’s 2,000 place-sharing search limit has been reached. Please try again next month.</p><button class="button button-primary" type="button" data-close-admin-local-finder-limit>Got it</button></div></dialog>` : ''}</main>`;
}

export function setupAdminLocalFinder(supabase) {
  const page = document.querySelector('.admin-local-finder-page');
  if (!page) return;
  const view = page.dataset.localFinderView || 'home';
  const entryLimitDialog = page.querySelector('[data-admin-local-finder-limit-dialog]');
  const entryLimitTitle = entryLimitDialog?.querySelector('#admin-local-finder-limit-title');
  const entryLimitMessage = entryLimitDialog?.querySelector('[data-admin-local-finder-limit-message]');
  const showEntryLimit = (message, title = 'Monthly place-sharing limit reached') => {
    if (entryLimitTitle) entryLimitTitle.textContent = title;
    if (entryLimitMessage) entryLimitMessage.textContent = message;
    if (entryLimitDialog && !entryLimitDialog.open) entryLimitDialog.showModal();
  };
  entryLimitDialog?.querySelector('[data-close-admin-local-finder-limit]')?.addEventListener('click', () => entryLimitDialog.close());
  entryLimitDialog?.addEventListener('click', (event) => { if (event.target === entryLimitDialog) entryLimitDialog.close(); });
  page.querySelectorAll('[data-admin-local-entry-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const quota = await requestLocalFinderQuota(supabase, 'get_local_finder_share_search_quota');
        if (!quota.allowed) {
          showEntryLimit('Sorry, this month’s 2,000 place-sharing search limit has been reached. Please try again next month.');
          return;
        }
        window.location.hash = button.dataset.adminLocalEntryRoute;
      } catch (error) {
        showEntryLimit(error.message || 'Sorry, place sharing is temporarily unavailable. Please try again later.', 'Could not check place-sharing limit');
      } finally { button.disabled = false; }
    });
  });
  const pending = document.querySelector('[data-admin-local-pending]');
  const edits = document.querySelector('[data-admin-local-edits]');
  const editCount = page.querySelector('[data-local-edit-count]');
  const published = document.querySelector('[data-admin-local-published]');
  const form = document.querySelector('[data-admin-local-place-form]');
  bindLocalFinderLocationPicker(form, supabase);
  bindLocalFinderOpeningHours(form);
  bindLocalFinderPlacePhotoPreview(form);
  const csvFile = document.querySelector('[data-local-finder-csv-file]');
  const csvImportButton = document.querySelector('[data-local-finder-import]');
  const csvFeedback = document.querySelector('[data-local-finder-import-feedback]');
  const csvErrors = document.querySelector('[data-local-finder-import-errors]');
  const quotaUsed = page.querySelector('[data-local-finder-quota-used]');
  const quotaLimit = page.querySelector('[data-local-finder-quota-limit]');
  const quotaFill = page.querySelector('[data-local-finder-quota-fill]');
  const quotaTrack = page.querySelector('[role="progressbar"][aria-label="Google Maps requests used this month"]');
  const quotaReset = page.querySelector('[data-local-finder-quota-reset]');
  const reviewTypeFilter = page.querySelector('[data-local-review-type-filter]');
  const reviewFilterEmpty = page.querySelector('[data-local-review-filter-empty]');
  const editTypeFilter = page.querySelector('[data-local-edit-type-filter]');
  const editFilterEmpty = page.querySelector('[data-local-edit-filter-empty]');
  const publishedTypeFilter = page.querySelector('[data-local-published-type-filter]');
  const publishedFilterEmpty = page.querySelector('[data-local-published-filter-empty]');
  let latestQuotaUsed = -1;
  const renderQuota = (quota) => {
    const used = Number(quota?.requests_used);
    const limit = Number(quota?.monthly_limit) || 2000;
    if (!Number.isFinite(used) || used < latestQuotaUsed) return;
    latestQuotaUsed = used;
    if (quotaUsed) quotaUsed.textContent = used.toLocaleString();
    if (quotaLimit) quotaLimit.textContent = limit.toLocaleString();
    if (quotaFill) quotaFill.style.width = `${Math.min(100, Math.max(0, used / limit * 100))}%`;
    quotaTrack?.setAttribute('aria-valuemax', String(limit));
    quotaTrack?.setAttribute('aria-valuenow', String(Math.min(limit, used)));
    if (quotaReset) quotaReset.textContent = quota?.resets_at
      ? `Resets ${new Date(quota.resets_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}`
      : 'Usage follows the Malaysia calendar month.';
  };
  window.addEventListener('local-finder-quota-updated', (event) => {
    const currentPage = document.querySelector('.admin-local-finder-page');
    if (currentPage === page) renderQuota(event.detail);
  });
  let csvImportRows = [];

  const applyCategoryFilter = (list, cardSelector, filter, emptyState) => {
    if (!list || !filter) return;
    const category = filter.value;
    const cards = [...list.querySelectorAll(cardSelector)];
    let visibleCount = 0;
    for (const card of cards) {
      const visible = category === 'all' || card.dataset.placeCategory === category;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    if (emptyState) emptyState.hidden = cards.length === 0 || visibleCount > 0;
  };
  const applyReviewPlaceTypeFilter = () => {
    if (!pending || !reviewTypeFilter) return;
    applyCategoryFilter(pending, '[data-local-place-card]', reviewTypeFilter, reviewFilterEmpty);
    for (const card of pending.querySelectorAll('[data-local-place-card][hidden]')) {
      const checkbox = card.querySelector('[data-local-place-select]');
      if (checkbox) checkbox.checked = false;
    }
    syncReviewSelection();
  };
  reviewTypeFilter?.addEventListener('change', applyReviewPlaceTypeFilter);
  editTypeFilter?.addEventListener('change', () => applyCategoryFilter(edits, '[data-local-edit-card]', editTypeFilter, editFilterEmpty));
  publishedTypeFilter?.addEventListener('change', () => applyCategoryFilter(published, '[data-local-place-card]', publishedTypeFilter, publishedFilterEmpty));

  csvFile?.addEventListener('change', async () => {
    csvImportRows = [];
    csvImportButton.disabled = true;
    csvErrors.hidden = true;
    csvErrors.innerHTML = '';
    const file = csvFile.files?.[0];
    if (!file) { csvFeedback.textContent = 'Choose a CSV to check its rows before importing.'; return; }
    if (file.size > 2 * 1024 * 1024) { csvFeedback.textContent = 'CSV files must be 2 MB or smaller.'; return; }
    try {
      const result = validatePlaceCsv(await file.text());
      csvImportRows = result.parsed;
      csvImportRows.forEach((row) => applyCachedCoordinates(row.data));
      csvFeedback.textContent = `${result.parsed.length} valid place row(s)${result.errors.length ? `; ${result.errors.length} invalid row(s) need correction before import` : ' ready to import'}.`;
      if (result.errors.length) {
        csvErrors.hidden = false;
        csvErrors.innerHTML = result.errors.slice(0, 20).map((message) => `<li>${escapeHTML(message)}</li>`).join('') + (result.errors.length > 20 ? `<li>And ${result.errors.length - 20} more issue(s).</li>` : '');
      }
      csvImportButton.disabled = !result.parsed.length || result.errors.length > 0;
    } catch (error) { csvFeedback.textContent = error.message || 'Could not read this CSV.'; }
  });

  csvImportButton?.addEventListener('click', async () => {
    if (!csvImportRows.length) return;
    csvImportButton.disabled = true;
    csvFile.disabled = true;
    csvFeedback.textContent = 'Checking existing places and importing…';
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before importing places.');
      const { data: existingPlaces, error: existingError } = await supabase.from('local_finder_places').select('name,address');
      if (existingError) throw existingError;
      const existingKeys = new Set((existingPlaces || []).map((place) => normalizedPlaceKey(place.name, place.address)));
      const uniqueRows = [];
      let duplicateCount = 0;
      for (const row of csvImportRows) {
        if (existingKeys.has(row.key)) { duplicateCount += 1; continue; }
        existingKeys.add(row.key);
        uniqueRows.push(row.data);
      }
      if (!uniqueRows.length) {
        csvFeedback.textContent = `No new places imported. All ${duplicateCount} row(s) already exist with the same name and address.`;
        csvFile.value = '';
        csvImportRows = [];
        return;
      }
      const needsGeocoding = uniqueRows.filter((place) => place.latitude == null && place.longitude == null);
      let lookupErrorCount = 0;
      let firstLookupError = '';
      const unmappedPlaces = [];
      for (let index = 0; index < needsGeocoding.length; index += 1) {
        const place = needsGeocoding[index];
        csvFeedback.textContent = `Looking up address coordinates with OpenStreetMap: ${index + 1} of ${needsGeocoding.length}…`;
        try {
          const cached = readCoordinateCache(place);
          if (cached?.notFound) { unmappedPlaces.push(place); continue; }
          let coordinates = cached?.coordinates;
          if (!coordinates) {
            coordinates = await lookupOpenStreetMapCoordinates(place);
            if (coordinates) {
              writeCoordinateCache(place, { coordinates, expiresAt: Date.now() + coordinateCacheTtl });
            } else {
              writeCoordinateCache(place, { notFound: true, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
            }
          }
          if (coordinates) {
            place.latitude = coordinates.latitude;
            place.longitude = coordinates.longitude;
            place.coordinates_source = 'openstreetmap_nominatim';
            place.coordinates_expires_at = null;
          } else { unmappedPlaces.push(place); }
        } catch (error) {
          lookupErrorCount += 1;
          firstLookupError ||= error.message || 'OpenStreetMap geocoding failed.';
          // Stop on a service/rate-limit error rather than sending the rest
          // of the batch while the public geocoder is unavailable.
          unmappedPlaces.push(...needsGeocoding.slice(index));
          break;
        }
      }
      const insertRows = uniqueRows.filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).map((place) => ({
        ...place, created_by: authData.user.id, status: 'pending', reviewed_by: null, reviewed_at: null, is_verified: false,
      }));
      if (!insertRows.length) {
        csvFeedback.textContent = lookupErrorCount
          ? `No places imported: OpenStreetMap lookup failed. ${firstLookupError} Resolve the issue above, then retry.`
          : `No places imported: OpenStreetMap could not find coordinates for any row. Correct the addresses or add coordinates to the CSV, then retry.`;
        csvErrors.hidden = false;
        csvErrors.innerHTML = unmappedPlaces.slice(0, 20).map((place) => `<li>${escapeHTML(place.name)} — ${escapeHTML(place.address)} (coordinates required)</li>`).join('') + (unmappedPlaces.length > 20 ? `<li>And ${unmappedPlaces.length - 20} more place(s) need coordinates.</li>` : '');
        return;
      }
      let importedCount = 0;
      for (let offset = 0; offset < insertRows.length; offset += 50) {
        const { error } = await supabase.from('local_finder_places').insert(insertRows.slice(offset, offset + 50));
        if (error) throw new Error(`${error.message} ${importedCount} place(s) were imported before this batch failed.`);
        importedCount += Math.min(50, insertRows.length - offset);
      }
      csvFeedback.textContent = `Added ${importedCount} place(s) with coordinates to Pending Review${duplicateCount ? `; skipped ${duplicateCount} duplicate(s)` : ''}${unmappedPlaces.length ? `; skipped ${unmappedPlaces.length} place(s) without coordinates` : ''}${lookupErrorCount ? `; OpenStreetMap lookup error: ${firstLookupError}` : ''}. Nothing is public until approved.`;
      if (unmappedPlaces.length) {
        csvErrors.hidden = false;
        csvErrors.innerHTML = unmappedPlaces.slice(0, 20).map((place) => `<li>${escapeHTML(place.name)} — ${escapeHTML(place.address)} (not imported: coordinates required)</li>`).join('') + (unmappedPlaces.length > 20 ? `<li>And ${unmappedPlaces.length - 20} more place(s) were skipped.</li>` : '');
      } else {
        csvErrors.hidden = true;
        csvErrors.innerHTML = '';
      }
      csvFile.value = '';
      csvImportRows = [];
      await load();
    } catch (error) {
      csvFeedback.textContent = error.message || 'Could not import places.';
    } finally {
      csvFile.disabled = false;
      csvImportButton.disabled = !csvImportRows.length;
    }
  });

  const load = async () => {
    try { await supabase.rpc('expire_local_finder_google_coordinates'); } catch { /* Expiry can also be handled by the database's optional daily job. */ }
    const [placesResult, editsResult, recommendationsResult, quotaResult] = await Promise.all([
      supabase.from('local_finder_places').select('*').order('created_at', { ascending: false }),
      edits || editCount
        ? supabase.from('local_finder_place_edits').select('*').eq('status', 'pending').order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc('get_local_finder_recommendation_counts'),
      supabase.rpc('get_local_finder_share_search_quota'),
    ]);
    const quota = Array.isArray(quotaResult.data) ? quotaResult.data[0] : quotaResult.data;
    if (quota && !quotaResult.error) renderQuota(quota);
    else if (quotaUsed) quotaUsed.textContent = 'Unavailable';
    if (placesResult.error || editsResult.error || recommendationsResult.error) {
      const reason = placesResult.error?.message || editsResult.error?.message || recommendationsResult.error?.message || 'Could not load Local Finder records.';
      if (pending) pending.innerHTML = `<p class="admin-market-empty">${escapeHTML(reason)} Apply migration 0051 or 0053 in Supabase if these tables are missing.</p>`;
      if (edits) edits.innerHTML = `<p class="admin-market-empty">${escapeHTML(reason)}</p>`;
      if (editCount) editCount.textContent = 'Unavailable';
      if (published) published.innerHTML = `<p class="admin-market-empty">${escapeHTML(reason)}</p>`;
      return;
    }
    const places = placesResult.data || [];
    const byId = new Map(places.map((place) => [place.id, place]));
    const counts = {};
    (recommendationsResult.data || []).forEach(({ place_id, recommendation_count }) => { counts[place_id] = Number(recommendation_count || 0); });
    const pendingPlaces = places.filter((place) => place.status === 'pending');
    const pendingCount = document.querySelector('[data-local-pending-count]');
    if (pendingCount) pendingCount.textContent = String(pendingPlaces.length);
    if (pending) pending.innerHTML = pendingPlaces.length ? pendingPlaces.map((place) => adminPlaceCard(place, counts, 'review')).join('') : '<p class="admin-market-empty">No new place submissions need review.</p>';
    applyReviewPlaceTypeFilter();
    syncReviewSelection();
    const pendingEdits = editsResult.data || [];
    if (editCount) editCount.textContent = String(pendingEdits.length);
    if (edits) edits.innerHTML = pendingEdits.length ? pendingEdits.map((edit) => adminEditCard(edit, byId.get(edit.place_id))).join('') : '<p class="admin-market-empty">No edit suggestions need review.</p>';
    applyCategoryFilter(edits, '[data-local-edit-card]', editTypeFilter, editFilterEmpty);
    const approved = places.filter((place) => place.status === 'approved');
    const publishedCount = document.querySelector('[data-local-published-count]');
    if (publishedCount) publishedCount.textContent = String(approved.length);
    if (published) published.innerHTML = approved.length ? approved.map((place) => adminPlaceCard(place, counts, 'published')).join('') : '<p class="admin-market-empty">No places have been published yet.</p>';
    applyCategoryFilter(published, '[data-local-place-card]', publishedTypeFilter, publishedFilterEmpty);
    published?.querySelectorAll('[data-local-place-edit-form]').forEach((editForm) => {
      bindLocalFinderLocationPicker(editForm, supabase);
      bindLocalFinderOpeningHours(editForm);
      bindLocalFinderPlacePhotoPreview(editForm);
      const address = editForm.querySelector('[data-place-selected-address]');
      if (address) address.textContent = editForm.elements.address.value || 'Choose a place to fill its address.';
    });
  };

  const syncReviewSelection = () => {
    const checkboxes = [...(pending?.querySelectorAll('[data-local-place-select]') || [])];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    const count = page.querySelector('[data-local-selected-count]');
    if (count) count.textContent = `${selectedCount} selected`;
    page.querySelectorAll('[data-local-bulk-review]').forEach((button) => { button.disabled = selectedCount === 0; });
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const feedback = form.querySelector('[data-admin-local-feedback]');
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Publishing place…';
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before adding a place.');
      const placeData = await saveLocalFinderPlaceData(form, supabase, authData.user.id);
      const duplicate = await findLocalFinderDuplicate(supabase, placeData);
      if (duplicate) { showLocalFinderDuplicateNotice(duplicate); feedback.textContent = ''; return; }
      const { error } = await supabase.from('local_finder_places').insert({
        ...placeData, created_by: authData.user.id, status: 'approved', is_verified: form.elements.is_verified.checked,
        reviewed_by: authData.user.id, reviewed_at: new Date().toISOString(),
      });
      if (error) throw error;
      form.reset();
      feedback.textContent = 'Place published.';
      await load();
    } catch (error) { feedback.textContent = error.message || 'Place could not be published.'; }
    finally { submit.disabled = false; }
  });

  page?.addEventListener('change', (event) => {
    if (event.target.matches('[data-local-place-select]')) syncReviewSelection();
  });

  page?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button');
    if (!actionButton) return;

    if (actionButton.matches('[data-local-geocode-missing]')) {
      const feedback = page.querySelector('[data-local-geocode-feedback]');
      actionButton.disabled = true;
      let locatedCount = 0;
      let unmatchedCount = 0;
      let lookupErrorCount = 0;
      let firstLookupError = '';
      const unmatchedPlaces = [];
      try {
        const { data: unmapped, error: loadError } = await supabase.from('local_finder_places')
          .select('id,name,address,city,state')
          .in('status', ['pending', 'approved'])
          .is('latitude', null).is('longitude', null);
        if (loadError) throw loadError;
        const placesToLocate = unmapped || [];
        for (let index = 0; index < placesToLocate.length; index += 1) {
          const place = placesToLocate[index];
          if (feedback) feedback.textContent = `Looking up coordinates with OpenStreetMap: ${index + 1} of ${placesToLocate.length}…`;
          try {
            const cached = readCoordinateCache(place);
            if (cached?.notFound) { unmatchedCount += 1; unmatchedPlaces.push(place); continue; }
            let coordinates = cached?.coordinates;
            if (!coordinates) {
              coordinates = await lookupOpenStreetMapCoordinates(place);
              if (coordinates) {
                writeCoordinateCache(place, { coordinates, expiresAt: Date.now() + coordinateCacheTtl });
              } else {
                writeCoordinateCache(place, { notFound: true, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
              }
            }
            if (!coordinates) { unmatchedCount += 1; unmatchedPlaces.push(place); continue; }
            const { error } = await supabase.from('local_finder_places').update({
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
              coordinates_source: 'openstreetmap_nominatim',
              coordinates_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', place.id);
            if (error) throw error;
            locatedCount += 1;
          } catch (error) {
            if (error?.code) throw error;
            unmatchedCount += placesToLocate.length - index;
            lookupErrorCount += 1;
            firstLookupError ||= error.message || 'OpenStreetMap lookup failed.';
            unmatchedPlaces.push(...placesToLocate.slice(index));
            break;
          }
        }
        if (feedback) feedback.textContent = placesToLocate.length
            ? `Coordinates added to ${locatedCount} place(s); ${unmatchedCount} address(es) remain unmapped${unmatchedPlaces.length ? `: ${unmatchedPlaces.map((place) => place.name).join(', ')}` : ''}${lookupErrorCount ? `; OpenStreetMap lookup error: ${firstLookupError}` : ''}.`
          : 'All pending and published places already have coordinates.';
        await load();
      } catch (error) {
        if (feedback) feedback.textContent = error.message || 'Could not look up missing coordinates.';
      } finally { actionButton.disabled = false; }
      return;
    }

    if (actionButton.matches('[data-local-select-all], [data-local-deselect-all]')) {
      const checked = actionButton.matches('[data-local-select-all]');
      pending?.querySelectorAll('[data-local-place-card]:not([hidden]) [data-local-place-select]').forEach((checkbox) => { checkbox.checked = checked; });
      syncReviewSelection();
      return;
    }

    if (actionButton.matches('[data-local-bulk-review]')) {
      const selectedIds = [...(pending?.querySelectorAll('[data-local-place-select]:checked') || [])].map((checkbox) => checkbox.value);
      if (!selectedIds.length) return;
      const approve = actionButton.dataset.localBulkReview === 'approve';
      const feedback = page.querySelector('[data-local-review-feedback]');
      actionButton.disabled = true;
      if (feedback) feedback.textContent = approve ? 'Approving selected places…' : 'Rejecting selected places…';
      const { data, error } = await supabase.rpc('review_local_finder_submissions', { p_place_ids: selectedIds, p_approve: approve });
      if (feedback) feedback.textContent = error ? (error.message || 'Could not review the selected places.') : `${data?.reviewed_count ?? selectedIds.length} place(s) ${approve ? 'approved and published' : 'rejected'}.`;
      await load();
      return;
    }

    const placeCard = event.target.closest('[data-local-place-card]');
    const editCard = event.target.closest('[data-local-edit-card]');
    if (!placeCard && !editCard) return;
    const button = actionButton;
    button.disabled = true;
    let error = null;
    if (button.matches('[data-local-review-edit]')) {
      const approve = button.dataset.localReviewEdit === 'approve';
      ({ error } = await supabase.rpc('review_local_finder_place_edit', {
        p_edit_id: editCard.dataset.localEditCard, p_approve: approve, p_reason: '',
      }));
    } else if (button.matches('[data-local-edit-place]')) {
      placeCard.querySelector('[data-local-place-edit-dialog]')?.showModal();
      button.disabled = false;
      return;
    } else if (button.matches('[data-close-local-place-edit]')) {
      button.closest('dialog')?.close();
      button.disabled = false;
      return;
    } else if (button.matches('[data-local-toggle-hidden]')) {
      const placeId = placeCard.dataset.localPlaceCard;
      const { data } = await supabase.from('local_finder_places').select('is_hidden').eq('id', placeId).single();
      ({ error } = await supabase.from('local_finder_places').update({ is_hidden: !data?.is_hidden, updated_at: new Date().toISOString() }).eq('id', placeId));
    } else if (button.matches('[data-local-verify]')) {
      const placeId = placeCard.dataset.localPlaceCard;
      const { data } = await supabase.from('local_finder_places').select('is_verified').eq('id', placeId).single();
      ({ error } = await supabase.from('local_finder_places').update({ is_verified: !data?.is_verified, updated_at: new Date().toISOString() }).eq('id', placeId));
    } else if (button.matches('[data-local-delete-place]')) {
      if (!window.confirm('Delete this place from Local Finder?')) { button.disabled = false; return; }
      ({ error } = await supabase.from('local_finder_places').delete().eq('id', placeCard.dataset.localPlaceCard));
    } else {
      button.disabled = false;
      return;
    }
    if (error) window.alert(error.message || 'The action could not be completed.');
    await load();
  });

  page?.addEventListener('submit', async (event) => {
    const editForm = event.target.closest('[data-local-place-edit-form]');
    if (!editForm) return;
    event.preventDefault();
    if (!editForm.reportValidity()) return;
    const feedback = editForm.querySelector('[data-local-place-edit-feedback]');
    const submit = editForm.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Saving changes…';
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before editing a place.');
      const placeData = await saveLocalFinderPlaceData(editForm, supabase, authData.user.id, editForm.dataset.existingPhoto || '');
      const { error } = await supabase.from('local_finder_places').update({
        ...placeData, is_verified: editForm.elements.is_verified.checked, updated_at: new Date().toISOString(),
      }).eq('id', editForm.dataset.placeId);
      if (error) throw error;
      editForm.closest('dialog')?.close();
      await load();
    } catch (error) {
      feedback.textContent = error.message || 'Could not save place details.';
    } finally { submit.disabled = false; }
  });

  void load();
}
