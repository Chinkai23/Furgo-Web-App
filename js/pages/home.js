import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadPromotions, normalizePromotionDestination } from './admin-promotions.js';
import { homeServiceShortcutsMarkup } from './home-shortcuts.js';
import { portalNotificationsMarkup } from '../portal-notifications.js';
import { formatPetDate, localPetDate, loadPetRecords, loadPetReminders, petServiceReminders } from './pet-care-data.js';

const petStorageKey = 'furgo-demo-pet-profiles';
const anonymousPetStorageKey = `${petStorageKey}-anonymous`;
export const defaultPetAvatarPath = 'Image/Pet%20Assistant%20Library/Furgo%20Assistant%20Dog.png';
export const defaultPetProfilePicturePath = 'Image/Other%20Image/Pet%20Profile%20Picture.png';
export const freePetAssistantAvatars = [
  { id: 'bulldog', label: 'Bulldog', image: 'Bulldog.png' },
  { id: 'corgi', label: 'Corgi', image: 'Corgi.png' },
  { id: 'golden-retriever', label: 'Golden Retriever', image: 'Golden Retriever.png' },
  { id: 'husky', label: 'Husky', image: 'Husky.png' },
  { id: 'labrador', label: 'Labrador', image: 'Labrador.png' },
  { id: 'maltese', label: 'Maltese', image: 'Maltese.png' },
  { id: 'mixed-breed', label: 'Mixed Breed', image: 'Mixed Breed.png' },
  { id: 'pomeranian', label: 'Pomeranian', image: 'Pomeranian.png' },
  { id: 'poodle', label: 'Poodle', image: 'Poodle.png' },
  { id: 'schnauzer', label: 'Schnauzer', image: 'Schnauzer.png' },
  { id: 'shih-tzu', label: 'Shih Tzu', image: 'Shih Tzu.png' },
].map((avatar) => ({ ...avatar, url: `Image/Pet%20Assistant%20Library/${encodeURIComponent(avatar.image)}` }));
export const freePetCatAvatars = [
  { id: 'furgo-cat', label: 'Furgo Assistant Cat', image: 'Furgo Assistant Cat.png' },
  { id: 'bengal', label: 'Bengal', image: 'Bengal.png' },
  { id: 'british-shorthair', label: 'British Shorthair', image: 'British Shorthair.png' },
  { id: 'domestic-longhair', label: 'Domestic Longhair', image: 'Domestic Longhair.png' },
  { id: 'domestic-shorthair', label: 'Domestic Shorthair', image: 'Domestic Shorthair.png' },
  { id: 'maine-coon', label: 'Maine Coon', image: 'Maine Coon.png' },
  { id: 'munchkin', label: 'Munchkin', image: 'Munchkin.png' },
  { id: 'persian', label: 'Persian', image: 'Persian.png' },
  { id: 'ragdoll', label: 'Ragdoll', image: 'Ragdoll.png' },
  { id: 'siamese', label: 'Siamese', image: 'Siamese.png' },
  { id: 'sphynx', label: 'Sphynx', image: 'Sphynx.png' },
].map((avatar) => ({ ...avatar, url: `Image/Pet%20Assistant%20Library/${encodeURIComponent(avatar.image)}` }));

// Collect custom avatars only from the current account's loaded pet profiles.
export function petCustomAvatarLibrary(pets = loadPetProfiles()) {
  const builtInUrls = new Set([defaultPetAvatarPath, ...freePetAssistantAvatars, ...freePetCatAvatars].map((item) => typeof item === 'string' ? item : item.url));
  const library = new Map();
  pets.forEach((pet) => {
    const entries = Array.isArray(pet.avatars) ? pet.avatars : [];
    const normalized = entries.map((entry) => typeof entry === 'string'
      ? { url: entry, path: entry === pet.avatar ? pet.avatarPath || '' : '' }
      : { url: entry?.url || '', path: entry?.path || '' });
    normalized.forEach((entry) => {
      // A pet's current assistant/profile avatar is not proof that it was
      // generated as a custom avatar. Only list files saved by the avatar
      // creator in the pet-records avatar folder.
      if (!entry.url || !/(^|\/)avatar-[^/]+\.[^/]+$/i.test(entry.path) || builtInUrls.has(entry.url) || entry.path?.startsWith('builtin:')) return;
      const key = entry.path || entry.url;
      if (!library.has(key)) library.set(key, { ...entry, petId: String(pet.id), petName: pet.name || 'My Pet' });
    });
  });
  return [...library.values()];
}
const assistantPetSelectionBaseKey = 'furgo-pet-assistant-selected-pet';
const assistantPetSetBaseKey = 'furgo-pet-assistant-enabled-pets';
const assistantPreferencesKey = 'furgo-demo-pet-assistant-preferences';
const defaultPets = [{ id: 'jojo-demo', name: 'Jojo', breed: 'Siberian Husky', sex: 'Female', weight: '3.8', tags: ['Big size', 'Sensitive skin'], photo: '' }];

