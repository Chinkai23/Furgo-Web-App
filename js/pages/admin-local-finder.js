import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { bindLocalFinderLocationPicker, bindLocalFinderOpeningHours, bindLocalFinderPlacePhotoPreview, localFinderAdminFormFields, saveLocalFinderPlaceData } from './local-finder.js';

const categoryNames = { cafe: 'Cafe & Dining', park: 'Park or Mall', clinic: 'Pet Clinic', event: 'Pet Event' };
const categoryKeys = new Map([
  ['cafe', 'cafe'], ['cafe_dining', 'cafe'], ['park', 'park'], ['park_or_mall', 'park'],
  ['clinic', 'clinic'], ['pet_clinic', 'clinic'], ['event', 'event'], ['pet_event', 'event'],
]);

// Keep bulk CSV/backfill geocoding on Photon/OSM. Google's Geocoding results
// are not suitable for bulk geocoding or permanent storage in Furgo's directory.
async function lookupBulkCoordinates(place) {
  const query = [place.name, place.address, place.city, place.state, 'Malaysia'].filter(Boolean).join(', ');
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'en');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Address lookup is temporarily unavailable.');
  const data = await response.json();
  const results = (data.features || []).filter((feature) => {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    const country = String(feature.properties?.country || '').toLowerCase();
    return country.includes('malaysia') && Number.isFinite(latitude) && Number.isFinite(longitude);
  });
  if (!results.length) return null;
  const [longitude, latitude] = results[0].geometry.coordinates;
  return { latitude, longitude };
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
function isPositivePetPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || /\b(no pets?|not allowed|not permitted|prohibited|unknown|not pet friendly)\b/.test(normalized)) return false;
  return /^(yes|true|pets? welcome|pets? allowed|pets? accepted|dogs? welcome|dogs? allowed|dogs? only|cats? welcome|cats? allowed|veterinary (care|clinic))\b/.test(normalized)
    || /\b(dogs?|cats?|pets?)\b.*\b(allowed|welcome|accepted|permitted|only|on leash|on lead|veterinary care)\b/.test(normalized);
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
  for (const required of ['name', 'category', 'address', 'pet_allowed']) {
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
      const petAllowed = get('pet_allowed');
      if (!isPositivePetPolicy(petAllowed)) throw new Error('pet_allowed must state which pets are explicitly welcome or accepted. Do not import unknown or non-pet-friendly places.');
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

const localFinderCsvTemplate = 'name,category,address,city,state,latitude,longitude,allowed_area,pet_allowed,pet_size,conditions,opening_hours,phone,website,photo_url,is_verified,source_provider,source_url,source_license\n"Example Pet Cafe",cafe,"Example Street 1",Petaling Jaya,Selangor,3.107,101.606,Outdoor only,Dogs only,All sizes,Leash required,"Monday-Friday: 9:00am-6:00pm",+60312345678,https://example.com,,false,Furgo,https://example.com/pet-policy,\n';

function adminPlaceCard(place, counts = {}, view = 'review') {
  const status = place.is_hidden ? 'Hidden' : place.status === 'approved' ? 'Published' : 'Pending Review';
  const links = reviewLinks(place);
  const selection = view === 'review' ? `<label class="admin-local-finder-select"><input type="checkbox" data-local-place-select value="${escapeHTML(place.id)}" /><span>Select place</span></label>` : '';
  const actions = view === 'published' ? `<div class="admin-local-finder-actions"><button class="button button-light" type="button" data-local-edit-place> Edit Place </button><button class="button button-light" type="button" data-local-toggle-hidden>${place.is_hidden ? 'Unhide Place' : 'Hide Place'}</button><button class="button button-light" type="button" data-local-verify>${place.is_verified ? 'Remove Furgo Verified' : 'Mark Furgo Verified'}</button><button class="button button-light" type="button" data-local-delete-place>Delete Place</button></div>` : '';
  const editDialog = view === 'published' ? `<dialog class="local-finder-share-dialog" data-local-place-edit-dialog aria-labelledby="local-place-edit-title"><form class="local-finder-suggestion-form" data-local-place-edit-form data-place-id="${escapeHTML(place.id)}" data-existing-photo="${escapeHTML(place.photo_url || '')}"><header><div><span>Published listing</span><h2 id="local-place-edit-title">Edit Place</h2></div><button type="button" data-close-local-place-edit aria-label="Close">×</button></header>${localFinderAdminFormFields({ values: place })}<label class="admin-local-verified-input"><input type="checkbox" name="is_verified" ${place.is_verified ? 'checked' : ''} /> Furgo Verified</label><p class="local-finder-suggestion-feedback" data-local-place-edit-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Save Changes</button></form></dialog>` : '';
  return `<article class="admin-local-finder-card" data-local-place-card="${escapeHTML(place.id)}"><div class="admin-local-finder-card-main">${place.photo_url ? `<img src="${escapeHTML(place.photo_url)}" alt="" />` : '<div class="admin-local-finder-photo-placeholder">No Photo</div>'}<div><span>${escapeHTML(categoryNames[place.category] || place.category)} · <b class="admin-local-finder-status ${place.is_hidden ? 'is-hidden' : 'is-approved'}">${status}</b></span><h3>${escapeHTML(place.name)}</h3><p>${escapeHTML(place.address)}</p><p>Pets: ${escapeHTML(place.pet_allowed || 'Policy not provided')}</p><small>${counts[place.id] || 0} Furgomate Recommended${place.is_verified ? ' · Furgo Verified' : ''}</small>${place.source_provider ? `<p class="admin-local-finder-source">Source: ${escapeHTML(place.source_provider)}${place.source_license ? ` · ${escapeHTML(place.source_license)}` : ''}</p>` : ''}${links}</div></div>
    ${selection}${actions}${editDialog}</article>`;
}

function adminEditCard(edit, place) {
  const changes = edit.proposed_changes || {};
  const suggestedPlace = { ...place, ...changes, name: changes.name || place?.name, address: changes.address || place?.address };
  const links = reviewLinks(suggestedPlace, { website: changes.website || place?.website, sourceUrl: place?.source_url });
  const fields = [
    ['Place name', changes.name], ['Address', changes.address], ['Allowed Area', changes.allowed_area],
    ['Pets Allowed', changes.pet_allowed], ['Pet Size', changes.pet_size], ['Conditions', changes.conditions],
    ['Opening Hours', changes.opening_hours?.raw], ['Phone', changes.phone], ['Website', changes.website],
  ].filter(([, value]) => value);
  return `<article class="admin-local-finder-card" data-local-edit-card="${escapeHTML(edit.id)}"><span>Edit suggestion · ${escapeHTML(categoryNames[place?.category] || '')}</span><h3>${escapeHTML(place?.name || 'Place')}</h3><dl class="admin-local-finder-change-list">${fields.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>${links}${safeReviewUrl(changes.photo_url) ? `<a href="${escapeHTML(safeReviewUrl(changes.photo_url))}" target="_blank" rel="noopener noreferrer">View suggested photo</a>` : ''}<div class="admin-local-finder-actions"><button class="button button-primary" type="button" data-local-review-edit="approve">Approve Edit</button><button class="button button-light" type="button" data-local-review-edit="reject">Reject</button></div></article>`;
}

export function adminLocalFinderPage(params = new URLSearchParams()) {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  if (!['manager', 'director', 'admin'].includes(profile.role)) return `<main class="admin-portal-page"><section class="admin-market-panel"><h1>Local Finder</h1><p>Manager or Director access is required.</p><a class="button button-primary" href="#admin">Back to Admin Home</a></section></main>`;
  const view = params.get('view') || 'home';
  const pageHeading = view === 'review' ? 'Review Places' : view === 'published' ? 'Published Places' : 'Places & Suggestions';
  const workspace = view === 'review' ? `<a class="admin-local-finder-back" href="#admin-local-finder">‹ Back to Places &amp; Suggestions</a><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Community suggestions</span><h2>Places Awaiting Review</h2></div><p>Select one or more places, then approve or reject them together.</p></div><div class="admin-local-finder-bulk-actions"><button class="button button-light" type="button" data-local-select-all>Select All</button><button class="button button-light" type="button" data-local-deselect-all>Deselect All</button><span data-local-selected-count>0 selected</span><button class="button button-primary" type="button" data-local-bulk-review="approve" disabled>Approve Selected</button><button class="button button-light" type="button" data-local-bulk-review="reject" disabled>Reject Selected</button></div><p data-local-review-feedback role="status" aria-live="polite"></p><div data-admin-local-pending class="admin-local-finder-list">Loading place submissions…</div></section>` : view === 'published' ? `<a class="admin-local-finder-back" href="#admin-local-finder">‹ Back to Places &amp; Suggestions</a><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Furgo directory</span><h2>Published Places</h2></div><p>Edit details, hide a listing from customers, or delete it.</p></div><div class="admin-local-finder-geocode-controls"><button class="button button-light" type="button" data-local-geocode-missing>Find Missing Coordinates</button><span data-local-geocode-feedback role="status" aria-live="polite"></span></div><div data-admin-local-published class="admin-local-finder-list">Loading published places…</div></section>` : `<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Community suggestions</span><h2>Places Awaiting Review</h2></div><p><strong data-local-pending-count>Loading…</strong> place(s) are waiting for a decision.</p></div><a class="button button-primary" href="#admin-local-finder?view=review">Review</a></section>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Furgo directory</span><h2>Published Places</h2></div><p><strong data-local-published-count>Loading…</strong> published place(s) are in the directory.</p></div><a class="button button-light" href="#admin-local-finder?view=published">See More</a></section>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer corrections</span><h2>Edit Suggestions</h2></div><p>Review suggested changes to published listings.</p></div><div data-admin-local-edits class="admin-local-finder-list">Loading edit suggestions…</div></section>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Bulk entry</span><h2>Import Places from CSV</h2></div><p>Imported places stay pending until a Manager or Director approves them. Include an explicit pet policy; uncertain venues are rejected during import.</p></div><div class="admin-local-finder-import"><div class="admin-local-finder-import-controls"><label>CSV file<input type="file" data-local-finder-csv-file accept=".csv,text/csv" /></label><a class="button button-light" href="data:text/csv;charset=utf-8,${encodeURIComponent(localFinderCsvTemplate)}" download="furgo-local-finder-template.csv">Download CSV Template</a></div><p class="admin-local-finder-import-help">Required columns: <b>name, category, address, pet_allowed</b>. Categories: <b>cafe</b>, <b>park</b>, <b>clinic</b>, or <b>event</b>. Optional columns: city, state, latitude, longitude, allowed_area, pet_size, conditions, opening_hours, phone, website, photo_url, is_verified, source_provider, source_url, source_license. Imports are unverified and pending review.</p><p data-local-finder-import-feedback role="status" aria-live="polite">Choose a CSV to check its rows before importing.</p><ul data-local-finder-import-errors class="admin-local-finder-import-errors" hidden></ul><button class="button button-primary" type="button" data-local-finder-import disabled>Import for Review</button></div></section>
    ${view === 'home' ? `<section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Admin entry</span><h2>Add a Place</h2></div><p>Manager and Director entries publish immediately. Furgo Verified is optional.</p></div><form class="local-finder-suggestion-form admin-local-finder-direct-form" data-admin-local-place-form>${localFinderAdminFormFields()}<label class="admin-local-verified-input"><input type="checkbox" name="is_verified" /> Mark Furgo Verified</label><p data-admin-local-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Publish Place</button></form></section>` : ''}`;
  return `<main class="admin-portal-page admin-local-finder-page" data-local-finder-view="${escapeHTML(view)}"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Admin Home">‹</a><div><span>Local Finder management</span><h1>${escapeHTML(pageHeading)}</h1></div></header>${workspace}</main>`;
}

export function setupAdminLocalFinder(supabase) {
  const page = document.querySelector('.admin-local-finder-page');
  if (!page) return;
  const view = page.dataset.localFinderView || 'home';
  const pending = document.querySelector('[data-admin-local-pending]');
  const edits = document.querySelector('[data-admin-local-edits]');
  const published = document.querySelector('[data-admin-local-published]');
  const form = document.querySelector('[data-admin-local-place-form]');
  bindLocalFinderLocationPicker(form, supabase);
  bindLocalFinderOpeningHours(form);
  bindLocalFinderPlacePhotoPreview(form);
  const csvFile = document.querySelector('[data-local-finder-csv-file]');
  const csvImportButton = document.querySelector('[data-local-finder-import]');
  const csvFeedback = document.querySelector('[data-local-finder-import-feedback]');
  const csvErrors = document.querySelector('[data-local-finder-import-errors]');
  let csvImportRows = [];

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
      let geocodedCount = 0;
      let unmatchedCount = 0;
      let lookupErrorCount = 0;
      const unmappedPlaces = [];
      for (let index = 0; index < needsGeocoding.length; index += 1) {
        const place = needsGeocoding[index];
        csvFeedback.textContent = `Looking up address coordinates: ${index + 1} of ${needsGeocoding.length}…`;
        try {
          const coordinates = await lookupBulkCoordinates(place);
          if (coordinates) {
            place.latitude = coordinates.latitude;
            place.longitude = coordinates.longitude;
            geocodedCount += 1;
          } else { unmatchedCount += 1; unmappedPlaces.push(place); }
        } catch {
          unmatchedCount += 1;
          lookupErrorCount += 1;
          unmappedPlaces.push(place);
        }
        // Keep sequential requests to be considerate of the public Photon service.
        if (index < needsGeocoding.length - 1) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (unmappedPlaces.length) {
        csvFeedback.textContent = `Import paused: ${unmappedPlaces.length} place(s) could not be matched to an address. Correct the address or add latitude and longitude, then import again${lookupErrorCount ? ` (${lookupErrorCount} lookup error(s))` : ''}.`;
        csvErrors.hidden = false;
        csvErrors.innerHTML = unmappedPlaces.slice(0, 20).map((place) => `<li>${escapeHTML(place.name)} — ${escapeHTML(place.address)}</li>`).join('') + (unmappedPlaces.length > 20 ? `<li>And ${unmappedPlaces.length - 20} more unmapped place(s).</li>` : '');
        return;
      }
      const insertRows = uniqueRows.map((place) => ({
        ...place, created_by: authData.user.id, status: 'pending', reviewed_by: null, reviewed_at: null, is_verified: false,
      }));
      let importedCount = 0;
      for (let offset = 0; offset < insertRows.length; offset += 50) {
        const { error } = await supabase.from('local_finder_places').insert(insertRows.slice(offset, offset + 50));
        if (error) throw new Error(`${error.message} ${importedCount} place(s) were imported before this batch failed.`);
        importedCount += Math.min(50, insertRows.length - offset);
      }
      const coordinateSummary = needsGeocoding.length
        ? `; coordinates found for ${geocodedCount}, unavailable for ${unmatchedCount}${lookupErrorCount ? ` (${lookupErrorCount} lookup error(s))` : ''}`
        : '';
      csvFeedback.textContent = `Added ${importedCount} place(s) to Pending Review${duplicateCount ? `; skipped ${duplicateCount} duplicate(s)` : ''}${coordinateSummary}. Nothing is public until approved.`;
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
    const [placesResult, editsResult, recommendationsResult] = await Promise.all([
      supabase.from('local_finder_places').select('*').order('created_at', { ascending: false }),
      edits ? supabase.from('local_finder_place_edits').select('*').eq('status', 'pending').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      supabase.rpc('get_local_finder_recommendation_counts'),
    ]);
    if (placesResult.error || editsResult.error || recommendationsResult.error) {
      const reason = placesResult.error?.message || editsResult.error?.message || recommendationsResult.error?.message || 'Could not load Local Finder records.';
      if (pending) pending.innerHTML = `<p class="admin-market-empty">${escapeHTML(reason)} Apply migration 0051 or 0053 in Supabase if these tables are missing.</p>`;
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
    syncReviewSelection();
    const pendingEdits = editsResult.data || [];
    if (edits) edits.innerHTML = pendingEdits.length ? pendingEdits.map((edit) => adminEditCard(edit, byId.get(edit.place_id))).join('') : '<p class="admin-market-empty">No edit suggestions need review.</p>';
    const approved = places.filter((place) => place.status === 'approved');
    const publishedCount = document.querySelector('[data-local-published-count]');
    if (publishedCount) publishedCount.textContent = String(approved.length);
    if (published) published.innerHTML = approved.length ? approved.map((place) => adminPlaceCard(place, counts, 'published')).join('') : '<p class="admin-market-empty">No places have been published yet.</p>';
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
          if (feedback) feedback.textContent = `Looking up coordinates: ${index + 1} of ${placesToLocate.length}…`;
          try {
            const coordinates = await lookupBulkCoordinates(place);
            if (!coordinates) { unmatchedCount += 1; unmatchedPlaces.push(place); continue; }
            const { error } = await supabase.from('local_finder_places').update({ ...coordinates, updated_at: new Date().toISOString() }).eq('id', place.id);
            if (error) throw error;
            locatedCount += 1;
          } catch (error) {
            if (error?.code) throw error;
            unmatchedCount += 1;
            lookupErrorCount += 1;
            unmatchedPlaces.push(place);
          }
          if (index < placesToLocate.length - 1) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (feedback) feedback.textContent = placesToLocate.length
          ? `Coordinates added to ${locatedCount} place(s); ${unmatchedCount} address(es) remain unmapped${unmatchedPlaces.length ? `: ${unmatchedPlaces.map((place) => place.name).join(', ')}` : ''}${lookupErrorCount ? ` (${lookupErrorCount} lookup error(s))` : ''}.`
          : 'All pending and published places already have coordinates.';
        await load();
      } catch (error) {
        if (feedback) feedback.textContent = error.message || 'Could not look up missing coordinates.';
      } finally { actionButton.disabled = false; }
      return;
    }

    if (actionButton.matches('[data-local-select-all], [data-local-deselect-all]')) {
      const checked = actionButton.matches('[data-local-select-all]');
      pending?.querySelectorAll('[data-local-place-select]').forEach((checkbox) => { checkbox.checked = checked; });
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
