import { bottomNavigation, escapeHTML } from '../shared.js';
import { defaultPetAvatarPath, freePetAssistantAvatars, freePetCatAvatars, isPetAssistantSelected, loadPetProfiles, petAvatarUrl, petCustomAvatarLibrary, petProfilePictureUrl, savePetAssistantIds, saveSelectedPetAssistantId, selectedPetAssistantId, selectedPetAssistantIds } from './home.js';
import { formatPetDate, localPetDate, loadPetRecords, loadPetReminders, petServiceReminders, savePetRecord, savePetReminders } from './pet-care-data.js';
import { loadGroomingBookings } from './grooming-data.js';
import { loadHotelBookings } from './hotel-data.js';
import { loadDaycareBookings } from './daycare-data.js';
import { createPetReminderInboxNotification, showPortalBrowserNotification } from '../portal-notifications.js';

const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
const getPet = (petId) => loadPetProfiles().find((pet) => String(pet.id) === String(petId)) || null;
const medicineDetailsList = (reminders = {}) => Array.isArray(reminders.medicines)
  ? reminders.medicines.map((item, index) => ({ ...item, id: item.id || `medicine-${index + 1}` }))
  : reminders.medicine?.name ? [{ ...reminders.medicine, id: reminders.medicine.id || 'legacy-medicine' }] : [];
const activeMedicineDetails = (reminders, date = localPetDate()) => medicineDetailsList(reminders).filter((item) => item.name && item.startDate && item.endDate && item.frequency && item.dosage && item.startDate <= date && item.endDate >= date);
const medicineIntakeFieldKey = (id) => `medicine_${String(id || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
const medicineIntakeEntry = (entry, reminders = {}) => {
  if (typeof entry === 'string') return { time: entry, medicineId: '', name: reminders.medicine?.name || 'Medicine' };
  return entry || {};
};
let medicineReminderInterval = null;
const petSettingTitle = (pet, section) => pet?.name?.trim() ? `${escapeHTML(pet.name)}’s ${section}` : `This Pet ${section}`;
const petSettingIcon = (name) => {
  const paths = {
    Avatar: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/><path d="M4 4v3M4 4h3M20 4h-3M20 4v3M4 20v-3M4 20h3M20 20h-3M20 20v-3"/>',
    Reminder: '<rect x="4.5" y="6" width="15" height="14" rx="2"/><path d="M8 3.5v5M16 3.5v5M4.5 10h15M8 14h2M13 14h3"/>',
    Vaccination: '<path d="m8 3 13 13-5 5L3 8z"/><path d="m6 6 3-3M10 10l2-2M13 13l2-2M8 16l2-2M12 20l2-2"/>',
    'Daily Care': '<path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z"/><path d="M9 4.5v-2h6v2M8 10h8M8 14h8M8 18h5"/>',
    Data: '<path d="M4 6.5C4 5.1 7.6 4 12 4s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5Z"/><path d="M4 6.5v5C4 12.9 7.6 14 12 14s8-1.1 8-2.5v-5M4 11.5v5C4 17.9 7.6 19 12 19s8-1.1 8-2.5v-5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths['Daily Care']}</svg>`;
};
const petSettingRow = (pet, section, href) => `<a class="profile-menu-row" href="${href}"><span class="pet-setting-label"><span class="pet-setting-icon">${petSettingIcon(section)}</span><span>${petSettingTitle(pet, section)}</span></span><span class="profile-chevron" aria-hidden="true">›</span></a>`;
const pageHeader = (title, pet, back = `#pet-profile?id=${encodeURIComponent(pet?.id || '')}&section=settings`) => `<header class="profile-heading"><a class="profile-back" href="${back}" aria-label="Back to Pet Profile settings">‹</a><h1>${title}</h1></header>`;
const missingPet = () => `<section class="profile-summary"><h2>Pet profile not found</h2><p>Return to the home page and choose a pet profile.</p><a href="#home">Go to Home</a></section>`;

