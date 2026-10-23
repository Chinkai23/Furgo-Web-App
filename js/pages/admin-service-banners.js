import { escapeHTML } from '../shared.js';
import { recordAdminAction } from '../admin-audit.js';
import { saveSharedAppData } from '../app-data-sync.js';
import { supabase } from '../supabase.js';
import { bannerServices, loadServiceBanners, serviceBannerBucket, serviceBannersKey } from './service-banners.js';

const maxBannerFileSize = 2 * 1024 * 1024;

function bannerRow(service, banner = {}) {
  const exists = Boolean(banner.id);
  return `<article class="admin-service-banner-item" data-service-banner-item data-banner-id="${escapeHTML(banner.id || '')}" data-desktop-path="${escapeHTML(banner.desktopPath || '')}" data-desktop-url="${escapeHTML(banner.desktopUrl || '')}" data-mobile-path="${escapeHTML(banner.mobilePath || '')}" data-mobile-url="${escapeHTML(banner.mobileUrl || '')}">
    <div class="admin-service-banner-item-heading"><strong>${exists ? 'Service Banner' : 'New Service Banner'}</strong><button class="button button-light" type="button" data-remove-service-banner>${exists ? 'Remove' : 'Discard'}</button></div>
    <div class="admin-service-banner-fields"><label>Banner title (for accessibility)<input name="bannerTitle" value="${escapeHTML(banner.title || '')}" maxlength="100" placeholder="e.g. October Grooming Offer" /></label><label>Short caption (optional)<input name="bannerCaption" value="${escapeHTML(banner.caption || '')}" maxlength="120" placeholder="Shown over the banner" /></label>
      <label>Website image (optional)<input name="bannerDesktop" type="file" accept="image/png,image/jpeg,image/webp" /><small>Recommended 1520 × 336 px · PNG, JPG, or WebP · max 2 MB${banner.desktopUrl ? ` · Current: ${escapeHTML(banner.desktopUrl.split('/').pop())}` : ''}</small></label>
      <label>Mobile-first image<input name="bannerMobile" type="file" accept="image/png,image/jpeg,image/webp" /><small>Recommended 750 × 270 px · PNG, JPG, or WebP · max 2 MB. This image also fills in for the website image when one is not uploaded.${banner.mobileUrl ? ` Current: ${escapeHTML(banner.mobileUrl.split('/').pop())}` : ''}</small></label>
      ${banner.desktopUrl ? `<img class="admin-service-banner-preview" src="${escapeHTML(banner.desktopUrl)}" alt="Current ${escapeHTML(service)} banner" />` : ''}
    </div>
  </article>`;
}

export function adminServiceBannerSettingsPanel(serviceId) {
  const config = loadServiceBanners();
  const service = bannerServices.find((item) => item.id === serviceId);
  if (!service) return '';
  const banners = (config[service.id] || []).slice(0, 5);
  return `<section class="admin-market-panel admin-service-banner-panel"><div class="admin-market-panel-heading"><div><span>Manage Service</span><h2>${escapeHTML(service.label)} Service Banners</h2></div><p>Upload up to five banners. They match the customer booking form width. Use a mobile-first image or upload a separate image for each screen size.</p></div><p class="admin-service-banner-size-guide"><strong>Recommended sizes:</strong> website 1520 × 336 px; mobile 750 × 270 px. Each image must be PNG, JPG, or WebP and 2 MB or smaller.</p><form data-service-banner-form="${service.id}"><div class="admin-service-banner-list" data-service-banner-list>${banners.map((banner) => bannerRow(service.label, banner)).join('')}</div><div class="admin-service-banner-actions"><button class="button button-light" type="button" data-add-service-banner ${banners.length >= 5 ? 'disabled' : ''}>Add Banner</button><button class="button button-primary" type="submit">Save ${escapeHTML(service.label)} Banners</button></div><p class="form-feedback" data-service-banner-feedback role="status" aria-live="polite"></p></form></section>`;
}

