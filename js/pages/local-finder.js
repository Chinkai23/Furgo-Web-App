import { bottomNavigation, escapeHTML } from '../shared.js';
import { GOOGLE_MAPS_API_KEY } from '../google-maps-config.js';
import { loadAnnouncements, normalizePromotionDestination } from './admin-promotions.js';

const placeTypes = [
  { label: 'Cafe & Dining', key: 'cafe', icon: 'Finder Icon-01.png' },
  { label: 'Park or Mall', key: 'park', icon: 'Finder Icon-02.png' },
  { label: 'Pet Clinic', key: 'clinic', icon: 'Finder Icon-03.png' },
  { label: 'Pet Event', key: 'event', icon: 'Finder Icon-04.png' },
];

const locationKey = 'furgo-local-finder-location';
const localFinderFavoritesKey = 'furgo-demo-local-finder-favorites';
const openStreetMapAttribution = '<p class="local-finder-osm-attribution">Location coordinates © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.</p>';
let googlePlacesLibraryPromise;
let googleMapsLibraryPromise;
const googleRequestTimeoutMs = 15000;

function withGoogleTimeout(promise, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), googleRequestTimeoutMs);
    Promise.resolve(promise).then((value) => { clearTimeout(timeout); resolve(value); }, (error) => { clearTimeout(timeout); reject(error); });
  });
}

function loadGoogleMapsLibrary() {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('Google Places is not configured yet. Add the restricted Google Maps API key in js/google-maps-config.js.');
  if (!googleMapsLibraryPromise) {
    googleMapsLibraryPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) { resolve(window.google.maps); return; }
      const callbackName = '__furgoGoogleMapsReady';
      const script = document.createElement('script');
      const cleanup = () => { clearTimeout(timeout); script.onerror = null; };
      const timeout = setTimeout(() => {
        script.remove();
        delete window[callbackName];
        reject(new Error('Google Maps did not load within 15 seconds. Check the API key, enabled APIs, allowed website referrers, and network connection.'));
      }, googleRequestTimeoutMs);
      window[callbackName] = () => { cleanup(); resolve(window.google.maps); };
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async&region=MY&language=en&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => { cleanup(); delete window[callbackName]; reject(new Error('Google Maps could not load. Check the API key, enabled APIs, allowed website referrers, and network connection.')); };
      document.head.append(script);
    });
    googleMapsLibraryPromise.catch(() => { googleMapsLibraryPromise = null; });
  }
  return googleMapsLibraryPromise;
}

async function loadGooglePlacesLibrary() {
  if (!googlePlacesLibraryPromise) {
    googlePlacesLibraryPromise = loadGoogleMapsLibrary().then((maps) => maps.importLibrary('places'));
    googlePlacesLibraryPromise.catch(() => { googlePlacesLibraryPromise = null; });
  }
  return googlePlacesLibraryPromise;
}

async function loadGoogleGeocoder() {
  const maps = await loadGoogleMapsLibrary();
  const { Geocoder } = await withGoogleTimeout(maps.importLibrary('geocoding'), 'Google Geocoding did not initialize within 15 seconds. Check that the Geocoding API is enabled for this key.');
  return new Geocoder();
}

export async function requestLocalFinderQuota(supabase, rpcName) {
  const { data, error } = await supabase.rpc(rpcName);
  if (error) throw new Error(error.message.includes('function public.') ? 'Apply migration 0055 in Supabase to enable the monthly Local Finder search limit.' : error.message);
  const quota = (Array.isArray(data) ? data[0] : data) || { allowed: false, requests_used: 2000, monthly_limit: 2000 };
  if (rpcName === 'consume_local_finder_share_search') window.dispatchEvent(new CustomEvent('local-finder-quota-updated', { detail: quota }));
  return quota;
}

function placeShareLimitMessage(isAdmin = false) {
  return isAdmin
    ? 'Sorry, this month’s 2,000 place-sharing search limit has been reached. Please try again next month.'
    : 'Sorry, this month’s place-sharing limit has been reached. Please try again next month.';
}