export function petProfileOverviewPage(petId = '') {
  const pets = loadPetProfiles();
  const pet = pets.find((item) => String(item.id) === String(petId)) || null;
  if (!pet) return `<main class="pet-profile-page">${pageHeader('Pet Profile', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const petIndex = pets.findIndex((item) => String(item.id) === String(pet.id));
  const remarks = Array.isArray(pet.remarks) ? pet.remarks : (pet.tags || []);
  return `<main class="pet-profile-page pet-care-page" data-pet-profile-page>
    ${pageHeader('Pet Profile', pet, '#home')}
    <div class="pet-profile-swipe-viewport pet-profile-overview-swipe-viewport" data-pet-profile-swipe-viewport>
    <div class="pet-profile-swipe-track" data-pet-profile-swipe-track>
    <div class="pet-profile-transition-content" data-pet-profile-transition-content>
    <section class="pet-profile-overview-shell" aria-label="${escapeHTML(pet.name)} profile and settings">
    <section class="pet-overview-media" data-pet-overview-media data-pet-id="${escapeHTML(pet.id)}" aria-label="Pet pictures and avatar">
      <button class="pet-profile-photo ${pet.photo || pet.profilePictureMode === 'avatar' ? 'has-photo' : ''}" type="button" data-open-profile-picture-menu aria-label="Choose a pet profile picture"><img data-pet-profile-preview src="${escapeHTML(petProfilePictureUrl(pet))}" alt="${escapeHTML(pet.name)} profile picture" /><span class="pet-photo-prompt">${pet.photo ? 'Change Photo' : pet.profilePictureMode === 'avatar' ? 'Pet Avatar' : 'Add Photo'}</span><span class="pet-photo-upload-mark" aria-hidden="true"><img src="${icon('Icon-17.png')}" alt="" /></span></button>
      <h2 class="pet-profile-photo-name">${escapeHTML(pet.name || 'Unnamed Pet')}</h2>
      <input type="file" accept="image/*" data-pet-overview-photo hidden />
      <dialog class="pet-photo-crop-dialog pet-profile-picture-choice-dialog" data-profile-picture-dialog aria-labelledby="overview-picture-title"><button class="pet-profile-picture-dialog-close" type="button" data-close-profile-picture-dialog aria-label="Close" title="Close">×</button><h2 id="overview-picture-title">Pet Profile Picture</h2><p>Choose a picture for this profile.</p><div class="pet-profile-picture-choice-actions"><button type="button" data-use-created-avatar>${pet.avatar ? 'Use Pet Avatar' : 'Create Avatar'}</button><button type="button" data-upload-profile-photo>Upload a Photo</button><button class="pet-profile-picture-delete" type="button" data-delete-profile-picture ${pet.photo || pet.profilePictureMode === 'avatar' ? '' : 'hidden'}>Delete Profile Picture</button></div></dialog>
      <dialog class="pet-photo-crop-dialog pet-profile-picture-confirm-dialog" data-delete-profile-picture-confirm aria-labelledby="delete-picture-title"><h2 id="delete-picture-title">Delete profile picture?</h2><p>Your pet profile picture will return to the default image.</p><div class="pet-photo-crop-actions"><button type="button" data-cancel-delete-profile-picture>Cancel</button><button type="button" data-confirm-delete-profile-picture>Yes, Delete</button></div></dialog>
      <dialog class="pet-photo-crop-dialog" data-pet-profile-crop-dialog aria-labelledby="pet-profile-crop-title"><h2 id="pet-profile-crop-title">Adjust Profile Picture</h2><p>Drag the photo and zoom to fit it inside the circle.</p><div class="pet-photo-crop-viewport" data-pet-profile-crop-viewport tabindex="0" aria-label="Photo crop area. Drag to reposition, or use arrow keys."><img data-pet-profile-crop-image alt="Pet profile picture crop preview" /></div><label class="pet-photo-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value="1" data-pet-profile-crop-zoom /></label><p class="pet-profile-crop-feedback" data-pet-profile-crop-feedback role="status" aria-live="polite"></p><div class="pet-photo-crop-actions"><button type="button" data-pet-profile-cancel-crop>Cancel</button><button type="button" data-pet-profile-use-crop>Use Photo</button></div></dialog>
      <div class="pet-profile-picture-options"><button type="button" data-create-pet-avatar hidden>Create your pet avatar</button><input type="file" accept="image/*" data-pet-avatar-source-photo hidden /><div class="pet-avatar-create-result" data-pet-avatar-result hidden><img data-pet-avatar-preview src="${escapeHTML(pet.avatar || '')}" alt="Created pet avatar preview" /><span data-pet-avatar-result-label>${pet.avatar ? 'Current pet avatar' : ''}</span></div><p class="pet-avatar-create-feedback" data-pet-avatar-feedback role="status" aria-live="polite"></p></div>
    </section>
    <article class="pet-card pet-profile-overview-card pet-profile-details-banner">
      ${petIndex > 0 ? '<button class="pet-profile-swap-arrow is-previous" type="button" data-pet-profile-previous aria-label="Show previous pet">‹</button>' : ''}
      <button class="pet-profile-swap-arrow is-next" type="button" data-pet-profile-next aria-label="Show next pet or add a new pet">›</button>
      <section class="pet-profile-details-list" aria-label="Pet details">
        <div class="pet-profile-detail-row"><span>Breed</span><strong>${escapeHTML(pet.breed || 'Not added')}</strong></div>
        <div class="pet-profile-detail-row"><span>Gender</span><strong>${escapeHTML(pet.sex || 'Not added')}</strong></div>
        <div class="pet-profile-detail-row"><span>Birthday / Adoption Day</span><strong>${pet.birthDate ? escapeHTML(formatPetDate(pet.birthDate)) : 'Not added'}</strong></div>
        <div class="pet-profile-detail-row"><span>Vaccination Cards</span><strong>${(pet.vaccinationCards || []).length ? 'Yes' : 'No'}</strong></div>
        <div class="pet-profile-detail-row"><span>Weight</span><strong>${pet.weight ? `${escapeHTML(pet.weight)} kg` : 'Not added'}</strong></div>
        <div class="pet-profile-detail-row pet-profile-detail-remarks"><span>Remarks</span><div class="pet-tags">${remarks.map((remark) => `<span>${escapeHTML(remark)}</span>`).join('') || '<span>None added</span>'}</div></div>
      </section>
      <a class="pet-profile-button" href="#pet-profile-edit?id=${encodeURIComponent(pet.id)}&from=pet-profile">Edit Profile</a>
    </article>
    <nav class="profile-menu pet-care-menu" aria-label="Settings for this pet">
      <section class="profile-menu-group pet-care-links">
        ${petSettingRow(pet, 'Avatar', `#pet-avatar?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Daily Care', `#pet-record?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Vaccination', `#pet-vaccination?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Reminder', `#pet-reminder?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Data', `#pet-data?id=${encodeURIComponent(pet.id)}`)}
      </section>
      <button class="pet-assistant-profile-toggle ${isPetAssistantSelected(pet.id) ? 'is-selected' : ''}" type="button" data-toggle-pet-assistant="${escapeHTML(pet.id)}" aria-pressed="${isPetAssistantSelected(pet.id)}">${isPetAssistantSelected(pet.id) ? '✓ Shown as Home Page Pet Assistant' : 'Show as Home Page Pet Assistant'}</button>
    </nav>
    </section>
    <div class="pet-profile-delete-area">
      <button class="pet-profile-delete-link" type="button" data-open-pet-profile-delete data-delete-pet-id="${escapeHTML(pet.id)}">Delete ${escapeHTML(pet.name || 'Pet')}’s Profile</button>
      <p class="pet-profile-delete-feedback" data-pet-profile-delete-feedback role="status" aria-live="polite"></p>
      <dialog class="pet-delete-dialog" data-pet-profile-delete-dialog aria-labelledby="delete-pet-profile-title"><h2 id="delete-pet-profile-title">Confirm Delete Profile?</h2><p>Are you sure you want to delete this pet profile?</p><div class="pet-delete-actions"><button type="button" data-cancel-pet-profile-delete>Cancel</button><button type="button" data-confirm-pet-profile-delete>Yes, delete</button></div></dialog>
    </div>
    </div>
    </div>
    </div>
    ${bottomNavigation('home', icon)}
  </main>`;
}
export function petProfileAddCardPage() {
  const pets = loadPetProfiles();
  const lastPet = pets[pets.length - 1];
  return `<main class="pet-profile-page pet-care-page" data-pet-profile-page>
    ${pageHeader('Pet Profile', null, lastPet ? `#pet-profile?id=${encodeURIComponent(lastPet.id)}` : '#home')}
    <div class="pet-profile-swipe-viewport pet-profile-overview-swipe-viewport" data-pet-profile-swipe-viewport>
    <div class="pet-profile-swipe-track" data-pet-profile-swipe-track>
    <div class="pet-profile-transition-content pet-profile-add-swipe-slide" data-pet-profile-transition-content>
    <section class="pet-profile-overview-shell pet-profile-add-overview-shell" aria-label="New pet profile">
    <section class="pet-overview-media" aria-label="New pet profile picture">
      <a class="pet-profile-photo pet-profile-photo-add" href="#pet-profile?mode=add&from=pet-profile" aria-label="Add a profile picture when creating a pet profile">
        <img src="Image/Other%20Image/Pet%20Profile%20Picture.png" alt="" />
        <span class="pet-photo-upload-mark" aria-hidden="true"><img src="${icon('Icon-17.png')}" alt="" /></span>
        <span class="pet-photo-prompt">Add Photo</span>
      </a>
    </section>
    <article class="pet-card pet-profile-overview-card pet-profile-details-banner pet-profile-add-details-banner" aria-label="New pet details">
      ${lastPet ? '<button class="pet-profile-swap-arrow is-previous" type="button" data-pet-profile-previous aria-label="Show previous pet">‹</button>' : ''}
      <section class="pet-profile-details-list" aria-label="Pet details">
        <div class="pet-profile-detail-row"><span>Breed</span><strong>&nbsp;</strong></div>
        <div class="pet-profile-detail-row"><span>Gender</span><strong>&nbsp;</strong></div>
        <div class="pet-profile-detail-row"><span>Birthday / Adoption Day</span><strong>&nbsp;</strong></div>
        <div class="pet-profile-detail-row"><span>Vaccination Cards</span><strong>&nbsp;</strong></div>
        <div class="pet-profile-detail-row"><span>Weight</span><strong>&nbsp;</strong></div>
        <div class="pet-profile-detail-row pet-profile-detail-remarks"><span>Remarks</span><div class="pet-tags"></div></div>
      </section>
      <a class="pet-profile-button" href="#pet-profile?mode=add&from=pet-profile">Add New Profile</a>
    </article>
    <nav class="profile-menu pet-care-menu pet-profile-add-settings" aria-label="Settings for this pet">
      <section class="profile-menu-group pet-care-links">
        ${['Avatar', 'Daily Care', 'Vaccination', 'Reminder', 'Data'].map((section) => `<button class="profile-menu-row" type="button" disabled><span class="pet-setting-label"><span class="pet-setting-icon">${petSettingIcon(section)}</span><span>This Pet ${section}</span></span><span class="profile-chevron" aria-hidden="true">›</span></button>`).join('')}
      </section>
    </nav>
    </section>
    </div>
    </div>
    </div>
    ${bottomNavigation('home', icon)}
  </main>`;
}

export function petAvatarPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Avatar', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const customAvatars = petCustomAvatarLibrary();
  const activeCustomIndex = customAvatars.findIndex((avatar) => (pet.avatarPath && avatar.path === pet.avatarPath) || avatar.url === pet.avatar);
  const activeCustom = activeCustomIndex >= 0 ? `custom:${activeCustomIndex}` : '';
  const cards = [
    ...customAvatars.map((avatar, index) => ({ label: avatar.petName, url: avatar.url, value: `custom:${index}` })),
    { label: 'Furgo Assistant Dog', url: defaultPetAvatarPath, value: 'free:furgo' },
    ...freePetAssistantAvatars.map((avatar) => ({ label: avatar.label, url: avatar.url, value: `free:${avatar.id}` })),
    ...freePetCatAvatars.map((avatar) => ({ label: avatar.label, url: avatar.url, value: `free:${avatar.id}` })),
  ];
  const customCards = cards.filter((card) => card.value.startsWith('custom:'));
  const dogCards = cards.filter((card) => card.value === 'free:furgo' || freePetAssistantAvatars.some((avatar) => card.value === `free:${avatar.id}`));
  const catCards = cards.filter((card) => freePetCatAvatars.some((avatar) => card.value === `free:${avatar.id}`));
  const renderAvatarCarousel = (items, title, emptyMessage = '', footer = '') => `<section class="pet-avatar-library-section" aria-label="${escapeHTML(title)}">
      <h2>${escapeHTML(title)}</h2>
      ${items.length ? `<div class="pet-avatar-carousel-wrap"><button class="pet-avatar-carousel-arrow" type="button" data-avatar-scroll="prev" aria-label="Scroll ${escapeHTML(title)} backward">‹</button><div class="pet-avatar-carousel" role="group" aria-label="${escapeHTML(title)} avatars">${items.map((card) => `<label class="pet-avatar-choice"><input type="radio" name="pet-avatar-choice" value="${escapeHTML(card.value)}" ${card.value === activeChoice ? 'checked' : ''} /><img src="${escapeHTML(card.url)}" alt="" loading="lazy" /><span>${escapeHTML(card.label)}</span></label>`).join('')}</div><button class="pet-avatar-carousel-arrow" type="button" data-avatar-scroll="next" aria-label="Scroll ${escapeHTML(title)} forward">›</button></div>` : `<p class="pet-avatar-empty">${escapeHTML(emptyMessage)}</p>`}
      ${footer}
    </section>`;
  const activeChoice = activeCustom || (freePetAssistantAvatars.find((avatar) => avatar.url === pet.avatar)?.id
    ? `free:${freePetAssistantAvatars.find((avatar) => avatar.url === pet.avatar).id}`
    : freePetCatAvatars.find((avatar) => avatar.url === pet.avatar)?.id
      ? `free:${freePetCatAvatars.find((avatar) => avatar.url === pet.avatar).id}`
      : 'free:furgo');
  return `<main class="pet-profile-page pet-care-page pet-avatar-page" data-pet-avatar-page data-pet-id="${escapeHTML(pet.id)}">
    ${pageHeader(petSettingTitle(pet, 'Avatar'), pet)}
    <section class="pet-avatar-intro"><img data-pet-avatar-current-preview src="${escapeHTML(petAvatarUrl(pet))}" alt="${escapeHTML(pet.name)}’s Pet Assistant avatar preview" /><div class="pet-avatar-intro-content"><h2>${escapeHTML(pet.name)}’s Pet Assistant</h2>${customAvatars.length ? '<p>Your created pet avatars appear first, followed by free Furgo avatars.</p>' : '<p>Choose or create an avatar for your pet.</p>'}<button class="button button-primary pet-avatar-save-inline" type="button" data-save-pet-avatar>Save This Avatar</button></div></section>
    <p class="pet-avatar-page-feedback" data-pet-avatar-feedback role="status" aria-live="polite"></p>
    <div class="pet-avatar-library" aria-label="Choose a pet avatar">
      ${renderAvatarCarousel(customCards, 'Your Avatar', 'Create a pet avatar and it will appear here.', '<button class="button button-outline pet-avatar-create-cta" type="button" data-pet-avatar-create-coming-soon>Create Your Pet Avatar Now</button>')}
      ${renderAvatarCarousel(dogCards, 'Furgo Dog Avatar')}
      ${renderAvatarCarousel(catCards, 'Furgo Cat Avatar')}
    </div>
    ${bottomNavigation('home', icon)}
  </main>`;
}

export function petDataPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Data', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const records = loadPetRecords(pet.id).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const reminders = loadPetReminders(pet.id);
  const rawWeightPoints = records.flatMap((record) => {
    if (Array.isArray(record.weightHistory) && record.weightHistory.length) {
      return record.weightHistory.flatMap((entry) => {
        const value = Number(entry.value ?? entry.weightKg ?? entry.weight);
        const timestamp = entry.changedAt || record.date;
        const changedDate = entry.changedAt && Number.isFinite(new Date(entry.changedAt).getTime())
          ? localPetDate(new Date(entry.changedAt))
          : record.date;
        return Number.isFinite(value) && value > 0 ? [{ date: changedDate, timestamp, value }] : [];
      });
    }
    const value = Number(record.weightKg ?? record.weight);
    return Number.isFinite(value) && value > 0 ? [{ date: record.date, value }] : [];
  });
  rawWeightPoints.sort((a, b) => String(a.timestamp || a.date || '').localeCompare(String(b.timestamp || b.date || '')));
  const weightByDay = new Map();
  rawWeightPoints.forEach((point) => {
    const day = String(point.date || point.timestamp || 'unknown').slice(0, 10);
    weightByDay.set(day, point);
  });
  const weightPoints = [...weightByDay.values()];
  const currentWeight = Number(pet.weight);
  if (Number.isFinite(currentWeight) && currentWeight > 0) {
    const todayPoint = weightPoints.find((point) => point.date === localPetDate());
    if (todayPoint) {
      todayPoint.value = currentWeight;
      todayPoint.current = true;
    }
    else weightPoints.push({ date: '', value: currentWeight, current: true });
  }
  const vaccinationCards = Array.isArray(pet.vaccinationCards) ? pet.vaccinationCards : [];
  const medicineEvents = records.flatMap((record) => {
    const loggedIntakes = (Array.isArray(record.medicineIntakes) ? record.medicineIntakes : []).map((entry) => {
      const details = medicineIntakeEntry(entry, reminders);
      const saved = medicineDetailsList(reminders).find((medicine) => String(medicine.id) === String(details.medicineId));
      return { date: record.date, medicineId: details.medicineId, name: details.name || saved?.name || record.medicineName || 'Medicine' };
    });
    const legacyEvents = (Array.isArray(record.medicineEvents) ? record.medicineEvents : Array.isArray(record.medicationHistory) ? record.medicationHistory : [])
      .map((entry) => ({ date: record.date, ...(typeof entry === 'string' ? { name: entry } : entry) }));
    return [...loggedIntakes, ...legacyEvents];
  });
  const savedMedicines = medicineDetailsList(reminders);
  const medicineHistory = new Map();
  savedMedicines.forEach((medicine) => medicineHistory.set(`medicine:${medicine.id}`, { name: medicine.name, startDate: medicine.startDate || '', endDate: medicine.endDate || '' }));
  medicineEvents.forEach((event) => {
    const name = event.name || event.medicine || 'Medicine / Supplement';
    const key = event.medicineId ? `medicine:${event.medicineId}` : `medicine-name:${name.toLocaleLowerCase()}`;
    const saved = event.medicineId ? savedMedicines.find((medicine) => String(medicine.id) === String(event.medicineId)) : null;
    const item = medicineHistory.get(key) || { name: saved?.name || name, startDate: '', endDate: '' };
    if (event.date) {
      if (!item.startDate || event.date < item.startDate) item.startDate = event.date;
      if (!item.endDate || event.date > item.endDate) item.endDate = event.date;
    }
    medicineHistory.set(key, item);
  });
  const medicineHistoryRows = Array.from(medicineHistory.values()).map((medicine) => {
    const dateRange = medicine.startDate ? `${formatPetDate(medicine.startDate)} – ${formatPetDate(medicine.endDate || medicine.startDate)}` : '—';
    return `<tr><td>${escapeHTML(medicine.name)}</td><td>${escapeHTML(dateRange)}</td></tr>`;
  }).join('');
  const vaccineRows = vaccinationCards.map((card, index) => `<tr><td>${escapeHTML(card.name || `Vaccination record ${index + 1}`)}</td><td>${escapeHTML(card.date || card.uploadedAt ? formatPetDate(card.date || card.uploadedAt) : 'Date not recorded')}</td><td>${escapeHTML(reminders.vaccinationDate || pet.vaccinationValidUntil ? formatPetDate(reminders.vaccinationDate || pet.vaccinationValidUntil) : 'Not set')}</td><td>${card.data ? `<a href="${escapeHTML(card.data)}" target="_blank" rel="noopener">View file</a>` : 'File unavailable'}</td></tr>`).join('');
  const serviceBookings = [
    ...loadGroomingBookings().filter((booking) => petBookingMatches(booking, pet.id)).map((booking) => ({ ...booking, _service: 'Grooming', _date: booking.date })),
    ...loadHotelBookings().filter((booking) => petBookingMatches(booking, pet.id)).map((booking) => ({ ...booking, _service: 'Pet Hotel', _date: booking.checkIn || booking.startDate || booking.date, _dateEnd: booking.checkOut || booking.endDate })),
    ...loadDaycareBookings().filter((booking) => petBookingMatches(booking, pet.id) && booking.type !== 'pass-purchase').map((booking) => ({ ...booking, _service: 'Pet Daycare', _date: booking.date })),
  ].sort((a, b) => String(b._date || b.createdAt || '').localeCompare(String(a._date || a.createdAt || '')));
  const intakeHistoryChart = petIntakeHistoryChart(records, reminders);
  const exerciseRows = records.slice().reverse().filter((record) => Number(record.exerciseKm || 0) || (record.exerciseSessions || []).length).map((record) => `<tr><td>${escapeHTML(formatPetDate(record.date) || '—')}</td><td>${Number(record.exerciseKm || 0).toFixed(2)} km</td><td>${(record.exerciseSessions || []).length} session${(record.exerciseSessions || []).length === 1 ? '' : 's'}</td></tr>`).join('');
  const petIdQuery = encodeURIComponent(pet.id);
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Data'), pet)}
    <div class="pet-data-dashboard">
      <section class="pet-data-section" id="pet-data-service"><header><h2>Service History</h2><a class="pet-intake-history-toggle" href="#services">Book Services</a></header><div class="pet-data-table-wrap"><table><thead><tr><th>Service</th><th>Date</th><th>Outlet</th><th>Status</th></tr></thead><tbody>${serviceBookings.map((booking) => `<tr><td>${escapeHTML(booking._service)}</td><td>${escapeHTML(formatPetDate(booking._date) || '—')}${booking._dateEnd ? ` – ${escapeHTML(formatPetDate(booking._dateEnd))}` : ''}</td><td>${escapeHTML(booking.outlet || '—')}</td><td>${escapeHTML(booking.status || 'Booked')}</td></tr>`).join('')}</tbody></table>${serviceBookings.length ? '' : '<p class="pet-data-empty">No grooming, Pet Hotel, or Pet Daycare bookings found.</p>'}</div></section>
      <section class="pet-data-section pet-data-weight" id="pet-data-weight"><header><h2>Weight Changes</h2><a class="pet-intake-history-toggle" href="#pet-profile-edit?id=${petIdQuery}&amp;from=pet-profile&amp;section=weight">Edit Profile</a></header><span class="pet-data-current-weight">${pet.weight ? `${escapeHTML(pet.weight)} kg current` : 'No current weight'}</span>${petWeightGraph(weightPoints)}</section>
      <section class="pet-data-section" id="pet-data-vaccination"><header><h2>Vaccination History</h2><a class="pet-intake-history-toggle" href="#pet-vaccination?id=${petIdQuery}">‹ Back to Vaccination</a></header><div class="pet-data-table-wrap"><table><thead><tr><th>Record</th><th>Date</th><th>Next vaccination</th><th>Document</th></tr></thead><tbody>${vaccineRows}</tbody></table>${vaccineRows ? '' : '<p class="pet-data-empty">No vaccination records uploaded.</p>'}</div></section>
      <section class="pet-data-section" id="pet-data-medicine"><header><h2>Medicine &amp; Supplement History</h2><a class="pet-intake-history-toggle" href="#pet-record?id=${petIdQuery}&amp;section=medicine">‹ Back to Daily Care</a></header><div class="pet-data-table-wrap"><table><thead><tr><th>Medicine / Supplement</th><th>Date range</th></tr></thead><tbody>${medicineHistoryRows}</tbody></table>${medicineHistoryRows ? '' : '<p class="pet-data-empty">No medicine or supplement history recorded.</p>'}</div></section>
      <section class="pet-data-section" id="pet-data-intake"><header><h2>Food, Water &amp; Medicine / Supplement Intake History</h2><a class="pet-intake-history-toggle" href="#pet-record?id=${petIdQuery}&amp;section=intake">‹ Back to Daily Care</a></header>${intakeHistoryChart}</section>
      <section class="pet-data-section" id="pet-data-exercise"><header><h2>${escapeHTML(pet.name)}’s Exercise History</h2><a class="pet-intake-history-toggle" href="#pet-record?id=${petIdQuery}&amp;section=exercise">‹ Back to Daily Care</a></header><div class="pet-data-table-wrap"><table><thead><tr><th>Date</th><th>Distance</th><th>Sessions</th></tr></thead><tbody>${exerciseRows}</tbody></table>${exerciseRows ? '' : '<p class="pet-data-empty">No exercise history recorded.</p>'}</div></section>
    </div>
    ${bottomNavigation('home', icon)}
  </main>`;
}

function petBookingMatches(booking, petId) {
  return [booking.petId, ...(Array.isArray(booking.petIds) ? booking.petIds : []), ...(Array.isArray(booking.pets) ? booking.pets.map((item) => item.id) : [])].some((id) => String(id) === String(petId));
}

function petWeightGraph(points) {
  if (!points.length) return '<p class="pet-data-empty">No weight measurements recorded yet.</p>';
  const visible = points.slice().reverse();
  const svgWidth = Math.max(700, 72 + Math.max(0, visible.length - 1) * 105);
  const values = visible.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const coords = visible.map((point, index) => ({ ...point, index, x: visible.length === 1 ? svgWidth / 2 : 36 + index * 105, y: 164 - ((point.value - min) / spread) * 78 }));
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const labelSize = coords.length > 20 ? 6 : coords.length > 10 ? 8 : coords.length > 6 ? 9 : 11;
  return `<div class="pet-data-weight-chart"><svg style="width:${svgWidth}px;min-width:${svgWidth}px" viewBox="0 0 ${svgWidth} 222" role="img" aria-label="Weight history timeline with latest measurement first, followed by older records"><line x1="24" y1="168" x2="${svgWidth - 24}" y2="168" class="pet-data-chart-axis"/><path d="${path}" class="pet-data-chart-line"/>${coords.map((point) => {
    const dateLabel = point.current ? 'Current' : point.date ? new Date(`${String(point.date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }) : 'Current';
    const titleDate = point.date ? new Date(`${String(point.date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'current profile weight';
    const dateY = 180 + (point.index % 3) * 12;
    return `<circle cx="${point.x}" cy="${point.y}" r="${point.current ? 7 : 5}" class="pet-data-chart-point${point.current ? ' is-current' : ''}"><title>${point.current ? 'Current weight: ' : ''}${point.value} kg · ${escapeHTML(titleDate)}</title></circle><text x="${point.x}" y="${dateY}" text-anchor="middle" font-size="${labelSize}">${escapeHTML(dateLabel)}</text><text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="pet-data-chart-value${point.current ? ' is-current' : ''}" font-size="${labelSize}">${escapeHTML(point.value)} kg</text>`;
  }).join('')}</svg></div>`;
}

function petIntakeHistoryChart(records = [], reminders = {}) {
  const dailyRecords = records.filter((record) => record.date && (Number(record.foodCount) > 0 || Number(record.waterCount) > 0 || Number(record.medicineCount) > 0 || (Array.isArray(record.medicineIntakes) && record.medicineIntakes.length) || (Array.isArray(record.foodIntakes) && record.foodIntakes.length) || (Array.isArray(record.waterIntakes) && record.waterIntakes.length)));
  if (!dailyRecords.length) return '<p class="pet-data-empty">No food, water, medicine, or supplement intakes recorded yet.</p>';

  const savedMedicines = medicineDetailsList(reminders);
  const medicineRows = new Map();
  dailyRecords.forEach((record) => {
    (Array.isArray(record.medicineIntakes) ? record.medicineIntakes : []).forEach((rawEntry) => {
      const entry = medicineIntakeEntry(rawEntry, reminders);
      const medicine = savedMedicines.find((item) => String(item.id) === String(entry.medicineId));
      const name = entry.name || medicine?.name || 'Medicine / Supplement';
      const key = entry.medicineId ? `medicine:${entry.medicineId}` : `medicine-name:${name.toLocaleLowerCase()}`;
      if (!medicineRows.has(key)) medicineRows.set(key, { key, name });
    });
    if (Number(record.medicineCount) > (record.medicineIntakes || []).length && !medicineRows.has('medicine:legacy')) {
      medicineRows.set('medicine:legacy', { key: 'medicine:legacy', name: reminders.medicine?.name || 'Medicine / Supplement' });
    }
  });
  const series = [
    { key: 'food', name: 'Food', kind: 'food', color: '#fe7801' },
    { key: 'water', name: 'Water', kind: 'water', color: '#5599c4' },
    ...Array.from(medicineRows.values()).map((medicine) => ({ ...medicine, kind: 'medicine', color: '#79a77e' })),
  ];
  const dates = [...new Set(dailyRecords.map((record) => record.date))].sort((a, b) => String(b).localeCompare(String(a)));
  const recordByDate = new Map(dailyRecords.map((record) => [record.date, record]));
  const countFor = (record, item) => {
    if (item.kind !== 'medicine') return Math.max(0, Number(record?.[`${item.kind}Count`]) || (Array.isArray(record?.[`${item.kind}Intakes`]) ? record[`${item.kind}Intakes`].length : 0));
    const entries = (Array.isArray(record?.medicineIntakes) ? record.medicineIntakes : []).map((rawEntry) => medicineIntakeEntry(rawEntry, reminders));
    if (item.key === 'medicine:legacy') return Math.max(0, (Number(record?.medicineCount) || 0) - entries.length);
    return entries.filter((entry) => (entry.medicineId ? `medicine:${entry.medicineId}` : `medicine-name:${(entry.name || 'Medicine / Supplement').toLocaleLowerCase()}`) === item.key).length;
  };
  const maxCount = Math.max(1, ...dates.flatMap((date) => series.map((item) => countFor(recordByDate.get(date), item))));
  const chartMax = Math.max(4, Math.ceil(maxCount / 4) * 4);
  const chartHeight = 230;
  const axisLeft = 38;
  const plotTop = 16;
  const plotHeight = 155;
  const axisY = plotTop + plotHeight;
  const groupWidth = Math.max(82, series.length * 15 + 20);
  const chartWidth = axisLeft + dates.length * groupWidth + 12;
  const ticks = [...new Set([0, Math.round(chartMax / 4), Math.round(chartMax / 2), Math.round(chartMax * 3 / 4), chartMax])].sort((a, b) => a - b);
  const grid = ticks.map((tick) => {
    const y = axisY - (tick / chartMax) * plotHeight;
    return `<line x1="${axisLeft}" y1="${y}" x2="${chartWidth - 8}" y2="${y}" class="pet-intake-chart-gridline"/><text x="${axisLeft - 8}" y="${y + 4}" text-anchor="end" class="pet-intake-chart-axis-label">${tick}</text>`;
  }).join('');
  const bars = dates.map((date, dateIndex) => {
    const record = recordByDate.get(date);
    const xStart = axisLeft + dateIndex * groupWidth;
    const visibleSeries = series.filter((item) => countFor(record, item) > 0);
    const barWidth = Math.min(13, (groupWidth - 18) / Math.max(1, visibleSeries.length));
    const barGap = 3;
    const barsWidth = visibleSeries.length * barWidth + Math.max(0, visibleSeries.length - 1) * barGap;
    const xOffset = (groupWidth - barsWidth) / 2;
    const rects = visibleSeries.map((item, seriesIndex) => {
      const count = countFor(record, item);
      const barHeight = count ? Math.max(2, (count / chartMax) * plotHeight) : 0;
      const x = xStart + xOffset + seriesIndex * (barWidth + barGap);
      const y = axisY - barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${item.color}" role="button" tabindex="0" data-intake-bar data-intake-date="${escapeHTML(date)}" data-intake-name="${escapeHTML(item.name)}" data-intake-count="${count}" aria-label="${escapeHTML(item.name)}: ${count} intake${count === 1 ? '' : 's'} on ${escapeHTML(formatPetDate(date))}"><title>${escapeHTML(item.name)}: ${count} intake${count === 1 ? '' : 's'} · ${escapeHTML(formatPetDate(date))}</title></rect>`;
    }).join('');
    const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
    return `${rects}<text x="${xStart + groupWidth / 2}" y="${axisY + 22}" text-anchor="middle" class="pet-intake-chart-date">${escapeHTML(label)}</text>`;
  }).join('');
  const legend = [
    '<span><i style="--intake-series-color:#fe7801"></i>Food</span>',
    '<span><i style="--intake-series-color:#5599c4"></i>Water</span>',
    '<span><i style="--intake-series-color:#79a77e"></i>Medicine / Supplement</span>',
  ].join('');
  return `<div class="pet-intake-chart-legend" aria-label="Intake chart legend">${legend}</div><div class="pet-intake-chart-scroll" tabindex="0" role="region" aria-label="Daily intake bar chart. Latest date first; scroll horizontally for older records."><svg style="width:${chartWidth}px;min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Daily food, water, medicine, and supplement intake counts by date, latest date first"><text x="10" y="${(plotTop + axisY) / 2}" text-anchor="middle" transform="rotate(-90 10 ${(plotTop + axisY) / 2})" class="pet-intake-chart-axis-label">Intakes / day</text>${grid}<line x1="${axisLeft}" y1="${axisY}" x2="${chartWidth - 8}" y2="${axisY}" class="pet-intake-chart-axis"/>${bars}</svg></div><p class="pet-intake-chart-detail" data-intake-chart-detail aria-live="polite">Click a bar to view the intake details.</p><p class="pet-data-caption">Dates run left to right. The latest date is on the left; scroll right for older records.</p>`;
}

export function petReminderPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Reminder', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const reminders = loadPetReminders(pet.id);
  const services = petServiceReminders(pet);
  const serviceRows = services.map((booking) => `<li><span>${escapeHTML(booking.service)}</span><strong>${escapeHTML(formatPetDate(booking.date))}</strong></li>`).join('');
  const bubbleSettings = { service: true, vaccination: true, foodWater: true, exercise: true, medicine: true, foodWeight: true, milestone: true, ...(reminders.showInAssistant || {}) };
  const customReminders = Array.isArray(reminders.customReminders) ? reminders.customReminders : [];
  const bubbleOptions = [
    ['service', 'Grooming / Pet Hotel / Pet Daycare reminders'],
    ['vaccination', 'Vaccination reminders'],
    ['foodWater', 'Food and water intake'],
    ['medicine', 'Medicine & Supplement reminders'],
    ['exercise', 'Exercise updates'],
    ['foodWeight', 'Weight check-ins (from pet profile)'],
    ['milestone', 'Birthday or adoption day'],
    ['custom', 'Custom reminders'],
  ];
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Reminder'), pet)}
    <section class="pet-care-panel pet-reminder-panel"><div class="profile-menu-group"><h2>${escapeHTML(pet.name)}’s Reminders</h2></div>
      <form class="pet-care-form" data-pet-reminder-form data-pet-id="${escapeHTML(pet.id)}">
        <fieldset class="pet-reminder-visibility"><legend>Show in the home speech bubble</legend>${bubbleOptions.map(([key, label]) => `<label><input type="checkbox" name="show-${key}" ${bubbleSettings[key] !== false ? 'checked' : ''} /><span>${label}</span></label>`).join('')}</fieldset>
        <section class="pet-custom-reminder-editor" aria-labelledby="custom-reminder-title"><div class="pet-custom-reminder-heading"><div><h3 id="custom-reminder-title">Custom Reminders</h3><p>Add one or more reminders for ${escapeHTML(pet.name)}.</p></div><button class="button button-outline" type="button" data-add-custom-reminder>Add Reminder</button></div><div class="pet-custom-reminder-list" data-custom-reminder-list>${customReminders.length ? customReminders.map((reminder) => customReminderEditorRow(reminder)).join('') : '<p class="pet-custom-reminder-empty" data-custom-reminder-empty>No custom reminders yet.</p>'}</div></section>
        <p class="pet-care-note">Grooming, Pet Hotel, and Pet Daycare reminders appear here automatically from your bookings.</p>
        <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary" type="submit">Save Reminders</button>
      </form>
      <ul class="pet-care-list">${serviceRows || '<li><span>Service reminder</span><strong>No upcoming bookings</strong></li>'}</ul>
    </section>
    ${bottomNavigation('home', icon)}
  </main>`;
}

export function petVaccinationPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Vaccination', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const cards = Array.isArray(pet.vaccinationCards) ? pet.vaccinationCards : [];
  const rows = cards.map((card, index) => `<li><a href="${escapeHTML(card.data || '#')}" target="_blank" rel="noopener">${escapeHTML(card.name || `Vaccination card ${index + 1}`)}</a><button type="button" data-remove-vaccination-card="${index}" aria-label="Remove ${escapeHTML(card.name || 'vaccination card')}">×</button></li>`).join('');
  const reminders = loadPetReminders(pet.id);
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Vaccination'), pet)}
    <section class="pet-care-panel pet-vaccination-page-panel">
      <div class="pet-intake-heading-row"><div class="profile-menu-group"><h2>${escapeHTML(pet.name)}’s Vaccination</h2><p>Keep vaccination dates and documents up to date.</p></div><a class="pet-intake-history-toggle" href="#pet-data?id=${encodeURIComponent(pet.id)}&amp;section=vaccination">View History</a></div>
      <form class="pet-care-form" data-pet-vaccination-form data-pet-id="${escapeHTML(pet.id)}">
        <label>Next vaccination date<input type="date" name="vaccinationValidUntil" value="${escapeHTML(reminders.vaccinationDate || pet.vaccinationValidUntil || '')}" /></label>
        <section class="pet-vaccination-section" aria-labelledby="pet-vaccination-title"><h2 id="pet-vaccination-title">Vaccination Cards</h2><p>Upload vaccination card images or PDF documents. Up to 3 files, 1.5 MB each (2.5 MB total).</p><label class="pet-vaccination-upload"><span>Choose files</span><input type="file" name="vaccinationCards" accept="image/*,.pdf,application/pdf" multiple data-vaccination-upload /></label><ul class="pet-vaccination-list" data-vaccination-list>${rows || '<li class="pet-vaccination-empty">No vaccination cards uploaded.</li>'}</ul></section>
        <p class="form-feedback pet-vaccination-feedback" role="status" aria-live="polite"></p>
      </form>
    </section>
    ${bottomNavigation('home', icon)}
  </main>`;
}

function customReminderEditorRow(reminder = {}) {
  const reminderId = reminder.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="pet-custom-reminder-row" data-custom-reminder-row data-reminder-id="${escapeHTML(reminderId)}"><label>Reminder<input type="text" data-custom-reminder-title value="${escapeHTML(reminder.title || '')}" placeholder="e.g. Give flea treatment" maxlength="100" required /></label><div class="pet-custom-reminder-fields"><label>Date<input type="date" data-custom-reminder-date value="${escapeHTML(reminder.date || '')}" required /></label><label>Time (optional)<input type="time" data-custom-reminder-time value="${escapeHTML(reminder.time || '')}" /></label></div><button class="pet-custom-reminder-remove" type="button" data-remove-custom-reminder aria-label="Remove reminder">Remove</button></div>`;
}

export function petRecordPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Daily Care', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const today = localPetDate();
  const records = loadPetRecords(pet.id);
  const todayRecord = records.find((item) => item.date === today) || {};
  const medicineReminders = loadPetReminders(pet.id);
  const medicines = medicineDetailsList(medicineReminders);
  const activeMedicines = activeMedicineDetails(medicineReminders, today);
  const intakeKinds = ['food', 'water', ...(activeMedicines.length ? ['medicine'] : [])];
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Daily Care'), pet)}
    <section class="pet-care-panel pet-intake-panel" id="pet-record-intake" aria-labelledby="pet-intake-heading">
      <div class="pet-intake-heading-row"><div class="profile-menu-group"><h2 id="pet-intake-heading">Today with ${escapeHTML(pet.name)}</h2><p>Tap a card to log an intake.</p></div><a class="pet-intake-history-toggle" href="#pet-data?id=${encodeURIComponent(pet.id)}&amp;section=intake">View History</a></div>
      <div class="pet-intake-cards" data-pet-intake-cards data-intake-kinds="${intakeKinds.join(',')}" data-pet-id="${escapeHTML(pet.id)}" data-pet-name="${escapeHTML(pet.name)}">${petIntakeCards(todayRecord, pet.name, intakeKinds, activeMedicines)}</div>
      <p class="pet-intake-feedback" data-intake-feedback role="status" aria-live="polite"></p>
    </section>
    <section class="pet-care-panel pet-exercise-panel" id="pet-record-exercise" aria-labelledby="pet-exercise-heading">
      <div class="pet-intake-heading-row"><div class="profile-menu-group"><h2 id="pet-exercise-heading">${escapeHTML(pet.name)}’s Exercise</h2><p>Keep this pet’s activity record up to date.</p></div><a class="pet-intake-history-toggle" href="#pet-data?id=${encodeURIComponent(pet.id)}&amp;section=exercise">View History</a></div>
      <section class="pet-exercise-tracker" data-exercise-tracker data-pet-id="${escapeHTML(pet.id)}" aria-label="Exercise route tracker">
        <div class="pet-exercise-summary">
          <strong data-exercise-distance>0.00 km</strong>
          <span>Time: <b data-exercise-duration>--:--</b></span>
        </div>
        <div class="pet-exercise-map" data-exercise-map aria-label="Map showing your exercise route">
          <div class="pet-exercise-map-placeholder" data-exercise-map-placeholder>Allow location access and start an exercise to see your route.</div>
          <button class="button button-primary pet-exercise-start" type="button" data-exercise-start>Start Exercise</button>
        </div>
        <p class="pet-exercise-status" data-exercise-status role="status" aria-live="polite">Your route is only recorded while this page is open.</p>
      </section>
      <form class="pet-care-form" data-pet-record-form data-pet-id="${escapeHTML(pet.id)}">
        <label>Exercise today (km)<input type="number" name="exerciseKm" min="0" max="100" step="0.1" value="${escapeHTML(todayRecord.exerciseKm ?? '')}" /></label>
        <label>Notes<input name="notes" maxlength="240" value="${escapeHTML(todayRecord.notes || '')}" placeholder="Add a note about today" /></label>
        <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary" type="submit">Save Exercise Record</button>
      </form>
    </section>
    <section class="pet-care-panel pet-medicine-panel" id="pet-record-medicine" aria-labelledby="pet-medicine-heading">
      <div class="pet-intake-heading-row"><div class="profile-menu-group"><h2 id="pet-medicine-heading">${escapeHTML(pet.name)}’s Medicine &amp; Supplement</h2><p>Set the active period and frequency. Reminders and intake cards appear only during each item’s active period.</p></div><a class="pet-intake-history-toggle" href="#pet-data?id=${encodeURIComponent(pet.id)}&amp;section=medicine">View History</a></div>
      <button class="button button-primary pet-medicine-add" type="button" data-add-medicine ${medicines.length ? '' : 'hidden'}>Add Medicine/Supplement</button>
      <div class="pet-medicine-saved-details" data-medicine-saved-details>${petMedicineDetailsListMarkup(medicines)}</div>
      <form class="pet-care-form pet-medicine-editor" data-pet-medicine-form data-pet-id="${escapeHTML(pet.id)}" ${medicines.length ? 'hidden' : ''}>
        <input type="hidden" name="medicineId" value="" />
        <label>Medicine or supplement name<input name="medicineName" value="" maxlength="80" placeholder="e.g. Joint supplement" required /></label>
        <div class="pet-medicine-period"><strong>Medicine or Supplement Period</strong><p>Select the first and last active dates. Reminders and the intake card are active only within this period. Reminders run while Furgo is open; allow browser notifications to see alerts when the tab is in the background.</p><div class="hotel-range-display pet-medicine-range-display"><div><small>Start date</small><strong data-medicine-start-display>Choose date</strong></div><span aria-hidden="true">→</span><div><small>End date</small><strong data-medicine-end-display>Choose date</strong></div></div><input type="hidden" name="medicineStartDate" data-medicine-start value="" required /><input type="hidden" name="medicineEndDate" data-medicine-end value="" required /><div class="hotel-calendar pet-medicine-calendar" data-medicine-calendar aria-label="Select medicine or supplement active dates"><div class="hotel-calendar-heading"><button type="button" data-medicine-calendar-nav="previous" aria-label="Previous month">‹</button><strong data-medicine-calendar-month></strong><button type="button" data-medicine-calendar-nav="next" aria-label="Next month">›</button></div><div class="hotel-calendar-grid" data-medicine-calendar-grid role="grid"></div></div></div>
        <div class="pet-care-inline-fields"><label>Frequency<div class="pet-medicine-frequency"><span>Every</span><input name="medicineFrequencyInterval" type="number" min="1" max="24" value="1" required /><select name="medicineFrequencyUnit" aria-label="Medicine frequency unit"><option value="hours">hours</option><option value="days" selected>days</option></select></div></label><label>Dosage<input name="medicineDosage" value="" maxlength="80" placeholder="e.g. 1 tablet" required /></label></div>
        <div class="pet-medicine-notification-setting"><button class="button button-light" type="button" data-enable-medicine-notifications>Enable Browser Reminders</button><span data-medicine-notification-status role="status" aria-live="polite"></span></div>
        <div class="form-feedback" role="status" aria-live="polite"></div><div class="pet-medicine-editor-actions"><button class="button button-primary" type="submit">Save Details</button><button class="button button-light" type="button" data-cancel-medicine-edit>Cancel</button></div>
      </form>
    </section>
    ${bottomNavigation('home', icon)}
  </main>`;
}

function petIntakeCards(record = {}, petName = '', kinds = ['food', 'water'], medicines = []) {
  const intakeItems = [
    { key: 'food', label: `${petName}’s Food Intake`, asset: 'Food and Water Intake-01.png', count: Number(record.foodCount) || 0, last: record.foodLastAt || '' },
    { key: 'water', label: `${petName}’s Water Intake`, asset: 'Food and Water Intake-02.png', count: Number(record.waterCount) || 0, last: record.waterLastAt || '' },
    ...medicines.map((medicine, index) => {
      const key = medicineIntakeFieldKey(medicine.id);
      const events = Array.isArray(record.medicineIntakes) ? record.medicineIntakes.map((entry) => medicineIntakeEntry(entry)).filter((entry) => entry.medicineId === medicine.id) : [];
      const legacyEvents = medicine.id === 'legacy-medicine' && index === 0 && Array.isArray(record.medicineIntakes) ? record.medicineIntakes.filter((entry) => typeof entry === 'string') : [];
      const allMedicineEvents = [...events, ...legacyEvents.map((time) => ({ time }))];
      return { key, type: 'medicine', label: `${medicine.name} Intake`, count: allMedicineEvents.length, last: allMedicineEvents.map((entry) => entry.time).filter(Boolean).at(-1) || '' };
    }),
  ];
  return intakeItems.filter((item) => item.key === 'food' || item.key === 'water' ? kinds.includes(item.key) : kinds.includes('medicine')).map((item) => `<article class="pet-intake-card is-${item.type || item.key}">
    <button class="pet-intake-add" type="button" data-add-pet-intake="${item.key}" aria-label="Add ${item.key} intake for today">
      <span class="pet-intake-title">${escapeHTML(item.label)} Today</span>${item.asset ? `<img src="Image/Other%20Image/${encodeURIComponent(item.asset)}" alt="" />` : ''}
      <span class="pet-intake-count" data-intake-count="${item.key}">${item.count}</span><span class="pet-intake-times">${item.count === 1 ? 'Time' : 'Times'}</span>
      <span class="pet-intake-last" data-intake-last="${item.key}">Last Intake: ${item.last ? escapeHTML(item.last) : '—'}</span>
      <span class="pet-intake-prompt">Tap to add an intake</span>
    </button>
    <button class="pet-intake-undo" type="button" data-undo-pet-intake="${item.key}" aria-label="Undo last ${item.key} intake" ${item.count ? '' : 'disabled'}>Undo ↶</button>
  </article>`).join('');
}

function petMedicineDetailsMarkup(details) {
  if (!details?.name) return '';
  return `<dl><div><dt>Medicine / Supplement</dt><dd>${escapeHTML(details.name)}</dd></div><div><dt>Medicine or Supplement Period</dt><dd>${escapeHTML(details.startDate ? formatPetDate(details.startDate) : 'Not set')} – ${escapeHTML(details.endDate ? formatPetDate(details.endDate) : 'Not set')}</dd></div><div><dt>Frequency</dt><dd>${escapeHTML(details.frequency || 'Not set')}</dd></div><div><dt>Dosage</dt><dd>${escapeHTML(details.dosage || 'Not set')}</dd></div></dl>`;
}

function petMedicineDetailsListMarkup(medicines = []) {
  return medicines.map((details) => `<article class="pet-medicine-saved-item" data-medicine-item="${escapeHTML(details.id)}"><dl><div><dt>Medicine / Supplement</dt><dd>${escapeHTML(details.name)}</dd></div><div><dt>Medicine or Supplement Period</dt><dd>${escapeHTML(details.startDate ? formatPetDate(details.startDate) : 'Not set')} – ${escapeHTML(details.endDate ? formatPetDate(details.endDate) : 'Not set')}</dd></div><div><dt>Frequency</dt><dd>${escapeHTML(details.frequency || 'Not set')}</dd></div><div><dt>Dosage</dt><dd>${escapeHTML(details.dosage || 'Not set')}</dd></div></dl><div class="pet-medicine-item-actions"><button class="button button-light" type="button" data-edit-medicine="${escapeHTML(details.id)}">Edit</button><button class="button button-light" type="button" data-delete-medicine="${escapeHTML(details.id)}">Remove</button></div></article>`).join('');
}

function resetMedicineForm(form, details = null) {
  form.reset();
  form.elements.medicineId.value = details?.id || '';
  form.elements.medicineName.value = details?.name || '';
  form.elements.medicineStartDate.value = details?.startDate || '';
  form.elements.medicineEndDate.value = details?.endDate || '';
  const parsed = parseMedicineFrequency(details?.frequency || '');
  form.elements.medicineFrequencyInterval.value = details?.frequencyInterval || parsed.interval || 1;
  form.elements.medicineFrequencyUnit.value = details?.frequencyUnit || parsed.unit || 'days';
  form.elements.medicineDosage.value = details?.dosage || '';
  const start = details?.startDate || localPetDate();
  const [year, month] = start.split('-').map(Number);
  renderMedicineCalendar(form, new Date(year, month - 1, 1));
  const feedback = form.querySelector('.form-feedback');
  if (feedback) { feedback.textContent = ''; feedback.classList.remove('visible'); }
}

function formatMedicineDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function parseMedicineFrequency(value = '') {
  const match = String(value).match(/every\s+(?:(\d+)\s*)?(hour|day)/i);
  if (!match) return { interval: 1, unit: 'days' };
  return { interval: Math.max(1, Number(match[1]) || 1), unit: match[2].toLowerCase().startsWith('hour') ? 'hours' : 'days' };
}

function renderMedicineCalendar(form, month) {
  const calendar = form.querySelector('[data-medicine-calendar]');
  if (!calendar) return;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const start = form.elements.medicineStartDate.value;
  const end = form.elements.medicineEndDate.value;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<span class="hotel-calendar-weekday" role="columnheader">${day}</span>`).join('');
  const blanks = Array.from({ length: firstWeekday }, () => '<span class="hotel-calendar-empty" aria-hidden="true"></span>').join('');
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const value = localPetDate(new Date(year, monthIndex, day));
    const selected = value === start || value === end;
    const inRange = Boolean(start && end && value > start && value < end);
    const date = new Date(year, monthIndex, day);
    const label = date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `<button type="button" class="hotel-calendar-day ${selected ? 'is-selected' : ''} ${inRange ? 'is-in-range' : ''}" role="gridcell" data-medicine-calendar-date="${value}" aria-label="${label}" aria-pressed="${selected}">${day}</button>`;
  }).join('');
  calendar.querySelector('[data-medicine-calendar-month]').textContent = month.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  calendar.querySelector('[data-medicine-calendar-grid]').innerHTML = `${weekdays}${blanks}${days}`;
  form.querySelector('[data-medicine-start-display]').textContent = formatMedicineDate(start) || 'Choose date';
  form.querySelector('[data-medicine-end-display]').textContent = formatMedicineDate(end) || 'Choose date';
}

function updatePetIntakeCards(record) {
  document.querySelectorAll('[data-pet-intake-cards]').forEach((cards) => {
    const kinds = cards.dataset.intakeKinds ? cards.dataset.intakeKinds.split(',') : ['food', 'water'];
    const medicines = kinds.includes('medicine') ? activeMedicineDetails(loadPetReminders(cards.dataset.petId)) : [];
    cards.innerHTML = petIntakeCards(record, cards.dataset.petName, kinds, medicines);
  });
}

export function setupPetCarePages() {
  setupMedicineReminderScheduler();
  const intakeChart = document.querySelector('.pet-intake-chart-scroll');
  const intakeChartDetail = document.querySelector('[data-intake-chart-detail]');
  intakeChart?.addEventListener('click', (event) => {
    const bar = event.target.closest('[data-intake-bar]');
    if (!bar || !intakeChartDetail) return;
    intakeChart.querySelectorAll('[data-intake-bar].is-active').forEach((activeBar) => activeBar.classList.remove('is-active'));
    bar.classList.add('is-active');
    const count = Number(bar.dataset.intakeCount) || 0;
    const date = formatPetDate(bar.dataset.intakeDate) || bar.dataset.intakeDate;
    intakeChartDetail.textContent = `${bar.dataset.intakeName}: ${count} intake${count === 1 ? '' : 's'} on ${date}.`;
  });
  intakeChart?.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-intake-bar]')) {
      event.preventDefault();
      event.target.click();
    }
  });
  document.querySelectorAll('[data-toggle-pet-assistant]').forEach((button) => button.addEventListener('click', () => {
    const petId = String(button.dataset.togglePetAssistant || '');
    const selected = selectedPetAssistantIds() || (selectedPetAssistantId() ? [selectedPetAssistantId()] : []);
    const enabling = !selected.includes(petId);
    const next = enabling ? [...selected, petId] : selected.filter((id) => id !== petId);
    savePetAssistantIds(next);
    if (enabling) saveSelectedPetAssistantId(petId);
    else if (String(selectedPetAssistantId()) === petId) saveSelectedPetAssistantId(next[0] || '');
    button.classList.toggle('is-selected', enabling);
    button.setAttribute('aria-pressed', String(enabling));
    button.textContent = enabling ? '✓ Shown as Home Page Pet Assistant' : 'Show as Home Page Pet Assistant';
  }));

  const reminderForm = document.querySelector('[data-pet-reminder-form]');
  const medicineForm = document.querySelector('[data-pet-medicine-form]');
  if (medicineForm) {
    const notificationButton = medicineForm.querySelector('[data-enable-medicine-notifications]');
    const notificationStatus = medicineForm.querySelector('[data-medicine-notification-status]');
    if (!window.Notification || window.Notification.permission === 'granted') notificationButton.hidden = true;
    notificationButton.addEventListener('click', async () => {
      if (!window.Notification) {
        notificationStatus.textContent = 'This browser does not support browser notifications.';
        return;
      }
      const permission = await window.Notification.requestPermission();
      notificationStatus.textContent = permission === 'granted'
        ? 'Browser reminders are enabled.'
        : 'Allow notifications in your browser settings to receive reminders when this tab is in the background.';
      notificationButton.hidden = permission === 'granted';
    });
    let calendarMonth = new Date();
    const initialDate = medicineForm.elements.medicineStartDate.value || localPetDate();
    const [initialYear, initialMonth] = initialDate.split('-').map(Number);
    calendarMonth = new Date(initialYear, initialMonth - 1, 1);
    renderMedicineCalendar(medicineForm, calendarMonth);
    medicineForm.querySelector('[data-medicine-calendar]')?.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-medicine-calendar-nav]');
      if (nav) {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (nav.dataset.medicineCalendarNav === 'next' ? 1 : -1), 1);
        renderMedicineCalendar(medicineForm, calendarMonth);
        return;
      }
      const day = event.target.closest('[data-medicine-calendar-date]');
      if (!day) return;
      const selectedDate = day.dataset.medicineCalendarDate;
      const startField = medicineForm.elements.medicineStartDate;
      const endField = medicineForm.elements.medicineEndDate;
      if (!startField.value || endField.value || selectedDate <= startField.value) {
        startField.value = selectedDate;
        endField.value = '';
      } else {
        endField.value = selectedDate;
      }
      renderMedicineCalendar(medicineForm, calendarMonth);
    });
    const medicinePanel = medicineForm.closest('.pet-medicine-panel');
    const openEditor = (details = null) => {
      resetMedicineForm(medicineForm, details);
      const selectedDate = medicineForm.elements.medicineStartDate.value || localPetDate();
      const [selectedYear, selectedMonth] = selectedDate.split('-').map(Number);
      calendarMonth = new Date(selectedYear, selectedMonth - 1, 1);
      medicineForm.hidden = false;
      medicineForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    medicinePanel.querySelector('[data-add-medicine]')?.addEventListener('click', () => openEditor());
    medicinePanel.querySelector('[data-cancel-medicine-edit]')?.addEventListener('click', () => {
      medicineForm.hidden = true;
      medicinePanel.querySelector('[data-add-medicine]').hidden = false;
    });
    medicinePanel.querySelector('[data-medicine-saved-details]')?.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-edit-medicine]');
      const deleteButton = event.target.closest('[data-delete-medicine]');
      if (!editButton && !deleteButton) return;
      const current = loadPetReminders(medicineForm.dataset.petId);
      const medicines = medicineDetailsList(current);
      const medicineId = (editButton || deleteButton).dataset.editMedicine || (editButton || deleteButton).dataset.deleteMedicine;
      if (editButton) {
        const selected = medicines.find((item) => String(item.id) === String(medicineId));
        if (selected) openEditor(selected);
        return;
      }
      const remaining = medicines.filter((item) => String(item.id) !== String(medicineId));
      savePetReminders(medicineForm.dataset.petId, { ...current, medicines: remaining, medicine: remaining[0] || null });
      medicinePanel.querySelector('[data-medicine-saved-details]').innerHTML = petMedicineDetailsListMarkup(remaining);
      medicinePanel.querySelector('[data-add-medicine]').textContent = 'Add Medicine/Supplement';
      medicinePanel.querySelector('[data-add-medicine]').hidden = false;
      const cards = document.querySelector('.pet-intake-panel [data-pet-intake-cards]');
      if (cards) {
        const todayRecord = loadPetRecords(medicineForm.dataset.petId).find((record) => record.date === localPetDate()) || {};
        const active = activeMedicineDetails({ medicines: remaining });
        const kinds = ['food', 'water', ...(active.length ? ['medicine'] : [])];
        cards.dataset.intakeKinds = kinds.join(',');
        cards.innerHTML = petIntakeCards(todayRecord, cards.dataset.petName, kinds, active);
      }
    });
  }
  const customReminderList = reminderForm?.querySelector('[data-custom-reminder-list]');
  customReminderList?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-remove-custom-reminder]')) return;
    event.target.closest('[data-custom-reminder-row]')?.remove();
    if (!customReminderList.querySelector('[data-custom-reminder-row]')) customReminderList.innerHTML = '<p class="pet-custom-reminder-empty" data-custom-reminder-empty>No custom reminders yet.</p>';
  });
  reminderForm?.querySelector('[data-add-custom-reminder]')?.addEventListener('click', () => {
    customReminderList?.querySelector('[data-custom-reminder-empty]')?.remove();
    customReminderList?.insertAdjacentHTML('beforeend', customReminderEditorRow());
    customReminderList?.querySelector('[data-custom-reminder-row]:last-child [data-custom-reminder-title]')?.focus();
  });
  reminderForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const feedback = reminderForm.querySelector('.form-feedback');
    const current = loadPetReminders(reminderForm.dataset.petId);
    savePetReminders(reminderForm.dataset.petId, {
      ...current,
      showInAssistant: {
        service: reminderForm.elements['show-service'].checked,
        vaccination: reminderForm.elements['show-vaccination'].checked,
        foodWater: reminderForm.elements['show-foodWater'].checked,
        medicine: reminderForm.elements['show-medicine'].checked,
        exercise: reminderForm.elements['show-exercise'].checked,
        foodWeight: reminderForm.elements['show-foodWeight'].checked,
        milestone: reminderForm.elements['show-milestone'].checked,
        custom: reminderForm.elements['show-custom'].checked,
      },
      customReminders: [...(customReminderList?.querySelectorAll('[data-custom-reminder-row]') || [])].map((row) => {
        const id = row.dataset.reminderId;
        const previousReminder = (current.customReminders || []).find((item) => String(item.id) === String(id));
        return {
          id,
          title: row.querySelector('[data-custom-reminder-title]').value.trim(),
          date: row.querySelector('[data-custom-reminder-date]').value,
          time: row.querySelector('[data-custom-reminder-time]').value,
          lastNotifiedDate: previousReminder?.lastNotifiedDate || '',
        };
      }).filter((reminder) => reminder.title && reminder.date),
      foodWeight: null,
    });
    feedback.textContent = 'Reminders and home speech bubble settings saved.';
    feedback.classList.add('visible');
  });
  medicineForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const feedback = medicineForm.querySelector('.form-feedback');
    const name = medicineForm.elements.medicineName.value.trim();
    const startDate = medicineForm.elements.medicineStartDate.value;
    const endDate = medicineForm.elements.medicineEndDate.value;
    const frequencyInterval = Math.max(1, Math.min(24, Number(medicineForm.elements.medicineFrequencyInterval.value) || 1));
    const frequencyUnit = medicineForm.elements.medicineFrequencyUnit.value === 'hours' ? 'hours' : 'days';
    const frequency = frequencyUnit === 'days' && frequencyInterval === 1 ? 'Every day' : `Every ${frequencyInterval} ${frequencyUnit.replace(/s$/, frequencyInterval === 1 ? '' : 's')}`;
    const dosage = medicineForm.elements.medicineDosage.value.trim();
    if (!name || !startDate || !endDate || !frequency || !dosage) {
      feedback.textContent = 'Complete all medicine and supplement details before saving.';
      feedback.classList.add('visible');
      return;
    }
    if (endDate < startDate) {
      feedback.textContent = 'The end date must be the same as or later than the start date.';
      feedback.classList.add('visible');
      return;
    }
    const current = loadPetReminders(medicineForm.dataset.petId);
    const currentMedicines = medicineDetailsList(current);
    const medicineId = medicineForm.elements.medicineId.value || `medicine-${window.crypto?.randomUUID?.() || Date.now()}`;
    const now = new Date();
    const startAnchor = new Date(`${startDate}T${now.toTimeString().slice(0, 8)}`);
    const scheduleAnchorAt = (startAnchor.getTime() > now.getTime() ? startAnchor : now).toISOString();
    const oldDetails = currentMedicines.find((item) => String(item.id) === String(medicineId));
    const scheduleUnchanged = oldDetails && oldDetails.startDate === startDate && oldDetails.frequency === frequency;
    const details = { ...oldDetails, id: medicineId, name, startDate, endDate, frequency, frequencyInterval, frequencyUnit, dosage, scheduleAnchorAt: scheduleUnchanged ? oldDetails.scheduleAnchorAt : scheduleAnchorAt, lastReminderAt: scheduleUnchanged ? (oldDetails.lastReminderAt || '') : '' };
    const medicines = oldDetails ? currentMedicines.map((item) => String(item.id) === String(medicineId) ? details : item) : [...currentMedicines, details];
    savePetReminders(medicineForm.dataset.petId, { ...current, medicines, medicine: medicines[0] || null });
    const todayCards = document.querySelector('.pet-intake-panel [data-pet-intake-cards]');
    if (todayCards) {
      const active = activeMedicineDetails({ medicines });
      const kinds = ['food', 'water', ...(active.length ? ['medicine'] : [])];
      todayCards.dataset.intakeKinds = kinds.join(',');
      const todayRecord = loadPetRecords(medicineForm.dataset.petId).find((record) => record.date === localPetDate()) || {};
      todayCards.innerHTML = petIntakeCards(todayRecord, todayCards.dataset.petName, kinds, active);
    }
    const medicinePanel = medicineForm.closest('.pet-medicine-panel');
    medicinePanel.querySelector('[data-medicine-saved-details]').innerHTML = petMedicineDetailsListMarkup(medicines);
    medicinePanel.querySelector('[data-add-medicine]').hidden = false;
    medicineForm.hidden = true;
    feedback.textContent = oldDetails ? 'Medicine details updated.' : 'Medicine details saved.';
    feedback.classList.add('visible');
  });
  const recordForm = document.querySelector('[data-pet-record-form]');
  setupPetExerciseTracker();
  const intakeCards = document.querySelectorAll('[data-pet-intake-cards]');
  intakeCards.forEach((cards) => cards.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-pet-intake]');
    const undoButton = event.target.closest('[data-undo-pet-intake]');
    const actionButton = addButton || undoButton;
    if (!actionButton) return;
    const kind = actionButton.dataset.addPetIntake || actionButton.dataset.undoPetIntake;
    const isMedicine = kind.startsWith('medicine_');
    const countField = `${kind}Count`;
    const lastField = `${kind}LastAt`;
    const eventsField = `${kind}Intakes`;
    const today = localPetDate();
    const current = loadPetRecords(cards.dataset.petId).find((record) => record.date === today) || { date: today };
    const time = new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    let events;
    let nextRecord;
    if (isMedicine) {
      const medicineId = kind.slice('medicine_'.length);
      const reminders = loadPetReminders(cards.dataset.petId);
      const medicine = medicineDetailsList(reminders).find((item) => medicineIntakeFieldKey(item.id) === kind);
      const allEvents = Array.isArray(current.medicineIntakes) ? current.medicineIntakes.map((entry) => medicineIntakeEntry(entry, reminders)) : [];
      if (addButton) allEvents.push({ medicineId: medicine?.id || medicineId, name: medicine?.name || 'Medicine / Supplement', time });
      else {
        const removeIndex = allEvents.map((entry, index) => ({ entry, index })).filter(({ entry }) => medicineIntakeFieldKey(entry.medicineId) === kind).at(-1)?.index;
        if (removeIndex !== undefined) allEvents.splice(removeIndex, 1);
      }
      events = allEvents;
      const legacyTimes = allEvents.map((entry) => entry.time).filter(Boolean);
      nextRecord = { ...current, date: today, medicineIntakes: allEvents, medicineCount: String(allEvents.length), medicineLastAt: legacyTimes.at(-1) || '' };
    } else {
      const previousCount = Number(current[countField]) || 0;
      events = Array.isArray(current[eventsField]) ? [...current[eventsField]] : Array(previousCount).fill('');
      if (addButton) events.push(time);
      else if (events.length) events.pop();
      const nextCount = addButton ? previousCount + 1 : Math.max(0, previousCount - 1);
      nextRecord = {
        ...current,
        date: today,
        [countField]: String(nextCount),
        [eventsField]: events,
        [lastField]: events.filter(Boolean).at(-1) || '',
      };
    }
    savePetRecord(cards.dataset.petId, nextRecord);
    updatePetIntakeCards(nextRecord);
    const feedback = cards.closest('.pet-care-panel')?.querySelector('[data-intake-feedback]');
    const label = kind === 'food' ? 'Food' : kind === 'water' ? 'Water' : 'Medicine or supplement';
    if (feedback) feedback.textContent = addButton ? `${label} intake added.` : `${label} intake removed.`;
  }));
  recordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const feedback = recordForm.querySelector('.form-feedback');
    const record = {
      date: localPetDate(),
      exerciseKm: recordForm.elements.exerciseKm.value || '0',
      notes: recordForm.elements.notes.value.trim(),
    };
    savePetRecord(recordForm.dataset.petId, record);
    feedback.textContent = 'Today’s exercise record saved.';
    feedback.classList.add('visible');
  });
}

function setupMedicineReminderScheduler() {
  if (medicineReminderInterval) return;
  const scan = async () => {
    const now = Date.now();
    const today = localPetDate();
    for (const pet of loadPetProfiles()) {
      const settings = loadPetReminders(pet.id);
      if (settings.showInAssistant?.medicine === false) continue;
      let changed = false;
      const medicines = [];
      for (const medicine of medicineDetailsList(settings)) {
        if (!medicine?.name || !medicine.startDate || !medicine.endDate || today < medicine.startDate || today > medicine.endDate) { medicines.push(medicine); continue; }
        const interval = Math.max(1, Number(medicine.frequencyInterval) || parseMedicineFrequency(medicine.frequency).interval);
        const unit = medicine.frequencyUnit || parseMedicineFrequency(medicine.frequency).unit;
        const cadenceMs = interval * (unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
        const anchor = Date.parse(medicine.scheduleAnchorAt || medicine.savedAt || '');
        if (!Number.isFinite(anchor)) { medicines.push(medicine); continue; }
        const lastReminder = Date.parse(medicine.lastReminderAt || '');
        const dueAt = Number.isFinite(lastReminder) ? lastReminder + cadenceMs : anchor + cadenceMs;
        if (now < dueAt) { medicines.push(medicine); continue; }
        const message = `${medicine.name}${medicine.dosage ? ` · ${medicine.dosage}` : ''} is due for ${pet.name}.`;
        let delivered = await createPetReminderInboxNotification('Medicine & Supplement Reminder', message, `medicine:${pet.id}:${medicine.id}:${dueAt}`);
        if (!delivered) delivered = await showPortalBrowserNotification('pet_reminder', 'Medicine & Supplement Reminder', message, {
          tag: `furgo-medicine-${pet.id}-${medicine.id}`,
          data: { url: `#pet-record?id=${encodeURIComponent(pet.id)}` },
        });
        if (!delivered && !document.hidden) {
          showMedicineReminderToast(message, pet.id);
        }
        if (!delivered && document.hidden) { medicines.push(medicine); continue; }
        changed = true;
        medicines.push({ ...medicine, lastReminderAt: new Date(now).toISOString() });
      }
      const customReminders = [];
      for (const reminder of settings.customReminders || []) {
        if (!reminder?.title || reminder.date !== today || reminder.lastNotifiedDate === today) { customReminders.push(reminder); continue; }
        const reminderTime = reminder.time || '09:00';
        const due = new Date(`${reminder.date}T${reminderTime}:00`).getTime();
        if (!Number.isFinite(due) || now < due) { customReminders.push(reminder); continue; }
        const message = `${reminder.title} · ${pet.name}`;
        let delivered = await createPetReminderInboxNotification('Pet Reminder', message, `custom:${pet.id}:${reminder.id}:${today}`);
        if (!delivered) delivered = await showPortalBrowserNotification('pet_reminder', 'Pet Reminder', message, {
          tag: `furgo-custom-reminder-${pet.id}-${reminder.id}-${today}`,
          data: { url: `#pet-profile?id=${encodeURIComponent(pet.id)}&section=settings` },
        });
        if (!delivered && !document.hidden) showMedicineReminderToast(message, pet.id);
        if (!delivered && document.hidden) { customReminders.push(reminder); continue; }
        changed = true;
        customReminders.push({ ...reminder, lastNotifiedDate: today });
      }
      if (changed) savePetReminders(pet.id, { ...settings, medicines, medicine: medicines[0] || null, customReminders });
    }
  };
  scan();
  medicineReminderInterval = window.setInterval(scan, 30_000);
}

