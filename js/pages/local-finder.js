import { bottomNavigation, escapeHTML } from '../shared.js';
import { GOOGLE_MAPS_API_KEY } from '../google-maps-config.js';

const placeTypes = [
  { label: 'Cafe & Dining', key: 'cafe', icon: 'Finder Icon-01.png' },
  { label: 'Park or Mall', key: 'park', icon: 'Finder Icon-02.png' },
  { label: 'Pet Clinic', key: 'clinic', icon: 'Finder Icon-03.png' },
  { label: 'Pet Event', key: 'event', icon: 'Finder Icon-04.png' },
];

const defaultMapFrame = 'https://www.openstreetmap.org/export/embed.html?bbox=101.663%2C3.116%2C101.720%2C3.166&layer=mapnik&marker=3.141%2C101.691';
const locationKey = 'furgo-local-finder-location';
let googlePlacesLibraryPromise;
let googleMapsLibraryPromise;

function loadGoogleMapsLibrary() {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('Google Places is not configured yet. Add the restricted Google Maps API key in js/google-maps-config.js.');
  if (!googleMapsLibraryPromise) {
    googleMapsLibraryPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) { resolve(window.google.maps); return; }
      const callbackName = '__furgoGoogleMapsReady';
      const script = document.createElement('script');
      window[callbackName] = () => resolve(window.google.maps);
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async&authReferrerPolicy=origin&region=MY&language=en&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error('Google Places could not load. Check the API key and enabled APIs.'));
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
  const { Geocoder } = await maps.importLibrary('geocoding');
  return new Geocoder();
}

async function requestLocalFinderQuota(supabase, rpcName) {
  const { data, error } = await supabase.rpc(rpcName);
  if (error) throw new Error(error.message.includes('function public.') ? 'Apply migration 0055 in Supabase to enable the monthly Local Finder search limit.' : error.message);
  return (Array.isArray(data) ? data[0] : data) || { allowed: false, requests_used: 2000, monthly_limit: 2000 };
}

function placeShareLimitMessage(isAdmin = false) {
  return isAdmin
    ? 'Sorry, this month’s 2,000 place-sharing search limit has been reached. Please try again next month.'
    : 'Sorry, this month’s place-sharing limit has been reached. Please try again next month.';
}

function iconPath(file) { return `Image/Icon/${encodeURIComponent(file)}`; }
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
function mapUrl(latitude, longitude, zoom = 15) {
  const radius = Math.max(.008, .18 / 2 ** (zoom - 10));
  const bbox = `${longitude - radius},${latitude - radius},${longitude + radius},${latitude + radius}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude},${longitude}`;
}
function placeFormFields({ values = {}, includeCategory = true } = {}) {
  const hours = typeof values.opening_hours === 'string' ? values.opening_hours : values.opening_hours?.raw || '';
  return `<label>Place name<input name="name" maxlength="140" required value="${escapeHTML(values.name || '')}" /></label>
    ${includeCategory ? `<label>Category<select name="category" required>${placeTypes.map((place) => `<option value="${place.key}" ${values.category === place.key ? 'selected' : ''}>${escapeHTML(place.label)}</option>`).join('')}</select></label>` : `<input type="hidden" name="category" value="${escapeHTML(values.category || '')}" />`}
    <input type="hidden" name="address" value="${escapeHTML(values.address || '')}" />
    <input type="hidden" name="latitude" value="${escapeHTML(values.latitude ?? '')}" />
    <input type="hidden" name="longitude" value="${escapeHTML(values.longitude ?? '')}" />
    <input type="hidden" name="city" value="${escapeHTML(values.city || '')}" />
    <input type="hidden" name="state" value="${escapeHTML(values.state || '')}" />
    <label>Allowed Area<input name="allowed_area" maxlength="160" placeholder="For example: Outdoor only" value="${escapeHTML(values.allowed_area || '')}" /></label>
    <label>Pets Allowed<input name="pet_allowed" maxlength="160" placeholder="For example: Dogs only" value="${escapeHTML(values.pet_allowed || '')}" /></label>
    <label>Pet Size<input name="pet_size" maxlength="100" placeholder="For example: Small and medium pets" value="${escapeHTML(values.pet_size || '')}" /></label>
    <label>Conditions<input name="conditions" maxlength="200" placeholder="For example: Leash required" value="${escapeHTML(values.conditions || '')}" /></label>
    <fieldset class="local-finder-opening-hours-field"><legend>Opening Hours</legend>${openingHoursInputFields(hours)}</fieldset>
    <div class="local-finder-form-pair"><label>Phone<input name="phone" type="tel" maxlength="60" value="${escapeHTML(values.phone || '')}" /></label><label>Website<input name="website" type="url" maxlength="300" placeholder="https://" value="${escapeHTML(values.website || '')}" /></label></div>
    <div class="local-finder-cover-photo-field"><label>${values.photo_url ? 'Change cover photo' : 'Add cover photo'}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label><div class="local-finder-cover-photo-preview" data-place-photo-preview ${values.photo_url ? '' : 'hidden'}>${values.photo_url ? `<img src="${escapeHTML(values.photo_url)}" alt="Current place cover photo" />` : ''}</div><small>Optional. One cover photo only; choosing another image replaces it.</small></div>`;
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
export async function lookupLocalFinderCoordinates(address, city = '', state = '', placeName = '') {
  const query = [placeName, address, city, state, 'Malaysia'].filter(Boolean).join(', ').trim();
  if (query.length < 3) return null;
  const geocoder = await loadGoogleGeocoder();
  const { results = [] } = await geocoder.geocode({ address: query, componentRestrictions: { country: 'MY' }, region: 'MY' });
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
  if (!input || !preview) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    preview.replaceChildren();
    const image = document.createElement('img');
    image.alt = 'Selected place cover photo';
    image.src = URL.createObjectURL(file);
    preview.append(image);
    preview.hidden = false;
  });
}

