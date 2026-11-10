import { escapeHTML } from '../shared.js';

export const promotionStorageKey = 'furgo-demo-promotions';
export const maximumPromotions = 8;

function loadBannerRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(promotionStorageKey) || '[]');
    return Array.isArray(records) ? records : [];
  } catch { return []; }
}

// Reads the locally configured promotions, keeping the Home carousel within its eight-banner limit.
export function loadPromotions() {
  return loadBannerRecords().filter((item) => item.type !== 'announcement').slice(0, maximumPromotions);
}

export function loadAnnouncements() {
  return loadBannerRecords().filter((item) => item.type === 'announcement').slice(0, maximumPromotions);
}

export function localFinderAnnouncementsManagementMarkup() {
  const announcements = loadAnnouncements();
  const announcementRows = announcements.map((announcement) => `<li class="admin-promo-row"><img src="${escapeHTML(announcement.image)}" alt="" /><div><strong>${escapeHTML(announcement.title)}</strong><span>${escapeHTML(announcement.details || announcement.destination || 'Local Finder announcement')}</span></div><button type="button" data-delete-announcement="${escapeHTML(announcement.id)}" aria-label="Delete ${escapeHTML(announcement.title)}">×</button></li>`).join('');
  return `<section class="admin-promotions-panel admin-announcements-panel">
    <h2>Local Finder Announcements <span data-announcement-count>${announcements.length} / ${maximumPromotions}</span></h2>
    <p class="admin-promo-guidance">Create a banner with a title and details. It will appear in the Announcement section on the customer Local Finder page. Images are resized and compressed before saving.</p>
    <form class="admin-promo-form" data-admin-banner-form="announcement">
      <label>Announcement title<input name="title" required maxlength="80" placeholder="e.g. New pet-friendly venues this month" /></label>
      <label>Announcement details<textarea name="details" required maxlength="300" rows="3" placeholder="Add the information customers should know."></textarea></label>
      <label>Destination page or URL (optional)<input name="destination" placeholder="e.g. #local-finder-list?category=cafe or https://example.com" /></label>
      <label class="admin-promo-file">Website banner <span>Recommended 1200 × 600 px · max 2 MB</span><input name="banner" type="file" accept="image/png,image/jpeg,image/webp" required data-promo-banner /></label>
      <label class="admin-promo-file">Mobile banner (optional) <span>Recommended 900 × 450 px · max 2 MB</span><input name="mobileBanner" type="file" accept="image/png,image/jpeg,image/webp" data-promo-mobile-banner /></label>
      <div class="admin-promo-previews"><img class="admin-promo-preview" data-promo-preview alt="Website announcement banner preview" hidden /><img class="admin-promo-preview" data-promo-mobile-preview alt="Mobile announcement banner preview" hidden /></div>
      <div class="form-feedback" data-admin-promo-feedback role="status" aria-live="polite"></div>
      <button class="button button-primary" type="submit" ${announcements.length >= maximumPromotions ? 'disabled' : ''}>${announcements.length >= maximumPromotions ? 'Announcement limit reached' : 'Add Announcement'}</button>
    </form>
    <ul class="admin-promo-list" data-admin-announcement-list>${announcementRows || '<li class="admin-promo-empty">No announcements are set up yet.</li>'}</ul>
  </section>`;
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
    <header class="admin-promotions-heading"><a href="#admin" aria-label="Back to Admin Portal">‹</a><div><span>Admin tools</span><h1>Manage Promotions</h1></div></header>
    <section class="admin-promotions-panel">
      <h2>Promotion Banners <span data-promotion-count>${promotions.length} / ${maximumPromotions}</span></h2>
      <p class="admin-promo-guidance">For a sharp mobile display, use 1200 × 600 px for the website image and 900 × 450 px for an optional mobile image. Both are center-cropped to a 2:1 ratio. PNG, JPG, or WebP only; each file can be up to 2 MB. Images are resized and compressed before saving. A maximum of eight promotions can be active.</p>
      <form class="admin-promo-form" data-admin-promo-form data-admin-banner-form="promotion">
        <label>Promotion title<input name="title" required maxlength="80" placeholder="e.g. 20% off grooming" /></label>
        <label>Destination page or URL<input name="destination" required placeholder="e.g. #profile or https://example.com" /></label>
        <label class="admin-promo-file">Website banner <span>Recommended 1200 × 600 px · max 2 MB</span><input name="banner" type="file" accept="image/png,image/jpeg,image/webp" required data-promo-banner /></label>
        <label class="admin-promo-file">Mobile banner (optional) <span>Recommended 900 × 450 px · max 2 MB</span><input name="mobileBanner" type="file" accept="image/png,image/jpeg,image/webp" data-promo-mobile-banner /></label>
        <div class="admin-promo-previews"><img class="admin-promo-preview" data-promo-preview alt="Website promotion banner preview" hidden /><img class="admin-promo-preview" data-promo-mobile-preview alt="Mobile promotion banner preview" hidden /></div>
        <div class="form-feedback" data-admin-promo-feedback role="status" aria-live="polite"></div>
        <button class="button button-primary" type="submit" data-add-promotion ${isFull ? 'disabled' : ''}>${isFull ? 'Promotion limit reached' : 'Add Promotion'}</button>
      </form>
      <ul class="admin-promo-list" data-admin-promo-list>${promotionRows || '<li class="admin-promo-empty">No promotions are set up yet.</li>'}</ul>
    </section>
  </main>`;
}