function iconPath(file) { return `Image/Icon/${encodeURIComponent(file)}`; }
export function loadLocalFinderFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(localFinderFavoritesKey) || '[]');
    return Array.isArray(saved) ? [...new Set(saved.map(String))] : [];
  } catch { return []; }
}
function normalizePlaceDuplicateValue(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export async function findLocalFinderDuplicate(supabase, details, excludeId = '') {
  const name = normalizePlaceDuplicateValue(details.name);
  const address = normalizePlaceDuplicateValue(details.address);
  if (!name || !address) return null;
  const { data, error } = await supabase.rpc('find_local_finder_duplicate', {
    p_name: details.name.trim(), p_address: details.address.trim(),
  });
  if (error) throw error;
  return (data || []).find((place) => place.id !== excludeId
    && normalizePlaceDuplicateValue(place.name) === name
    && normalizePlaceDuplicateValue(place.address) === address) || null;
}
export function showLocalFinderDuplicateNotice(place) {
  let dialog = document.querySelector('[data-local-finder-duplicate-dialog]');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'local-finder-share-dialog local-finder-duplicate-dialog';
    dialog.setAttribute('data-local-finder-duplicate-dialog', '');
    dialog.setAttribute('aria-labelledby', 'local-finder-duplicate-title');
    dialog.innerHTML = '<section class="local-finder-suggestion-form"><header><div><span>Local Finder</span><h2 id="local-finder-duplicate-title">Place Already Shared</h2></div><button type="button" data-close-duplicate-place aria-label="Close">×</button></header><p data-local-finder-duplicate-message></p><a class="button button-primary" data-view-duplicate-place hidden>View Existing Place</a><button class="button button-light" type="button" data-close-duplicate-place>Got It</button></section>';
    document.body.append(dialog);
    dialog.querySelectorAll('[data-close-duplicate-place]').forEach((button) => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('[data-view-duplicate-place]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
  const isPublished = place.status === 'approved';
  dialog.querySelector('[data-local-finder-duplicate-message]').textContent = isPublished
    ? 'This place may already be listed. We found a matching place name and address in Local Finder. Please check the existing listing before sharing again.'
    : 'This place has already been shared and is awaiting review. Please don’t submit it again.';
  const viewLink = dialog.querySelector('[data-view-duplicate-place]');
  viewLink.hidden = !isPublished;
  if (isPublished) viewLink.href = `#local-finder-place?category=${encodeURIComponent(place.category || 'cafe')}&id=${encodeURIComponent(place.id)}`;
  if (!dialog.open) dialog.showModal();
}
function placeCategory(key) { return placeTypes.find((place) => place.key === key) || placeTypes[0]; }
function verifiedBadge() { return `<span class="local-finder-verified"><img src="${iconPath('Icon-20.png')}" alt="" />Furgo Verified</span>`; }
function safeExternalUrl(value, fallback = '#') {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback; } catch { return fallback; }
}
function readLocation() {
  try {
    const location = JSON.parse(sessionStorage.getItem(locationKey) || 'null');
    if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) return location;
  } catch { /* Ignore invalid cached location. */ }
  return null;
}
function distanceKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const openingWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayAbbreviations = { mo: 'Monday', mon: 'Monday', tu: 'Tuesday', tue: 'Tuesday', we: 'Wednesday', wed: 'Wednesday', th: 'Thursday', thu: 'Thursday', fr: 'Friday', fri: 'Friday', sa: 'Saturday', sat: 'Saturday', su: 'Sunday', sun: 'Sunday' };

function openingHoursByDay(value) {
  const raw = typeof value === 'string' ? value : value?.raw || '';
  const hoursByDay = new Map();
  const addDays = (dayLabel, hours) => {
    const label = dayLabel.trim().toLowerCase();
    let days = [];
    if (/^(daily|every day|all days)$/.test(label)) days = openingWeekdays;
    else if (/^(weekdays|weekday)$/.test(label)) days = openingWeekdays.slice(0, 5);
    else if (/^(weekends|weekend)$/.test(label)) days = openingWeekdays.slice(5);
    else {
      const parts = label.split(/\s*(?:-|–|—|to|,|&|and)\s*/i).map((part) => weekdayAbbreviations[part.slice(0, 3)]).filter(Boolean);
      if (parts.length === 2 && /(?:-|–|—|\bto\b)/i.test(dayLabel)) {
        const start = openingWeekdays.indexOf(parts[0]);
        const end = openingWeekdays.indexOf(parts[1]);
        for (let index = start; ; index = (index + 1) % 7) {
          days.push(openingWeekdays[index]);
          if (index === end) break;
        }
      } else days = [...new Set(parts)];
    }
    days.forEach((day) => hoursByDay.set(day, hours.trim().replace(/\bclosed\b/gi, 'Closed')));
  };
  const entries = raw.split(/\r?\n|;/).map((entry) => entry.trim()).filter(Boolean);
  entries.forEach((entry) => {
    const match = entry.match(/^(.+?)\s*:\s*(.+)$/) || entry.match(/^((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*(?:-|–|—|to|,|&|and)\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(.+)$/i);
    if (match) addDays(match[1], match[2]);
  });
  return hoursByDay;
}
function openingHoursMarkup(value) {
  const hoursByDay = openingHoursByDay(value);
  return openingWeekdays.map((day) => `<div class="local-finder-opening-hours-row"><span>${day}</span><span>${escapeHTML(hoursByDay.get(day) || 'Not listed')}</span></div>`).join('');
}
function openingHoursInputFields(value) {
  const hoursByDay = openingHoursByDay(value);
  const timeOptions = (selected) => {
    const options = ['<option value="">Select time</option>'];
    for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
      const hour24 = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const suffix = hour24 < 12 ? 'am' : 'pm';
      const hour12 = hour24 % 12 || 12;
      const value = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const label = `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
      options.push(`<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`);
    }
    return options.join('');
  };
  const parseTime = (value) => {
    const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return '';
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const suffix = (match[3] || '').toLowerCase();
    if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return '';
    if (suffix) {
      if (hour < 1 || hour > 12) return '';
      if (suffix === 'am' && hour === 12) hour = 0;
      if (suffix === 'pm' && hour < 12) hour += 12;
    }
    if (hour === 24) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };
  return `<div class="local-finder-opening-hours-form" role="group" aria-label="Opening hours">${openingWeekdays.map((day) => {
    const hours = hoursByDay.get(day) || '';
    const closed = /^closed$/i.test(hours);
    const range = hours.match(/^\s*(.+?)\s*(?:-|–|—|\bto\b)\s*(.+?)\s*$/i);
    const from = range ? parseTime(range[1]) : '';
    const to = range ? parseTime(range[2]) : '';
    const status = closed ? 'closed' : (from && to) || /24\s*hours/i.test(hours) ? 'open' : '';
    const openTime = /24\s*hours/i.test(hours) ? '00:00' : from;
    const closeTime = /24\s*hours/i.test(hours) ? '23:30' : to;
    const key = day.toLowerCase();
    return `<div class="local-finder-opening-hour-row"><strong>${day}</strong><select name="opening_hours_${key}_status" aria-label="${day} status"><option value="" ${status === '' ? 'selected' : ''}>Not listed</option><option value="open" ${status === 'open' ? 'selected' : ''}>Open</option><option value="closed" ${status === 'closed' ? 'selected' : ''}>Closed</option></select><div class="local-finder-opening-hour-times" data-opening-times ${status === 'open' ? '' : 'hidden'}><select name="opening_hours_${key}_from" aria-label="${day} opening time" ${status === 'open' ? 'required' : ''}>${timeOptions(openTime)}</select><span>to</span><select name="opening_hours_${key}_to" aria-label="${day} closing time" ${status === 'open' ? 'required' : ''}>${timeOptions(closeTime)}</select></div></div>`;
  }).join('')}</div>`;
}

export function bindLocalFinderOpeningHours(form) {
  if (!form) return;
  openingWeekdays.forEach((day) => {
    const key = day.toLowerCase();
    const status = form.elements[`opening_hours_${key}_status`];
    const timeFields = status?.closest('.local-finder-opening-hour-row')?.querySelector('[data-opening-times]');
    const selects = timeFields?.querySelectorAll('select');
    const sync = () => {
      const isOpen = status.value === 'open';
      timeFields.hidden = !isOpen;
      selects?.forEach((select) => { select.required = isOpen; });
    };
    status?.addEventListener('change', sync);
    sync();
  });
}
function placeFormFields({ values = {}, includeCategory = true } = {}) {
  const hours = typeof values.opening_hours === 'string' ? values.opening_hours : values.opening_hours?.raw || '';
  const petAllowed = normalizeLocalFinderPetAllowed(values.pet_allowed);
  return `<label>Place name<input name="name" maxlength="140" required value="${escapeHTML(values.name || '')}" /></label>
    ${includeCategory ? `<label>Category<select name="category" required>${placeTypes.map((place) => `<option value="${place.key}" ${values.category === place.key ? 'selected' : ''}>${escapeHTML(place.label)}</option>`).join('')}</select></label>` : `<input type="hidden" name="category" value="${escapeHTML(values.category || '')}" />`}
    <input type="hidden" name="address" value="${escapeHTML(values.address || '')}" />
    <input type="hidden" name="latitude" value="${escapeHTML(values.latitude ?? '')}" />
    <input type="hidden" name="longitude" value="${escapeHTML(values.longitude ?? '')}" />
    <input type="hidden" name="coordinates_source" value="${escapeHTML(values.coordinates_source || '')}" />
    <input type="hidden" name="coordinates_expires_at" value="${escapeHTML(values.coordinates_expires_at || '')}" />
    <input type="hidden" name="city" value="${escapeHTML(values.city || '')}" />
    <input type="hidden" name="state" value="${escapeHTML(values.state || '')}" />
    <label>Allowed Area<input name="allowed_area" maxlength="160" placeholder="For example: Outdoor only" value="${escapeHTML(values.allowed_area || '')}" /></label>
    <label>Pets Allowed<select name="pet_allowed"><option value="" ${petAllowed ? '' : 'selected'}>Not specified</option><option value="Dog" ${petAllowed === 'Dog' ? 'selected' : ''}>Dog</option><option value="Cat" ${petAllowed === 'Cat' ? 'selected' : ''}>Cat</option><option value="All" ${petAllowed === 'All' ? 'selected' : ''}>All</option></select></label>
    <label>Pet Size<input name="pet_size" maxlength="100" placeholder="For example: Small and medium pets" value="${escapeHTML(values.pet_size || '')}" /></label>
    <label>Conditions<input name="conditions" maxlength="200" placeholder="For example: Leash required" value="${escapeHTML(values.conditions || '')}" /></label>
    <fieldset class="local-finder-opening-hours-field"><legend>Opening Hours</legend>${openingHoursInputFields(hours)}</fieldset>
    <div class="local-finder-form-pair"><label>Phone<input name="phone" type="tel" maxlength="60" value="${escapeHTML(values.phone || '')}" /></label><label>Website<input name="website" type="url" maxlength="300" placeholder="https://" value="${escapeHTML(values.website || '')}" /></label></div>
    <div class="local-finder-cover-photo-field"><label>${values.photo_url ? 'Change cover photo' : 'Add cover photo'}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label><p class="local-finder-photo-feedback" data-place-photo-feedback role="status" aria-live="polite" hidden></p><div class="local-finder-cover-photo-preview" data-place-photo-preview ${values.photo_url ? '' : 'hidden'}>${values.photo_url ? `<img src="${escapeHTML(values.photo_url)}" alt="Current place cover photo" />` : ''}</div><dialog class="local-finder-cover-photo-dialog" data-place-photo-dialog aria-labelledby="place-photo-crop-title"><h2 id="place-photo-crop-title">Adjust Cover Photo</h2><p>Drag the photo and use the slider to fit it inside the visible place card frame.</p><div class="local-finder-cover-photo-viewport" data-place-photo-viewport tabindex="0" aria-label="Cover photo crop area. Drag to reposition the photo."><img data-place-photo-crop-image alt="Cover photo crop preview" /></div><label class="local-finder-cover-photo-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value="1" data-place-photo-zoom /></label><button class="local-finder-cover-photo-reset" type="button" data-place-photo-reset>Reset position</button><div class="local-finder-cover-photo-actions"><button type="button" data-place-photo-cancel>Cancel</button><button type="button" data-place-photo-use>Use Photo</button></div></dialog><small>Optional. One cover photo only; choosing another image replaces it.</small></div>`;
}

export function normalizeLocalFinderPetAllowed(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || /\b(unknown|not listed|not specified|unspecified|n\/a)\b/.test(normalized)) return '';
  if (normalized === 'all' || /\b(all pets?|dogs?\s*(?:and|&)\s*cats?|cats?\s*(?:and|&)\s*dogs?)\b/.test(normalized)) return 'All';
  if (/\b(dogs?|canines?)\b/.test(normalized)) return 'Dog';
  if (/\b(cats?|felines?)\b/.test(normalized)) return 'Cat';
  if (/\b(pets?|animals?)\b/.test(normalized)) return 'All';
  return '';
}

function localFinderLocationPicker({ values = {} } = {}) {
  return `<section class="local-finder-location-picker" aria-label="Find a place location">
    <div class="local-finder-location-picker-heading"><div><strong>Find this place on the map</strong><span>Search for a venue or use your current location to fill in its name, address and map pin.</span></div></div>
    <div class="local-finder-location-search" data-place-location-search><div><input id="place-location-query" name="query" type="search" maxlength="180" placeholder="Search a place or address" autocomplete="off" /><button class="button button-secondary" type="button" data-place-search>Search</button></div></div>
    <button class="button button-secondary" type="button" data-place-use-location>Use current location</button>
    <p class="local-finder-selected-address" data-place-selected-address>${escapeHTML(values.address || 'Choose a place to fill its address.')}</p>
    <div class="local-finder-location-results" data-place-location-results aria-live="polite"></div>
    <p class="local-finder-google-attribution" translate="no">Google Maps</p>
  </section>`;
}

function componentLongName(result, ...types) {
  for (const type of types) {
    const value = result.address_components?.find((component) => component.types?.includes(type))?.long_name;
    if (value) return value;
  }
  return '';
}

/** Resolve an address with Google's Geocoding service and only accept a Malaysia result. */
export async function lookupLocalFinderCoordinates(address, city = '', state = '') {
  // Geocoding is most reliable with the postal address alone. Adding a POI
  // name to the address can make an otherwise valid address return no result.
  // Avoid repeating city/state when the CSV address already contains them.
  const parts = [];
  const seen = new Set();
  for (const part of [address, city, state, 'Malaysia']) {
    const value = String(part || '').trim();
    const key = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (value && key && !seen.has(key)) { parts.push(value); seen.add(key); }
  }
  const query = parts.join(', ');
  if (query.length < 3) return null;
  const geocoder = await loadGoogleGeocoder();
  let response;
  try {
    response = await withGoogleTimeout(geocoder.geocode({ address: query, componentRestrictions: { country: 'MY' }, region: 'MY' }), 'Google Geocoding did not respond within 15 seconds. Check Google Cloud API access and try again.');
  } catch (error) {
    const status = String(error?.code || error?.message || 'Google Geocoding failed');
    const hint = /REQUEST_DENIED|not authorized|API key/i.test(status)
      ? 'Check that Geocoding API is enabled and the browser key allows this website.'
      : /OVER_QUERY_LIMIT|OVER_DAILY_LIMIT|quota|rate limit/i.test(status)
        ? 'Google reports a quota or rate limit. Check the Geocoding API quota in Google Cloud.'
        : /timed out|did not respond|did not initialize|within 15 seconds/i.test(status)
          ? 'Check Google Cloud API access, allowed website referrers, and network connection.'
        : 'Check the address and retry.';
    throw new Error(`Google could not check this address (${status}). ${hint}`);
  }
  if (response?.status && !['OK', 'ZERO_RESULTS'].includes(response.status)) {
    throw new Error(`Google Geocoding returned ${response.status}. Check the Geocoding API key, API access, and quota in Google Cloud.`);
  }
  const { results = [] } = response || {};
  const result = results.find((item) => item.address_components?.some((component) => component.types?.includes('country') && component.short_name === 'MY'));
  const location = result?.geometry?.location;
  if (!location) return null;
  return { latitude: location.lat(), longitude: location.lng() };
}

async function fillPlaceFromGoogleGeocoder(form, location) {
  const geocoder = await loadGoogleGeocoder();
  const { results = [] } = await geocoder.geocode({ location, region: 'MY' });
  const result = results.find((item) => item.address_components?.some((component) => component.types?.includes('country') && component.short_name === 'MY')) || results[0];
  if (!result) return false;
  const fields = form.elements;
  fields.address.value = result.formatted_address || '';
  fields.city.value = componentLongName(result, 'locality', 'postal_town', 'administrative_area_level_2', 'sublocality_level_1');
  fields.state.value = componentLongName(result, 'administrative_area_level_1');
  const selectedAddress = form.querySelector('[data-place-selected-address]');
  if (selectedAddress) selectedAddress.textContent = fields.address.value || 'The selected location has no formatted address.';
  return Boolean(fields.address.value);
}

export function bindLocalFinderLocationPicker(form, supabase = null) {
  const searchForm = form?.querySelector('[data-place-location-search]');
  const results = form?.querySelector('[data-place-location-results]');
  if (!form || !results) return;
  const isAdminForm = form.matches('.admin-local-finder-direct-form, [data-local-place-edit-form]');

  const showResults = (suggestions) => {
    if (!suggestions.length) {
      results.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'No matching places found. Try a nearby street, suburb or venue name.' }));
      return;
    }
    results.replaceChildren(...suggestions.map((suggestion, index) => {
      const prediction = suggestion.placePrediction;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'local-finder-location-result';
      button.dataset.placeResult = String(index);
      const title = document.createElement('strong');
      const subtitle = document.createElement('span');
      title.textContent = prediction?.mainText?.toString?.() || prediction?.text?.toString?.() || 'Place result';
      subtitle.textContent = prediction?.secondaryText?.toString?.() || prediction?.text?.toString?.() || '';
      button.append(title, subtitle);
      return button;
    }));
    results._suggestions = suggestions;
  };

  const searchPlaces = async () => {
    const query = searchForm.querySelector('[name="query"]').value.trim();
    if (query.length < 2) {
      results.textContent = 'Enter at least two characters to search.';
      return;
    }
    results.textContent = 'Searching Google Maps…';
    const button = searchForm.querySelector('[data-place-search]');
    button.disabled = true;
    try {
      if (!supabase) throw new Error('Google Places search is unavailable.');
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await loadGooglePlacesLibrary();
      const quota = await requestLocalFinderQuota(supabase, 'consume_local_finder_share_search');
      if (!quota.allowed) {
        results.textContent = placeShareLimitMessage(isAdminForm);
        return;
      }
      const sessionToken = new AutocompleteSessionToken();
      const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['my'],
        sessionToken,
      });
      results._sessionToken = sessionToken;
      showResults(suggestions.filter((suggestion) => suggestion.placePrediction));
    }
    catch (error) { results.textContent = error.message || 'Place search failed. Please try again.'; }
    finally { button.disabled = false; }
  };
  searchForm?.querySelector('[data-place-search]')?.addEventListener('click', searchPlaces);
  searchForm?.querySelector('[name="query"]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); searchPlaces(); }
  });

  results.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-place-result]');
    if (!button) return;
    const suggestion = results._suggestions?.[Number(button.dataset.placeResult)];
    if (!suggestion?.placePrediction) return;
    const prediction = suggestion.placePrediction;
    button.disabled = true;
    results.setAttribute('aria-busy', 'true');
    try {
      if (!supabase) throw new Error('Google Places search is unavailable.');
      const quota = await requestLocalFinderQuota(supabase, 'consume_local_finder_share_search');
      if (!quota.allowed) {
        results.textContent = placeShareLimitMessage(isAdminForm);
        return;
      }
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });
      const components = place.addressComponents || [];
      const addressComponent = (...types) => types.map((type) => components.find((component) => component.types?.includes(type))?.longText).find(Boolean) || '';
      form.elements.name.value = prediction.mainText?.toString?.() || prediction.text?.toString?.() || '';
      form.elements.address.value = place.formattedAddress || '';
      form.elements.city.value = addressComponent('locality', 'postal_town', 'administrative_area_level_2', 'sublocality_level_1');
      form.elements.state.value = addressComponent('administrative_area_level_1');
      form.elements.latitude.value = place.location?.lat?.() ?? '';
      form.elements.longitude.value = place.location?.lng?.() ?? '';
      form.elements.coordinates_source.value = 'google_places';
      form.elements.coordinates_expires_at.value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const selectedAddress = form.querySelector('[data-place-selected-address]');
      if (selectedAddress) selectedAddress.textContent = form.elements.address.value || 'The selected place has no formatted address.';
      results.replaceChildren(Object.assign(document.createElement('p'), { className: 'local-finder-location-selected', textContent: 'Location added from Google Maps. Please check the details and complete the pet-friendly information.' }));
    } catch (error) {
      results.textContent = error.message || 'Place details could not be loaded. Please search again.';
    } finally {
      results.removeAttribute('aria-busy');
    }
  });

  form.querySelector('[data-place-use-location]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    if (!navigator.geolocation) {
      results.textContent = 'Current location is unavailable in this browser. Search for a place or enter the address manually.';
      return;
    }
    button.disabled = true;
    results.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      form.elements.latitude.value = coords.latitude;
      form.elements.longitude.value = coords.longitude;
      form.elements.coordinates_source.value = 'user_location';
      form.elements.coordinates_expires_at.value = '';
      try {
        if (!supabase) throw new Error('Google address lookup is unavailable.');
        const quota = await requestLocalFinderQuota(supabase, 'consume_local_finder_share_search');
        if (!quota.allowed) {
          results.textContent = placeShareLimitMessage(isAdminForm);
          return;
        }
        const foundAddress = await fillPlaceFromGoogleGeocoder(form, { lat: coords.latitude, lng: coords.longitude });
        results.textContent = foundAddress
          ? 'Current location added. Please enter the venue name and complete the pet-friendly information.'
          : 'Current map pin added, but Google could not find an address. Search for the place or enter its details manually.';
      } catch (error) {
        const selectedAddress = form.querySelector('[data-place-selected-address]');
        if (selectedAddress) selectedAddress.textContent = 'Current location selected. Search for the place to fill its address.';
        results.textContent = error.message || 'Current map pin added. Search for the place or enter its details manually.';
      } finally { button.disabled = false; }
    }, () => {
      results.textContent = 'Location access was not granted. Search for a place or enter the address manually.';
      button.disabled = false;
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  });
}

