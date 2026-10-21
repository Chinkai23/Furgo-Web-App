import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadPromotions, normalizePromotionDestination } from './admin-promotions.js';

const petStorageKey = 'furgo-demo-pet-profiles';
const defaultPets = [{ id: 'jojo-demo', name: 'Jojo', breed: 'Siberian Husky', sex: 'Female', weight: '3.8', tags: ['Big size', 'Sensitive skin'], photo: '' }];

// Loads pet profiles saved in this browser, falling back to the sample pet shown in the prototype.
export function loadPetProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(petStorageKey) || 'null');
    return Array.isArray(saved) ? saved : defaultPets;
  } catch {
    return defaultPets;
  }
}

// Builds the horizontal pet cards, remark previews, and final add-pet card.
export function petCarouselMarkup(icon, pets = loadPetProfiles()) {
  const cards = pets.map((pet) => {
    const avatar = pet.photo || 'Image/Other%20Image/Pet%20Profile%20Picture.png';
    const remarks = Array.isArray(pet.remarks) ? pet.remarks : [...(pet.tags || []), ...(pet.redFlagRemark ? [pet.redFlagRemark] : [])];
    let visibleRemarks = remarks.slice(0, 2);
    const hasMoreRemarks = remarks.length > 1 || visibleRemarks.some((remark) => remark.length > 17) || visibleRemarks.reduce((total, remark) => total + remark.length, 0) > 22;
    if (hasMoreRemarks) visibleRemarks = remarks.slice(0, 1);
    const profileUrl = `#pet-profile?id=${encodeURIComponent(pet.id)}`;
    const hasVaccinationCards = (pet.vaccinationCards || []).length > 0;
    return `<article class="pet-card"><div class="pet-card-side"><label class="pet-photo-trigger" aria-label="Upload a photo for ${escapeHTML(pet.name)}"><img class="pet-avatar" src="${escapeHTML(avatar)}" alt="${pet.photo ? `${escapeHTML(pet.name)}'s uploaded profile photo` : 'Default pet profile picture'}" /><input type="file" accept="image/*" data-pet-photo="${escapeHTML(pet.id)}" aria-label="Choose ${escapeHTML(pet.name)}'s profile photo" /></label><div class="pet-tags ${hasMoreRemarks ? 'has-more-remarks' : ''}">${visibleRemarks.map((remark) => `<span title="${escapeHTML(remark)}">${escapeHTML(remark)}</span>`).join('')}${hasMoreRemarks ? `<a class="pet-view-more" href="${profileUrl}">View more</a>` : ''}</div></div><div class="pet-info"><h3>${escapeHTML(pet.name)}</h3><p class="pet-description"><span>${escapeHTML(pet.breed || 'Breed not added')}${pet.sex ? ` • ${escapeHTML(pet.sex)}` : ''}</span></p><p class="pet-vaccination-status ${hasVaccinationCards ? 'has-vaccination-cards' : 'no-vaccination-cards'}">Vaccination Cards: ${hasVaccinationCards ? 'Yes' : 'No'}</p><p class="pet-weight">${pet.weight ? `${escapeHTML(pet.weight)}kg` : 'Weight not added'}</p></div><a class="pet-profile-button" href="${profileUrl}">Check Profile</a></article>`;
  }).join('');
  return `${cards}<a class="add-pet-card" href="#pet-profile?mode=add" aria-label="Add a new pet"><img class="add-pet-plus" src="${icon('Icon-12.png')}" alt="" /><small>Add New Pet</small></a>`;
}

// Home screen: customer greeting, search, credit, service shortcuts, pet profile, promotions, and navigation.
export function homePage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const userName = profile.name || 'Pet Parent';
  const creditBalance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0) || 0;
  const serviceArtwork = [
    ['Marketplace', 'MVP Icon-01.png'], ['Grooming', 'MVP Icon-02.png'],
    ['Pet Hotel', 'MVP Icon-04.png'], ['Pet Daycare', 'MVP Icon-03.png'],
  ];
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const pets = loadPetProfiles();
  const promotions = loadPromotions();
  const promotionMarkup = promotions.length
    ? promotions.map((promotion) => {
      const destination = normalizePromotionDestination(promotion.destination) || '#home';
      const external = destination.startsWith('https://');
      return `<a class="promo-banner" href="${escapeHTML(destination)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="Open promotion: ${escapeHTML(promotion.title)}"><img src="${escapeHTML(promotion.image)}" alt="${escapeHTML(promotion.title)}" loading="lazy" /></a>`;
    }).join('')
    : '<p class="promo-empty">Promotions will appear here.</p>';
  return `<main class="mobile-home">
    <section class="home-orange" aria-label="Furgo dashboard">
      <div class="home-topline"><div><span class="home-kicker">Better Care For Every Pet</span><h1>Hey, ${escapeHTML(userName)}</h1></div><button class="notification-button" type="button" aria-label="Notifications" data-toast="You’re all caught up."><img src="${icon('Icon-10.png')}" alt="" /></button></div>
      <form class="home-search" role="search" data-search-form><span class="search-symbol" aria-hidden="true"></span><input type="search" name="service" placeholder="Search pet services" aria-label="Search pet services" /><span class="search-hint">Try “grooming”</span></form>
      <div class="credit-row"><img class="home-pet-art" src="Image/Icon/FurgoMascot.png" alt="Furgo mascot" /><!-- Furgo Credit balance card opens My Furgo Credit and records Home as its return destination. --><a class="credit-card" href="#credit?from=home"><span class="credit-label">Total Furgo Credit</span><span class="credit-balance-row"><strong>MYR ${creditBalance.toFixed(2)}</strong><img class="wallet-mark" src="${icon('Icon-11.png')}" alt="" /></span></a></div>
      <nav class="service-shortcuts" id="services" aria-label="Pet services">${serviceArtwork.map(([name, file]) => `<a class="shortcut" href="${name === 'Marketplace' ? '#marketplace' : name === 'Grooming' ? '#grooming' : name === 'Pet Hotel' ? '#hotel' : '#daycare'}" data-service="${name.toLowerCase()}"><img src="${icon(file)}" alt="" /><span>${name}</span></a>`).join('')}</nav>
    </section>
    <div class="home-content">
      <section class="pet-section" aria-labelledby="pet-title"><div class="section-title-row"><h2 id="pet-title">Pet Profile</h2></div><div class="pet-carousel" data-pet-carousel>${petCarouselMarkup(icon, pets)}</div></section>
      <section class="promo-section" aria-labelledby="promo-title"><div class="section-title-row"><h2 id="promo-title">Promotions</h2>${promotions.length > 1 ? '<button class="arrow-button" type="button" aria-label="More promotions" data-toast="Swipe to see more promotions.">›</button>' : ''}</div><div class="promo-track">${promotionMarkup}</div></section>
    </div>
    ${bottomNavigation('home', icon)}
    <div class="home-toast" role="status" aria-live="polite"></div>
  </main>`;
}