// Pet caches are isolated by account; the unscoped key is read only as a legacy migration source.
export function petProfilesStorageKeyForCurrentUser() {
  try {
    const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
    return profile.id ? `${petStorageKey}-user-${encodeURIComponent(profile.id)}` : anonymousPetStorageKey;
  } catch {
    return anonymousPetStorageKey;
  }
}

// Loads this account's saved pets, falling back to the sample only outside an identified account.
export function loadPetProfiles() {
  try {
    const storageKey = petProfilesStorageKeyForCurrentUser();
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) return saved;
    return storageKey === anonymousPetStorageKey ? defaultPets : [];
  } catch {
    return petProfilesStorageKeyForCurrentUser() === anonymousPetStorageKey ? defaultPets : [];
  }
}

export function selectedPetAssistantId() {
  try {
    return String(readAssistantPreferences().selectedPetId || '');
  } catch {
    return '';
  }
}

export function selectedPetAssistantIds() {
  try {
    const preferences = readAssistantPreferences();
    return Array.isArray(preferences.enabledPetIds) ? preferences.enabledPetIds.map(String) : null;
  } catch { return []; }
}

function readAssistantPreferences() {
  const current = localStorage.getItem(assistantPreferencesKey);
  if (current !== null) {
    try {
      const parsed = JSON.parse(current);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  // Migrate this browser's previous account-scoped preference keys into the
  // Supabase-synced record. The sync mirror will upload this on signed-in pages.
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const suffix = profile.id ? `-${encodeURIComponent(profile.id)}` : '-anonymous';
  let selectedPetId = '';
  let enabledPetIds = null;
  try { selectedPetId = localStorage.getItem(`${assistantPetSelectionBaseKey}${suffix}`) || ''; } catch { /* Use defaults. */ }
  try {
    const legacySet = localStorage.getItem(`${assistantPetSetBaseKey}${suffix}`);
    if (legacySet !== null) {
      const parsed = JSON.parse(legacySet);
      enabledPetIds = Array.isArray(parsed) ? [...new Set(parsed.map(String))] : [];
    }
  } catch { enabledPetIds = []; }
  const migrated = { selectedPetId, enabledPetIds };
  if (selectedPetId || enabledPetIds !== null) localStorage.setItem(assistantPreferencesKey, JSON.stringify(migrated));
  return migrated;
}

function writeAssistantPreferences(update) {
  const current = readAssistantPreferences();
  const next = { ...current, ...update };
  localStorage.setItem(assistantPreferencesKey, JSON.stringify(next));
  return next;
}

export function isPetAssistantSelected(petId) {
  const ids = selectedPetAssistantIds();
  return ids ? ids.includes(String(petId)) : String(selectedPetAssistantId()) === String(petId);
}

export function savePetAssistantIds(petIds) {
  try { writeAssistantPreferences({ enabledPetIds: [...new Set(petIds.map(String))] }); }
  catch { /* The UI remains usable when browser storage is unavailable. */ }
}

export function saveSelectedPetAssistantId(petId) {
  try {
    const preferences = readAssistantPreferences();
    const selectedPetId = petId ? String(petId) : '';
    const enabledPetIds = Array.isArray(preferences.enabledPetIds)
      ? [...new Set([...preferences.enabledPetIds.map(String), ...(selectedPetId ? [selectedPetId] : [])])]
      : preferences.enabledPetIds;
    writeAssistantPreferences({ selectedPetId, ...(enabledPetIds ? { enabledPetIds } : {}) });
  } catch { /* The assistant still works if browser storage is unavailable. */ }
}

export function petAvatarUrl(pet) {
  return pet?.avatar || defaultPetAvatarPath;
}

export function petProfilePictureUrl(pet) {
  return pet?.profilePictureMode === 'avatar'
    ? petAvatarUrl(pet)
    : pet?.photo || defaultPetProfilePicturePath;
}

export function selectedHomeAssistantPet(pets = loadPetProfiles()) {
  const selectedId = selectedPetAssistantId();
  const selectedIds = selectedPetAssistantIds();
  if (selectedIds) {
    return pets.find((pet) => String(pet.id) === String(selectedId) && selectedIds.includes(String(pet.id)))
      || pets.find((pet) => selectedIds.includes(String(pet.id))) || null;
  }
  return pets.find((pet) => String(pet.id) === String(selectedId)) || pets[0] || null;
}

export function selectedHomeAssistantPets(pets = loadPetProfiles()) {
  const selectedIds = selectedPetAssistantIds();
  if (selectedIds) return pets.filter((pet) => selectedIds.includes(String(pet.id)));
  const selectedPet = selectedHomeAssistantPet(pets);
  return selectedPet ? [selectedPet] : [];
}

function nextAnnualPetDate(value) {
  const [, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!month || !day) return '';
  const today = localPetDate();
  let year = Number(today.slice(0, 4));
  let nextDate = localPetDate(new Date(year, month - 1, day));
  if (nextDate < today) nextDate = localPetDate(new Date(++year, month - 1, day));
  return nextDate;
}

export function homeAssistantBubbleMessages(pet) {
  const messages = ['Hi! Chat with me now'];
  if (!pet) return [...messages, 'Add a pet profile so I can meet you'];
  const petReminders = loadPetReminders(pet.id);
  const show = { service: true, vaccination: true, foodWater: true, exercise: true, medicine: true, foodWeight: true, milestone: true, custom: true, ...(petReminders.showInAssistant || {}) };
  if (show.service) {
    petServiceReminders(pet).slice(0, 2).forEach((booking) => messages.push(`My ${booking.service} will be on ${formatPetDate(booking.date)}`));
  }
  const vaccinationDate = petReminders.vaccinationDate || pet.vaccinationValidUntil;
  if (show.vaccination && vaccinationDate) messages.push(`My next vaccine will be on ${formatPetDate(vaccinationDate)}`);
  const today = localPetDate();
  const record = loadPetRecords(pet.id).find((item) => item.date === today);
  if (record) {
    if (show.foodWater) messages.push(`Today I drank water ${Number(record.waterCount) || 0} times and ate ${Number(record.foodCount) || 0} times`);
    if (show.exercise) messages.push(Number(record.exerciseKm) > 0 ? `I exercised ${record.exerciseKm} km today` : 'I haven’t logged exercise today yet');
  } else {
    if (show.foodWater) messages.push('I haven’t logged my food or water today yet');
    if (show.exercise) messages.push('I haven’t logged exercise today yet');
  }
  const medicine = petReminders.medicine;
  if (show.medicine && medicine?.name && medicine?.time) messages.push(`I need to take ${medicine.name} at ${medicine.time}`);
  const foodWeight = petReminders.foodWeight;
  if (show.foodWeight && foodWeight?.date) {
    const reminderName = foodWeight.type === 'weight-check' ? 'weight check-in' : 'food change';
    messages.push(`My ${reminderName} will be on ${formatPetDate(foodWeight.date)}`);
  }
  const milestone = petReminders.milestone;
  if (show.milestone && milestone?.date) {
    const occasionDate = nextAnnualPetDate(milestone.date);
    const occasionName = milestone.type === 'adoption' ? 'adoption day' : 'birthday';
    if (occasionDate) messages.push(`My ${occasionName} is on ${formatPetDate(occasionDate)}`);
  }
  if (show.custom && Array.isArray(petReminders.customReminders)) {
    petReminders.customReminders
      .filter((reminder) => reminder.title && reminder.date && String(reminder.date) >= localPetDate())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 3)
      .forEach((reminder) => messages.push(`I have ${reminder.title} coming up on ${formatPetDate(reminder.date)}${reminder.time ? ` at ${reminder.time}` : ''}`));
  }
  return messages;
}

// Builds the horizontal pet cards, remark previews, and final add-pet card.
export function petCarouselMarkup(icon, pets = loadPetProfiles()) {
  const cards = pets.map((pet) => {
    const profilePicture = petProfilePictureUrl(pet);
    const hasProfilePicture = Boolean(pet.photo || pet.profilePictureMode === 'avatar');
    const remarks = Array.isArray(pet.remarks) ? pet.remarks : [...(pet.tags || []), ...(pet.redFlagRemark ? [pet.redFlagRemark] : [])];
    const profileUrl = `#pet-profile?id=${encodeURIComponent(pet.id)}`;
    const hasVaccinationCards = (pet.vaccinationCards || []).length > 0;
    return `<article class="pet-card"><div class="pet-photo-trigger"><img class="pet-avatar" src="${escapeHTML(profilePicture)}" alt="${hasProfilePicture ? `${escapeHTML(pet.name)}'s profile picture` : 'Default pet profile picture'}" /></div><div class="pet-info"><h3>${escapeHTML(pet.name)}</h3><p class="pet-description"><span>${escapeHTML(pet.breed || 'Breed not added')}${pet.sex ? ` • ${escapeHTML(pet.sex)}` : ''}</span></p><p class="pet-vaccination-status ${hasVaccinationCards ? 'has-vaccination-cards' : 'no-vaccination-cards'}">Vaccination Cards: ${hasVaccinationCards ? 'Yes' : 'No'}</p><p class="pet-weight">${pet.weight ? `${escapeHTML(pet.weight)}kg` : 'Weight not added'}</p></div><div class="pet-tags">${remarks.map((remark) => `<span data-pet-remark title="${escapeHTML(remark)}">${escapeHTML(remark)}</span>`).join('')}<a class="pet-view-more" data-pet-view-more href="${profileUrl}" hidden>View more</a></div><a class="pet-profile-button" href="${profileUrl}">Check Profile</a></article>`;
  }).join('');
  return `${cards}<a class="add-pet-card" href="#pet-profile?mode=add" aria-label="Add a new pet"><img class="add-pet-plus" src="${icon('Icon-12.png')}" alt="" /><small>Add New Pet</small></a>`;
}

// Shows every remark that fits in the card's single line; the link takes the remaining space only when needed.
export function fitPetCardRemarks(root = document) {
  root.querySelectorAll('.pet-tags').forEach((container) => {
    const remarks = [...container.querySelectorAll('[data-pet-remark]')];
    const moreLink = container.querySelector('[data-pet-view-more]');
    if (!moreLink || remarks.length === 0) return;

    remarks.forEach((remark) => { remark.hidden = false; });
    moreLink.hidden = true;
    container.classList.remove('has-more-remarks');

    const remarksOverflow = () => container.scrollWidth > container.clientWidth
      || remarks.some((remark) => !remark.hidden && remark.scrollWidth > remark.clientWidth);
    if (!remarksOverflow()) return;

    moreLink.hidden = false;
    container.classList.add('has-more-remarks');
    for (let index = remarks.length - 1; index >= 0 && remarksOverflow(); index -= 1) {
      remarks[index].hidden = true;
    }
  });
}

// Home screen: customer greeting, search, credit, service shortcuts, pet profile, promotions, and navigation.
export function homePage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const userName = profile.name || 'Pet Parent';
  const creditBalance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0) || 0;
  const tokenBalance = Math.max(0, Number(localStorage.getItem('furgo-demo-token-balance') || 0) || 0);
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const serviceShortcuts = homeServiceShortcutsMarkup();
  const pets = loadPetProfiles();
  const assistantPet = selectedHomeAssistantPet(pets);
  const assistantPets = selectedHomeAssistantPets(pets);
  const assistantAvatar = petAvatarUrl(assistantPet);
  const mascotProfileRoute = assistantPet ? `#pet-profile?id=${encodeURIComponent(assistantPet.id)}` : '#pet-profile?mode=add';
  const assistantRoute = assistantPet ? `#pet-assistant?pet=${encodeURIComponent(assistantPet.id)}` : '#pet-assistant';
  const assistantBubbleMessages = homeAssistantBubbleMessages(assistantPet);
  const promotions = loadPromotions();
  const promotionMarkup = promotions.length
    ? promotions.map((promotion) => {
      const destination = normalizePromotionDestination(promotion.destination) || '#home';
      const external = destination.startsWith('https://');
      return `<a class="promo-banner" href="${escapeHTML(destination)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="Open promotion: ${escapeHTML(promotion.title)}"><picture>${promotion.mobileImage ? `<source media="(max-width: 640px)" srcset="${escapeHTML(promotion.mobileImage)}" />` : ''}<img src="${escapeHTML(promotion.image)}" alt="${escapeHTML(promotion.title)}" loading="lazy" /></picture></a>`;
    }).join('')
    : '<p class="promo-empty">Promotions will appear here.</p>';
  return `<main class="mobile-home">
    <section class="home-orange" aria-label="Furgo dashboard">
      <div class="home-topline"><div><span class="home-kicker">Better Care For Every Pet</span><div class="home-greeting-title"><h1>Hey, ${escapeHTML(userName)}</h1><svg class="home-greeting-rays" viewBox="0 0 40 34" aria-hidden="true"><path d="M8 18 2 16M17 12 15 2M25 15 33 9" /></svg></div></div>${portalNotificationsMarkup('customer')}</div>
      <a class="home-search" href="#search" aria-label="Search products, services, or pet-friendly places"><span class="search-symbol" aria-hidden="true"></span><span class="home-search-placeholder">Search products, services, or places</span><span class="search-hint">Try “parks”</span></a>
      <div class="credit-row"><a class="home-pet-assistant-bubble" href="${escapeHTML(assistantRoute)}" aria-label="Open AI Pet Assistant${assistantPet ? ` for ${escapeHTML(assistantPet.name)}` : ''}" data-assistant-bubble data-messages="${escapeHTML(JSON.stringify(assistantBubbleMessages))}"><span class="home-pet-assistant-copy"><span class="home-pet-assistant-name" data-assistant-pet-name>${escapeHTML(assistantPet?.name || 'Furgo Assistant')}</span><span data-assistant-bubble-text>${escapeHTML(assistantBubbleMessages[0])}</span></span><span class="home-pet-assistant-arrow" aria-hidden="true">›</span></a><div class="home-balance-cards"><a class="home-pet-assistant-shortcut" data-assistant-pet-ids="${escapeHTML(JSON.stringify(assistantPets.map((pet) => String(pet.id))))}" href="${escapeHTML(mascotProfileRoute)}" aria-label="Open ${assistantPet ? `${escapeHTML(assistantPet.name)}'s` : 'a pet'} profile"><img class="home-pet-art" src="${escapeHTML(assistantAvatar)}" alt="" /></a><a class="home-balance-card token-card" href="#tokens" aria-label="Furgo Coins: ${tokenBalance}"><span class="home-token-stack"><img class="home-token-art" src="Image/Other%20Image/Pet%20Token-2.png" alt="" /><span class="home-token-copy"><span class="home-balance-label">Furgo Coins</span><strong data-fit-balance data-furgo-coins-balance>${tokenBalance.toLocaleString()}</strong></span></span></a><a class="credit-card home-balance-card" href="#credit?from=home"><span class="credit-label">Furgo Credit</span><span class="credit-balance-row"><strong data-fit-balance>${creditBalance.toFixed(2)}</strong><small class="credit-currency">MYR</small><img class="wallet-mark" src="${icon('Icon-11.png')}" alt="" /></span></a></div></div>
      ${serviceShortcuts ? `<nav class="service-shortcuts" id="services" aria-label="Pet services">${serviceShortcuts}</nav>` : ''}
    </section>
    <div class="home-content">
      <section class="pet-section" aria-labelledby="pet-title"><div class="section-title-row"><h2 id="pet-title">Pet Profile</h2></div><div class="pet-carousel" data-pet-carousel>${petCarouselMarkup(icon, pets)}</div></section>
      <section class="promo-section" aria-labelledby="promo-title"><div class="section-title-row"><h2 id="promo-title">Promotions</h2>${promotions.length > 1 ? '<button class="arrow-button" type="button" aria-label="More promotions" data-toast="Swipe to see more promotions.">›</button>' : ''}</div><div class="promo-track">${promotionMarkup}</div></section>
    </div>
    ${bottomNavigation('home', icon)}
    <div class="home-toast" role="status" aria-live="polite"></div>
  </main>`;
}