export function localFinderAdminFormFields({ values = {} } = {}) { return `${localFinderLocationPicker({ values })}${placeFormFields({ values })}`; }

export function bindLocalFinderPlacePhotoPreview(form) {
  const input = form?.elements.photo;
  const preview = form?.querySelector('[data-place-photo-preview]');
  const dialog = form?.querySelector('[data-place-photo-dialog]');
  const viewport = dialog?.querySelector('[data-place-photo-viewport]');
  const cropImage = dialog?.querySelector('[data-place-photo-crop-image]');
  const zoomControl = dialog?.querySelector('[data-place-photo-zoom]');
  const resetButton = dialog?.querySelector('[data-place-photo-reset]');
  const cancelButton = dialog?.querySelector('[data-place-photo-cancel]');
  const useButton = dialog?.querySelector('[data-place-photo-use]');
  if (!input || !preview || !dialog || !viewport || !cropImage || !zoomControl || !cancelButton || !useButton) return;

  let pendingFile = null;
  let confirmedPhoto = null;
  let confirmedPreviewUrl = '';
  let applyingCrop = false;
  let cropState = { zoom: 1, x: 0, y: 0, width: 0, height: 0, dragging: false, pointerX: 0, pointerY: 0, startX: 0, startY: 0 };
  const feedback = form.querySelector('[data-place-photo-feedback]');
  const updateFrameAspect = () => {
    const viewportWidth = window.innerWidth;
    const cardContainerWidth = Math.min(viewportWidth, 980);
    const sidePadding = viewportWidth <= 420 ? 18 : 22 + cardContainerWidth * 0.05;
    const cardWidth = Math.max(1, cardContainerWidth - sidePadding * 2);
    const cardHeight = Math.max(105, Math.min(viewportWidth * 0.31, 196));
    const frameAspect = `${cardWidth} / ${cardHeight}`;
    viewport.style.aspectRatio = frameAspect;
    preview.style.aspectRatio = frameAspect;
  };
  const drawCrop = () => {
    if (!cropImage?.naturalWidth) return;
    const bounds = viewport.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const fit = Math.max(bounds.width / cropImage.naturalWidth, bounds.height / cropImage.naturalHeight);
    cropState.width = cropImage.naturalWidth * fit * cropState.zoom;
    cropState.height = cropImage.naturalHeight * fit * cropState.zoom;
    cropState.x = Math.max(-(cropState.width - bounds.width) / 2, Math.min((cropState.width - bounds.width) / 2, cropState.x));
    cropState.y = Math.max(-(cropState.height - bounds.height) / 2, Math.min((cropState.height - bounds.height) / 2, cropState.y));
    cropImage.style.width = `${cropState.width}px`;
    cropImage.style.height = `${cropState.height}px`;
    cropImage.style.left = `calc(50% + ${cropState.x}px)`;
    cropImage.style.top = `calc(50% + ${cropState.y}px)`;
  };
  const cropSelectedPhoto = async () => {
    if (!cropImage?.naturalWidth || !pendingFile) throw new Error('Choose and adjust a cover photo before using it.');
    const bounds = viewport.getBoundingClientRect();
    const outputWidth = 1400;
    const outputHeight = Math.max(1, Math.round(outputWidth * bounds.height / bounds.width));
    const scale = outputWidth / bounds.width;
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the cover photo. Please try another image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(
      cropImage,
      ((bounds.width - cropState.width) / 2 + cropState.x) * scale,
      ((bounds.height - cropState.height) / 2 + cropState.y) * scale,
      cropState.width * scale,
      cropState.height * scale,
    );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Could not prepare the cover photo. Please try another image.');
    const sourceName = pendingFile.name.replace(/\.[^.]+$/, '') || 'cover-photo';
    return new File([blob], `${sourceName}-cover.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  };

  const discardPendingPhoto = () => {
    if (!applyingCrop) {
      input.value = '';
    }
    pendingFile = null;
    applyingCrop = false;
  };
  dialog.addEventListener('close', discardPendingPhoto);
  cancelButton.addEventListener('click', () => dialog.close());
  useButton.addEventListener('click', async () => {
    useButton.disabled = true;
    if (feedback) { feedback.textContent = ''; feedback.hidden = true; }
    try {
      confirmedPhoto = await cropSelectedPhoto();
      if (confirmedPreviewUrl) URL.revokeObjectURL(confirmedPreviewUrl);
      confirmedPreviewUrl = URL.createObjectURL(confirmedPhoto);
      preview.replaceChildren();
      const image = document.createElement('img');
      image.alt = 'Selected place cover photo';
      image.src = confirmedPreviewUrl;
      preview.append(image);
      preview.hidden = false;
      applyingCrop = true;
      dialog.close();
    } catch (error) {
      if (feedback) { feedback.textContent = error.message || 'Could not prepare the cover photo. Please try another image.'; feedback.hidden = false; }
    } finally { useButton.disabled = false; }
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (feedback) { feedback.textContent = ''; feedback.hidden = true; }
    if (file.size > 2 * 1024 * 1024) {
      input.value = '';
      if (feedback) { feedback.textContent = 'Place photos must be 2 MB or smaller.'; feedback.hidden = false; }
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      input.value = '';
      if (feedback) { feedback.textContent = 'Upload a JPG, PNG, or WebP place photo.'; feedback.hidden = false; }
      return;
    }
    pendingFile = file;
    cropState = { ...cropState, zoom: 1, x: 0, y: 0, dragging: false };
    zoomControl.value = '1';
    updateFrameAspect();
    const objectUrl = URL.createObjectURL(file);
    cropImage.onload = () => { drawCrop(); URL.revokeObjectURL(objectUrl); };
    cropImage.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      pendingFile = null;
      input.value = '';
      if (feedback) { feedback.textContent = 'This image could not be opened. Try a different photo.'; feedback.hidden = false; }
    };
    cropImage.src = objectUrl;
    if (!dialog.open) dialog.showModal();
  });
  zoomControl.addEventListener('input', () => { cropState.zoom = Number(zoomControl.value) || 1; drawCrop(); });
  resetButton?.addEventListener('click', () => { cropState.zoom = 1; cropState.x = 0; cropState.y = 0; zoomControl.value = '1'; drawCrop(); });
  viewport.addEventListener('pointerdown', (event) => {
    if (!cropImage?.naturalWidth) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    cropState.dragging = true;
    cropState.pointerX = event.clientX;
    cropState.pointerY = event.clientY;
    cropState.startX = cropState.x;
    cropState.startY = cropState.y;
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!cropState.dragging) return;
    cropState.x = cropState.startX + event.clientX - cropState.pointerX;
    cropState.y = cropState.startY + event.clientY - cropState.pointerY;
    drawCrop();
  });
  const endDrag = () => { cropState.dragging = false; };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  updateFrameAspect();
  window.addEventListener('resize', () => { updateFrameAspect(); drawCrop(); });
  form._localFinderCropSelectedPhoto = async () => confirmedPhoto;
  form._localFinderClearSelectedCoverPhoto = () => {
    confirmedPhoto = null;
    if (confirmedPreviewUrl) URL.revokeObjectURL(confirmedPreviewUrl);
    confirmedPreviewUrl = '';
    input.value = '';
  };
}

export async function saveLocalFinderPlaceData(form, supabase, userId, existingPhoto = '') {
  const fields = form.elements;
  const address = fields.address.value.trim();
  if (address.length < 3 || address.length > 500) throw new Error('Search for and select a place location to fill in its address.');
  let latitude = fields.latitude.value === '' ? null : Number(fields.latitude.value);
  let longitude = fields.longitude.value === '' ? null : Number(fields.longitude.value);
  let coordinatesSource = fields.coordinates_source?.value || (latitude === null ? '' : 'imported');
  let coordinatesExpiresAt = fields.coordinates_expires_at?.value || '';
  if ((latitude === null) !== (longitude === null)) throw new Error('Enter both map coordinates, or leave both blank.');
  if (latitude === null) {
    const quota = await requestLocalFinderQuota(supabase, 'consume_local_finder_share_search');
    if (!quota.allowed) throw new Error(placeShareLimitMessage(form.matches('.admin-local-finder-direct-form, [data-local-place-edit-form]')));
    const coordinates = await lookupLocalFinderCoordinates(address, fields.city.value.trim(), fields.state.value.trim());
    if (coordinates) ({ latitude, longitude } = coordinates);
    else throw new Error('We could not locate this address. Search for and select the place on the map before submitting.');
    coordinatesSource = 'google_geocoding';
    coordinatesExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  let photoUrl = existingPhoto;
  let photo = form._localFinderCropSelectedPhoto ? await form._localFinderCropSelectedPhoto() : fields.photo.files?.[0];
  if (photo) {
    if (photo.size > 2 * 1024 * 1024) throw new Error('Place photos must be 2 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new Error('Upload a JPG, PNG, or WebP place photo.');
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('local-finder-photos').upload(path, photo, { contentType: photo.type, upsert: false });
    if (error) throw error;
    photoUrl = supabase.storage.from('local-finder-photos').getPublicUrl(path).data.publicUrl;
    form._localFinderClearSelectedCoverPhoto?.();
  }
  const website = fields.website.value.trim();
  const openingHours = openingWeekdays.map((day) => {
    const key = day.toLowerCase();
    const status = fields[`opening_hours_${key}_status`].value;
    if (status === 'closed') return `${day}: Closed`;
    if (status !== 'open') return '';
    const from = fields[`opening_hours_${key}_from`].value;
    const to = fields[`opening_hours_${key}_to`].value;
    if (!from || !to) throw new Error(`Select both opening and closing times for ${day}, or choose Closed.`);
    const displayTime = (value) => {
      const [hourText, minuteText] = value.split(':');
      const hour24 = Number(hourText);
      const suffix = hour24 < 12 ? 'am' : 'pm';
      return `${hour24 % 12 || 12}:${minuteText}${suffix}`;
    };
    return `${day}: ${displayTime(from)}–${displayTime(to)}`;
  }).filter(Boolean).join('\n');
  return {
    name: fields.name.value.trim(), category: fields.category.value, address,
    city: fields.city.value.trim(), state: fields.state.value.trim(), latitude, longitude,
    coordinates_source: latitude === null ? null : coordinatesSource,
    coordinates_expires_at: latitude === null ? null : (coordinatesSource.startsWith('google_') ? coordinatesExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null),
    allowed_area: fields.allowed_area.value.trim(), pet_allowed: normalizeLocalFinderPetAllowed(fields.pet_allowed.value),
    pet_size: fields.pet_size.value.trim(), conditions: fields.conditions.value.trim(),
    opening_hours: { raw: openingHours }, phone: fields.phone.value.trim(),
    website, photo_url: photoUrl,
  };
}

function localFinderAnnouncementsMarkup() {
  const announcements = loadAnnouncements();
  const cards = announcements.map((announcement) => {
    const destination = normalizePromotionDestination(announcement.destination);
    const external = destination.startsWith('https://');
    const content = `<img src="${escapeHTML(announcement.image)}" alt="${escapeHTML(announcement.title)}" loading="lazy" /><div class="local-finder-announcement-copy"><h3>${escapeHTML(announcement.title)}</h3><p>${escapeHTML(announcement.details || '')}</p></div>`;
    return destination
      ? `<a class="local-finder-announcement-card" href="${escapeHTML(destination)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''}>${content}</a>`
      : `<article class="local-finder-announcement-card">${content}</article>`;
  }).join('');
  return `<section class="local-finder-announcements" aria-labelledby="local-finder-announcements-title"><div class="local-finder-section-heading"><h2 id="local-finder-announcements-title">Announcement</h2>${announcements.length > 1 ? '<span>Swipe to see more</span>' : ''}</div>${cards ? `<div class="local-finder-announcement-track">${cards}</div>` : ''}</section>`;
}

