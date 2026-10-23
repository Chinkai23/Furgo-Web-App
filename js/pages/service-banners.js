import { escapeHTML } from '../shared.js';

export const serviceBannersKey = 'furgo-demo-service-banners';
export const serviceBannerBucket = 'service-banners';
export const bannerServices = [
  { id: 'grooming', label: 'Grooming' },
  { id: 'hotel', label: 'Pet Hotel' },
  { id: 'daycare', label: 'Pet Daycare' },
];

export function loadServiceBanners() {
  try {
    const data = JSON.parse(localStorage.getItem(serviceBannersKey) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function customerServiceBannerMarkup(service) {
  const banners = (loadServiceBanners()[service] || []).filter((banner) => banner?.desktopUrl).slice(0, 5);
  if (!banners.length) return '';
  const slides = banners.map((banner, index) => `<article class="service-promo-banner" data-service-banner-slide="${index}"><picture>${banner.mobileUrl ? `<source media="(max-width: 640px)" srcset="${escapeHTML(banner.mobileUrl)}" />` : ''}<img src="${escapeHTML(banner.desktopUrl)}" alt="${escapeHTML(banner.title || `${service} promotion ${index + 1}`)}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'} /></picture>${banner.caption ? `<span class="service-promo-banner-caption">${escapeHTML(banner.caption)}</span>` : ''}</article>`).join('');
  const dots = banners.map((_, index) => `<button type="button" data-service-banner-dot="${index}" aria-label="Show promotion ${index + 1}" aria-current="${index === 0}"></button>`).join('');
  return `<section class="service-promo-banners" data-service-banner-carousel aria-label="${escapeHTML(bannerServices.find((item) => item.id === service)?.label || 'Service')} promotions"><div class="service-promo-banner-track" data-service-banner-track>${slides}</div>${banners.length > 1 ? `<button class="service-promo-banner-arrow is-previous" type="button" data-service-banner-step="-1" aria-label="Previous promotion">‹</button><button class="service-promo-banner-arrow is-next" type="button" data-service-banner-step="1" aria-label="Next promotion">›</button><div class="service-promo-banner-dots">${dots}</div>` : ''}</section>`;
}

export function setupServiceBannerCarousel(root = document) {
  root.querySelectorAll('[data-service-banner-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('[data-service-banner-track]');
    const slides = [...track.querySelectorAll('[data-service-banner-slide]')];
    const dots = [...carousel.querySelectorAll('[data-service-banner-dot]')];
    if (slides.length < 2) return;
    const setActiveDot = () => {
      const index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      dots.forEach((dot, dotIndex) => dot.setAttribute('aria-current', String(index === dotIndex)));
    };
    carousel.addEventListener('click', (event) => {
      const step = event.target.closest('[data-service-banner-step]');
      const dot = event.target.closest('[data-service-banner-dot]');
      const current = Math.round(track.scrollLeft / track.clientWidth);
      const target = dot ? Number(dot.dataset.serviceBannerDot) : step ? (current + Number(step.dataset.serviceBannerStep) + slides.length) % slides.length : null;
      if (target !== null) track.scrollTo({ left: slides[target].offsetLeft, behavior: 'smooth' });
    });
    track.addEventListener('scroll', setActiveDot, { passive: true });
  });
}
