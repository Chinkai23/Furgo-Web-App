import { escapeHTML } from '../shared.js';

export const promotionStorageKey = 'furgo-demo-promotions';
export const maximumPromotions = 8;

// Reads the locally configured promotions, keeping the Home carousel within its eight-banner limit.
export function loadPromotions() {
  try {
    const promotions = JSON.parse(localStorage.getItem(promotionStorageKey) || '[]');
    return Array.isArray(promotions) ? promotions.slice(0, maximumPromotions) : [];
  } catch {
    return [];
  }
}

// Accepts internal app routes and secure external destinations configured by an admin.
export function normalizePromotionDestination(value) {
  const destination = String(value || '').trim();
  if (/^#[a-zA-Z0-9_/?&=%.-]+$/.test(destination)) return destination;
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// Admin prototype: create up to eight image promotions and choose the page each banner opens.
export function adminPromotionsPage() {
  const promotions = loadPromotions();
  const promotionRows = promotions.map((promotion) => `<li class="admin-promo-row"><img src="${escapeHTML(promotion.image)}" alt="" /><div><strong>${escapeHTML(promotion.title)}</strong><span>${escapeHTML(promotion.destination)}</span></div><button type="button" data-delete-promotion="${escapeHTML(promotion.id)}" aria-label="Delete ${escapeHTML(promotion.title)}">×</button></li>`).join('');
  const isFull = promotions.length >= maximumPromotions;

  return `<main class="admin-promotions-page">
    <header class="admin-promotions-heading"><a href="#admin" aria-label="Back to Admin Portal">‹</a><div><span>Admin tools</span><h1>Home Promotions</h1></div></header>
    <section class="admin-promotions-panel">
      <h2>Promotion Banners <span data-promotion-count>${promotions.length} / ${maximumPromotions}</span></h2>
      <p class="admin-promo-guidance">Upload a banner image. It will be center-cropped and saved at the standard size of 1200 × 600 px (2:1). Add a destination page or secure URL. A maximum of eight promotions can be active.</p>
      <form class="admin-promo-form" data-admin-promo-form>
        <label>Promotion title<input name="title" required maxlength="80" placeholder="e.g. 20% off grooming" /></label>
        <label>Destination page or URL<input name="destination" required placeholder="e.g. #profile or https://example.com" /></label>
        <label class="admin-promo-file">Banner image <span>1200 × 600 px output</span><input name="banner" type="file" accept="image/*" required data-promo-banner /></label>
        <img class="admin-promo-preview" data-promo-preview alt="Promotion banner preview" hidden />
        <div class="form-feedback" data-admin-promo-feedback role="status" aria-live="polite"></div>
        <button class="button button-primary" type="submit" data-add-promotion ${isFull ? 'disabled' : ''}>${isFull ? 'Promotion limit reached' : 'Add Promotion'}</button>
      </form>
      <ul class="admin-promo-list" data-admin-promo-list>${promotionRows || '<li class="admin-promo-empty">No promotions are set up yet.</li>'}</ul>
    </section>
  </main>`;
}