// Local Finder keeps sharing and nearby categories prominent, with saved places and updates below.
export function localFinderPage() {
  const icon = iconPath;
  return `<main class="local-finder-page">
    <header class="local-finder-header"><a href="#home" aria-label="Back to Home">‹</a><h1>Pet Local Finder</h1><span aria-hidden="true"></span></header>
    <section class="local-finder-content">
      <section class="local-finder-share-card" aria-labelledby="local-finder-share-title">
        <img class="local-finder-share-art" src="${icon('MVP Icon-06.png')}" alt="Furgo dog pointing out places on a map" />
        <div><h2 id="local-finder-share-title">Share Your Places</h2><p>Share your favourite pet-friendly places and shops with us!</p><button class="button button-primary" type="button" data-open-place-suggestion>Share Now</button></div>
      </section>
      <section class="local-finder-nearby" aria-labelledby="local-finder-nearby-title">
        <h2 id="local-finder-nearby-title">Find The Places Near Me:</h2>
        <div class="local-finder-categories">${placeTypes.map((place) => `<a class="local-finder-category" href="#local-finder-list?category=${place.key}"><img src="${icon(place.icon)}" alt="" /><span>${escapeHTML(place.label)}</span></a>`).join('')}</div>
      </section>
      <a class="local-finder-favorites-banner" href="#local-finder-favourites"><span><strong>Favourite Places</strong><small>Save places you love and find them here anytime.</small></span><span class="local-finder-favorites-count">${loadLocalFinderFavorites().length} saved</span><b aria-hidden="true">›</b></a>
      ${localFinderAnnouncementsMarkup()}
    </section>
    <dialog class="local-finder-share-dialog" data-place-suggestion-dialog aria-labelledby="place-suggestion-title">
      <form class="local-finder-suggestion-form" data-place-suggestion-form>
        <header><div><span>Help our community discover</span><h2 id="place-suggestion-title">Share a Place</h2></div><button type="button" data-close-place-suggestion aria-label="Close">×</button></header>
        ${localFinderLocationPicker()}
        ${placeFormFields()}
        <p class="local-finder-form-note">Thanks for sharing a pet-friendly place with the Furgo community.</p>
        <p class="local-finder-suggestion-feedback" data-place-suggestion-feedback role="status" aria-live="polite"></p>
        <button class="button button-primary" type="submit">Submit Place</button>
      </form>
    </dialog>
    <dialog class="local-finder-limit-dialog" data-local-finder-limit-dialog aria-labelledby="local-finder-limit-title"><div><h2 id="local-finder-limit-title">Monthly place search limit reached</h2><p data-local-finder-limit-message>Sorry, this month’s 2,000 place-sharing search limit has been reached. Please try again next month.</p><button class="button button-primary" type="button" data-close-local-finder-limit>Got it</button></div></dialog>
    ${bottomNavigation('home', icon)}
  </main>`;
}

