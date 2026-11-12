import { bottomNavigation, escapeHTML } from '../shared.js';
import { defaultPetAvatarPath, freePetAssistantAvatars, freePetCatAvatars, isPetAssistantSelected, loadPetProfiles, petAvatarUrl, petCustomAvatarLibrary, petProfilePictureUrl, savePetAssistantIds, saveSelectedPetAssistantId, selectedPetAssistantId, selectedPetAssistantIds } from './home.js';
import { formatPetDate, localPetDate, loadPetRecords, loadPetReminders, petServiceReminders, savePetRecord, savePetReminders } from './pet-care-data.js';

const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
const getPet = (petId) => loadPetProfiles().find((pet) => String(pet.id) === String(petId)) || null;
const petSettingTitle = (pet, section) => pet?.name?.trim() ? `${escapeHTML(pet.name)}’s ${section}` : `This Pet ${section}`;
const petSettingIcon = (name) => {
  const paths = {
    Avatar: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/><path d="M4 4v3M4 4h3M20 4h-3M20 4v3M4 20v-3M4 20h3M20 20h-3M20 20v-3"/>',
    Reminder: '<rect x="4.5" y="6" width="15" height="14" rx="2"/><path d="M8 3.5v5M16 3.5v5M4.5 10h15M8 14h2M13 14h3"/>',
    Vaccination: '<path d="m8 3 13 13-5 5L3 8z"/><path d="m6 6 3-3M10 10l2-2M13 13l2-2M8 16l2-2M12 20l2-2"/>',
    Record: '<path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z"/><path d="M9 4.5v-2h6v2M8 10h8M8 14h8M8 18h5"/>',
    Data: '<path d="M4 6.5C4 5.1 7.6 4 12 4s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5Z"/><path d="M4 6.5v5C4 12.9 7.6 14 12 14s8-1.1 8-2.5v-5M4 11.5v5C4 17.9 7.6 19 12 19s8-1.1 8-2.5v-5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.Record}</svg>`;
};
const petSettingRow = (pet, section, href) => `<a class="profile-menu-row" href="${href}"><span class="pet-setting-label"><span class="pet-setting-icon">${petSettingIcon(section)}</span><span>${petSettingTitle(pet, section)}</span></span><span class="profile-chevron" aria-hidden="true">›</span></a>`;
const pageHeader = (title, pet, back = `#pet-profile?id=${encodeURIComponent(pet?.id || '')}`) => `<header class="profile-heading"><a class="profile-back" href="${back}" aria-label="Back to Pet Profile">‹</a><h1>${title}</h1></header>`;
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
        ${petSettingRow(pet, 'Reminder', `#pet-reminder?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Vaccination', `#pet-vaccination?id=${encodeURIComponent(pet.id)}`)}
        ${petSettingRow(pet, 'Record', `#pet-record?id=${encodeURIComponent(pet.id)}`)}
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
        ${['Avatar', 'Reminder', 'Vaccination', 'Record', 'Data'].map((section) => `<button class="profile-menu-row" type="button" disabled><span class="pet-setting-label"><span class="pet-setting-icon">${petSettingIcon(section)}</span><span>This Pet ${section}</span></span><span class="profile-chevron" aria-hidden="true">›</span></button>`).join('')}
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
  const rows = [
    ['Pet name', pet.name], ['Breed', pet.breed], ['Gender', pet.sex], ['Birth date', pet.birthDate ? formatPetDate(pet.birthDate) : 'Not added'],
    ['Weight', pet.weight ? `${pet.weight} kg` : 'Not added'], ['Neutered / Spayed', pet.neutered === 'yes' ? 'Yes' : pet.neutered === 'no' ? 'No' : 'Not added'],
    ['Vaccination cards', `${(pet.vaccinationCards || []).length} uploaded`],
  ];
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Data'), pet)}
    <section class="pet-care-panel"><div class="profile-menu-group"><h2>${escapeHTML(pet.name)}’s Data</h2></div>
      <dl class="pet-data-list">${rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value || 'Not added')}</dd></div>`).join('')}</dl>
      ${(pet.vaccinationCards || []).length ? `<section class="pet-data-documents"><h3>Vaccination Cards</h3><ul class="pet-care-list">${pet.vaccinationCards.map((card) => `<li><a href="${escapeHTML(card.data || '#')}" target="_blank" rel="noopener">${escapeHTML(card.name || 'Vaccination record')}</a></li>`).join('')}</ul></section>` : ''}
    </section>
    ${bottomNavigation('home', icon)}
  </main>`;
}

export function petReminderPage(petId = '') {
  const pet = getPet(petId);
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Reminder', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const reminders = loadPetReminders(pet.id);
  const services = petServiceReminders(pet);
  const serviceRows = services.map((booking) => `<li><span>${escapeHTML(booking.service)}</span><strong>${escapeHTML(formatPetDate(booking.date))}</strong></li>`).join('');
  const bubbleSettings = { service: true, vaccination: true, foodWater: true, exercise: true, medicine: true, foodWeight: true, milestone: true, ...(reminders.showInAssistant || {}) };
  const customReminders = Array.isArray(reminders.customReminders) ? reminders.customReminders : [];
  const foodWeight = reminders.foodWeight || {};
  const milestone = reminders.milestone || {};
  const milestoneDate = milestone.date || pet.birthDate || '';
  const bubbleOptions = [
    ['service', 'Grooming / Pet Hotel / Pet Daycare reminders'],
    ['vaccination', 'Vaccination reminders'],
    ['foodWater', 'Food and water intake'],
    ['medicine', 'Medicine reminders'],
    ['exercise', 'Exercise updates'],
    ['foodWeight', 'Food changes or weight check-ins'],
    ['milestone', 'Birthday or adoption day'],
    ['custom', 'Custom reminders'],
  ];
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Reminder'), pet)}
    <section class="pet-care-panel"><div class="profile-menu-group"><h2>${escapeHTML(pet.name)}’s Reminders</h2></div>
      <form class="pet-care-form" data-pet-reminder-form data-pet-id="${escapeHTML(pet.id)}">
        <fieldset class="pet-reminder-visibility"><legend>Show in the home speech bubble</legend>${bubbleOptions.map(([key, label]) => `<label><input type="checkbox" name="show-${key}" ${bubbleSettings[key] !== false ? 'checked' : ''} /><span>${label}</span></label>`).join('')}</fieldset>
        <div class="pet-care-inline-fields"><label>Medicine name<input name="medicineName" value="${escapeHTML(reminders.medicine?.name || '')}" maxlength="80" placeholder="e.g. Daily medicine" /></label><label>Medicine time<input type="time" name="medicineTime" value="${escapeHTML(reminders.medicine?.time || '')}" /></label></div>
        <div class="pet-care-inline-fields"><label>Food or weight reminder<select name="foodWeightType"><option value="food-change" ${foodWeight.type !== 'weight-check' ? 'selected' : ''}>Food change</option><option value="weight-check" ${foodWeight.type === 'weight-check' ? 'selected' : ''}>Weight check-in</option></select></label><label>Reminder date<input type="date" name="foodWeightDate" value="${escapeHTML(foodWeight.date || '')}" /></label></div>
        <div class="pet-care-inline-fields"><label>Annual occasion<select name="milestoneType"><option value="birthday" ${milestone.type !== 'adoption' ? 'selected' : ''}>Birthday</option><option value="adoption" ${milestone.type === 'adoption' ? 'selected' : ''}>Adoption day</option></select></label><label>Occasion date<input type="date" name="milestoneDate" value="${escapeHTML(milestoneDate)}" /></label></div>
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
      <div class="profile-menu-group"><h2>${escapeHTML(pet.name)}’s Vaccination</h2></div>
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
  if (!pet) return `<main class="pet-profile-page pet-care-page">${pageHeader('This Pet Record', null, '#home')}${missingPet()}${bottomNavigation('home', icon)}</main>`;
  const today = localPetDate();
  const records = loadPetRecords(pet.id);
  const todayRecord = records.find((item) => item.date === today) || {};
  return `<main class="pet-profile-page pet-care-page">
    ${pageHeader(petSettingTitle(pet, 'Record'), pet)}
    <section class="pet-care-panel pet-intake-panel" aria-labelledby="pet-intake-heading">
      <div class="profile-menu-group"><h2 id="pet-intake-heading">Today with ${escapeHTML(pet.name)}</h2><p>Tap a card to log an intake.</p></div>
      <div class="pet-intake-cards" data-pet-intake-cards data-pet-id="${escapeHTML(pet.id)}" data-pet-name="${escapeHTML(pet.name)}">${petIntakeCards(todayRecord, pet.name)}</div>
      <p class="pet-intake-feedback" data-intake-feedback role="status" aria-live="polite"></p>
    </section>
    <section class="pet-record-chart-panel" aria-labelledby="pet-intake-chart-title">
      <h2 id="pet-intake-chart-title">Food &amp; Water Intake — Last 7 Days</h2>
      ${petIntakeChart(records, today)}
      <div class="pet-intake-chart-legend"><span><i class="is-food"></i>Food</span><span><i class="is-water"></i>Water</span></div>
    </section>
    <section class="pet-care-panel pet-exercise-panel" aria-labelledby="pet-exercise-heading">
      <div class="profile-menu-group"><h2 id="pet-exercise-heading">Exercise</h2><p>Keep this pet’s activity record up to date.</p></div>
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
    ${bottomNavigation('home', icon)}
  </main>`;
}

function petIntakeCards(record = {}, petName = '') {
  return [
    { key: 'food', label: `${petName}’s Food Intake`, asset: 'Food and Water Intake-01.png', count: Number(record.foodCount) || 0, last: record.foodLastAt || '' },
    { key: 'water', label: `${petName}’s Water Intake`, asset: 'Food and Water Intake-02.png', count: Number(record.waterCount) || 0, last: record.waterLastAt || '' },
  ].map((item) => `<article class="pet-intake-card is-${item.key}">
    <button class="pet-intake-add" type="button" data-add-pet-intake="${item.key}" aria-label="Add ${item.key} intake for today">
      <span class="pet-intake-title">${escapeHTML(item.label)} Today</span><img src="Image/Other%20Image/${encodeURIComponent(item.asset)}" alt="" />
      <span class="pet-intake-count" data-intake-count="${item.key}">${item.count}</span><span class="pet-intake-times">${item.count === 1 ? 'Time' : 'Times'}</span>
      <span class="pet-intake-last" data-intake-last="${item.key}">Last Intake: ${item.last ? escapeHTML(item.last) : '—'}</span>
      <span class="pet-intake-prompt">Tap to add an intake</span>
    </button>
    <button class="pet-intake-undo" type="button" data-undo-pet-intake="${item.key}" aria-label="Undo last ${item.key} intake" ${item.count ? '' : 'disabled'}>Undo ↶</button>
  </article>`).join('');
}

function petIntakeChart(records, today) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - (6 - offset));
    return localPetDate(date);
  });
  const max = Math.max(1, ...days.flatMap((date) => {
    const record = byDate.get(date) || {};
    return [Number(record.foodCount) || 0, Number(record.waterCount) || 0];
  }));
  return `<div class="pet-intake-chart" role="img" aria-label="Food and water intake counts for the last seven days">${days.map((date) => {
    const record = byDate.get(date) || {};
    const food = Number(record.foodCount) || 0;
    const water = Number(record.waterCount) || 0;
    const labelDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
    const bar = (kind, count) => `<div class="pet-intake-bar-column"><span class="pet-intake-bar-count">${count || ''}</span><i class="is-${kind}" style="--bar-height:${count ? Math.max(4, count / max * 100) : 0}%"></i></div>`;
    return `<div class="pet-intake-day">${bar('food', food)}${bar('water', water)}<span class="pet-intake-day-label">${escapeHTML(labelDate)}</span></div>`;
  }).join('')}</div>`;
}