function showMedicineReminderToast(message, petId) {
  let toast = document.querySelector('[data-medicine-reminder-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'pet-medicine-reminder-toast';
    toast.dataset.medicineReminderToast = '';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
  }
  toast.innerHTML = `<span>${escapeHTML(message)}</span><button type="button" data-open-medicine-intake>Log Intake</button><button type="button" data-dismiss-medicine-toast aria-label="Dismiss reminder">×</button>`;
  toast.querySelector('[data-open-medicine-intake]').onclick = () => { window.location.hash = `#pet-record?id=${encodeURIComponent(petId)}`; toast.remove(); };
  toast.querySelector('[data-dismiss-medicine-toast]').onclick = () => toast.remove();
  window.clearTimeout(Number(toast.dataset.timeoutId));
  toast.dataset.timeoutId = String(window.setTimeout(() => toast.remove(), 12_000));
}

function setupPetExerciseTracker() {
  const tracker = document.querySelector('[data-exercise-tracker]');
  if (!tracker) return;
  const mapElement = tracker.querySelector('[data-exercise-map]');
  const placeholder = tracker.querySelector('[data-exercise-map-placeholder]');
  const distanceLabel = tracker.querySelector('[data-exercise-distance]');
  const durationLabel = tracker.querySelector('[data-exercise-duration]');
  const status = tracker.querySelector('[data-exercise-status]');
  const startButton = tracker.querySelector('[data-exercise-start]');
  const petId = tracker.dataset.petId;
  let map = null;
  let routeLine = null;
  let currentMarker = null;
  let watchId = null;
  let timerId = null;
  let startedAt = 0;
  let distanceMeters = 0;
  let lastPoint = null;
  let route = [];
  let wasHidden = false;
  let hasFix = false;


  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.classList.toggle('is-warning', kind === 'warning');
    status.classList.toggle('is-error', kind === 'error');
  };
  const formatDuration = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  const refreshMetrics = () => {
    distanceLabel.textContent = `${(distanceMeters / 1000).toFixed(2)} km`;
    durationLabel.textContent = formatDuration(Date.now() - startedAt);
  };
  const initMap = (lat, lon) => {
    if (map || !window.L) return;
    placeholder?.remove();
    map = window.L.map(mapElement, { zoomControl: true, attributionControl: true }).setView([lat, lon], 16);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    }).addTo(map);
    routeLine = window.L.polyline([], { color: '#ff7900', weight: 5, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    currentMarker = window.L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#ff7900', fillOpacity: 1 }).addTo(map);
    requestAnimationFrame(() => map?.invalidateSize());
  };
  const onPosition = (position) => {
    if (!startedAt) return;
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (accuracy > 70) {
      setStatus('GPS signal is weak. Move to a more open area for a better route.', 'warning');
      return;
    }
    const point = [latitude, longitude];
    if (lastPoint) {
      const segment = distanceBetweenMeters(lastPoint, point);
      if (segment >= 3 && segment <= 250) distanceMeters += segment;
      else if (segment > 250) setStatus('A location jump was ignored. GPS may be reconnecting.', 'warning');
    }
    lastPoint = point;
    hasFix = true;
    route.push(point);
    if (route.length > 300) route = route.filter((_, index) => index % 2 === 0);
    initMap(latitude, longitude);
    if (map) {
      currentMarker?.setLatLng(point);
      routeLine?.setLatLngs(route);
      if (route.length === 1) map.setView(point, 16);
    }
    refreshMetrics();
    if (wasHidden && !document.hidden) {
      wasHidden = false;
      setStatus('Location tracking resumed.');
    } else if (!window.L) {
      setStatus('GPS is recording, but the map could not load. Check your internet connection.', 'warning');
    } else if (!document.hidden) {
      setStatus('Tracking your route. Keep this page open for the most reliable recording.');
    }
  };
  const onPositionError = (error) => {
    const message = error.code === 1
      ? 'Location permission is off. Allow location access in your browser to record this route.'
      : error.code === 3
        ? 'GPS is taking longer than expected. Move outdoors and check your location settings.'
        : 'Location updates were interrupted. Check your GPS signal and keep this page open.';
    setStatus(message, 'error');
  };
  const stopTracking = (save = true) => {
    if (!startedAt) return;
    if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
    if (timerId !== null) window.clearInterval(timerId);
    watchId = null;
    timerId = null;
    const durationMs = Date.now() - startedAt;
    distanceLabel.textContent = `${(distanceMeters / 1000).toFixed(2)} km`;
    durationLabel.textContent = formatDuration(durationMs);
    startButton.textContent = 'Start Exercise';
    startButton.classList.remove('is-recording');
    if (save && hasFix) {
      const today = localPetDate();
      const current = loadPetRecords(petId).find((record) => record.date === today) || { date: today };
      const priorDistance = Number(current.exerciseKm) || 0;
      const session = {
        id: `exercise-${Date.now()}`,
        startedAt: new Date(startedAt).toISOString(),
        durationSeconds: Math.round(durationMs / 1000),
        distanceKm: Number((distanceMeters / 1000).toFixed(3)),
        route: route.slice(0, 300),
      };
      savePetRecord(petId, {
        ...current,
        date: today,
        exerciseKm: (priorDistance + distanceMeters / 1000).toFixed(2),
        exerciseSessions: [...(Array.isArray(current.exerciseSessions) ? current.exerciseSessions : []), session].slice(-5),
      });
      const exerciseInput = document.querySelector('[data-pet-record-form] input[name="exerciseKm"]');
      if (exerciseInput) exerciseInput.value = (priorDistance + distanceMeters / 1000).toFixed(2);
      setStatus(`Exercise saved: ${(distanceMeters / 1000).toFixed(2)} km in ${formatDuration(durationMs)}.`);
    } else if (save) {
      setStatus('No route was recorded. Allow location access and try again.', 'error');
    } else {
      setStatus('Exercise tracking stopped.');
    }
    startedAt = 0;
  };
  startButton?.addEventListener('click', () => {
    if (startedAt) {
      stopTracking(true);
      return;
    }
    if (!navigator.geolocation) {
      setStatus('Location tracking is not available in this browser.', 'error');
      return;
    }
    distanceMeters = 0;
    lastPoint = null;
    route = [];
    wasHidden = false;
    hasFix = false;
    startedAt = Date.now();
    if (map) {
      routeLine?.setLatLngs([]);
      if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
    }
    startButton.textContent = 'Finish Exercise';
    startButton.classList.add('is-recording');
    setStatus('Waiting for GPS location. Allow location access when your browser asks.');
    timerId = window.setInterval(refreshMetrics, 1000);
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 20000,
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!startedAt) return;
    if (document.hidden) {
      wasHidden = true;
      setStatus('The browser is in the background. GPS updates may be interrupted; return to this page and check the route.', 'warning');
    } else if (wasHidden) {
      setStatus('Checking GPS signal after returning to the page…', 'warning');
    }
  });
}

function distanceBetweenMeters([lat1, lon1], [lat2, lon2]) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