export function localFinderFavoritesPage() {
  return `<main class="local-finder-page local-finder-subpage local-finder-list-page local-finder-favorites-page"><header class="local-finder-header"><a href="#local-finder" aria-label="Back to Local Finder">‹</a><h1>Favourite Places</h1><span aria-hidden="true"></span></header><section class="local-finder-content local-finder-list-content"><p class="local-finder-results-location">Your saved places</p><div class="local-finder-place-list" data-finder-favorite-list aria-live="polite"><p class="local-finder-loading">Loading your favourite places…</p></div></section>${bottomNavigation('home', iconPath)}</main>`;
}

export function localFinderListPage(params = new URLSearchParams()) {
  const category = placeCategory(params.get('category'));
  return `<main class="local-finder-page local-finder-subpage local-finder-list-page">
    <header class="local-finder-header"><a href="#local-finder" aria-label="Back to Local Finder">‹</a><h1>${escapeHTML(category.label)} Near Me</h1><span aria-hidden="true"></span></header>
    <section class="local-finder-content local-finder-list-content">
      <p class="local-finder-results-location" data-finder-list-location>Finding places near you…</p>
      <div class="local-finder-place-list" data-finder-place-list aria-live="polite"><p class="local-finder-loading">Finding nearby places…</p></div>
      ${openStreetMapAttribution}
    </section>
    ${bottomNavigation('home', iconPath)}
  </main>`;
}