function updatePetIntakeCards(record) {
  const cards = document.querySelector('[data-pet-intake-cards]');
  if (!cards) return;
  cards.innerHTML = petIntakeCards(record, cards.dataset.petName);
}

function updatePetIntakeChart(records) {
  const panel = document.querySelector('.pet-record-chart-panel');
  if (!panel) return;
  const chart = panel.querySelector('.pet-intake-chart');
  if (chart) chart.outerHTML = petIntakeChart(records, localPetDate());
}

export function setupPetCarePages() {
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
    const name = reminderForm.elements.medicineName.value.trim();
    const time = reminderForm.elements.medicineTime.value;
    if (Boolean(name) !== Boolean(time)) {
      feedback.textContent = 'Enter both the medicine name and time, or leave both blank.';
      feedback.classList.add('visible');
      return;
    }
    const current = loadPetReminders(reminderForm.dataset.petId);
    savePetReminders(reminderForm.dataset.petId, {
      ...current,
      medicine: name && time ? { name, time } : null,
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
      customReminders: [...(customReminderList?.querySelectorAll('[data-custom-reminder-row]') || [])].map((row) => ({
        id: row.dataset.reminderId,
        title: row.querySelector('[data-custom-reminder-title]').value.trim(),
        date: row.querySelector('[data-custom-reminder-date]').value,
        time: row.querySelector('[data-custom-reminder-time]').value,
      })).filter((reminder) => reminder.title && reminder.date),
      foodWeight: reminderForm.elements.foodWeightDate.value ? {
        type: reminderForm.elements.foodWeightType.value,
        date: reminderForm.elements.foodWeightDate.value,
      } : null,
      milestone: reminderForm.elements.milestoneDate.value ? {
        type: reminderForm.elements.milestoneType.value,
        date: reminderForm.elements.milestoneDate.value,
      } : null,
    });
    feedback.textContent = 'Reminders and home speech bubble settings saved.';
    feedback.classList.add('visible');
  });
  const recordForm = document.querySelector('[data-pet-record-form]');
  setupPetExerciseTracker();
  const intakeCards = document.querySelector('[data-pet-intake-cards]');
  intakeCards?.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-pet-intake]');
    const undoButton = event.target.closest('[data-undo-pet-intake]');
    const actionButton = addButton || undoButton;
    if (!actionButton) return;
    const kind = actionButton.dataset.addPetIntake || actionButton.dataset.undoPetIntake;
    const countField = `${kind}Count`;
    const lastField = `${kind}LastAt`;
    const eventsField = `${kind}Intakes`;
    const today = localPetDate();
    const current = loadPetRecords(intakeCards.dataset.petId).find((record) => record.date === today) || { date: today };
    const previousCount = Number(current[countField]) || 0;
    const events = Array.isArray(current[eventsField]) ? [...current[eventsField]] : Array(previousCount).fill('');
    if (addButton) events.push(new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase());
    else if (events.length) events.pop();
    const nextCount = addButton ? previousCount + 1 : Math.max(0, previousCount - 1);
    const nextRecord = {
      ...current,
      date: today,
      [countField]: String(nextCount),
      [eventsField]: events,
      [lastField]: events.filter(Boolean).at(-1) || '',
    };
    const records = savePetRecord(intakeCards.dataset.petId, nextRecord);
    updatePetIntakeCards(nextRecord);
    updatePetIntakeChart(records);
    const feedback = document.querySelector('[data-intake-feedback]');
    if (feedback) feedback.textContent = addButton ? `${kind === 'food' ? 'Food' : 'Water'} intake added.` : `${kind === 'food' ? 'Food' : 'Water'} intake removed.`;
  });
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