export async function saveLocalFinderPlaceData(form, supabase, userId, existingPhoto = '') {
  const fields = form.elements;
  const address = fields.address.value.trim();
  if (address.length < 3 || address.length > 500) throw new Error('Search for and select a place location to fill in its address.');
  let latitude = fields.latitude.value === '' ? null : Number(fields.latitude.value);
  let longitude = fields.longitude.value === '' ? null : Number(fields.longitude.value);
  if ((latitude === null) !== (longitude === null)) throw new Error('Enter both map coordinates, or leave both blank.');
  if (latitude === null) {
    const quota = await requestLocalFinderQuota(supabase, 'consume_local_finder_share_search');
    if (!quota.allowed) throw new Error(placeShareLimitMessage(form.matches('.admin-local-finder-direct-form, [data-local-place-edit-form]')));
    const coordinates = await lookupLocalFinderCoordinates(address, fields.city.value.trim(), fields.state.value.trim(), fields.name.value.trim());
    if (coordinates) ({ latitude, longitude } = coordinates);
    else throw new Error('We could not locate this address. Search for and select the place on the map before submitting.');
  }
  let photoUrl = existingPhoto;
  const photo = fields.photo.files?.[0];
  if (photo) {
    if (photo.size > 2 * 1024 * 1024) throw new Error('Place photos must be 2 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new Error('Upload a JPG, PNG, or WebP place photo.');
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('local-finder-photos').upload(path, photo, { contentType: photo.type, upsert: false });
    if (error) throw error;
    photoUrl = supabase.storage.from('local-finder-photos').getPublicUrl(path).data.publicUrl;
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
    allowed_area: fields.allowed_area.value.trim(), pet_allowed: fields.pet_allowed.value.trim(),
    pet_size: fields.pet_size.value.trim(), conditions: fields.conditions.value.trim(),
    opening_hours: { raw: openingHours }, phone: fields.phone.value.trim(),
    website, photo_url: photoUrl,
  };
}

// Local Finder keeps the mockup's main actions visible: share a place, choose a category, and browse a map.
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
      <section class="local-finder-map-wrap" aria-label="Nearby map">
        <iframe title="Map of nearby places" data-local-finder-map src="${defaultMapFrame}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <button class="local-finder-map-locate" type="button" data-local-finder-location-button aria-label="Center map on my current location" title="Use my location"><span aria-hidden="true">◎</span></button>
        <p class="local-finder-feedback" data-local-finder-feedback role="status" aria-live="polite"></p>
      </section>
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

export function localFinderListPage(params = new URLSearchParams()) {
  const category = placeCategory(params.get('category'));
  return `<main class="local-finder-page local-finder-subpage local-finder-list-page">
    <header class="local-finder-header"><a href="#local-finder" aria-label="Back to Local Finder">‹</a><h1>${escapeHTML(category.label)} Near Me</h1><span aria-hidden="true"></span></header>
    <section class="local-finder-content local-finder-list-content">
      <p class="local-finder-results-location" data-finder-list-location>Finding places near you…</p>
      <div class="local-finder-place-list" data-finder-place-list aria-live="polite"><p class="local-finder-loading">Finding nearby places…</p></div>
    </section>
    ${bottomNavigation('home', iconPath)}
  </main>`;
}

export function localFinderPlacePage(params = new URLSearchParams()) {
  const category = placeCategory(params.get('category'));
  return `<main class="local-finder-page local-finder-subpage local-finder-place-page">
    <header class="local-finder-header"><a href="#local-finder-list?category=${category.key}" aria-label="Back to ${escapeHTML(category.label)} results">‹</a><h1>${escapeHTML(category.label)} Near Me</h1><span aria-hidden="true"></span></header>
    <section class="local-finder-place-detail" data-finder-place-detail aria-live="polite"><p class="local-finder-loading">Loading place details…</p></section>
    ${bottomNavigation('home', iconPath)}
  </main>`;
}

export function setupLocalFinder(supabase) {
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

  let currentCoordinates = readLocation();
  const map = document.querySelector('[data-local-finder-map]');
  const feedback = document.querySelector('[data-local-finder-feedback]');
  const locationButton = document.querySelector('[data-local-finder-location-button]');
  const setCurrentLocation = (coordinates) => {
    currentCoordinates = { latitude: coordinates.latitude, longitude: coordinates.longitude };
    sessionStorage.setItem(locationKey, JSON.stringify(currentCoordinates));
    map.src = mapUrl(currentCoordinates.latitude, currentCoordinates.longitude, 12);
  };
  const requestLocation = (announce = true) => {
    if (!navigator.geolocation) {
      if (announce && feedback) feedback.textContent = 'Location access is unavailable in this browser. The map is showing the default area.';
      return;
    }
    if (announce && feedback) feedback.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setCurrentLocation(coords);
      if (feedback) feedback.textContent = 'Map centered on your current location. Choose a category to find nearby places.';
    }, () => {
      if (feedback) feedback.textContent = 'Location could not be accessed. Check browser permission and tap the location button to try again.';
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  };
  if (currentCoordinates) setCurrentLocation(currentCoordinates);
  else requestLocation(false);
  locationButton?.addEventListener('click', () => requestLocation(true));
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
  const counts = new Map((recommendations || []).map((row) => [row.place_id, row]));
  return (places || []).map((place) => ({
    ...place,
    id: place.id,
    tags: {
      dog: place.pet_allowed,
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
  })).sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
}

function placeCard(place, category) {
  const petRules = [place.allowed_area, place.pet_allowed, place.pet_size, place.conditions].filter(Boolean);
  const photo = place.image ? `<img src="${escapeHTML(place.image)}" alt="" loading="lazy" />` : `<div class="local-finder-place-no-photo">No Photo Uploaded</div>`;
  const area = [place.city, place.state].filter(Boolean).join(', ') || place.address;
  const detailsRoute = `#local-finder-place?category=${category.key}&id=${encodeURIComponent(place.id)}`;
  return `<a class="local-finder-place-card" href="${detailsRoute}">
    <div class="local-finder-place-card-copy"><span>${escapeHTML(area)}</span><span>${place.distance === null ? 'Approx. distance unavailable' : `Approx. distance: ${place.distance.toFixed(1)}km`}</span><h2>${escapeHTML(place.name)}</h2><p>${place.recommendationCount} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}</p></div>
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
      <section class="local-finder-detail-summary"><div class="local-finder-detail-meta"><div class="local-finder-detail-recommend"><span data-place-recommendation-count>${place.recommendationCount} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}</span><button type="button" class="local-finder-recommend-button" data-place-recommend data-place-id="${escapeHTML(place.id)}" data-recommended="${place.recommendedByUser}">${place.recommendedByUser ? 'Remove' : 'Recommend'}</button></div><span>${place.distance === null ? 'Approx. distance unavailable' : `Approx. distance: ${place.distance.toFixed(1)}km`}</span></div><h2>${escapeHTML(place.name)}</h2><p>${escapeHTML([place.city, place.state].filter(Boolean).join(', ') || place.address)}</p><div class="local-finder-rule-chips">${petRules.length ? petRules.map((rule) => `<span>${escapeHTML(rule)}</span>`).join('') : '<span>Pet rules not provided</span>'}</div></section>
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
    recommendButton.textContent = isRecommended ? 'Recommend' : 'Remove';
    root.querySelector('[data-place-recommendation-count]').innerHTML = `${count} Furgomate Recommended ${place.is_verified ? verifiedBadge() : ''}`;
    feedback.textContent = isRecommended ? '' : 'Thanks for recommending this place!';
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