export function localFinderPlacePage(params = new URLSearchParams()) {
  const category = placeCategory(params.get('category'));
  return `<main class="local-finder-page local-finder-subpage local-finder-place-page">
    <header class="local-finder-header"><a href="#local-finder-list?category=${category.key}" aria-label="Back to ${escapeHTML(category.label)} results">‹</a><h1>${escapeHTML(category.label)} Near Me</h1><span aria-hidden="true"></span></header>
    <section class="local-finder-place-detail" data-finder-place-detail aria-live="polite"><p class="local-finder-loading">Loading place details…</p></section>
    ${openStreetMapAttribution}
    ${bottomNavigation('home', iconPath)}
  </main>`;
}

export function setupLocalFinder(supabase) {
  if (supabase) Promise.resolve(supabase.rpc('expire_local_finder_google_coordinates')).catch(() => {});
  const route = window.location.hash.slice(1).split('?')[0];
  const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (route === 'local-finder-list') {
    loadLocalFinderList(routeParams, supabase);
    return;
  }
  if (route === 'local-finder-place') {
    loadLocalFinderPlace(routeParams, supabase);
    return;
  }
  if (route === 'local-finder-favourites') {
    loadLocalFinderFavoritesPage(supabase);
    return;
  }
  if (route !== 'local-finder') return;
  const dialog = document.querySelector('[data-place-suggestion-dialog]');
  const suggestionForm = document.querySelector('[data-place-suggestion-form]');
  const suggestionFeedback = suggestionForm?.querySelector('[data-place-suggestion-feedback]');
  bindLocalFinderLocationPicker(suggestionForm, supabase);
  bindLocalFinderOpeningHours(suggestionForm);
  bindLocalFinderPlacePhotoPreview(suggestionForm);
  const limitDialog = document.querySelector('[data-local-finder-limit-dialog]');
  const limitMessage = limitDialog?.querySelector('[data-local-finder-limit-message]');
  const showLimitNotice = (message = placeShareLimitMessage()) => {
    if (limitMessage) limitMessage.textContent = message;
    if (limitDialog && !limitDialog.open) limitDialog.showModal();
  };
  limitDialog?.querySelector('[data-close-local-finder-limit]')?.addEventListener('click', () => limitDialog.close());
  document.querySelector('[data-open-place-suggestion]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const quota = await requestLocalFinderQuota(supabase, 'get_local_finder_share_search_quota');
      if (!quota.allowed) { showLimitNotice(); return; }
      dialog?.showModal();
    } catch (error) {
      showLimitNotice(error.message || 'Sorry, place sharing is temporarily unavailable. Please try again later.');
    } finally { button.disabled = false; }
  });
  document.querySelector('[data-close-place-suggestion]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  suggestionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!suggestionForm.reportValidity()) return;
    const submit = suggestionForm.querySelector('[type="submit"]');
    submit.disabled = true;
    suggestionFeedback.textContent = 'Submitting your place for review…';
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before submitting a place.');
      const details = await saveLocalFinderPlaceData(suggestionForm, supabase, authData.user.id);
      const duplicate = await findLocalFinderDuplicate(supabase, details);
      if (duplicate) { showLocalFinderDuplicateNotice(duplicate); suggestionFeedback.textContent = ''; return; }
      const { error } = await supabase.from('local_finder_places').insert({ ...details, created_by: authData.user.id, status: 'pending', is_verified: false });
      if (error) throw error;
      suggestionForm.reset();
      suggestionFeedback.classList.remove('is-error');
      suggestionFeedback.textContent = 'Place submitted. Thanks for helping improve Local Finder.';
      window.setTimeout(() => dialog?.close(), 1800);
    } catch (error) {
      suggestionFeedback.textContent = error.message || 'Your place could not be submitted. Apply migration 0051 in Supabase, then try again.';
      suggestionFeedback.classList.add('is-error');
    } finally {
      submit.disabled = false;
    }
  });

}