async function uploadBannerImage(serviceId, bannerId, variant, file) {
  if (!file) return null;
  if (file.size > maxBannerFileSize) throw new Error('Each banner image must be 2 MB or smaller.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${serviceId}/${bannerId}/${variant}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(serviceBannerBucket).upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(serviceBannerBucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export function setupAdminServiceBanners() {
  document.querySelectorAll('[data-service-banner-form]').forEach((form) => {
    const list = form.querySelector('[data-service-banner-list]');
    const feedback = form.querySelector('[data-service-banner-feedback]');
    const updateAddButton = () => { form.querySelector('[data-add-service-banner]').disabled = list.querySelectorAll('[data-service-banner-item]').length >= 5; };
    form.querySelector('[data-add-service-banner]').addEventListener('click', () => {
      if (list.querySelectorAll('[data-service-banner-item]').length >= 5) return;
      list.insertAdjacentHTML('beforeend', bannerRow(bannerServices.find((item) => item.id === form.dataset.serviceBannerForm)?.label || 'service'));
      updateAddButton();
    });
    list.addEventListener('click', (event) => {
      if (!event.target.closest('[data-remove-service-banner]')) return;
      event.target.closest('[data-service-banner-item]')?.remove();
      updateAddButton();
    });
    list.addEventListener('change', (event) => {
      if (!event.target.matches('input[type="file"]')) return;
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        feedback.textContent = 'Choose a PNG, JPG, or WebP banner image.';
        event.target.value = '';
        return;
      }
      if (file.size > maxBannerFileSize) {
        feedback.textContent = 'Each banner image must be 2 MB or smaller.';
        event.target.value = '';
        return;
      }
      feedback.textContent = '';
      const row = event.target.closest('[data-service-banner-item]');
      let preview = row.querySelector('.admin-service-banner-preview');
      if (!preview) { preview = document.createElement('img'); preview.className = 'admin-service-banner-preview'; preview.alt = 'Selected banner preview'; row.querySelector('.admin-service-banner-fields').append(preview); }
      if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.src = URL.createObjectURL(file);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      feedback.textContent = '';
      const saveButton = form.querySelector('button[type="submit"]');
      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      const serviceId = form.dataset.serviceBannerForm;
      const priorConfig = loadServiceBanners();
      const priorBanners = priorConfig[serviceId] || [];
      const removedPaths = [];
      const banners = [];
      const uploadedPaths = [];
      const rows = [...list.querySelectorAll('[data-service-banner-item]')];
      if (rows.length > 5) {
        feedback.textContent = 'A service can have up to five banners.';
        saveButton.disabled = false;
        saveButton.textContent = `Save ${bannerServices.find((item) => item.id === serviceId)?.label || 'Service'} Banners`;
        return;
      }
      try {
        for (const row of rows) {
          const desktopFile = row.querySelector('[name="bannerDesktop"]').files?.[0];
          const mobileFile = row.querySelector('[name="bannerMobile"]').files?.[0];
          const title = row.querySelector('[name="bannerTitle"]').value.trim();
          const caption = row.querySelector('[name="bannerCaption"]').value.trim();
          const id = row.dataset.bannerId || `banner-${crypto.randomUUID()}`;
          const desktop = await uploadBannerImage(serviceId, id, 'desktop', desktopFile);
          const mobile = await uploadBannerImage(serviceId, id, 'mobile', mobileFile);
          if (desktop?.path) uploadedPaths.push(desktop.path);
          if (mobile?.path) uploadedPaths.push(mobile.path);
          const desktopUrl = desktop?.url || row.dataset.desktopUrl || mobile?.url;
          const desktopPath = desktop?.path || row.dataset.desktopPath || mobile?.path;
          if (!desktopUrl) {
            if (!title && !desktopFile && !mobileFile) {
              throw new Error('Add an image to this banner or remove the empty banner row before saving.');
            }
            throw new Error('Choose a mobile-first image or website image for each banner before saving.');
          }
          banners.push({ id, title, caption, desktopUrl, desktopPath, mobileUrl: mobile?.url || row.dataset.mobileUrl || desktopUrl, mobilePath: mobile?.path || row.dataset.mobilePath || desktopPath });
          if (desktop && row.dataset.desktopPath) removedPaths.push(row.dataset.desktopPath);
          if (mobile && row.dataset.mobilePath) removedPaths.push(row.dataset.mobilePath);
        }
        const retained = new Set(banners.map((banner) => banner.id));
        for (const old of priorBanners) {
          if (!retained.has(old.id)) { if (old.desktopPath) removedPaths.push(old.desktopPath); if (old.mobilePath) removedPaths.push(old.mobilePath); }
        }
        await saveSharedAppData(serviceBannersKey, { ...priorConfig, [serviceId]: banners });
        if (removedPaths.length) {
          const { error } = await supabase.storage.from(serviceBannerBucket).remove([...new Set(removedPaths)]);
          if (error) console.warn('Old service banner images could not be removed:', error);
        }
        void recordAdminAction('service_banners_updated', 'service', serviceId, { count: banners.length });
        feedback.textContent = `${banners.length} ${bannerServices.find((item) => item.id === serviceId)?.label || 'service'} banner${banners.length === 1 ? '' : 's'} saved.`;
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        if (uploadedPaths.length) {
          try {
            const { error: cleanupError } = await supabase.storage.from(serviceBannerBucket).remove(uploadedPaths);
            if (cleanupError) console.warn('New service banner uploads could not be rolled back:', cleanupError);
          } catch (cleanupError) {
            console.warn('New service banner uploads could not be rolled back:', cleanupError);
          }
        }
        const message = error.message || 'The banners could not be saved.';
        feedback.textContent = /bucket|storage|row-level security|permission|policy/i.test(message)
          ? `${message} Confirm that Supabase migration 0025 is applied and that your account is Manager or Director level.`
          : message;
        saveButton.disabled = false;
        saveButton.textContent = `Save ${bannerServices.find((item) => item.id === serviceId)?.label || 'Service'} Banners`;
      }
    });
  });
}