async function getCurrentLocation() {
  const cached = readLocation();
  if (cached) return cached;
  if (!navigator.geolocation) throw new Error('Location access is unavailable in this browser.');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(({ coords }) => {
    const location = { latitude: coords.latitude, longitude: coords.longitude };
    sessionStorage.setItem(locationKey, JSON.stringify(location));
    resolve(location);
  }, () => reject(new Error('Allow location access to see nearby places.')), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }));
}

async function fetchNearbyPlaces(category, location, supabase) {
  const [{ data: places, error }, { data: recommendations, error: recommendationError }] = await Promise.all([
    supabase.from('local_finder_places').select('*').eq('category', category).eq('status', 'approved').eq('is_hidden', false),
    supabase.rpc('get_local_finder_recommendation_counts'),
  ]);
  if (error) throw new Error(error.message.includes('local_finder_places') ? 'Apply migration 0051 in Supabase to enable the Local Finder directory.' : error.message);
  if (recommendationError) throw new Error(recommendationError.message);
  return normalizeLocalFinderPlaces(places || [], recommendations || [], location);
}

function normalizeLocalFinderPlaces(places, recommendations, location) {
  const counts = new Map((recommendations || []).map((row) => [row.place_id, row]));
  return (places || []).map((place) => ({
    ...place,
    pet_allowed: normalizeLocalFinderPetAllowed(place.pet_allowed),
    id: place.id,
    tags: {
      dog: normalizeLocalFinderPetAllowed(place.pet_allowed),
      opening_hours: place.opening_hours?.raw || '',
      phone: place.phone,
      website: place.website,
      indoor_seating: (place.allowed_area || '').toLowerCase().includes('indoor') ? 'yes' : '',
      outdoor_seating: (place.allowed_area || '').toLowerCase().includes('outdoor') ? 'yes' : '',
    },
    distance: location && place.latitude != null && place.latitude !== '' && place.longitude != null && place.longitude !== ''
      ? distanceKm(location, { latitude: Number(place.latitude), longitude: Number(place.longitude) })
      : null,
    image: place.photo_url,
    address: place.address,
    recommendationCount: Number(counts.get(place.id)?.recommendation_count || 0),
    recommendedByUser: Boolean(counts.get(place.id)?.recommended_by_me),
    isFavorite: loadLocalFinderFavorites().includes(String(place.id)),
  })).sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
}

async function loadLocalFinderFavoritesPage(supabase) {
  const target = document.querySelector('[data-finder-favorite-list]');
  if (!target) return;
  const ids = loadLocalFinderFavorites();
  if (!ids.length) {
    target.innerHTML = '<div class="local-finder-empty"><h2>No Favourite Places Yet</h2><p>Tap the star on a place to save it here.</p><a class="button button-primary" href="#local-finder">Find Places</a></div>';
    return;
  }
  const [{ data: places, error }, { data: recommendations, error: recommendationError }] = await Promise.all([
    supabase.from('local_finder_places').select('*').in('id', ids).eq('status', 'approved').eq('is_hidden', false),
    supabase.rpc('get_local_finder_recommendation_counts'),
  ]);
  if (error || recommendationError) {
    target.innerHTML = `<p class="local-finder-empty">${escapeHTML(error?.message || recommendationError?.message || 'Your saved places could not be loaded.')}</p>`;
    return;
  }
  const normalized = normalizeLocalFinderPlaces(places || [], recommendations || [], null);
  const byId = new Map(normalized.map((place) => [String(place.id), place]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  target.innerHTML = ordered.length
    ? ordered.map((place) => placeCard(place, placeCategory(place.category), { showDistance: false })).join('')
    : '<div class="local-finder-empty"><h2>No Favourite Places Yet</h2><p>Your saved places may have been removed from the directory.</p><a class="button button-primary" href="#local-finder">Find Places</a></div>';
}

function placeCard(place, category, { showDistance = true } = {}) {
  const petRules = [place.allowed_area, place.pet_allowed, place.pet_size, place.conditions].filter(Boolean);
  const photo = place.image ? `<img src="${escapeHTML(place.image)}" alt="" loading="lazy" />` : `<div class="local-finder-place-no-photo">No Photo Uploaded</div>`;
  const area = [place.city, place.state].filter(Boolean).join(', ') || place.address;
  const detailsRoute = `#local-finder-place?category=${category.key}&id=${encodeURIComponent(place.id)}`;
  return `<a class="local-finder-place-card" href="${detailsRoute}">
    <div class="local-finder-place-card-copy"><span>${escapeHTML(area)}</span>${showDistance ? `<span>${place.distance === null ? 'Approx. distance unavailable' : `Approx. distance: ${place.distance.toFixed(1)}km`}</span>` : ''}<h2>${escapeHTML(place.name)}</h2><p>${place.recommendationCount} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}</p></div>
    <div class="local-finder-place-card-photo">${photo}</div>
  </a>`;
}

async function loadLocalFinderList(params, supabase) {
  const category = placeCategory(params.get('category'));
  const list = document.querySelector('[data-finder-place-list]');
  const locationLabel = document.querySelector('[data-finder-list-location]');
  try {
    const location = await getCurrentLocation();
    if (locationLabel) locationLabel.textContent = 'Places closest to your current location';
    const places = await fetchNearbyPlaces(category.key, location, supabase);
    if (!list) return;
    list.innerHTML = places.length ? places.map((place) => placeCard(place, category)).join('') : '<p class="local-finder-empty">No nearby places were found in this category. Try again in another area.</p>';
  } catch (error) {
    if (list) list.innerHTML = `<p class="local-finder-empty">${escapeHTML(error.message || 'Nearby places could not be loaded.')}</p><a class="button button-primary local-finder-back-button" href="#local-finder">Back to Local Finder</a>`;
  }
}

async function loadLocalFinderPlace(params, supabase) {
  const category = placeCategory(params.get('category'));
  const id = params.get('id') || '';
  const detail = document.querySelector('[data-finder-place-detail]');
  if (!detail) return;
  try {
    const location = await getCurrentLocation();
    const places = await fetchNearbyPlaces(category.key, location, supabase);
    const place = places.find((item) => item.id === id);
    if (!place) throw new Error('This place is no longer available in nearby map results.');
    const tags = place.tags;
    const petRules = [place.allowed_area, place.pet_allowed, place.pet_size, place.conditions].filter(Boolean);
    const photo = place.image ? `<img class="local-finder-detail-photo" src="${escapeHTML(place.image)}" alt="${escapeHTML(place.name)}" />` : `<div class="local-finder-detail-no-photo">No Photo Uploaded</div>`;
    const openingHours = openingHoursMarkup(tags.opening_hours);
    const destination = `${place.name} ${place.address}`.trim();
    const directions = place.latitude === null ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` : `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
    const wazeDirections = place.latitude === null ? `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes` : `https://waze.com/ul?ll=${place.latitude}%2C${place.longitude}&navigate=yes`;
    const phone = place.phone;
    const website = safeExternalUrl(place.website, '');
    const myId = (await supabase.auth.getUser()).data?.user?.id;
    detail.innerHTML = `<div class="local-finder-detail-image">${photo}</div>
      <section class="local-finder-detail-summary"><div class="local-finder-detail-meta"><div class="local-finder-detail-recommend"><span data-place-recommendation-count>${place.recommendationCount} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}</span><button type="button" class="local-finder-recommend-button" data-place-recommend data-place-id="${escapeHTML(place.id)}" data-recommended="${place.recommendedByUser}">${place.recommendedByUser ? 'Remove Recommendation' : 'Recommend This Place'}</button></div><span>${place.distance === null ? 'Approx. distance unavailable' : `Approx. distance: ${place.distance.toFixed(1)}km`}</span></div><div class="local-finder-place-title-row"><h2>${escapeHTML(place.name)}</h2><button type="button" class="button local-finder-favorite-button" data-toggle-local-favorite="${escapeHTML(place.id)}" aria-label="${place.isFavorite ? `Remove ${escapeHTML(place.name)} from favourite places` : `Save ${escapeHTML(place.name)} as favourite`}" aria-pressed="${place.isFavorite}">${place.isFavorite ? 'Remove Favourite' : 'Save As Favourite'}</button></div><p>${escapeHTML([place.city, place.state].filter(Boolean).join(', ') || place.address)}</p><div class="local-finder-rule-chips">${petRules.length ? petRules.map((rule) => `<span>${escapeHTML(rule)}</span>`).join('') : '<span>Pet rules not provided</span>'}</div></section>
      <section class="local-finder-detail-contact"><div><strong>Address:</strong><span>${escapeHTML(place.address)}</span></div><div class="local-finder-direction"><span>Approx. distance: ${place.distance === null ? 'Unavailable' : `${place.distance.toFixed(1)}km`}</span><details class="local-finder-directions-menu"><summary class="button button-primary">Go Now</summary><div role="menu"><a role="menuitem" href="${directions}" target="_blank" rel="noopener noreferrer">Google Maps</a><a role="menuitem" href="${wazeDirections}" target="_blank" rel="noopener noreferrer">Waze</a></div></details></div></section>
      <section class="local-finder-detail-facts"><p><span>Allowed Area</span><span>${escapeHTML(place.allowed_area || 'Not listed')}</span></p><p><span>Pet Allowed</span><span>${escapeHTML(place.pet_allowed || 'Not listed')}</span></p><p><span>Size</span><span>${escapeHTML(place.pet_size || 'Not listed')}</span></p><p><span>Conditions</span><span>${escapeHTML(place.conditions || 'Not listed')}</span></p>${phone ? `<p><span>Phone</span><a href="tel:${escapeHTML(phone.replaceAll(/[^+\d]/g, ''))}">${escapeHTML(phone)}</a></p>` : ''}${website ? `<p><span>Website</span><a href="${escapeHTML(website)}" target="_blank" rel="noopener noreferrer">Visit website</a></p>` : ''}<h3>Opening Hours</h3><div class="local-finder-opening-hours">${openingHours}</div></section>
      <section class="local-finder-detail-actions"><p class="local-finder-action-feedback" data-place-action-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="button" data-open-place-edit>Suggest Edit</button></section>
      <dialog class="local-finder-share-dialog" data-place-edit-dialog aria-labelledby="place-edit-title"><form class="local-finder-suggestion-form" data-place-edit-form data-place-id="${escapeHTML(place.id)}"><header><div><span>Suggest a correction</span><h2 id="place-edit-title">Suggest Edit</h2></div><button type="button" data-close-place-edit aria-label="Close">×</button></header>${placeFormFields({ values: place, includeCategory: false })}<p class="local-finder-suggestion-feedback" data-place-edit-feedback role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Submit Edit</button></form></dialog>
      `;
    wirePlaceActions(detail, supabase, place, myId);
  } catch (error) {
    detail.innerHTML = `<p class="local-finder-empty">${escapeHTML(error.message || 'Place details could not be loaded.')}</p><a class="button button-primary local-finder-back-button" href="#local-finder-list?category=${category.key}">Back to results</a>`;
  }
}

function wirePlaceActions(root, supabase, place, userId) {
  const feedback = root.querySelector('[data-place-action-feedback]');
  const recommendButton = root.querySelector('[data-place-recommend]');
  recommendButton?.addEventListener('click', async () => {
    if (!userId) { feedback.textContent = 'Sign in to recommend this place.'; return; }
    const isRecommended = recommendButton.dataset.recommended === 'true';
    recommendButton.disabled = true;
    const result = isRecommended
      ? await supabase.from('local_finder_recommendations').delete().eq('place_id', place.id).eq('user_id', userId)
      : await supabase.from('local_finder_recommendations').insert({ place_id: place.id, user_id: userId });
    recommendButton.disabled = false;
    if (result.error) { feedback.textContent = result.error.message || 'Your recommendation could not be saved.'; return; }
    const count = Math.max(0, place.recommendationCount + (isRecommended ? -1 : 1));
    place.recommendationCount = count;
    recommendButton.dataset.recommended = String(!isRecommended);
    recommendButton.textContent = isRecommended ? 'Recommend This Place' : 'Remove Recommendation';
    root.querySelector('[data-place-recommendation-count]').innerHTML = `${count} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}`;
    feedback.textContent = isRecommended ? '' : 'Thanks for recommending this place!';
  });

  root.querySelector('[data-toggle-local-favorite]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const favorites = loadLocalFinderFavorites();
    const isSaved = favorites.includes(String(place.id));
    const updated = isSaved ? favorites.filter((id) => id !== String(place.id)) : [...favorites, String(place.id)];
    localStorage.setItem(localFinderFavoritesKey, JSON.stringify(updated));
    button.setAttribute('aria-pressed', String(!isSaved));
    button.setAttribute('aria-label', isSaved ? `Save ${place.name} as favourite` : `Remove ${place.name} from favourite places`);
    button.textContent = isSaved ? 'Save As Favourite' : 'Remove Favourite';
    const bannerCount = document.querySelector('.local-finder-favorites-count');
    if (bannerCount) bannerCount.textContent = `${updated.length} saved`;
    const feedback = root.querySelector('[data-place-action-feedback]');
    if (feedback) feedback.textContent = isSaved ? 'Removed from your favourite places.' : 'Saved to your favourite places.';
  });

  const dialog = root.querySelector('[data-place-edit-dialog]');
  const form = root.querySelector('[data-place-edit-form]');
  bindLocalFinderLocationPicker(form);
  bindLocalFinderOpeningHours(form);
  bindLocalFinderPlacePhotoPreview(form);
  const close = () => dialog?.close();
  root.querySelector('[data-open-place-edit]')?.addEventListener('click', () => dialog?.showModal());
  dialog?.querySelector('[data-close-place-edit]')?.addEventListener('click', close);
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    const formFeedback = form.querySelector('[data-place-edit-feedback]');
    submit.disabled = true;
    formFeedback.textContent = 'Sending your edit…';
    try {
      const data = await saveLocalFinderPlaceData(form, supabase, userId, place.photo_url);
      const { error } = await supabase.from('local_finder_place_edits').insert({
        place_id: place.id, submitted_by: userId, proposed_changes: data, status: 'pending',
      });
      if (error) throw error;
      formFeedback.classList.remove('is-error');
      formFeedback.textContent = 'Edit submitted. Thanks for helping improve Local Finder.';
      window.setTimeout(close, 1800);
    } catch (error) {
      formFeedback.textContent = error.message || 'The edit could not be submitted.';
      formFeedback.classList.add('is-error');
    } finally { submit.disabled = false; }
  });
}
