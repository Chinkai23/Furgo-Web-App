import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { supplierProductEditorMarkup } from './marketplace-supplier.js';

const sections = [
  ['overview', 'Home'], ['products', 'My Products'], ['requests', 'Product Requests'], ['inventory', 'Inventory'],
  ['sales', 'Product Sales'], ['analytics', 'Analytics'],
  ['reports', 'Reports'], ['settings', 'Settings'], ['payout-fee', 'Payout & Fee'], ['profile', 'My Profile'],
];
const sellerTabForSection = (section) => ['overview'].includes(section) ? 'home' : ['products', 'requests', 'sales'].includes(section) ? 'products' : section === 'inventory' ? 'inventory' : 'profile';
const sellerGroupTitle = (section) => ({ overview: 'Overview', products: 'My Products', requests: 'My Products', sales: 'My Products', inventory: 'Inventory', analytics: 'My Profile', reports: 'My Profile', settings: 'My Profile', 'payout-fee': 'My Profile', profile: 'My Profile' })[section] || 'Home';
const money = (value) => `RM ${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const safeDateTime = (value) => value ? new Date(value).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const text = (value, fallback = '—') => escapeHTML(value == null || value === '' ? fallback : String(value));
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sellerSalesDateFormat = new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' });
const sellerSalesToday = () => {
  const { year, month, day } = Object.fromEntries(sellerSalesDateFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return new Date(Number(year), Number(month) - 1, Number(day));
};
const activeSale = (sale) => !['Cancelled', 'Returned', 'Refunded'].includes(sale.product_sale_status);
const eligibleForMarketplaceFees = (sale) => !sale.demo_payment && activeSale(sale);
const totalMarketplaceFees = (sales) => sales.reduce((sum, sale) => sum + Number(sale.commission_amount || 0), 0);
const expiryState = (expiry) => {
  if (!expiry) return 'none';
  const today = dateKey(new Date());
  if (expiry < today) return 'expired';
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + 30);
  return expiry <= dateKey(cutoff) ? 'soon' : 'future';
};

export function sellerPortalPage(params = new URLSearchParams()) {
  const section = sections.some(([key]) => key === params.get('section')) ? params.get('section') : 'overview';
  const activeTab = sellerTabForSection(section);
  const profile = (() => { try { return JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { return {}; } })();
  return `<main class="seller-portal-page" data-seller-portal data-section="${section}">
    <header class="seller-topbar"><a class="seller-brand" href="#seller-portal"><img src="Image/Icon/Logo.png" alt="Furgo"/><span>Furgo Seller</span></a><div><span>${text(profile.name || profile.email, 'Seller')}</span></div></header>
    <div class="seller-layout"><section class="seller-content"><div class="seller-heading"><div><span>SELLER PORTAL</span><h1>${sellerGroupTitle(section)}</h1></div><div class="seller-date-filter seller-overview-period-filter" ${['products', 'requests', 'inventory', 'sales', 'profile', 'settings', 'payout-fee'].includes(section) ? 'hidden' : ''}><label for="seller-date-range">Period</label><select id="seller-date-range" data-seller-range="general"><option value="month" selected>This Month</option><option value="all">All Time</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="custom">Custom Range</option></select><input type="date" data-seller-range-start="general" aria-label="Start date" hidden/><input type="date" data-seller-range-end="general" aria-label="End date" hidden/></div></div><div data-seller-data class="seller-data-state" role="status" aria-live="polite">Loading your seller workspace…</div></section></div>
    <nav class="bottom-nav supplier-bottom-nav seller-bottom-nav" aria-label="Seller Portal navigation"><a class="bottom-item${activeTab === 'home' ? ' active' : ''}" href="#seller-portal?section=overview"><img src="Image/Icon/${activeTab === 'home' ? 'Icon-02.png' : 'Icon-01.png'}" alt=""/><span>Home</span></a><a class="bottom-item${activeTab === 'products' ? ' active' : ''}" href="#seller-portal?section=products"><img src="Image/Icon/${activeTab === 'products' ? 'Icon-24.png' : 'Icon-23.png'}" alt=""/><span>My Products</span></a><a class="bottom-item${activeTab === 'inventory' ? ' active' : ''}" href="#seller-portal?section=inventory"><img src="Image/Icon/${activeTab === 'inventory' ? 'Icon-26.png' : 'Icon-25.png'}" alt=""/><span>Inventory</span></a><a class="bottom-item${activeTab === 'profile' ? ' active' : ''}" href="#seller-portal?section=profile"><img src="Image/Icon/${activeTab === 'profile' ? 'Icon-08.png' : 'Icon-07.png'}" alt=""/><span>My Profile</span></a></nav>
  </main>`;
}

function table(headers, rows, empty = 'No records for this period.') {
  return `<div class="seller-table-wrap"><table class="seller-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="seller-empty-cell">${empty}</td></tr>`}</tbody></table></div>`;
}

export async function setupSellerPortal() {
  const root = document.querySelector('[data-seller-portal]');
  if (!root) return;
  const host = root.querySelector('[data-seller-data]');
  const showSellerDialog = (selector) => {
    const dialog = host.querySelector(selector);
    if (dialog && !dialog.open) dialog.showModal();
    return dialog;
  };
  const reopenSellerDialogAfterClose = (closeSelector, openSelector) => {
    host.querySelector(closeSelector)?.close();
    window.requestAnimationFrame(() => showSellerDialog(openSelector));
  };
  let snapshot = null;
  let sellerMarketplaceProducts = [];
  let sellerFeeSchedule = null;
  let sellerFeeScheduleError = '';
  let sellerStockDetails = new Map();
  let sellerStockDetailsError = '';
  let activeSellerStockContext = null;
  let sellerStockHistoryTab = 'active';
  let sellerStockHistoryFocusBatchId = '';
  let sellerMarketplaceProductsError = '';
  let storeListingStatuses = new Map();
  let requestProfile = {};
  let currentSection = root.dataset.section || 'overview';
  let bestSellingLimit = 5;
  let salesProductFilter = '';
  let salesStatusFilter = '';
  let salesPage = 1;
  const periodFilters = {
    general: { period: 'month', start: '', end: '' },
    sales: { period: 'all', start: '', end: '' },
    movements: { period: 'all', start: '', end: '' },
  };
  let inventorySearch = '';
  let inventoryCategoryFilter = 'all';
  let inventoryStatusFilter = 'all';
  let inventoryExpiryFilter = 'all';
  let marketplaceProductSearch = '';
  let marketplaceProductCategory = 'all';
  let marketplaceProductStatus = 'all';
  let analyticsProductFilter = '';
  let requests = [];
  let sellerRequestImages = [];
  let sellerRequestProduct = null;
  let sellerRequestSubmitting = false;
  let draggedSellerPhotoIndex = null;
  const clearSellerRequestPreviewUrls = () => {
    sellerRequestImages.forEach((photo) => {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
    });
    sellerRequestImages = [];
  };
  const sellerRequestImage = (url) => ({ id: crypto.randomUUID(), url });
  const validateSellerRequestPhoto = (file) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) return 'Use a JPG, PNG, WEBP, or GIF product photo.';
    if (file.size > 2 * 1024 * 1024) return 'Each product photo must be 2 MB or smaller.';
    return '';
  };
  const captureSellerRequestVariantRows = () => [...host.querySelectorAll('[data-supplier-variant-row]')].map((row) => {
    const imageIndex = Number(row.querySelector('[name="variantImageIndex"]')?.value || 0);
    return {
      id: row.querySelector('[name="variantRowId"]')?.value || '',
      option: row.querySelector('[name="variantOption"]')?.value || '',
      variant: row.querySelector('[name="variantLabel"]')?.value || '',
      price: row.querySelector('[name="price"]')?.value ?? '',
      imageIndex,
      imageId: sellerRequestImages[imageIndex]?.id || '',
    };
  });
  const requestPhotoChoices = () => {
    return { photoCount: sellerRequestImages.length };
  };
  const renderSellerRequestPhotos = () => {
    const list = host.querySelector('[data-supplier-photo-list]');
    if (!list) return;
    const items = sellerRequestImages;
    list.hidden = !items.length;
    list.innerHTML = items.map((photo, index) => {
      const label = index === 0 ? 'Product cover photo' : `Product photo ${index + 1}`;
      const preview = photo.previewUrl || photo.url;
      return `<article class="supplier-photo-item" draggable="true" data-seller-request-photo-index="${index}" aria-label="${label}; drag to reorder"><span class="supplier-photo-drag-handle" aria-hidden="true">⠿</span><img src="${text(preview)}" alt="${label}" draggable="false"/><span>${label}</span><label class="supplier-photo-change">Change<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-replace-seller-request-photo="${index}" aria-label="Change ${label}"/></label><button type="button" data-remove-seller-request-photo="${index}" aria-label="Delete ${label}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg></button></article>`;
    }).join('');
  };
  const renderSellerRequestVariantRows = (rows = [{}]) => {
    const variantRows = host.querySelector('[data-supplier-variant-rows]');
    if (!variantRows) return;
    const safeRows = rows.length ? rows : [{}];
    const { photoCount } = requestPhotoChoices();
    const photoOptions = photoCount
      ? Array.from({ length: photoCount }, (_, index) => `<option value="${index}">${index === 0 ? 'Product cover photo' : `Product photo ${index + 1}`}</option>`).join('')
      : '<option value="0">Product cover photo (add above)</option>';
    variantRows.innerHTML = safeRows.map((variant) => `<div class="supplier-variant-row seller-request-variant-row" data-supplier-variant-row><input type="hidden" name="variantRowId" value="${text(variant.id, '')}"/><label>Option<input name="variantOption" maxlength="100" placeholder="e.g. Chicken Flavour (optional)" value="${text(variant.option, '')}"/></label><label>Variant<input name="variantLabel" required maxlength="100" placeholder="e.g. 100 g" value="${text(variant.variant || variant.label, '')}"/></label><label>Price (MYR)<input name="price" type="number" min="0" step="0.01" required value="${variant.price == null ? '' : Number(variant.price)}"/></label><label class="supplier-variant-image-field">Option photo<select name="variantImageIndex" aria-label="Photo for ${text([variant.option, variant.variant || variant.label].filter(Boolean).join(' · ') || 'option')}">${photoOptions}</select></label><button type="button" class="supplier-variant-remove" data-seller-remove-variant aria-label="Remove option"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg></button></div>`).join('');
    [...variantRows.querySelectorAll('[data-supplier-variant-row]')].forEach((row, index) => {
      const select = row.querySelector('[name="variantImageIndex"]');
      const variant = safeRows[index] || {};
      const matchedImage = variant.imageUrl || (Array.isArray(variant.images) ? variant.images[0] : '');
      const savedIndex = Number(variant.imageIndex || 0);
      const matchedIndex = variant.imageId
        ? sellerRequestImages.findIndex((photo) => photo.id === variant.imageId)
        : matchedImage && sellerRequestImages[savedIndex]?.url !== matchedImage
          ? sellerRequestImages.findIndex((photo) => photo.url === matchedImage) : -1;
      const selectedIndex = matchedIndex >= 0 ? matchedIndex : savedIndex;
      select.value = String(Math.min(Math.max(0, selectedIndex), Math.max(0, photoCount - 1)));
    });
    const removeButtons = [...variantRows.querySelectorAll('[data-seller-remove-variant]')];
    removeButtons.forEach((button) => { button.disabled = removeButtons.length === 1; });
  };
  const refreshSellerRequestPhotoChoices = (previousRows = captureSellerRequestVariantRows()) => {
    const rows = previousRows.map((row) => {
      const nextIndex = row.imageId ? sellerRequestImages.findIndex((photo) => photo.id === row.imageId) : -1;
      return { ...row, imageIndex: nextIndex >= 0 ? nextIndex : 0, imageId: nextIndex >= 0 ? row.imageId : '' };
    });
    renderSellerRequestVariantRows(rows);
  };
  const salesPageSize = 20;
  const setProductRequestModalOpen = (open) => {
    const modal = host.querySelector('[data-seller-request-modal]');
    if (!modal) return;
    modal.hidden = !open;
    if (open) modal.querySelector('[data-close-seller-request]')?.focus();
    else host.querySelector('[data-open-seller-request]')?.focus();
  };
  const salesPeriodBounds = (filter, today = sellerSalesToday()) => {
    if (filter.period === 'custom') return { start: filter.start, finish: filter.end };
    const year = today.getFullYear();
    const month = today.getMonth();
    if (filter.period === 'month') return { start: dateKey(new Date(year, month, 1)), finish: dateKey(new Date(year, month + 1, 0)) };
    if (filter.period === '7' || filter.period === '30') {
      const firstDay = today.getDate() - Number(filter.period) + 1;
      return { start: dateKey(new Date(year, month, firstDay)), finish: dateKey(today) };
    }
    return { start: '', finish: '' };
  };
  const stockMovementBounds = (filter) => {
    if (filter.period === 'custom') return { start: filter.start, finish: filter.end };
    if (filter.period === 'all') return { start: '', finish: '' };
    const today = new Date();
    const firstDay = filter.period === 'month' ? 1 : today.getDate() - Number(filter.period);
    return { start: dateKey(new Date(today.getFullYear(), today.getMonth(), firstDay)), finish: '' };
  };
  const isInPeriod = (day, { start, finish }) => (!start || day >= start) && (!finish || day <= finish);
  const filteredSales = (bounds = salesPeriodBounds(periodFilters.general)) => (snapshot?.sales || []).filter((sale) => isInPeriod(sale.sale_date, bounds));
  const warehouseFeeBreakdown = () => {
    const allocations = Array.isArray(sellerFeeSchedule?.warehouse_allocations) ? sellerFeeSchedule.warehouse_allocations : [];
    const total = Number(sellerFeeSchedule?.warehouse_fee_total ?? allocations.reduce((sum, allocation) => sum + Number(allocation.line_fee ?? (Number(allocation.price_per_unit || 0) * Number(allocation.unit_amount || 0))), 0));
    return { allocations, total };
  };
  const periodFilterMarkup = (scope, id) => {
    const filter = periodFilters[scope];
    return `<div class="seller-date-filter seller-inline-date-filter"><label for="${id}">Period</label><select id="${id}" data-seller-range="${scope}"><option value="all" ${filter.period === 'all' ? 'selected' : ''}>All Time</option><option value="7" ${filter.period === '7' ? 'selected' : ''}>Last 7 Days</option><option value="30" ${filter.period === '30' ? 'selected' : ''}>Last 30 Days</option><option value="month" ${filter.period === 'month' ? 'selected' : ''}>This Month</option><option value="custom" ${filter.period === 'custom' ? 'selected' : ''}>Custom Range</option></select><input type="date" data-seller-range-start="${scope}" aria-label="Start date" value="${text(filter.start, '')}" ${filter.period === 'custom' ? '' : 'hidden'}/><input type="date" data-seller-range-end="${scope}" aria-label="End date" value="${text(filter.end, '')}" ${filter.period === 'custom' ? '' : 'hidden'}/></div>`;
  };
  const groupedNavigation = () => {
    if (['products', 'requests', 'sales'].includes(currentSection)) {
      return `<nav class="seller-section-tabs" aria-label="My Products">${[['products', 'My Products'], ['requests', 'Submit New Product'], ['sales', 'Product Sales']].map(([key, label]) => `<a class="${currentSection === key ? 'active' : ''}" href="#seller-portal?section=${key}">${label}</a>`).join('')}</nav>`;
    }
    if (['analytics', 'reports', 'settings', 'payout-fee'].includes(currentSection)) return `<a class="seller-profile-back" href="#seller-portal?section=profile">‹ <span>My Profile</span></a>`;
    return '';
  };
  const profileSettingsMarkup = () => `<nav class="profile-menu seller-profile-menu" aria-label="My Profile settings"><section class="profile-menu-group"><h2>General</h2>${[['analytics','Analytics'],['reports','Reports'],['payout-fee','Payout & Fee']].map(([key,label]) => `<a class="profile-menu-row" href="#seller-portal?section=${key}"><span>${label}</span><span class="profile-chevron" aria-hidden="true">›</span></a>`).join('')}<a class="profile-menu-row" href="#change-password?from=seller"><span>Change Password</span><span class="profile-chevron" aria-hidden="true">›</span></a></section></nav>`;
  const sellerAccountFormsMarkup = () => {
    let userProfile = {};
    try { userProfile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { userProfile = {}; }
    return `<section class="seller-card seller-profile-summary" data-seller-profile-summary><div class="seller-profile-summary-heading"><h2>Profile Details</h2><button type="button" class="profile-edit-link" data-seller-edit-profile>Edit Profile</button></div><dl class="seller-settings-list"><div><dt>Username</dt><dd>${text(userProfile.name, '')}</dd></div><div><dt>Email Address</dt><dd>${text(userProfile.email, '')}</dd></div><div><dt>Business name</dt><dd>${text(requestProfile.business_name, '')}</dd></div><div><dt>Contact name</dt><dd>${text(requestProfile.contact_name, '')}</dd></div><div><dt>Contact phone</dt><dd>${text(requestProfile.contact_phone, '')}</dd></div><div><dt>Business address</dt><dd>${text(requestProfile.business_address, '')}</dd></div></dl><p class="seller-profile-feedback" data-seller-profile-status role="status" aria-live="polite"></p></section>
    <dialog class="seller-card seller-profile-edit-dialog" data-seller-profile-edit aria-labelledby="seller-profile-edit-title"><form class="edit-profile-form seller-account-profile-form" data-seller-account-profile><div class="seller-profile-dialog-heading"><h2 id="seller-profile-edit-title">Edit Profile</h2><button type="button" class="seller-profile-dialog-close" data-seller-cancel-profile-edit aria-label="Close edit profile">×</button></div>
      <div class="edit-field"><label for="seller-account-name">Username</label><input id="seller-account-name" name="display_name" autocomplete="name" maxlength="80" required value="${text(userProfile.name, '')}" /></div>
      <div class="edit-field"><label for="seller-account-email">Email Address</label><input id="seller-account-email" value="${text(userProfile.email, '')}" readonly aria-readonly="true" /></div>
      <h2>Business Details</h2>
      <div class="edit-field"><label for="seller-business-name">Business name</label><input id="seller-business-name" name="business_name" maxlength="160" required value="${text(requestProfile.business_name, '')}" /></div>
      <div class="edit-field"><label for="seller-contact-name">Contact name</label><input id="seller-contact-name" name="contact_name" maxlength="120" value="${text(requestProfile.contact_name, '')}" /></div>
      <div class="edit-field"><label for="seller-contact-phone">Contact phone</label><input id="seller-contact-phone" name="contact_phone" autocomplete="tel" maxlength="40" value="${text(requestProfile.contact_phone, '')}" /></div>
      <div class="edit-field"><label for="seller-business-address">Business address</label><textarea id="seller-business-address" name="business_address" rows="3" maxlength="500" required>${text(requestProfile.business_address, '')}</textarea></div>
      <div class="form-feedback" role="status" aria-live="polite"></div><div class="seller-profile-form-actions"><button class="button button-primary edit-save-button" type="submit">Save Profile</button></div>
    </form></dialog>`;
  };
  const normalizedStockVariant = (value) => String(value || 'Standard').trim().toLocaleLowerCase();
  const currentSellerStockRecord = () => activeSellerStockContext
    ? sellerStockDetails.get(String(activeSellerStockContext.productId))
    : null;
  const sellerStockLotsForContext = () => {
    const variant = normalizedStockVariant(activeSellerStockContext?.variant);
    return (currentSellerStockRecord()?.batches || []).filter((batch) => normalizedStockVariant(batch.variant) === variant);
  };
  const sellerStockHistoryForContext = () => {
    const variant = normalizedStockVariant(activeSellerStockContext?.variant);
    return (currentSellerStockRecord()?.history || []).filter((movement) => normalizedStockVariant(movement.variant) === variant);
  };
  const sellerBatchIdentity = (batch) => String(batch.id || batch.batch_number || 'unlabelled');
  const renderSellerStockHistoryGroups = (tab) => {
    const lots = sellerStockLotsForContext();
    const history = sellerStockHistoryForContext();
    const activeById = new Map(lots.filter((lot) => Number(lot.quantity) > 0).map((lot) => [String(lot.id), lot]));
    const activeByNumber = new Map(lots.filter((lot) => Number(lot.quantity) > 0).map((lot) => [String(lot.batch_number || '').trim().toLocaleLowerCase(), lot]));
    const groups = new Map();
    activeById.forEach((batch) => groups.set(sellerBatchIdentity(batch), { batch, movements: [] }));
    history.forEach((movement) => {
      const batchNumberKey = String(movement.batch_number || '').trim().toLocaleLowerCase();
      const matchingLot = (movement.lot_id ? activeById.get(String(movement.lot_id)) : null)
        || activeByNumber.get(batchNumberKey)
        || null;
      const key = matchingLot ? sellerBatchIdentity(matchingLot) : String(movement.lot_id || movement.batch_number || 'unlabelled');
      if (!groups.has(key)) groups.set(key, { batch: matchingLot || null, movements: [] });
      groups.get(key).movements.push(movement);
    });
    const rows = [...groups.values()].filter(({ batch }) => tab === 'active' ? Boolean(batch) : !batch);
    if (!rows.length) return `<p class="supplier-stock-empty">${tab === 'active' ? 'No active batch history for this option.' : 'No depleted batch history for this option.'}</p>`;
    return rows.map(({ batch, movements }) => {
      const batchNumber = batch?.batch_number || movements[0]?.batch_number || 'Unlabelled batch';
      const batchInfo = batch
        ? `<div class="supplier-stock-history-batch-meta"><span>Current stock: ${Number(batch.quantity) || 0} units</span><span>Received: ${safeDate(batch.received_on)}</span><span>Expiry: ${batch.expires_on ? safeDate(batch.expires_on) : 'No expiry date'}</span><span>Location: ${text(batch.location || '—')}${batch.notes ? ` · ${text(batch.notes)}` : ''}</span></div>`
        : '<div class="supplier-stock-history-batch-meta"><span>Current stock: 0 units</span><span>Batch inventory record is no longer active.</span></div>';
      const movementRows = movements.map((movement) => {
        const delta = Number(movement.quantity_delta) || 0;
        return `<article class="supplier-stock-history-entry ${delta < 0 ? 'is-out' : 'is-in'}"><strong>${delta > 0 ? '+' : ''}${delta} Stock ${delta < 0 ? 'From' : 'To'} Batch ${text(batchNumber)}</strong><p>Date: ${safeDateTime(movement.created_at)}</p><p>Reason: ${text(movement.reason || '—')}</p>${movement.order_number ? `<p>Order number: ${text(movement.order_number)}</p>` : ''}${movement.notes ? `<p>Details: ${text(movement.notes)}</p>` : ''}<small>Balance: ${Number(movement.quantity_before) || 0} → ${Number(movement.quantity_after) || 0}</small></article>`;
      }).join('');
      return `<details class="supplier-stock-history-batch" data-seller-stock-history-batch-id="${text(batch?.id || '')}" data-seller-stock-history-batch-number="${text(batchNumber)}"><summary><span class="supplier-stock-history-batch-summary-heading"><strong>${text(batchNumber)}</strong><span>${movements.length} movement${movements.length === 1 ? '' : 's'}</span></span>${batchInfo}</summary><div class="supplier-stock-history-movements">${movementRows || '<p class="supplier-stock-empty">No stock movements have been recorded for this batch yet.</p>'}</div></details>`;
    }).join('');
  };
  const sellerHistoryBatches = () => {
    const lots = sellerStockLotsForContext();
    const history = sellerStockHistoryForContext();
    const activeById = new Map(lots.map((lot) => [String(lot.id), lot]));
    const grouped = new Map();
    history.forEach((movement) => {
      const lot = movement.lot_id ? activeById.get(String(movement.lot_id)) : null;
      const id = lot ? `lot:${lot.id}` : `batch:${movement.batch_number || 'unlabelled'}`;
      if (!grouped.has(id)) grouped.set(id, { id, lot, batchNumber: movement.batch_number || lot?.batch_number || 'Unlabelled batch', movements: [] });
      grouped.get(id).movements.push(movement);
    });
    lots.forEach((lot) => {
      const id = `lot:${lot.id}`;
      if (!grouped.has(id)) grouped.set(id, { id, lot, batchNumber: lot.batch_number || 'Unlabelled batch', movements: [] });
    });
    return [...grouped.values()].map((group) => ({
      id: group.id,
      batchNumber: group.batchNumber,
      depleted: !group.lot || Number(group.lot.quantity || 0) <= 0,
      quantity: Number(group.lot?.quantity) || 0,
      receivedDate: group.lot?.received_on || '',
      received: group.lot?.received_on ? safeDate(group.lot.received_on) : '—',
      expiry: group.lot?.expires_on ? safeDate(group.lot.expires_on) : 'No expiry date',
      location: group.lot?.location || '—',
      notes: group.lot?.notes || '',
      movements: group.movements.map((movement) => ({ date: safeDateTime(movement.created_at), change: Number(movement.quantity_delta) || 0, before: Number(movement.quantity_before) || 0, after: Number(movement.quantity_after) || 0, reason: movement.reason || '—', orderNumber: movement.order_number || '', notes: movement.notes || '' })),
    }));
  };
  const renderSellerStockHistory = () => {
    const dialog = host.querySelector('[data-seller-stock-history-dialog]');
    const content = host.querySelector('[data-seller-stock-history-content]');
    if (!dialog || !content || !activeSellerStockContext) return;
    const batches = sellerHistoryBatches();
    const activeCount = batches.filter((batch) => !batch.depleted).length;
    const depletedCount = batches.filter((batch) => batch.depleted).length;
    sellerStockExportData = { productName: activeSellerStockContext.productName, variantLabel: activeSellerStockContext.variant || 'Standard', batches };
    const panel = (name) => `<div class="supplier-stock-history-panel" role="tabpanel" data-seller-stock-history-panel="${name}"${sellerStockHistoryTab === name ? '' : ' hidden'}><div class="supplier-stock-history-list">${renderSellerStockHistoryGroups(name)}</div></div>`;
    content.innerHTML = `<div class="supplier-stock-history-title-row"><h2 id="seller-stock-history-title">${text(activeSellerStockContext.productName)} · ${text(activeSellerStockContext.variant)} History</h2><button type="button" data-seller-stock-history-download ${batches.length ? '' : 'disabled'}>Download Statement</button></div><div class="supplier-stock-history-tabs" role="tablist" aria-label="Batch history"><button type="button" role="tab" aria-selected="${sellerStockHistoryTab === 'active'}" class="${sellerStockHistoryTab === 'active' ? 'is-active' : ''}" data-seller-stock-history-tab="active">Active Batches (${activeCount})</button><button type="button" role="tab" aria-selected="${sellerStockHistoryTab === 'depleted'}" class="${sellerStockHistoryTab === 'depleted' ? 'is-active' : ''}" data-seller-stock-history-tab="depleted">Depleted Batches (${depletedCount})</button></div>${panel('active')}${panel('depleted')}`;
    if (sellerStockHistoryFocusBatchId && sellerStockHistoryTab === 'active') {
      const focusBatch = batches.find((batch) => batch.id === `lot:${sellerStockHistoryFocusBatchId}`);
      if (focusBatch) {
        const panel = content.querySelector('[data-seller-stock-history-panel="active"]');
        const historyBatch = [...(panel?.querySelectorAll('[data-seller-stock-history-batch-id]') || [])]
          .find((batch) => batch.dataset.sellerStockHistoryBatchId === sellerStockHistoryFocusBatchId);
        if (historyBatch) historyBatch.open = true;
      }
    }
  };
  const renderSellerStockDetails = () => {
    const dialog = host.querySelector('[data-seller-stock-dialog]');
    const content = host.querySelector('[data-seller-stock-dialog-content]');
    if (!dialog || !content || !activeSellerStockContext) return;
    const lots = sellerStockLotsForContext().filter((batch) => Number(batch.quantity) > 0);
    const total = lots.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
    const batchCards = lots.length ? lots.map((batch) => `<button type="button" class="supplier-stock-batch seller-stock-batch-readonly seller-stock-batch-history-trigger" data-seller-stock-batch-history="${text(batch.id)}" aria-label="View stock history for batch ${text(batch.batch_number)}"><div aria-hidden="true">›</div><div class="supplier-stock-batch-main"><div class="supplier-stock-batch-heading"><strong>Batch No: ${text(batch.batch_number)}</strong><span>${Number(batch.quantity || 0).toLocaleString()} units</span></div><p>Received: ${safeDate(batch.received_on)} · Expires: ${safeDate(batch.expires_on)}${batch.location ? ` · Location: ${text(batch.location)}` : ''}</p>${batch.notes ? `<p>${text(batch.notes)}</p>` : ''}</div></button>`).join('') : `<p class="supplier-stock-empty">No active stock batches for this option.</p>`;
    const historyUnavailable = sellerStockDetailsError ? `<p class="seller-stock-data-error">Batch details could not be loaded. Ask the administrator to apply migration <code>0124_seller_inventory_batch_details.sql</code>.</p>` : '';
    content.innerHTML = `<div class="supplier-stock-details-heading"><h2 id="seller-stock-dialog-title">${text(activeSellerStockContext.productName)} · ${text(activeSellerStockContext.variant)}</h2><div class="supplier-stock-details-heading-actions"><button type="button" class="supplier-stock-history-button" data-seller-stock-open-history>History</button></div></div><p class="supplier-stock-details-total">${total.toLocaleString()} units on hand across ${lots.length} active ${lots.length === 1 ? 'batch' : 'batches'}</p>${historyUnavailable}<section class="supplier-stock-batch-section"><h3>Active Batches <span>${lots.length}</span></h3><div class="supplier-stock-batches">${batchCards}</div></section>`;
  };
  let sellerStockExportData = null;
  const makeSellerStockStatementPdf = (report) => {
    const pages = [];
    let commands = [];
    let y = 0;
    const ascii = (value) => String(value ?? '').replace(/[–—]/g, '-').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const drawText = (value, x, baseline, size = 9, bold = false, color = '0.16 0.15 0.14 rg') => commands.push(color, `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${baseline} Td (${ascii(value)}) Tj ET`);
    const drawLine = (x1, y1, x2, y2) => commands.push('0.91 0.85 0.80 RG', `${x1} ${y1} m ${x2} ${y2} l S`);
    const drawRect = (x, bottom, width, height, color) => commands.push(color, `${x} ${bottom} ${width} ${height} re f`);
    const wrap = (value, maxChars) => {
      const words = String(value || '—').replace(/\s+/g, ' ').trim().split(' ');
      const lines = [];
      let line = '';
      words.forEach((word) => {
        while (word.length > maxChars) { if (line) { lines.push(line); line = ''; } lines.push(word.slice(0, maxChars)); word = word.slice(maxChars); }
        if (!word) return;
        if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      });
      if (line) lines.push(line);
      return lines.length ? lines : ['—'];
    };
    const startPage = () => {
      if (commands.length) pages.push(commands.join('\n'));
      commands = ['0.996 0.471 0.004 rg', '0 547 842 48 re f'];
      drawText('WAREHOUSE STOCK HISTORY', 36, 570, 17, true, '1 1 1 rg');
      drawText(`${report.productName} - ${report.variantLabel || 'Standard'}`, 36, 530, 12, true);
      drawText(`Generated ${new Date().toLocaleString('en-MY')}`, 36, 514, 8, false, '0.42 0.38 0.35 rg');
      y = 492;
    };
    const ensureSpace = (height) => { if (y - height < 40) startPage(); };
    const tableHeader = () => {
      const xs = [36, 136, 231, 481, 591, 656];
      drawRect(36, y - 5, 770, 21, '0.996 0.95 0.91 rg');
      ['DATE / TIME', 'BATCH NO.', 'MOVEMENT / REASON', 'ORDER NO.', 'CHANGE', 'BALANCE'].forEach((label, i) => drawText(label, xs[i] + 5, y + 2, 7, true, '0.38 0.30 0.25 rg'));
      y -= 21;
    };
    startPage();
    report.batches.forEach((batch) => {
      const info = [`Status: ${batch.depleted ? 'Depleted' : 'Active'}    Current stock: ${batch.quantity} units`, `Received: ${batch.received || '—'}    Expiry: ${batch.expiry || 'No expiry date'}`, `Location: ${batch.location || '—'}${batch.notes ? `    Notes: ${batch.notes}` : ''}`].flatMap((line) => wrap(line, 112));
      ensureSpace(44 + info.length * 11);
      drawRect(36, y - 19, 770, 23, '0.996 0.95 0.91 rg');
      drawText(batch.batchNumber || 'Unlabelled batch', 44, y - 11, 10, true, '0.67 0.29 0.03 rg');
      y -= 30;
      info.forEach((line) => { drawText(line, 44, y, 8); y -= 11; });
      y -= 5;
      if (batch.movements.length) {
        tableHeader();
        batch.movements.forEach((movement, index) => {
          const xs = [36, 136, 231, 481, 591, 656];
          const date = wrap(movement.date, 18);
          const batchNo = wrap(batch.batchNumber, 16);
          const reason = [...wrap(`${movement.change > 0 ? 'Stock added' : 'Stock deducted'} - ${movement.reason || 'Reason not recorded'}`, 42), ...(movement.notes ? wrap(`Details: ${movement.notes}`, 42) : [])];
          const order = wrap(movement.orderNumber || '—', 18);
          const count = Math.max(date.length, batchNo.length, reason.length, order.length, 1);
          const height = Math.max(25, count * 10 + 8);
          if (y - height < 42) { startPage(); drawText(`${batch.batchNumber} - continued`, 36, y, 9, true, '0.67 0.29 0.03 rg'); y -= 17; tableHeader(); }
          if (index % 2) drawRect(36, y - height + 4, 770, height, '0.985 0.974 0.961 rg');
          const baseline = y - 9;
          date.forEach((line, i) => drawText(line, xs[0] + 5, baseline - i * 10, 7.5));
          batchNo.forEach((line, i) => drawText(line, xs[1] + 5, baseline - i * 10, 7.5));
          reason.forEach((line, i) => drawText(line, xs[2] + 5, baseline - i * 10, 7.5));
          order.forEach((line, i) => drawText(line, xs[3] + 5, baseline - i * 10, 7.5));
          drawText(`${movement.change > 0 ? '+' : ''}${movement.change}`, xs[4] + 5, baseline, 8, true, movement.change > 0 ? '0.15 0.52 0.32 rg' : '0.72 0.25 0.20 rg');
          drawText(`${movement.before} -> ${movement.after}`, xs[5] + 5, baseline, 7.5);
          y -= height;
          drawLine(36, y + 3, 806, y + 3);
        });
      } else drawText('No movements recorded for this batch.', 44, y, 8, false, '0.42 0.38 0.35 rg');
      y -= 24;
    });
    if (commands.length) pages.push(commands.join('\n'));
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
    const pageRefs = [];
    pages.forEach((stream) => {
      const pageObject = objects.length + 1;
      const contentObject = pageObject + 1;
      pageRefs.push(`${pageObject} 0 R`);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    return `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  };
  const sellerExportDateBounds = () => {
    const dialog = host.querySelector('[data-seller-stock-history-export-dialog]');
    const mode = dialog?.querySelector('[data-seller-stock-export-date-filter]')?.value || 'all';
    if (mode === 'all') return { from: '', to: '', invalid: false };
    if (mode === 'custom') {
      const from = dialog?.querySelector('[data-seller-stock-export-from]')?.value || '';
      const to = dialog?.querySelector('[data-seller-stock-export-to]')?.value || '';
      return { from, to, invalid: !from || !to || from > to };
    }
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (mode === 'month') start.setMonth(start.getMonth() - 1);
    else start.setFullYear(start.getFullYear() - 1);
    const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { from: dateValue(start), to: dateValue(today), invalid: false };
  };
  const renderSellerStockExportChooser = ({ checkVisibleByDefault = true } = {}) => {
    const dialog = host.querySelector('[data-seller-stock-history-export-dialog]');
    const list = dialog?.querySelector('[data-seller-stock-export-batches]');
    if (!dialog || !list || !sellerStockExportData) return;
    const mode = dialog.querySelector('[data-seller-stock-export-date-filter]')?.value || 'all';
    const customRange = dialog.querySelector('[data-seller-stock-export-custom-range]');
    if (customRange) customRange.hidden = mode !== 'custom';
    const { from, to, invalid } = sellerExportDateBounds();
    const filtered = sellerStockExportData.batches.filter((batch) => mode === 'all' || (!invalid && batch.receivedDate && batch.receivedDate >= from && batch.receivedDate <= to));
    list.innerHTML = filtered.length ? filtered.map((batch) => `<label class="supplier-stock-export-batch"><input type="checkbox" data-seller-stock-export-batch value="${text(batch.id)}" ${checkVisibleByDefault ? 'checked' : ''}/><span><strong>${text(batch.batchNumber)}</strong><small>${batch.depleted ? 'Depleted' : 'Active'} · ${batch.quantity} units · Received: ${text(batch.received)} · Expiry: ${text(batch.expiry)}</small></span></label>`).join('') : `<p class="supplier-stock-export-empty">${invalid ? 'Choose a valid start and end date to list batches.' : 'No batches were received within this date range.'}</p>`;
    const feedback = dialog.querySelector('[data-seller-stock-export-feedback]');
    if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
    const selectAll = dialog.querySelector('[data-seller-stock-export-select-all]');
    if (selectAll) { selectAll.checked = checkVisibleByDefault && filtered.length > 0; selectAll.indeterminate = false; }
    syncSellerStockExportSelection();
  };
  const syncSellerStockExportSelection = () => {
    const dialog = host.querySelector('[data-seller-stock-history-export-dialog]');
    if (!dialog) return;
    const boxes = [...dialog.querySelectorAll('[data-seller-stock-export-batch]')];
    const selected = boxes.filter((box) => box.checked).length;
    const selectAll = dialog.querySelector('[data-seller-stock-export-select-all]');
    if (selectAll) { selectAll.checked = boxes.length > 0 && selected === boxes.length; selectAll.indeterminate = selected > 0 && selected < boxes.length; }
    const count = dialog.querySelector('[data-seller-stock-export-selection-count]');
    if (count) count.textContent = `${selected} of ${boxes.length} batch${boxes.length === 1 ? '' : 'es'} selected`;
  };
  const showSection = () => {
    if (!snapshot) return;
    currentSection = root.dataset.section || currentSection;
    const activeSalesPeriod = currentSection === 'sales' ? periodFilters.sales : periodFilters.general;
    const salesToday = sellerSalesToday();
    const salesBounds = salesPeriodBounds(activeSalesPeriod, salesToday);
    const hasBoundedSalesPeriod = Boolean(salesBounds.start || salesBounds.finish);
    const sales = filteredSales(salesBounds);
    const products = snapshot.products || [];
    const inventory = snapshot.inventory || [];
    const marketplaceProducts = sellerMarketplaceProducts || [];
    requests = snapshot.product_requests || [];
    const gross = sales.reduce((sum, row) => sum + Number(row.gross_sales || 0), 0);
    // Prefer the seller sales ledger for all seller-facing sales reports. The
    // live Marketplace aggregate is a fallback until the sales-sync migration
    // has backfilled this seller's historical order lines.
    const allTimeMarketplaceUnits = marketplaceProducts.reduce((sum, product) => sum + (product.variants || []).reduce((variantSum, variant) => variantSum + Number(variant.units_sold || 0), 0), 0);
    const eligibleSales = sales.filter(activeSale);
    const ledgerUnits = eligibleSales.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const units = hasBoundedSalesPeriod ? ledgerUnits : (ledgerUnits || allTimeMarketplaceUnits);
    const availableStock = inventory.reduce((sum, row) => sum + Number(row.available_stock || 0), 0);
    const salesForTable = sales.filter((row) => (!salesProductFilter || row.product_id === salesProductFilter) && (!salesStatusFilter || row.product_sale_status === salesStatusFilter));
    const salesPageCount = Math.max(1, Math.ceil(salesForTable.length / salesPageSize));
    salesPage = Math.min(salesPage, salesPageCount);
    const visibleSales = salesForTable.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize);
    const salesRows = visibleSales.map((row) => `<tr><td><code>${text(row.sale_reference)}</code></td><td>${safeDate(row.sale_date)}</td><td><div class="seller-product-cell">${row.product_image ? `<img src="${text(row.product_image)}" alt=""/>` : ''}<span><strong>${text(row.product_name)}</strong><small>${text(row.variant)}</small></span></div></td><td>${text(row.seller_sku)}</td><td>${Number(row.quantity || 0)}</td><td>${money(row.unit_price)}</td><td>${money(row.gross_sales)}</td><td><span class="seller-status">${text(row.product_sale_status)}${row.demo_payment ? ' · Demo' : ''}</span></td></tr>`).join('');
    const productForInventory = (row) => products.find((product) => String(product.seller_product_id) === String(row.product_id));
    const storeListingStatus = (warehouseProductId) => storeListingStatuses.get(String(warehouseProductId)) || 'Hidden';
    const optionLabelFor = (variant) => {
      const label = String(variant?.label || '').trim();
      if (label) return label;
      const option = String(variant?.optionLabel || variant?.option || '').trim();
      const value = String(variant?.variantLabel || variant?.variant || '').trim();
      return [option, value].filter(Boolean).join(' · ') || 'Standard';
    };
    const optionStockFor = (row, variant, variants, stockRecord) => {
      // Warehouse lots are the source of truth, matching Store Portal stock.
      if (Array.isArray(stockRecord?.batches)) {
        const label = String(optionLabelFor(variant) || 'Standard');
        return stockRecord.batches
          .filter((batch) => String(batch.variant || 'Standard') === label)
          .reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
      }
      if (variant?.stock !== undefined && variant?.stock !== null && variant.stock !== '') return Number(variant.stock) || 0;
      return variants.length === 1 ? Number(row.available_stock || 0) : null;
    };
    // Low-stock totals must use the warehouse option settings and batch
    // quantities returned by the same source as Store Portal. If either is
    // missing, showing a partial count (often a misleading zero) is worse than
    // explicitly marking the count unavailable.
    const lowStockDataReady = !sellerStockDetailsError && inventory.every((row) => {
      const stockRecord = sellerStockDetails.get(String(row.product_id));
      return Array.isArray(stockRecord?.batches) && Array.isArray(stockRecord?.low_stock_settings);
    });
    const lowStockOptions = lowStockDataReady ? inventory.flatMap((row) => {
      const product = productForInventory(row);
      const liveProduct = sellerMarketplaceProducts.find((entry) => String(entry.seller_product_id) === String(row.product_id));
      const stockRecord = sellerStockDetails.get(String(row.product_id));
      const variants = stockRecord.low_stock_settings;
      return variants.flatMap((variant) => {
        const label = optionLabelFor(variant);
        const setting = variant;
        const enabled = setting?.low_stock_alert_enabled ?? setting?.lowStockAlertEnabled
          ?? variant.low_stock_alert_enabled ?? variant.lowStockAlertEnabled ?? true;
        const threshold = Math.max(0, Number(setting?.low_stock_threshold ?? setting?.lowStockThreshold
          ?? variant.low_stock_threshold ?? variant.lowStockThreshold ?? 5) || 0);
        const quantity = optionStockFor(row, variant, variants, stockRecord);
        return enabled && quantity !== null && quantity <= threshold
          ? [{ productName: row.name || product?.name || liveProduct?.name || 'Product', label, quantity, threshold }]
          : [];
      });
    }) : [];
    const lowStockSettingsNotice = lowStockDataReady || inventory.length === 0
      ? ''
      : sellerStockDetailsError
        ? '<p class="seller-stock-data-error">Seller low-stock data could not be loaded. Apply migrations <code>0124_seller_inventory_batch_details.sql</code> and <code>0134_seller_low_stock_variant_settings.sql</code> in order, then refresh.</p>'
        : '<p class="seller-stock-data-error">Seller low-stock settings are unavailable. Apply migration <code>0134_seller_low_stock_variant_settings.sql</code> in Supabase, then refresh.</p>';
    const lowStockCountDisplay = lowStockDataReady ? lowStockOptions.length.toLocaleString() : '—';
    const storeStatusBadge = (warehouseProductId) => {
      const status = storeListingStatus(warehouseProductId);
      return `<span class="seller-status seller-store-status-${status.toLowerCase()}">${status}</span>`;
    };
    const inventoryForTable = inventory.map((row) => {
      const product = productForInventory(row);
      const liveProduct = sellerMarketplaceProducts.find((entry) => String(entry.seller_product_id) === String(row.product_id));
      const sourceVariants = liveProduct?.variants?.length ? liveProduct.variants : (product?.variants || []);
      const variants = sourceVariants.length ? sourceVariants : [{ label: 'Standard', units_sold: 0 }];
      const status = storeListingStatus(liveProduct?.warehouse_product_id || product?.product_id);
      const stockRecord = sellerStockDetails.get(String(row.product_id));
      const stockAwareVariants = variants.map((variant) => ({ ...variant, sellerAvailableStock: optionStockFor(row, variant, variants, stockRecord) }));
      const visibleVariants = stockAwareVariants.filter((variant) => {
        if (inventoryExpiryFilter === 'all') return true;
        const optionLabel = variant.label || 'Standard';
        const batches = (stockRecord?.batches || []).filter((batch) => normalizedStockVariant(batch.variant) === normalizedStockVariant(optionLabel) && Number(batch.quantity) > 0);
        const expiryStates = batches.map((batch) => expiryState(batch.expires_on));
        if (inventoryExpiryFilter === 'attention') return expiryStates.some((state) => state === 'expired' || state === 'soon');
        if (inventoryExpiryFilter === 'soon') return expiryStates.includes('soon');
        if (inventoryExpiryFilter === 'expired') return expiryStates.includes('expired');
        if (inventoryExpiryFilter === 'none') return !expiryStates.length || expiryStates.includes('none');
        return true;
      });
      return { row, product, liveProduct, status, variants: visibleVariants };
    }).filter(({ row, product, liveProduct, status, variants }) => {
      const searchValue = `${row.name || ''} ${row.sku || ''} ${product?.category || liveProduct?.category || ''} ${variants.map((variant) => variant.label || 'Standard').join(' ')}`.toLowerCase();
      const category = product?.category || liveProduct?.category || 'Other';
      return variants.length > 0
        && (!inventorySearch || searchValue.includes(inventorySearch.toLowerCase()))
        && (inventoryCategoryFilter === 'all' || category === inventoryCategoryFilter)
        && (inventoryStatusFilter === 'all' || status.toLowerCase() === inventoryStatusFilter);
    });
    const inventoryCategories = [...new Set(inventory.map((row) => productForInventory(row)?.category || sellerMarketplaceProducts.find((product) => String(product.seller_product_id) === String(row.product_id))?.category || 'Other'))].sort((a, b) => a.localeCompare(b));
    const inventoryRows = inventoryForTable.map(({ row, product, liveProduct, status, variants }) => {
      const imageUrl = product?.image || liveProduct?.images?.find((url) => typeof url === 'string' && url) || '';
      const imageMarkup = imageUrl ? `<img class="supplier-inventory-product-image" src="${text(imageUrl)}" alt="" loading="lazy"/>` : '<span class="supplier-inventory-product-image is-placeholder" aria-hidden="true">🐾</span>';
      const category = product?.category || liveProduct?.category || 'Product';
      const hasMultipleOptions = variants.length > 1;
      const productCell = `<td rowspan="${variants.length + (hasMultipleOptions ? 1 : 0)}" class="supplier-inventory-product-group-cell"><div class="supplier-inventory-product-cell">${imageMarkup}<span><strong>${text(row.name)}</strong><small>${text(category)} · SKU: ${text(row.sku, '—')}</small></span></div></td>`;
      const productActionRow = hasMultipleOptions
        ? `<tr class="supplier-inventory-product-actions-row">${productCell}<td class="supplier-inventory-option-cell supplier-inventory-product-action-spacer" colspan="4"></td><td></td><td rowspan="${variants.length + 1}" class="supplier-inventory-status-cell"><span class="seller-status seller-store-status-${status.toLowerCase()}">${text(status)}</span></td></tr>`
        : '';
      const optionRows = variants.map((variant, index) => {
        const hasOptionStock = variant.stock !== undefined && variant.stock !== null && variant.stock !== '';
        const optionStock = variant.sellerAvailableStock;
        const optionLabel = optionLabelFor(variant);
        const stockRecord = sellerStockDetails.get(String(row.product_id));
        const optionBatches = (stockRecord?.batches || []).filter((batch) => normalizedStockVariant(batch.variant) === normalizedStockVariant(optionLabel) && Number(batch.quantity) > 0);
        const closestExpiry = optionBatches.map((batch) => batch.expires_on).filter(Boolean).sort()[0] || '';
        const sold = variant.units_sold ?? (variants.length === 1 ? row.units_sold : 0);
        const stockDetailsAction = `<div class="supplier-inventory-actions"><button type="button" class="seller-outline-button seller-stock-details-button" data-seller-stock-details="${text(row.product_id)}" data-seller-stock-name="${text(row.name)}" data-seller-stock-variant="${text(optionLabel)}">Stock Details</button></div>`;
        const actionCell = `<td><div class="supplier-inventory-actions-wrap">${stockDetailsAction}</div></td>`;
        const statusCell = hasMultipleOptions ? '' : `<td class="supplier-inventory-status-cell"><span class="seller-status seller-store-status-${status.toLowerCase()}">${text(status)}</span></td>`;
        return `<tr class="${hasMultipleOptions ? 'supplier-inventory-option-row' : ''} ${index > 0 ? 'supplier-inventory-option-continuation' : ''}">${index || hasMultipleOptions ? '' : productCell}<td class="supplier-inventory-option-cell">${text(optionLabel)}</td><td><strong>${optionStock == null ? '—' : optionStock.toLocaleString()}</strong>${optionStock == null ? '' : '<small>units</small>'}</td><td><strong>${Number(sold || 0).toLocaleString()}</strong><small>units</small></td><td><span class="supplier-inventory-expiry">${closestExpiry ? safeDate(closestExpiry) : '—'}</span></td>${actionCell}${statusCell}</tr>`;
      }).join('');
      return `${productActionRow}${optionRows}`;
    }).join('');
    const inventoryLotRows = [...sellerStockDetails.values()].flatMap((record) => record.batches || []);
    const trackedBatchCount = inventoryLotRows.filter((batch) => Number(batch.quantity) > 0).length;
    const expiryCutoff = new Date(); expiryCutoff.setDate(expiryCutoff.getDate() + 30);
    const expiringBatchCount = inventoryLotRows.filter((batch) => Number(batch.quantity) > 0 && batch.expires_on && new Date(`${batch.expires_on}T00:00:00`) <= expiryCutoff).length;
    const inventoryStockDialogs = `<dialog class="seller-stock-dialog" data-seller-stock-dialog aria-labelledby="seller-stock-dialog-title"><div class="seller-stock-dialog-content" data-seller-stock-dialog-content></div><div class="seller-stock-dialog-actions"><button type="button" data-seller-stock-close>Close</button></div></dialog><dialog class="seller-stock-dialog seller-stock-history-dialog" data-seller-stock-history-dialog aria-labelledby="seller-stock-history-title"><div class="seller-stock-dialog-content supplier-stock-history-content" data-seller-stock-history-content></div><div class="seller-stock-dialog-actions"><button type="button" class="seller-back-stock-details-button" data-seller-stock-history-back>Back to Stock Details</button></div></dialog><dialog class="seller-stock-dialog seller-stock-history-export-dialog" data-seller-stock-history-export-dialog><form data-seller-stock-export-form><h2>Choose Batches for PDF</h2><p class="supplier-stock-details-total">Filter by stock received date, then choose which batches to include.</p><label class="supplier-stock-export-date-filter">Received date range<select data-seller-stock-export-date-filter><option value="all">All received dates</option><option value="month">Past month</option><option value="year">Past 12 months</option><option value="custom">Custom date range</option></select></label><div class="supplier-stock-export-custom-range" data-seller-stock-export-custom-range hidden><label>From<input type="date" data-seller-stock-export-from /></label><label>To<input type="date" data-seller-stock-export-to /></label></div><p class="supplier-stock-export-selection-count" data-seller-stock-export-selection-count></p><label class="supplier-stock-export-select-all"><input type="checkbox" data-seller-stock-export-select-all checked /><span>Select all batches</span></label><div class="supplier-stock-export-batches" data-seller-stock-export-batches></div><p class="seller-stock-data-error" data-seller-stock-export-feedback role="status" aria-live="polite" hidden></p><div class="seller-stock-dialog-actions"><button type="button" data-seller-stock-export-back>Back to History</button><button type="button" class="seller-stock-export-download-button" data-seller-stock-export-download>Download Stock Statement</button></div></form></dialog>`;
    const inventoryToolbar = `<div class="supplier-inventory-toolbar seller-inventory-toolbar"><label><span class="sr-only">Search seller inventory</span><input type="search" placeholder="Search product, SKU, category, or option" data-inventory-search value="${text(inventorySearch, '')}" /></label><label><span class="sr-only">Filter by status</span><select data-inventory-status-filter><option value="all" ${inventoryStatusFilter === 'all' ? 'selected' : ''}>All statuses</option><option value="live" ${inventoryStatusFilter === 'live' ? 'selected' : ''}>Live</option><option value="hidden" ${inventoryStatusFilter === 'hidden' ? 'selected' : ''}>Hidden</option></select></label><label><span class="sr-only">Filter by category</span><select data-inventory-category-filter><option value="all" ${inventoryCategoryFilter === 'all' ? 'selected' : ''}>All categories</option>${inventoryCategories.map((category) => `<option value="${text(category)}" ${inventoryCategoryFilter === category ? 'selected' : ''}>${text(category)}</option>`).join('')}</select></label><label><span class="sr-only">Filter by expiry</span><select data-inventory-expiry-filter><option value="all" ${inventoryExpiryFilter === 'all' ? 'selected' : ''}>All expiry dates</option><option value="attention" ${inventoryExpiryFilter === 'attention' ? 'selected' : ''}>Expired / expiring soon</option><option value="soon" ${inventoryExpiryFilter === 'soon' ? 'selected' : ''}>Expiring in 30 days</option><option value="expired" ${inventoryExpiryFilter === 'expired' ? 'selected' : ''}>Expired</option><option value="none" ${inventoryExpiryFilter === 'none' ? 'selected' : ''}>No expiry date</option></select></label></div>`;
    const marketplaceCategories = [...new Set(sellerMarketplaceProducts.map((product) => product.category || 'Other'))].sort((a, b) => a.localeCompare(b));
    const marketplaceStatuses = ['Live', 'Hidden'];
    const visibleMarketplaceProducts = sellerMarketplaceProducts.filter((product) => {
      const searchText = `${product.name || ''} ${product.product_code || ''} ${product.category || ''} ${(product.variants || []).map((variant) => variant.label || '').join(' ')}`.toLowerCase();
      const status = storeListingStatus(product.warehouse_product_id).toLowerCase();
      return (!marketplaceProductSearch || searchText.includes(marketplaceProductSearch.toLowerCase()))
        && (marketplaceProductCategory === 'all' || (product.category || 'Other') === marketplaceProductCategory)
        && (marketplaceProductStatus === 'all' || status === marketplaceProductStatus);
    });
    const marketplaceProductFilters = `<div class="supplier-product-filters"><label class="supplier-product-search"><span class="sr-only">Search seller products</span><input type="search" value="${text(marketplaceProductSearch, '')}" placeholder="Search products, codes, or options" autocomplete="off" data-seller-marketplace-search /></label><label class="supplier-product-filter"><span class="sr-only">Filter seller products by category</span><select data-seller-marketplace-category><option value="all" ${marketplaceProductCategory === 'all' ? 'selected' : ''}>All categories</option>${marketplaceCategories.map((category) => `<option value="${text(category)}" ${marketplaceProductCategory === category ? 'selected' : ''}>${text(category)}</option>`).join('')}</select></label><label class="supplier-product-filter"><span class="sr-only">Filter seller products by status</span><select data-seller-marketplace-status><option value="all" ${marketplaceProductStatus === 'all' ? 'selected' : ''}>All statuses</option>${marketplaceStatuses.map((status) => `<option value="${status.toLowerCase()}" ${marketplaceProductStatus === status.toLowerCase() ? 'selected' : ''}>${status}</option>`).join('')}</select></label></div>`;
    const productRows = visibleMarketplaceProducts.map((product) => {
      const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{ label: 'Standard', price: 0, stock: 0, units_sold: 0 }];
      const image = Array.isArray(product.images) ? product.images.find((url) => typeof url === 'string' && url) : '';
      const imageMarkup = image
        ? `<img class="supplier-product-thumb" src="${text(image)}" alt="${text(product.name)}" loading="lazy"/>`
        : `<span class="supplier-product-thumb is-placeholder" role="img" aria-label="${text(product.name)}">🐾</span>`;
      const variantLines = (render) => `<span class="supplier-product-variant-lines">${variants.map((variant) => `<span>${render(variant)}</span>`).join('')}</span>`;
      const warehouseFee = sellerFeeSchedule ? (sellerFeeSchedule.warehouse_fee_enabled ? money(sellerFeeSchedule.warehouse_fee_per_unit) : money(0)) : '—';
      const marketplaceFee = sellerFeeSchedule?.marketplace_fee_percent == null ? '—' : `${Number(sellerFeeSchedule.marketplace_fee_percent).toFixed(2)}%`;
      return `<tr><td class="supplier-product-cell"><span class="supplier-product-cell-inner">${imageMarkup}<span><strong>${text(product.name)}</strong><small>${text(product.category, 'Other')}</small>${variantLines((variant) => text(variant.label, 'Standard'))}</span></span></td><td>${text(product.product_code)}</td><td>${variantLines((variant) => `MYR ${Number(variant.price || 0).toFixed(2)}`)}</td><td>${variantLines((variant) => Number(variant.stock || 0).toLocaleString())}</td><td class="supplier-product-sold-number">${variantLines((variant) => Number(variant.units_sold || 0).toLocaleString())}</td><td>${variantLines(() => warehouseFee)}</td><td>${variantLines(() => marketplaceFee)}</td><td>${storeStatusBadge(product.warehouse_product_id)}</td></tr>`;
    }).join('');
    const movementBounds = stockMovementBounds(periodFilters.movements);
    const filteredMovements = (snapshot.movements || []).filter((row) => {
      const day = String(row.created_at || '').slice(0, 10);
      return isInPeriod(day, movementBounds);
    });
    const movementRows = filteredMovements.map((row) => `<tr><td>${safeDate(row.created_at)}</td><td>${text(row.product_name)}</td><td>${text(row.sku)}</td><td>${text(row.variant)}</td><td class="${Number(row.quantity_delta) < 0 ? 'seller-negative' : 'seller-positive'}">${Number(row.quantity_delta) > 0 ? '+' : ''}${Number(row.quantity_delta || 0)}</td><td>${text(row.reason)}</td></tr>`).join('');
    let content = '';
    if (currentSection === 'overview') {
      const trendMap = new Map();
      sales.forEach((sale) => trendMap.set(sale.sale_date, (trendMap.get(sale.sale_date) || 0) + Number(sale.gross_sales || 0)));
      const trendRows = [...trendMap].sort(([a], [b]) => b.localeCompare(a))
        .map(([day, amount]) => `<tr role="row"><td>${safeDate(day)}</td><td>${money(amount)}</td><td><span class="seller-record-tag">Sales</span></td></tr>`).join('');
      const hasSalesLedger = Array.isArray(snapshot.sales) && snapshot.sales.length > 0;
      const bestProducts = [...marketplaceProducts].map((product) => {
        const productLedgerUnits = eligibleSales.filter((sale) => String(sale.product_id) === String(product.warehouse_product_id)).reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const liveUnits = (product.variants || []).reduce((sum, variant) => sum + Number(variant.units_sold || 0), 0);
        // Respect the selected date period. Fall back to the live all-time
        // totals only when the account has no sales ledger and the view is
        // unbounded, so stale all-time values never leak into a month view.
        return { ...product, sold: hasSalesLedger || hasBoundedSalesPeriod ? productLedgerUnits : liveUnits };
      }).sort((a, b) => b.sold - a.sold || String(a.name).localeCompare(String(b.name))).slice(0, bestSellingLimit);
      const pieColors = ['#fe7801', '#3288c7', '#39a66c', '#8c63cf', '#e1b32d', '#e15b62', '#1aa6a1', '#7353ba', '#ec9a33', '#5580a8', '#a7a52c', '#c65c9a', '#568f4c', '#d56e40', '#5773ce', '#c3982c', '#3e9b9b', '#aa5c42', '#8272c6', '#6b9a45'];
      const totalTopUnits = bestProducts.reduce((sum, product) => sum + Math.max(0, Number(product.sold || 0)), 0);
      let pieOffset = 0;
      const pieSlices = bestProducts.filter((product) => Number(product.sold) > 0).map((product) => {
        const value = Number(product.sold) / totalTopUnits * 100;
        const slice = `${pieColors[bestProducts.indexOf(product) % pieColors.length]} ${pieOffset}% ${pieOffset + value}%`;
        pieOffset += value;
        return slice;
      });
      const pieBackground = pieSlices.length ? `conic-gradient(${pieSlices.join(', ')})` : '#e9e2dc';
      const bestLegend = bestProducts.map((product) => {
        const color = pieColors[bestProducts.indexOf(product) % pieColors.length];
        const share = totalTopUnits ? Math.round(Number(product.sold || 0) / totalTopUnits * 100) : 0;
        return `<li><i style="--seller-pie-color:${color}"></i><span>${text(product.name)}</span><strong>${Number(product.sold || 0).toLocaleString()} sold · ${share}%</strong></li>`;
      }).join('');
      const monthBounds = salesPeriodBounds({ period: 'month' }, salesToday);
      const monthFeeSales = filteredSales(monthBounds).filter(eligibleForMarketplaceFees);
      const furgoFee = sellerFeeScheduleError ? '—' : money(warehouseFeeBreakdown().total + totalMarketplaceFees(monthFeeSales));
      const metricCards = [
        { label: 'Total Sales', value: money(gross), note: 'Gross sales in selected period', section: 'sales', icon: 'Icon-29.png' },
        { label: 'Units Sold', value: units.toLocaleString(), note: sellerMarketplaceProductsError ? 'Marketplace sold data unavailable. Apply migration <code>0122_seller_portal_live_product_metrics.sql</code>.' : 'Excludes cancelled, returned and refunded units', section: 'sales', icon: 'Icon-30.png' },
        { label: 'Total Products', value: sellerMarketplaceProductsError ? '—' : marketplaceProducts.length.toLocaleString(), note: 'Assigned Marketplace products', section: 'products', icon: 'Icon-31.png' },
        { label: 'Furgo Fee', value: furgoFee, note: 'Warehouse and marketplace fees this month', section: 'payout-fee', icon: 'Icon-32.png' },
        { label: 'Available Stock', value: availableStock.toLocaleString(), note: 'Current warehouse units', section: 'inventory', icon: 'Icon-33.png' },
        { label: 'Low Stock', value: lowStockCountDisplay, note: 'Options at or below their alert threshold', section: 'inventory', icon: 'Icon-34.png' },
      ].map(({ label, value, note, section, icon }) => `
        <a class="seller-overview-kpi-card" href="#seller-portal?section=${section}">
          <img src="Image/Icon/${icon}" width="40" height="40" alt="" />
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${note}</small>
        </a>`).join('');
      const low = lowStockOptions.map((option) => `<li><span>${text(option.productName)} · ${text(option.label)}</span><strong>${Number(option.quantity).toLocaleString()} left · alert at ${Number(option.threshold).toLocaleString()}</strong></li>`).join('');
      const salesSyncNotice = allTimeMarketplaceUnits > 0 && !(snapshot.sales || []).length && !sellerMarketplaceProductsError
        ? '<p class="seller-error">Marketplace units are available, but sales have no linked order records yet. Apply migration <code>0123_seller_portal_marketplace_sales_sync.sql</code> in Supabase to sync and backfill them.</p>'
        : '';
      const lowStockContent = lowStockDataReady
        ? `<ul class="seller-simple-list">${low || '<li>No options are at or below their low-stock alert.</li>'}</ul>`
        : '<p class="seller-muted">Low-stock alerts are unavailable until warehouse option settings and batch data load.</p>';
      content = `${salesSyncNotice}${lowStockSettingsNotice}
        <div class="seller-kpi-grid seller-overview-kpi-grid">${metricCards}</div>
        <div class="seller-two-col seller-overview-charts">
          <section class="seller-card seller-performance-card" aria-labelledby="seller-performance-heading">
            <h2 id="seller-performance-heading">Sales Performance</h2>
            <table class="seller-table seller-performance-table" role="table" aria-labelledby="seller-performance-heading">
              <thead role="rowgroup"><tr role="row"><th scope="col">Date</th><th scope="col">Gross Sales</th><th scope="col">Record</th></tr></thead>
              <tbody class="seller-performance-scroll" role="rowgroup"${trendMap.size > 5 ? ' tabindex="0" aria-label="Sales records"' : ''}>
                ${trendRows || '<tr role="row"><td colspan="3" class="seller-empty-cell">No sales records match this period.</td></tr>'}
              </tbody>
            </table>
          </section>
          <section class="seller-card seller-best-sellers-card"><div class="seller-best-sellers-heading"><h2>Best Selling Products</h2><label><span>Show</span><select data-best-selling-limit aria-label="Number of products in best selling chart"><option value="5" ${bestSellingLimit === 5 ? 'selected' : ''}>Top 5</option><option value="10" ${bestSellingLimit === 10 ? 'selected' : ''}>Top 10</option><option value="20" ${bestSellingLimit === 20 ? 'selected' : ''}>Top 20</option></select></label></div><div class="seller-best-sellers-content"><div class="seller-pie-chart" style="--seller-pie-background:${pieBackground}" role="img" aria-label="Best selling products pie chart"><span>${totalTopUnits.toLocaleString()}<small>units sold</small></span></div><ul class="seller-pie-legend">${bestLegend || '<li class="seller-no-chart-data">No marketplace products are available yet.</li>'}</ul></div>${bestProducts.length && !totalTopUnits ? '<p class="seller-chart-empty-note">No units sold for these products yet.</p>' : ''}</section>
        </div>
        <section class="seller-card"><h2>Low Stock Alerts</h2>${lowStockContent}</section>`;
    } else if (currentSection === 'products') content = `<section class="seller-card seller-marketplace-products-card"><h2>My Products</h2>${sellerFeeScheduleError ? `<p class="seller-muted">Fee breakdown is unavailable. Apply migration <code>0127_seller_portal_fee_breakdown.sql</code> in Supabase to show the current seller fees.</p>` : ''}${sellerMarketplaceProductsError ? `<p class="seller-error">${text(sellerMarketplaceProductsError)}<br/>Apply migration <code>0122_seller_portal_live_product_metrics.sql</code> in Supabase, then refresh this page.</p>` : `${marketplaceProductFilters}${productRows ? `<div class="supplier-table-wrap"><table class="supplier-product-table seller-marketplace-live-table"><thead><tr><th>Product &amp; Options</th><th>Product Code</th><th>Selling Price (MYR)</th><th>Stock</th><th>Sold</th><th>Warehouse Fee / Unit</th><th>Marketplace Fee</th><th>Status</th></tr></thead><tbody>${productRows}</tbody></table></div>` : `<p class="seller-empty-cell">${marketplaceProductSearch || marketplaceProductCategory !== 'all' || marketplaceProductStatus !== 'all' ? 'No products match your search or filters.' : 'No products have been assigned to this seller yet.'}</p>`}`}</section>`;
    else if (currentSection === 'requests') {
      clearSellerRequestPreviewUrls();
      sellerRequestProduct = null;
      const requestRows = requests.length ? requests.map((request) => {
        const product = request.product_data || {};
        const images = Array.isArray(product.images) ? product.images : [];
        const approvedEditButton = request.status === 'Approved' && request.warehouse_product_id
          ? `<button type="button" class="seller-outline-button" data-request-product-edit="${text(request.warehouse_product_id)}">Edit Request</button>`
          : '';
        return `<article class="seller-request-card"><div class="seller-request-card-main">${images[0] ? `<img src="${text(images[0])}" alt=""/>` : ''}<div><strong>${text(product.name, 'Product request')}</strong><small>${text(request.request_type, 'New Product')} · ${text(product.category, 'Other')} · Submitted ${safeDate(request.submitted_at)}</small><span class="seller-status seller-request-status-${text(request.status).toLowerCase().replaceAll(' ', '-')}">${text(request.status)}</span>${request.admin_note ? `<p>Furgo note: ${text(request.admin_note)}</p>` : ''}</div></div>${request.status === 'Rejected' ? `<button type="button" class="seller-outline-button" data-edit-product-request="${text(request.id)}">Edit &amp; Resubmit</button>` : approvedEditButton}</article>`;
      }).join('') : '<p class="seller-muted">No product requests yet.</p>';
      const editor = supplierProductEditorMarkup('seller-request')
        .replace('<div class="supplier-variant-row" data-supplier-variant-row>', '<div class="supplier-variant-row seller-request-variant-row" data-supplier-variant-row>')
        .replace('data-supplier-add-variant', 'data-seller-add-variant')
        .replace(/<label>Stock<input name="stock"[^>]*><\/label>/, '')
        .replace('<label>Product name<input name="name"', '<label class="seller-request-name-field">Product name<input name="name"')
        .replace('<label>Category<select name="category"', '<label class="seller-request-category-field">Category<select name="category"')
        .replace('<label>Types Of Pets<input name="petTypes"', '<label class="seller-request-pet-types-field">Types Of Pets<input name="petTypes"')
        .replace('class="button button-light" type="button" data-supplier-cancel-edit', 'class="button button-light seller-request-cancel-button" type="button" data-supplier-cancel-edit');
      content = `<section class="seller-request-intro"><div class="seller-request-heading"><div><h2>Product Requests</h2><p>Submit a new product or update a rejected request. Furgo will review it before it enters warehouse inventory.</p></div></div><button type="button" data-open-seller-request>Submit Product Request</button></section><div class="seller-request-modal" data-seller-request-modal hidden><div class="seller-request-modal-backdrop" data-seller-request-backdrop><div class="seller-request-modal-dialog" role="dialog" aria-modal="true" aria-label="Product request form"><button type="button" class="seller-request-modal-close" data-close-seller-request aria-label="Close product request form">×</button>${editor}</div></div></div><div class="seller-request-list"><section class="seller-card"><h2>Submitted Products</h2>${requestRows}</section></div>`;
      // Replace the shared editor's initial example row with rows rendered from request data.
      host.innerHTML = `${groupedNavigation()}${content}`;
      const requestForm = host.querySelector('[data-seller-product-request]');
      if (requestForm && !requestForm.elements.sellerWarehouseProductId) {
        const field = document.createElement('input'); field.type = 'hidden'; field.name = 'sellerWarehouseProductId'; requestForm.prepend(field);
      }
      const variantRows = requestForm?.querySelector('[data-supplier-variant-rows]');
      if (variantRows) renderSellerRequestVariantRows([{}]);
      const formNote = requestForm?.querySelector('.supplier-form-note');
      if (formNote) formNote.textContent = 'Product requests are reviewed by Furgo. Warehouse stock is recorded by Store staff when products are received.';
      return;
    }
    else if (currentSection === 'inventory') content = `<section class="seller-card seller-inventory-card"><div class="admin-market-panel-heading seller-warehouse-heading"><div><span>Warehouse Operations</span><h2>Inventory</h2></div><p>View your marketplace products and warehouse stock. Stock and listing status are read-only.</p></div><div class="supplier-inventory-summary seller-warehouse-summary"><article><span>Stock</span><strong>${inventory.reduce((sum, row) => sum + Number(row.available_stock || 0), 0).toLocaleString()} units</strong></article><article><span>Tracked lots</span><strong>${trackedBatchCount}</strong></article><article><span>Low-stock options</span><strong>${lowStockCountDisplay}</strong></article><article><span>Expired / expiring soon</span><strong>${expiringBatchCount}</strong></article></div><div class="admin-market-panel-heading seller-warehouse-stock-heading"><div><span>Stock control</span><h2>Warehouse Stock</h2></div></div>${inventoryToolbar}<div class="supplier-inventory-table-wrap"><table class="supplier-inventory-table seller-inventory-table"><thead><tr><th>Product</th><th>Option</th><th>Stock</th><th>Units Sold</th><th>Closest expiry</th><th>Actions</th><th>Status</th></tr></thead><tbody>${inventoryRows || '<tr><td colspan="7" class="seller-empty-cell">No inventory matches these filters.</td></tr>'}</tbody></table></div>${lowStockSettingsNotice}${sellerStockDetailsError ? `<p class="seller-stock-data-error seller-stock-table-error">Stock batch details, expiry dates, and history are unavailable until migration <code>0124_seller_inventory_batch_details.sql</code> is applied in Supabase.</p>` : ''}${inventoryStockDialogs}</section><section class="seller-card"><div class="seller-stock-movement-heading"><h2>Stock Movement</h2>${periodFilterMarkup('movements', 'seller-movement-date-range')}</div>${table(['Date','Product','SKU','Variant','Change','Movement'], movementRows, 'No stock movements in this period.')}</section>`;
    else if (currentSection === 'sales') content = `<section class="seller-card"><h2>Product Sales</h2><p class="seller-muted">These are seller product-line records. They do not identify or link to a buyer order.</p><div class="seller-sales-toolbar"><label>Product<select data-sales-product-filter><option value="">All products</option>${products.map((product) => `<option value="${text(product.product_id)}" ${salesProductFilter === product.product_id ? 'selected' : ''}>${text(product.name)}</option>`).join('')}</select></label><label>Status<select data-sales-status-filter><option value="">All statuses</option>${['Processing','Shipped','Completed','Cancelled','Returned','Refunded'].map((status) => `<option ${salesStatusFilter === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>${periodFilterMarkup('sales', 'seller-sales-date-range')}</div>${table(['Sale Ref','Date','Product','SKU','Qty','Unit Price','Gross Sales','Status'], salesRows, 'No seller product sales in this period.')}<div class="seller-pagination"><span>${salesForTable.length ? `${(salesPage - 1) * salesPageSize + 1}–${Math.min(salesPage * salesPageSize, salesForTable.length)} of ${salesForTable.length}` : '0 results'}</span><div><button type="button" data-sales-page="prev" ${salesPage <= 1 ? 'disabled' : ''}>Previous</button><button type="button" data-sales-page="next" ${salesPage >= salesPageCount ? 'disabled' : ''}>Next</button></div></div></section>`;
    else if (currentSection === 'analytics') {
      const analyticsSales = sales.filter((sale) => !analyticsProductFilter || sale.product_id === analyticsProductFilter);
      const analyticsGross = analyticsSales.reduce((sum,row)=>sum+Number(row.gross_sales||0),0);
      const analyticsUnits = analyticsSales.filter((row) => !['Cancelled','Returned','Refunded'].includes(row.product_sale_status)).reduce((sum,row)=>sum+Number(row.quantity||0),0);
      const skuRows = [...products].filter((product) => !analyticsProductFilter || product.product_id === analyticsProductFilter).map((product) => { const lines = analyticsSales.filter((sale) => sale.product_id === product.product_id); return `<tr><td>${text(product.name)}</td><td>${text(product.sku)}</td><td>${lines.reduce((sum,line)=>sum+Number(line.quantity||0),0)}</td><td>${money(lines.reduce((sum,line)=>sum+Number(line.gross_sales||0),0))}</td><td>${lines.reduce((sum,line)=>sum+Number(line.refund_amount||0),0)}</td></tr>`; }).join('');
      content = `<section class="seller-card"><h2>Product Performance</h2><div class="seller-sales-toolbar"><label>Product<select data-analytics-product-filter><option value="">All products</option>${products.map((product) => `<option value="${text(product.product_id)}" ${analyticsProductFilter === product.product_id ? 'selected' : ''}>${text(product.name)}</option>`).join('')}</select></label></div>${table(['Product','SKU','Units Sold','Gross Sales','Refund Amount'], skuRows, 'No performance data yet.')}</section><div class="seller-kpi-grid seller-finance-grid"><article><span>Units Sold</span><strong>${analyticsUnits.toLocaleString()}</strong></article><article><span>Gross Sales</span><strong>${money(analyticsGross)}</strong></article><article><span>Return Rate</span><strong>${analyticsUnits ? `${(analyticsSales.reduce((sum,row)=>sum+Number(row.refund_amount||0),0)/Math.max(analyticsGross,1)*100).toFixed(1)}%` : '0.0%'}</strong><small>Refund amount as a share of gross sales</small></article></div>`;
    } else if (currentSection === 'reports') content = `<section class="seller-card"><h2>Reports</h2><p class="seller-muted">Exports contain only your product sales and inventory fields. They exclude buyers, platform order IDs, payment details, addresses and tracking.</p><div class="seller-report-actions"><button type="button" data-seller-report="sales">Download Sales Report CSV</button><button type="button" data-seller-report="inventory">Download Inventory Report CSV</button><button type="button" data-seller-report="returns">Download Return Report CSV</button></div></section>`;
    else if (currentSection === 'payout-fee') {
      const fees = snapshot.fees || {};
      const payoutRows = (snapshot.payouts || []).map((payout) => `<tr><td>${text(payout.payout_reference, 'Payout')}</td><td>${safeDate(payout.period_start)} – ${safeDate(payout.period_end)}</td><td>${money(payout.amount)}</td><td>${text(payout.status)}</td><td>${safeDate(payout.paid_date)}</td></tr>`).join('');
      const { allocations: warehouseAllocations, total: warehouseFeeTotal } = warehouseFeeBreakdown();
      const warehouseProductCount = warehouseAllocations.length;
      const warehouseStorageSummary = [...warehouseAllocations.reduce((totals, allocation) => {
        const unit = String(allocation.billing_unit || 'unit');
        totals.set(unit, (totals.get(unit) || 0) + Number(allocation.unit_amount || 0));
        return totals;
      }, new Map())].map(([unit, amount]) => `${Number(amount.toLocaleString('en-MY', { maximumFractionDigits: 2 }))} ${text(unit)}`).join(' · ');
      const warehouseStockRows = warehouseAllocations.map((allocation) => `<div><span>${text(allocation.storage_type)} · ${Number(allocation.unit_amount || 0).toLocaleString('en-MY', { maximumFractionDigits: 2 })} ${text(allocation.billing_unit)} × ${money(allocation.price_per_unit)} / ${text(allocation.billing_unit)} / month</span><strong>${money(allocation.line_fee ?? (Number(allocation.price_per_unit || 0) * Number(allocation.unit_amount || 0)))}</strong></div>`).join('');
      const warehouseRate = warehouseAllocations.length ? warehouseAllocations.map((allocation) => `${text(allocation.storage_type)}: ${money(allocation.price_per_unit)} / ${text(allocation.billing_unit)} / month`).join('; ') : money(0);
      const marketplaceRate = sellerFeeSchedule?.marketplace_fee_percent == null ? (fees.commission_percent == null ? 'Not available' : `${Number(fees.commission_percent).toFixed(2)}%`) : `${Number(sellerFeeSchedule.marketplace_fee_percent).toFixed(2)}%`;
      const marketplaceSales = (snapshot.sales || []).filter(eligibleForMarketplaceFees);
      const recordedMarketplaceFees = totalMarketplaceFees(marketplaceSales);
      const recordedMarketplaceSales = marketplaceSales.reduce((sum, row) => sum + Number(row.gross_sales || 0), 0);
      const feeToday = salesToday;
      const feeMonthStart = new Date(feeToday.getFullYear(), feeToday.getMonth(), 1);
      const feeMonthEnd = new Date(feeToday.getFullYear(), feeToday.getMonth() + 1, 0);
      const nextFeeDate = new Date(feeToday.getFullYear(), feeToday.getMonth() + 1, 1);
      const formatFeeDate = (date) => new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
      const billingPeriod = `${formatFeeDate(feeMonthStart)} – ${formatFeeDate(feeMonthEnd)}`;
      const thisMonthSales = marketplaceSales.filter((row) => isInPeriod(row.sale_date, { start: dateKey(feeMonthStart), finish: dateKey(feeMonthEnd) }));
      const thisMonthMarketplaceFees = totalMarketplaceFees(thisMonthSales);
      const thisMonthMarketplaceSales = thisMonthSales.reduce((sum, row) => sum + Number(row.gross_sales || 0), 0);
      const warehouseStatus = warehouseFeeTotal > 0 ? 'Active' : 'No fee';
      const marketplaceStatus = Number(sellerFeeSchedule?.marketplace_fee_percent ?? fees.commission_percent ?? 0) > 0 ? 'Active' : 'No fee';
      const marketplaceFeeHistory = thisMonthSales.map((row) => `<tr><td>${safeDate(row.sale_date)}</td><td>${text(row.product_name)}</td><td>${money(row.gross_sales)}</td><td>${money(row.commission_amount)}</td></tr>`).join('');
      content = `<section class="seller-card seller-payout-overview"><h2>Payout &amp; Fee</h2><p class="seller-muted">Review your warehouse storage charges and marketplace fees. Fee settings and payout processing are managed by Furgo.</p>${sellerFeeScheduleError ? `<p class="seller-muted">Fee breakdown could not load. Apply migration <code>0129_seller_warehouse_fee_allocations.sql</code> in Supabase.</p>` : ''}<div class="seller-fee-overview-grid">
        <article class="seller-fee-overview-card"><header><img src="Image/Icon/Icon-02.png" alt=""/><div class="seller-fee-heading-copy"><h3>Warehouse Fee</h3><p>Manage your storage space and monthly warehouse charges.</p></div>${warehouseStatus === 'Active' ? '<span class="seller-fee-state is-active">Active</span>' : ''}</header><div class="seller-fee-overview-total"><div class="seller-fee-total-top"><div><span>Total Warehouse Fee</span><strong>${money(warehouseFeeTotal)}</strong><span class="seller-fee-billing-period">Billing Period: ${billingPeriod}</span></div><span class="seller-fee-deduction-state ${warehouseFeeTotal > 0 ? '' : 'is-none'}">${warehouseFeeTotal > 0 ? 'Pending Deduction' : 'No Charge'}</span></div><div class="seller-fee-overview-stats"><div><span>Allocated Storage</span><strong>${warehouseStorageSummary || 'None'}</strong></div><div><span>Billing Method</span><strong>${warehouseProductCount ? 'By storage type / month' : 'No charge'}</strong></div><div><span>Storage Types Used</span><strong>${warehouseProductCount ? `${warehouseProductCount} ${warehouseProductCount === 1 ? 'Type' : 'Types'}` : '0 Types'}</strong></div><div><span>Next Billing Date</span><strong>${formatFeeDate(nextFeeDate)}</strong></div></div></div><details class="seller-fee-more"><summary>View More Details</summary><div class="seller-fee-detail-content"><h4>My Storage Spaces</h4><p class="seller-fee-detail-intro">Your allocated storage amount and estimated monthly fee by type.</p>${warehouseStockRows ? `<div class="seller-fee-stock-list">${warehouseStockRows}</div>` : '<p>No storage types have been assigned. No warehouse fee applies.</p>'}<h4>What’s Included</h4><ul class="seller-fee-included-list"><li>Product storage</li><li>Stock receiving</li><li>Inventory tracking</li><li>Stock organization</li><li>Stock monitoring</li><li>Product handling</li><li>Low-stock alerts</li><li>Inventory reports</li></ul><h4>Billing History</h4><p>Separate warehouse billing history is not available yet. Current rates: ${warehouseRate}.</p></div></details></article>
        <article class="seller-fee-overview-card"><header><img src="Image/Icon/Icon-04.png" alt=""/><div class="seller-fee-heading-copy"><h3>Marketplace Fee</h3><p>Marketplace commission charged on eligible product sales.</p></div>${marketplaceStatus === 'Active' ? '<span class="seller-fee-state is-active">Active</span>' : ''}</header><div class="seller-fee-overview-total"><div class="seller-fee-total-top"><div><span>Total Marketplace Fee</span><strong>${money(thisMonthMarketplaceFees)}</strong><span class="seller-fee-billing-period">Billing Period: ${billingPeriod}</span></div><span class="seller-fee-deduction-state ${thisMonthMarketplaceFees > 0 ? '' : 'is-none'}">${thisMonthMarketplaceFees > 0 ? 'Pending Deduction' : 'No Charge'}</span></div><div class="seller-fee-overview-stats"><div><span>Marketplace Sales</span><strong>${money(thisMonthMarketplaceSales)}</strong></div><div><span>Billing Method</span><strong>${marketplaceRate} of sales</strong></div><div><span>Sales Recorded</span><strong>${thisMonthSales.length}</strong></div><div><span>Next Billing Date</span><strong>${formatFeeDate(nextFeeDate)}</strong></div></div></div><details class="seller-fee-more"><summary>View More Details</summary><div class="seller-fee-detail-content"><h4>Marketplace Fee Summary</h4><dl><div><dt>All-time eligible sales</dt><dd>${money(recordedMarketplaceSales)}</dd></div><div><dt>All-time recorded fees</dt><dd>${money(recordedMarketplaceFees)}</dd></div><div><dt>Current fee rate</dt><dd>${marketplaceRate}</dd></div></dl><h4>Billing History</h4>${marketplaceFeeHistory ? `<div class="seller-fee-history-table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Sales</th><th>Fee</th></tr></thead><tbody>${marketplaceFeeHistory}</tbody></table></div>` : '<p>No marketplace fee records for this billing period.</p>'}</div></details></article>
      </div></section><section class="seller-card seller-payout-readonly-card"><h3>Payout Records</h3>${table(['Payout Ref','Period','Amount','Status','Paid Date'], payoutRows, 'No payout records yet.')}</section>`;
    }
    else if (currentSection === 'profile') content = `${sellerAccountFormsMarkup()}${profileSettingsMarkup()}<button class="seller-signout-button" type="button" data-seller-signout>Log out</button>`;
    else content = `<section class="seller-card"><h2>Seller Business Profile</h2><dl class="seller-settings-list"><div><dt>Business name</dt><dd>${text(snapshot.profile?.business_name)}</dd></div><div><dt>Contact name</dt><dd>${text(snapshot.profile?.contact_name)}</dd></div><div><dt>Contact email</dt><dd>${text(snapshot.profile?.contact_email)}</dd></div><div><dt>Contact phone</dt><dd>${text(snapshot.profile?.contact_phone)}</dd></div></dl><h2>Notification Preferences</h2><form data-seller-notifications class="seller-preferences"><label><input type="checkbox" name="low_stock" ${snapshot.profile?.notification_preferences?.low_stock !== false ? 'checked' : ''}/> Low stock alerts</label><label><input type="checkbox" name="product_status" ${snapshot.profile?.notification_preferences?.product_status !== false ? 'checked' : ''}/> Product status updates</label><button type="submit">Save Preferences</button><span role="status" aria-live="polite"></span></form><p class="seller-muted">For seller profile, listing, stock and settlement questions, contact Furgo Support.</p></section>`;
    host.innerHTML = `${groupedNavigation()}${content}`;
  };
  const [snapshotResult, requestResult, requestProfileResult, listingStatusesResult, liveProductsResult, stockDetailsResult, feeScheduleResult] = await Promise.all([
    supabase.rpc('seller_portal_snapshot'),
    supabase.rpc('seller_portal_product_requests'),
    supabase.rpc('seller_portal_request_profile'),
    supabase.rpc('seller_portal_store_listing_statuses'),
    supabase.rpc('seller_portal_live_products'),
    supabase.rpc('seller_portal_inventory_stock_details'),
    supabase.rpc('seller_portal_fee_schedule'),
  ]);
  const error = snapshotResult.error || requestResult.error || requestProfileResult.error || listingStatusesResult.error;
  if (error) { host.innerHTML = `<div class="seller-error"><strong>Seller data could not be loaded.</strong><p>${text(error.message, listingStatusesResult.error ? 'Apply the Seller Portal status sync migration and confirm this account has Seller Portal access.' : 'Check that migrations 0113 and 0114 have been applied and this account has Seller Portal access.')}</p><a href="#login">Return to sign in</a></div>`; return; }
  sellerMarketplaceProductsError = liveProductsResult.error?.message || '';
  sellerMarketplaceProducts = liveProductsResult.error ? [] : liveProductsResult.data || [];
  sellerFeeScheduleError = feeScheduleResult.error?.message || '';
  sellerFeeSchedule = feeScheduleResult.error ? null : feeScheduleResult.data || null;
  sellerStockDetailsError = stockDetailsResult.error?.message || '';
  sellerStockDetails = new Map((!stockDetailsResult.error && Array.isArray(stockDetailsResult.data) ? stockDetailsResult.data : []).map((record) => [String(record.seller_product_id), record]));
  storeListingStatuses = new Map((listingStatusesResult.data || []).map((row) => [String(row.warehouse_product_id), row.status]));
  requestProfile = requestProfileResult.data || {};
  const sellerInventoryById = new Map((snapshotResult.data?.inventory || []).map((row) => [String(row.product_id), row]));
  const recordedStockMovements = [...sellerStockDetails.values()].flatMap((record) => {
    const product = sellerInventoryById.get(String(record.seller_product_id));
    return (record.history || []).map((movement) => ({
      ...movement,
      product_name: product?.name || movement.product_name,
      sku: product?.sku || movement.sku,
      // Use the same recorded reason shown in batch history. The older snapshot
      // RPC translates unknown deductions (including Marketplace sale) to
      // "Stock adjusted", which mislabels the actual stock movement.
      reason: movement.reason || '—',
    }));
  }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  snapshot = {
    ...(snapshotResult.data || {}),
    profile: { ...(snapshotResult.data?.profile || {}), ...requestProfile },
    product_requests: requestResult.data || [],
    movements: stockDetailsResult.error ? (snapshotResult.data?.movements || []) : recordedStockMovements,
  };
  showSection();
  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-best-selling-limit]')) {
      bestSellingLimit = Number(event.target.value) || 5;
      showSection();
      return;
    } else if (event.target.matches('[data-seller-range]')) {
      const scope = event.target.dataset.sellerRange || 'general';
      if (!periodFilters[scope]) return;
      periodFilters[scope].period = event.target.value;
      root.querySelector(`[data-seller-range-start="${scope}"]`)?.toggleAttribute('hidden', event.target.value !== 'custom');
      root.querySelector(`[data-seller-range-end="${scope}"]`)?.toggleAttribute('hidden', event.target.value !== 'custom');
      showSection();
      return;
    } else if (event.target.matches('[data-seller-range-start], [data-seller-range-end]')) {
      const scope = event.target.dataset.sellerRangeStart != null ? event.target.dataset.sellerRangeStart : event.target.dataset.sellerRangeEnd;
      if (!periodFilters[scope]) return;
      if (event.target.matches('[data-seller-range-start]')) periodFilters[scope].start = event.target.value;
      else periodFilters[scope].end = event.target.value;
      showSection();
      return;
    } else if (event.target.matches('[data-seller-stock-export-select-all]')) {
      host.querySelectorAll('[data-seller-stock-export-batch]').forEach((checkbox) => { checkbox.checked = event.target.checked; });
      syncSellerStockExportSelection();
      return;
    } else if (event.target.matches('[data-seller-stock-export-date-filter], [data-seller-stock-export-from], [data-seller-stock-export-to]')) {
      renderSellerStockExportChooser();
      return;
    } else if (event.target.matches('[data-seller-stock-export-batch]')) {
      syncSellerStockExportSelection();
      return;
    } else if (event.target.matches('[data-sales-product-filter]')) salesProductFilter = event.target.value;
    else if (event.target.matches('[data-sales-status-filter]')) salesStatusFilter = event.target.value;
    else if (event.target.matches('[data-inventory-status-filter]')) inventoryStatusFilter = event.target.value;
    else if (event.target.matches('[data-inventory-category-filter]')) inventoryCategoryFilter = event.target.value;
    else if (event.target.matches('[data-inventory-expiry-filter]')) inventoryExpiryFilter = event.target.value;
    else if (event.target.matches('[data-analytics-product-filter]')) analyticsProductFilter = event.target.value;
    else if (event.target.matches('[data-seller-marketplace-category]')) marketplaceProductCategory = event.target.value;
    else if (event.target.matches('[data-seller-marketplace-status]')) marketplaceProductStatus = event.target.value;
    else return;
    salesPage = 1;
    showSection();
  });
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-seller-marketplace-search]')) marketplaceProductSearch = event.target.value;
    else if (event.target.matches('[data-inventory-search]')) inventorySearch = event.target.value;
    else return;
    const start = event.target.selectionStart;
    const selector = event.target.matches('[data-seller-marketplace-search]') ? '[data-seller-marketplace-search]' : '[data-inventory-search]';
    showSection();
    const next = root.querySelector(selector);
    next?.focus();
    next?.setSelectionRange(start, start);
  });
  host.addEventListener('cancel', (event) => {
    const exportDialog = event.target.closest?.('[data-seller-stock-history-export-dialog]');
    if (!exportDialog) return;
    event.preventDefault();
    reopenSellerDialogAfterClose('[data-seller-stock-history-export-dialog]', '[data-seller-stock-history-dialog]');
  }, true);
  // Open stock history after the stock dialog has closed. Some browsers drop
  // a second showModal() call made in the same click task as close().
  host.addEventListener('click', (event) => {
    const historyTrigger = event.target.closest?.('[data-seller-stock-open-history]');
    const batchTrigger = event.target.closest?.('[data-seller-stock-batch-history]');
    if (!historyTrigger && !batchTrigger) return;
    event.preventDefault();
    event.stopPropagation();
    sellerStockHistoryFocusBatchId = batchTrigger?.dataset.sellerStockBatchHistory || '';
    sellerStockHistoryTab = 'active';
    renderSellerStockHistory();
    host.querySelector('[data-seller-stock-dialog]')?.close();
    window.requestAnimationFrame(() => {
      const historyDialog = showSellerDialog('[data-seller-stock-history-dialog]');
      if (!batchTrigger || !historyDialog?.open) return;
      window.requestAnimationFrame(() => {
        const batch = [...historyDialog.querySelectorAll('[data-seller-stock-history-batch-id]')]
          .find((item) => item.dataset.sellerStockHistoryBatchId === sellerStockHistoryFocusBatchId);
        batch?.scrollIntoView({ block: 'nearest' });
        batch?.querySelector('summary')?.focus({ preventScroll: true });
      });
    });
  });
  root.addEventListener('click', async (event) => {
    if (sellerRequestSubmitting && event.target.closest('[data-seller-request-modal], [data-open-seller-request], [data-edit-product-request], [data-request-product-edit]')) {
      event.preventDefault();
      return;
    }
    if (event.target.closest('[data-seller-edit-profile]')) {
      const editor = host.querySelector('[data-seller-profile-edit]');
      if (editor && !editor.open) editor.showModal();
      return;
    }
    if (event.target.closest('[data-seller-cancel-profile-edit]')) {
      const editor = host.querySelector('[data-seller-profile-edit]');
      if (editor?.open) editor.close();
      return;
    }
    const profileDialog = event.target.closest('[data-seller-profile-edit]');
    if (profileDialog && event.target === profileDialog) profileDialog.close();
    if (event.target.closest('[data-open-seller-request]')) {
      if (sellerRequestProduct) showSection();
      setProductRequestModalOpen(true);
      return;
    }
    if (event.target.closest('[data-seller-product-request] [data-supplier-cancel-edit]')) {
      showSection();
      setProductRequestModalOpen(false);
      return;
    }
    if (event.target.closest('[data-close-seller-request]') || event.target.matches('[data-seller-request-backdrop]')) { setProductRequestModalOpen(false); return; }
    const removeRequestPhoto = event.target.closest('[data-remove-seller-request-photo]');
    if (removeRequestPhoto) {
      event.preventDefault();
      const previousRows = captureSellerRequestVariantRows();
      const index = Number(removeRequestPhoto.dataset.removeSellerRequestPhoto);
      const [removed] = sellerRequestImages.splice(index, 1);
      if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
      renderSellerRequestPhotos();
      refreshSellerRequestPhotoChoices(previousRows);
      return;
    }
    const stockDetailsTrigger = event.target.closest('[data-seller-stock-details]');
    if (stockDetailsTrigger) {
      activeSellerStockContext = {
        productId: stockDetailsTrigger.dataset.sellerStockDetails,
        productName: stockDetailsTrigger.dataset.sellerStockName || 'Product',
        variant: stockDetailsTrigger.dataset.sellerStockVariant || 'Standard',
      };
      renderSellerStockDetails();
      const dialog = host.querySelector('[data-seller-stock-dialog]');
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    if (event.target.closest('[data-seller-stock-close]')) {
      host.querySelector('[data-seller-stock-dialog]')?.close();
      return;
    }
    if (event.target.closest('[data-seller-stock-history-download]') && sellerStockExportData) {
      const exportDialog = host.querySelector('[data-seller-stock-history-export-dialog]');
      if (!exportDialog) return;
      exportDialog.querySelector('[data-seller-stock-export-date-filter]').value = 'all';
      exportDialog.querySelector('[data-seller-stock-export-from]').value = '';
      exportDialog.querySelector('[data-seller-stock-export-to]').value = '';
      renderSellerStockExportChooser();
      reopenSellerDialogAfterClose('[data-seller-stock-history-dialog]', '[data-seller-stock-history-export-dialog]');
      return;
    }
    if (event.target.closest('[data-seller-stock-export-back]')) {
      reopenSellerDialogAfterClose('[data-seller-stock-history-export-dialog]', '[data-seller-stock-history-dialog]');
      return;
    }
    if (event.target.closest('[data-seller-stock-export-download]') && sellerStockExportData) {
      const exportDialog = host.querySelector('[data-seller-stock-history-export-dialog]');
      const selectedIds = new Set([...host.querySelectorAll('[data-seller-stock-export-batch]:checked')].map((checkbox) => checkbox.value));
      const selectedBatches = sellerStockExportData.batches.filter((batch) => selectedIds.has(String(batch.id)));
      const feedback = exportDialog?.querySelector('[data-seller-stock-export-feedback]');
      if (!selectedBatches.length) {
        if (feedback) { feedback.textContent = 'Choose at least one batch to include.'; feedback.hidden = false; }
        return;
      }
      const report = { ...sellerStockExportData, batches: selectedBatches };
      const pdf = makeSellerStockStatementPdf(report);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-history-${[report.productName, report.variantLabel].join('-').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'furgo'}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      reopenSellerDialogAfterClose('[data-seller-stock-history-export-dialog]', '[data-seller-stock-history-dialog]');
      return;
    }
    if (event.target.closest('[data-seller-stock-history-back]')) {
      renderSellerStockDetails();
      reopenSellerDialogAfterClose('[data-seller-stock-history-dialog]', '[data-seller-stock-dialog]');
      return;
    }
    const historyTab = event.target.closest('[data-seller-stock-history-tab]');
    if (historyTab) {
      sellerStockHistoryTab = historyTab.dataset.sellerStockHistoryTab;
      sellerStockHistoryFocusBatchId = '';
      renderSellerStockHistory();
      return;
    }
    if (event.target.matches('[data-seller-stock-dialog]')) {
      event.target.close();
      return;
    }
    if (event.target.matches('[data-seller-stock-history-dialog]')) {
      event.target.close();
      return;
    }
    const signout = event.target.closest('[data-seller-signout]');
    if (signout) { await supabase.auth.signOut(); sessionStorage.removeItem('furgo-demo-auth'); sessionStorage.removeItem('furgo-demo-user-role'); sessionStorage.removeItem('furgo-demo-profile-complete'); sessionStorage.removeItem('furgo-demo-user-profile'); window.location.hash = '#login'; return; }
    const report = event.target.closest('[data-seller-report]');
    if (report) downloadReport(report.dataset.sellerReport);
    const addVariant = event.target.closest('[data-seller-add-variant]');
    if (addVariant) {
      const rows = host.querySelector('[data-supplier-variant-rows]');
      if (!rows) return;
      const count = rows.querySelectorAll('[data-supplier-variant-row]').length;
      if (count >= 30) { window.alert('A product can have up to 30 options.'); return; }
      const currentRows = captureSellerRequestVariantRows();
      currentRows.push({});
      renderSellerRequestVariantRows(currentRows);
      rows.querySelectorAll('[data-seller-remove-variant]').forEach((button) => { button.disabled = count + 1 === 1; });
      return;
    }
    const removeVariant = event.target.closest('[data-seller-remove-variant]');
    if (removeVariant) {
      const rows = host.querySelector('[data-supplier-variant-rows]');
      if (rows.querySelectorAll('[data-supplier-variant-row]').length <= 1) return;
      removeVariant.closest('[data-supplier-variant-row]')?.remove();
      const buttons = rows.querySelectorAll('[data-seller-remove-variant]');
      buttons.forEach((button) => { button.disabled = buttons.length === 1; });
      return;
    }
    const editRequest = event.target.closest('[data-edit-product-request]');
    if (editRequest) {
      const request = requests.find((entry) => entry.id === editRequest.dataset.editProductRequest && entry.status === 'Rejected');
      if (!request) return;
      let product = request.product_data || {};
      if (request.warehouse_product_id) {
        const { data, error } = await supabase.rpc('seller_portal_product_request_product', {
          p_warehouse_product_id: request.warehouse_product_id,
        });
        if (error) { window.alert(error.message || 'Product details could not be loaded.'); return; }
        product = { ...data.product_data, name: data.name };
      }
      const form = host.querySelector('[data-seller-product-request]');
      if (!form) return;
      clearSellerRequestPreviewUrls();
      sellerRequestProduct = product;
      sellerRequestImages = (Array.isArray(product.images) ? product.images : []).filter(Boolean).map(sellerRequestImage);
      if (form.elements.photos) form.elements.photos.value = '';
      renderSellerRequestPhotos();
      form.elements.sellerRequestId.value = request.id;
      if (form.elements.sellerWarehouseProductId) form.elements.sellerWarehouseProductId.value = request.warehouse_product_id || '';
      for (const key of ['name', 'category', 'description', 'petTypes', 'ingredients', 'nutrition']) {
        if (form.elements[key]) form.elements[key].value = product[key] || '';
      }
      const rows = form.querySelector('[data-supplier-variant-rows]');
      const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
      renderSellerRequestVariantRows(variants);
      rows.querySelectorAll('[data-seller-remove-variant]').forEach((button) => { button.disabled = variants.length === 1; });
      const title = form.closest('[data-supplier-editor]')?.querySelector('[data-supplier-form-title]');
      if (title) title.textContent = 'Edit Rejected Product Request';
      form.querySelector('[data-supplier-submit-label]').textContent = 'Resubmit Product Request';
      form.querySelector('[data-supplier-feedback]').textContent = `Furgo note: ${request.admin_note || 'Please update the product details and resubmit.'}`;
      setProductRequestModalOpen(true);
      return;
    }
    const editApprovedProduct = event.target.closest('[data-request-product-edit]');
    if (editApprovedProduct) {
      const { data, error } = await supabase.rpc('seller_portal_product_request_product', { p_warehouse_product_id: editApprovedProduct.dataset.requestProductEdit });
      if (sellerRequestSubmitting) return;
      if (error) { window.alert(error.message || 'Product details could not be loaded.'); return; }
      const form = host.querySelector('[data-seller-product-request]');
      if (!form) return;
      const product = { ...data?.product_data, name: data?.name };
      form.reset();
      clearSellerRequestPreviewUrls();
      sellerRequestProduct = product;
      sellerRequestImages = (Array.isArray(product.images) ? product.images : []).filter(Boolean).map(sellerRequestImage);
      renderSellerRequestPhotos();
      form.elements.sellerRequestId.value = '';
      form.elements.sellerWarehouseProductId.value = editApprovedProduct.dataset.requestProductEdit;
      for (const key of ['name', 'category', 'description', 'petTypes', 'ingredients', 'nutrition']) if (form.elements[key]) form.elements[key].value = product[key] || '';
      const rows = form.querySelector('[data-supplier-variant-rows]');
      const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
      renderSellerRequestVariantRows(variants);
      rows.querySelectorAll('[data-seller-remove-variant]').forEach((button) => { button.disabled = variants.length === 1; });
      const title = form.closest('[data-supplier-editor]')?.querySelector('[data-supplier-form-title]');
      if (title) title.textContent = `Request Edit: ${product.name || 'Product'}`;
      form.querySelector('[data-supplier-submit-label]').textContent = 'Submit Edit Request';
      form.querySelector('[data-supplier-feedback]').textContent = 'Your current Marketplace and warehouse details stay unchanged until Furgo approves this request.';
      setProductRequestModalOpen(true);
      return;
    }
    const salesPageButton = event.target.closest('[data-sales-page]');
    if (salesPageButton) { salesPage += salesPageButton.dataset.salesPage === 'next' ? 1 : -1; showSection(); }
  });
  root.addEventListener('keydown', (event) => {
    if (!sellerRequestSubmitting && event.key === 'Escape' && host.querySelector('[data-seller-request-modal]:not([hidden])')) setProductRequestModalOpen(false);
  });
  root.addEventListener('change', (event) => {
    if (sellerRequestSubmitting) return;
    const feedback = host.querySelector('[data-supplier-feedback]');
    if (event.target.matches('[data-seller-product-request] [name="photos"]')) {
      const input = event.target;
      const files = [...(input.files || [])];
      const previousRows = captureSellerRequestVariantRows();
      const invalid = files.map(validateSellerRequestPhoto).find(Boolean);
      if (invalid) {
        input.value = '';
        if (feedback) { feedback.textContent = invalid; feedback.classList.add('is-error'); }
        return;
      }
      if (sellerRequestImages.length + files.length > 5) {
        input.value = '';
        if (feedback) { feedback.textContent = 'Add no more than 5 product photos.'; feedback.classList.add('is-error'); }
        return;
      }
      sellerRequestImages.push(...files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), url: '' })));
      input.value = '';
      if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
      renderSellerRequestPhotos();
      refreshSellerRequestPhotoChoices(previousRows);
      return;
    }
    if (event.target.matches('[data-replace-seller-request-photo]')) {
      const input = event.target;
      const file = input.files?.[0];
      if (!file) return;
      const invalid = validateSellerRequestPhoto(file);
      if (invalid) {
        input.value = '';
        if (feedback) { feedback.textContent = invalid; feedback.classList.add('is-error'); }
        return;
      }
      const previousRows = captureSellerRequestVariantRows();
      const index = Number(input.dataset.replaceSellerRequestPhoto);
      const existing = sellerRequestImages[index];
      if (!existing) return;
      if (existing.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(existing.previewUrl);
      sellerRequestImages[index] = { id: existing.id, file, previewUrl: URL.createObjectURL(file), url: '' };
      if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
      renderSellerRequestPhotos();
      refreshSellerRequestPhotoChoices(previousRows);
    }
  });
  root.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('[data-seller-request-photo-index]');
    if (sellerRequestSubmitting || !card || event.target.closest?.('button, label, input')) { event.preventDefault(); return; }
    draggedSellerPhotoIndex = Number(card.dataset.sellerRequestPhotoIndex);
    event.dataTransfer?.setData('text/plain', String(draggedSellerPhotoIndex));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  root.addEventListener('dragover', (event) => {
    if (sellerRequestSubmitting || !event.target.closest?.('[data-seller-request-photo-index]')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (event) => {
    const target = event.target.closest?.('[data-seller-request-photo-index]');
    if (!target || draggedSellerPhotoIndex == null) return;
    event.preventDefault();
    if (sellerRequestSubmitting) return;
    const from = draggedSellerPhotoIndex;
    const to = Number(target.dataset.sellerRequestPhotoIndex);
    draggedSellerPhotoIndex = null;
    if (from === to || !sellerRequestImages[from] || !sellerRequestImages[to]) return;
    const previousRows = captureSellerRequestVariantRows();
    const [photo] = sellerRequestImages.splice(from, 1);
    sellerRequestImages.splice(to, 0, photo);
    renderSellerRequestPhotos();
    refreshSellerRequestPhotoChoices(previousRows);
  });
  root.addEventListener('dragend', () => {
    draggedSellerPhotoIndex = null;
    root.querySelectorAll('.supplier-photo-item.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
  });
  root.addEventListener('submit', async (event) => {
    const sellerProfileForm = event.target.closest('[data-seller-account-profile]');
    if (sellerProfileForm) {
      event.preventDefault();
      if (!sellerProfileForm.reportValidity()) return;
      const formData = new FormData(sellerProfileForm);
      const feedback = sellerProfileForm.querySelector('.form-feedback');
      const submit = sellerProfileForm.querySelector('[type="submit"]');
      const displayName = String(formData.get('display_name') || '').trim();
      submit.disabled = true;
      feedback.textContent = 'Saving profile…'; feedback.classList.add('visible');
      try {
        const { data, error: saveError } = await supabase.rpc('seller_portal_update_profile', {
          p_display_name: displayName,
          p_business_name: String(formData.get('business_name') || '').trim(),
          p_contact_name: String(formData.get('contact_name') || '').trim(),
          p_contact_phone: String(formData.get('contact_phone') || '').trim(),
          p_business_address: String(formData.get('business_address') || '').trim(),
        });
        if (saveError) throw saveError;
        requestProfile = { ...requestProfile, ...(data || {}) };
        snapshot.profile = { ...snapshot.profile, ...requestProfile };
        let userProfile = {};
        try { userProfile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { userProfile = {}; }
        userProfile.name = displayName;
        sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(userProfile));
        const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName } });
        if (metadataError) console.warn('Seller profile was saved, but Auth metadata could not be refreshed:', metadataError);
        const headerName = root.querySelector('.seller-topbar > div > span');
        if (headerName) headerName.textContent = displayName;
        showSection();
        const profileStatus = host.querySelector('[data-seller-profile-status]');
        if (profileStatus) profileStatus.textContent = 'Profile details saved.';
      } catch (saveError) {
        feedback.textContent = saveError.message || 'Profile details could not be saved.';
      } finally { submit.disabled = false; }
      return;
    }
    const productRequest = event.target.closest('[data-seller-product-request]');
    if (productRequest) {
      event.preventDefault();
      if (sellerRequestSubmitting) return;
      const feedback = productRequest.querySelector('[data-supplier-feedback]');
      const formData = new FormData(productRequest);
      // Seller business and contact details are maintained by Admin when the
      // seller account is assigned. Include that saved profile with the request.
      const sellerDetails = requestProfile || {};
      const variants = [...productRequest.querySelectorAll('[data-supplier-variant-row]')].map((row) => {
        const option = row.querySelector('[name="variantOption"]').value.trim();
        const variant = row.querySelector('[name="variantLabel"]').value.trim();
        return { id: row.querySelector('[name="variantRowId"]')?.value || '', option, variant, label: [option, variant].filter(Boolean).join(' · ') || 'Standard', price: Number(row.querySelector('[name="price"]').value), stock: 0, imageIndex: Number(row.querySelector('[name="variantImageIndex"]')?.value || 0) };
      });
      if (!variants.length || variants.length > 30 || variants.some((row) => !row.variant || !Number.isFinite(row.price) || row.price < 0)) {
        feedback.textContent = 'Enter a valid variant and price for every option.'; feedback.classList.add('is-error'); return;
      }
      if (new Set(variants.map((row) => row.label.toLocaleLowerCase())).size !== variants.length) {
        feedback.textContent = 'Each option and variant combination needs a different name.'; feedback.classList.add('is-error'); return;
      }
      // The variant indices and upload order must come from the same form state.
      const photos = [...sellerRequestImages];
      if (photos.length > 5) { feedback.textContent = 'Add no more than 5 product photos.'; feedback.classList.add('is-error'); return; }
      const originalProduct = sellerRequestProduct;
      const originalVariants = Array.isArray(originalProduct?.variants) ? originalProduct.variants : [];
      const enabledControls = [...productRequest.querySelectorAll('input:enabled, select:enabled, textarea:enabled, button:enabled')];
      const photoCards = [...productRequest.querySelectorAll('[data-seller-request-photo-index]')];
      sellerRequestSubmitting = true;
      draggedSellerPhotoIndex = null;
      enabledControls.forEach((control) => { control.disabled = true; });
      photoCards.forEach((card) => { card.draggable = false; card.classList.remove('is-dragging'); });
      feedback.classList.remove('is-error'); feedback.textContent = 'Submitting product request…';
      try {
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError || !userResult?.user) throw userError || new Error('Sign in again before submitting a product request.');
        const requestId = crypto.randomUUID();
        const imageUrls = [];
        for (const [index, photo] of photos.entries()) {
          if (photo.url) { imageUrls.push(photo.url); continue; }
          const file = photo.file;
          if (!file) throw new Error('A product photo is missing. Please change or remove it and try again.');
          const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
          if (!['png', 'jpg', 'webp', 'gif'].includes(extension)) throw new Error('Use a JPG, PNG, WEBP, or GIF product photo.');
          const path = `${userResult.user.id}/${requestId}/${index + 1}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('marketplace-submissions').upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw uploadError;
          imageUrls.push(supabase.storage.from('marketplace-submissions').getPublicUrl(path).data.publicUrl);
        }
        const originalImageUrls = new Set(Array.isArray(originalProduct?.images) ? originalProduct.images : []);
        const retainedImageUrls = new Set(imageUrls);
        const productData = {
          productCode: '', hidden: true, ...originalProduct,
          id: originalProduct?.id || `seller-request-${requestId}`, name: String(formData.get('name') || '').trim(), category: String(formData.get('category') || 'Other'),
          petTypes: String(formData.get('petTypes') || '').trim(), description: String(formData.get('description') || '').trim(),
          ingredients: String(formData.get('ingredients') || '').trim(), nutrition: String(formData.get('nutrition') || '').trim(),
          images: imageUrls,
          variants: variants.map((row, index) => {
            const previous = originalVariants.find((variant) => row.id ? String(variant.id) === row.id : !variant.id && variant.label === row.label);
            const imageUrl = imageUrls[row.imageIndex] || imageUrls[0] || '';
            const variant = { ...previous, ...row, id: row.id || (previous?.label ? undefined : 'seller-request-' + requestId + '-' + (index + 1)), stock: previous?.stock ?? row.stock, imageUrl };
            if (Array.isArray(previous?.images)) {
              const otherPhotos = previous.images.slice(1).filter((url) => url !== imageUrl && (!originalImageUrls.has(url) || retainedImageUrls.has(url)));
              variant.images = [imageUrl, ...otherPhotos].filter(Boolean);
            }
            return variant;
          }),
        };
        const { error: submitError } = await supabase.rpc('submit_seller_product_request_with_baseline', {
          p_request_id: formData.get('sellerRequestId') || null, p_product_data: productData, p_seller_details: sellerDetails,
          p_warehouse_product_id: formData.get('sellerWarehouseProductId') || null,
          p_expected: originalProduct || null,
        });
        if (submitError) throw submitError;
        const [nextSnapshot, nextRequests, nextProfile] = await Promise.all([supabase.rpc('seller_portal_snapshot'), supabase.rpc('seller_portal_product_requests'), supabase.rpc('seller_portal_request_profile')]);
        if (nextSnapshot.error) throw nextSnapshot.error;
        if (nextRequests.error) throw nextRequests.error;
        if (nextProfile.error) throw nextProfile.error;
        requestProfile = nextProfile.data || {};
        snapshot = { ...(nextSnapshot.data || {}), profile: { ...(nextSnapshot.data?.profile || {}), ...requestProfile }, product_requests: nextRequests.data || [] };
        setProductRequestModalOpen(false);
        showSection();
      } catch (submitError) {
        feedback.textContent = submitError.message || 'Could not submit the product request.'; feedback.classList.add('is-error');
      } finally {
        sellerRequestSubmitting = false;
        enabledControls.forEach((control) => { control.disabled = false; });
        photoCards.forEach((card) => { card.draggable = true; });
      }
      return;
    }
    const form = event.target.closest('[data-seller-notifications]');
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector('[role="status"]');
    const formData = new FormData(form);
    const preferences = Object.fromEntries(['low_stock','product_status'].map((key) => [key, formData.has(key)]));
    const { error: saveError } = await supabase.rpc('seller_portal_update_notifications', { p_preferences: preferences });
    status.textContent = saveError ? (saveError.message || 'Could not save preferences.') : 'Preferences saved.';
    if (!saveError) snapshot.profile.notification_preferences = preferences;
  });
  function downloadReport(kind) {
    const csvEscape = (value) => `"${String(value ?? '').replaceAll('"','""')}"`;
    let headers = []; let rows = [];
    if (kind === 'sales') {
      headers = ['Sale Ref','Date','Product','SKU','Variant','Quantity','Unit Price MYR','Gross Sales MYR','Status'];
      rows = filteredSales().map((sale) => [sale.sale_reference,sale.sale_date,sale.product_name,sale.seller_sku,sale.variant,sale.quantity,sale.unit_price,sale.gross_sales,`${sale.product_sale_status}${sale.demo_payment ? ' · Demo' : ''}`]);
    } else if (kind === 'inventory') { headers = ['Product','SKU','Stock Received','Available Stock','Units Sold','Low Stock Threshold','Last Updated']; rows = (snapshot.inventory || []).map((item) => [item.name,item.sku,item.stock_received,item.available_stock,item.units_sold,item.low_stock_threshold,item.last_updated]); }
    else if (kind === 'returns') { headers = ['Sale Ref','Date','Product','SKU','Variant','Quantity','Refund MYR','Status']; rows = filteredSales().filter((sale) => ['Returned','Refunded'].includes(sale.product_sale_status)).map((sale) => [sale.sale_reference,sale.sale_date,sale.product_name,sale.seller_sku,sale.variant,sale.quantity,sale.refund_amount,sale.product_sale_status]); }
    else return;
    const blob = new Blob([[headers, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `furgo-seller-${kind}-report.csv`; link.click(); URL.revokeObjectURL(url);
  }
}

export function adminSellerManagementPage() {
  return `<main class="admin-portal-page seller-admin-page" data-admin-sellers><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo"/><span>Admin Portal</span></a><div class="admin-portal-account"><a class="admin-customer-portal-link" href="#admin">Open Admin Portal</a></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>ADVANCED MANAGEMENT</span><h1>Manage Sellers</h1></div></header><div class="seller-admin-management-sections"><section class="seller-admin-subsection seller-admin-fee-management"><div><h2>Manage Seller's Fee &amp; Payout Rule</h2><p>Set warehouse storage rates and manage seller payout rules.</p></div><a class="seller-admin-fee-link" href="#admin-fee-rules">Manage Fee &amp; Payout</a></section><section class="admin-market-panel seller-admin-marketplace-panel"><h2 class="seller-admin-marketplace-title">Marketplace Seller</h2><section class="seller-admin-subsection seller-admin-global-requests"><div class="seller-admin-global-requests-heading"><h2>Product Requests</h2><button type="button" data-seller-request-view-toggle>Waiting List</button></div><div data-seller-admin-product-requests role="status" aria-live="polite">Loading product requests…</div></section><button type="button" class="seller-admin-open-assign" data-open-seller-assign>Assign Seller Account</button><dialog class="seller-admin-assign-dialog" data-seller-assign-dialog aria-labelledby="seller-assign-title"><form data-create-seller class="seller-admin-form"><div class="seller-admin-assign-heading"><h2 id="seller-assign-title">Assign Seller Account</h2><button type="button" data-close-seller-assign aria-label="Close assign seller form">×</button></div><label>Account email<input name="email" type="email" required placeholder="seller@example.com"/></label><label>Business name<input name="business_name" required maxlength="160"/></label><label>Contact name<input name="contact_name" maxlength="120"/></label><label>Contact phone<input name="contact_phone" maxlength="40"/></label><label class="seller-admin-business-address">Business address<input name="business_address" required maxlength="500"/></label><button class="button button-primary seller-assign-button" type="submit">Assign Seller</button><span role="status" aria-live="polite"></span></form></dialog><div data-seller-admin-list role="status" aria-live="polite">Loading seller configuration…</div></section></div></main>`;
}

export function adminSellerPayoutFeePage(params = new URLSearchParams()) {
  const sellerId = params.get('sellerId') || '';
  return `<main class="admin-portal-page seller-admin-page" data-admin-seller-payout-fee data-seller-id="${text(sellerId, '')}">
    <header class="admin-portal-header">
      <a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo"/><span>Admin Portal</span></a>
      <div class="admin-portal-account"><a class="admin-customer-portal-link" href="#admin">Open Admin Portal</a></div>
    </header>
    <header class="admin-market-heading"><a href="#admin-seller-management" aria-label="Back to Manage Sellers">‹</a><div><span>ADVANCED MANAGEMENT</span><h1>Payout &amp; Fee</h1></div></header>
    <section class="admin-market-panel seller-payout-fee-page">
      <header class="seller-payout-fee-heading"><div><span>SELLER</span><h2 data-payout-fee-seller-name>Loading seller…</h2></div></header>
      <section class="seller-payout-fee-panel">
        <div class="seller-payout-section-heading"><h3>Fee Settings</h3><p class="seller-payout-fee-help">Set what Furgo charges this seller. The preview updates as you enter amounts.</p></div>
        <form data-seller-fee-form class="seller-payout-fee-form">
          <div class="seller-fee-cards">
            <section class="seller-fee-card seller-fee-card-warehouse seller-fee-card-warehouse-allocation">
              <header><img src="Image/Icon/Icon-01.png" alt=""/><div><h4>Warehouse</h4><p>Optional · choose storage types and enter each seller’s allocated amount. Fees are calculated monthly from the active rate rules.</p></div></header>
              <div class="seller-warehouse-allocation-rows" data-warehouse-allocation-rows><p class="seller-warehouse-allocation-empty">No warehouse storage allocated. This seller has no warehouse fee.</p></div>
              <div class="seller-warehouse-allocation-footer"><label>Monthly warehouse fee<input type="text" data-warehouse-allocation-total value="RM 0.00" readonly aria-readonly="true"/></label><button type="button" class="seller-warehouse-add-allocation" data-add-warehouse-allocation>Add Storage</button></div>
            </section>
            <section class="seller-fee-card seller-fee-card-pack">
              <header><img src="Image/Icon/Icon-23.png" alt=""/><div><h4>Pack &amp; Ship</h4><p>Required · based on product size and weight, like courier pricing.</p></div></header>
              <label>Pack &amp; Ship fee per unit (MYR)<input name="pack_ship_fee_per_unit" type="number" min="0" step="0.01" value="0" required/></label>
            </section>
            <section class="seller-fee-card seller-fee-card-marketplace">
              <header><img src="Image/Icon/Icon-03.png" alt=""/><div><h4>Marketplace</h4><p>Required · a percentage of product sales.</p></div></header>
              <label>Marketplace fee (%)<input name="marketplace_fee_percent" type="number" min="0" max="100" step="0.01" value="0" required/></label>
            </section>
          </div>
          <label class="seller-payout-basis-field">Payout calculation<select name="payout_basis"><option value="net_after_fees">Product sales minus fees</option><option value="gross_sales">Product sales before fees</option></select></label>
          <button type="submit" class="seller-payout-primary seller-payout-save-fees">Save Fee Settings</button>
          <span class="seller-payout-fee-feedback" data-fee-save-status role="status" aria-live="polite"></span>
        </form>
        <div class="seller-warehouse-allocation-modal" data-warehouse-allocation-modal hidden>
          <div class="seller-warehouse-allocation-backdrop" data-close-warehouse-allocation aria-hidden="true"></div>
          <section class="seller-warehouse-allocation-dialog" role="dialog" aria-modal="true" aria-labelledby="seller-warehouse-allocation-title">
            <button type="button" class="seller-warehouse-allocation-close" data-close-warehouse-allocation aria-label="Close">×</button>
            <h3 id="seller-warehouse-allocation-title">Storage Allocation</h3>
            <p>Choose a storage type and enter the area size used. The monthly fee updates automatically.</p>
            <label>Storage type<select data-allocation-modal-rule><option value="">Choose storage type</option></select></label>
            <label>Allocated Area Size<div class="seller-warehouse-area-input"><input data-allocation-modal-amount type="number" min="0.01" step="0.01" placeholder="Enter area size"/><span data-allocation-modal-unit></span></div></label>
            <div class="seller-warehouse-allocation-modal-calculation"><span data-allocation-modal-rate>Choose a storage type to see its rate.</span><strong data-allocation-modal-total>RM 0.00 / month</strong></div>
            <div class="seller-warehouse-allocation-modal-actions"><button type="button" class="seller-warehouse-allocation-cancel" data-close-warehouse-allocation>Cancel</button><button type="button" class="seller-warehouse-allocation-confirm" data-save-warehouse-allocation>Save Storage</button></div>
            <span data-allocation-modal-status role="status" aria-live="polite"></span>
          </section>
        </div>
        <div class="seller-payout-preview">
          <label>Example product sales (MYR)<input type="number" min="0" step="0.01" value="100" data-fee-preview-sales/></label>
          <label>Units sold<input type="number" min="1" step="1" value="1" data-fee-preview-units/></label>
          <div data-fee-preview-output aria-live="polite"></div>
        </div>
      </section>
      <section class="seller-payout-fee-panel seller-payout-record-panel">
        <div class="seller-payout-section-heading"><h3>Payout Records</h3><p class="seller-payout-fee-help">Choose a period and calculate from paid product sales, then record the payout.</p></div>
        <div data-seller-payout-list></div>
        <form data-seller-payout-form class="seller-payout-record-form">
          <div class="seller-payout-period-fields">
            <label>Period start<input name="period_start" type="date" required/></label>
            <label>Period end<input name="period_end" type="date" required/></label>
            <div class="seller-payout-calculate"><button type="button" class="seller-payout-primary" data-calculate-payout>Calculate from Sales</button><span data-payout-calculation-result aria-live="polite"></span></div>
          </div>
          <label>Payout amount (MYR)<input name="amount" type="number" min="0" step="0.01" required/></label>
          <label>Status<select name="status"><option>Pending</option><option>Processing</option><option>Paid</option><option>Failed</option></select></label>
          <label class="seller-payout-statement-field">Statement link<input name="statement_url" type="url" placeholder="https://…"/></label>
          <button type="submit" class="seller-payout-primary seller-payout-record-submit">Record Payout</button>
          <span class="seller-payout-record-feedback" data-payout-save-status role="status" aria-live="polite"></span>
        </form>
      </section>
      <p data-payout-fee-status role="status" aria-live="polite"></p>
    </section>
  </main>`;
}

export async function setupAdminSellerPayoutFee() {
  const root = document.querySelector('[data-admin-seller-payout-fee]');
  if (!root) return;
  const name = root.querySelector('[data-payout-fee-seller-name]');
  const status = root.querySelector('[data-payout-fee-status]');
  const feeForm = root.querySelector('[data-seller-fee-form]');
  const payoutForm = root.querySelector('[data-seller-payout-form]');
  const payoutList = root.querySelector('[data-seller-payout-list]');
  const calculatePayoutButton = root.querySelector('[data-calculate-payout]');
  const allocationRows = root.querySelector('[data-warehouse-allocation-rows]');
  const allocationTotal = root.querySelector('[data-warehouse-allocation-total]');
  const addAllocationButton = root.querySelector('[data-add-warehouse-allocation]');
  const allocationModal = root.querySelector('[data-warehouse-allocation-modal]');
  const allocationModalRule = root.querySelector('[data-allocation-modal-rule]');
  const allocationModalAmount = root.querySelector('[data-allocation-modal-amount]');
  const allocationModalUnit = root.querySelector('[data-allocation-modal-unit]');
  const allocationModalRate = root.querySelector('[data-allocation-modal-rate]');
  const allocationModalTotal = root.querySelector('[data-allocation-modal-total]');
  const allocationModalStatus = root.querySelector('[data-allocation-modal-status]');
  const sellerId = root.dataset.sellerId;
  let warehouseRules = [];
  let warehouseAllocations = [];
  let editingAllocationIndex = null;
  const setStatus = (selector, message, isError = false) => {
    const target = root.querySelector(selector);
    if (target) { target.textContent = message; target.classList.toggle('is-error', isError); }
  };
  const updatePreview = () => {
    if (!feeForm) return;
    const data = new FormData(feeForm);
    const sales = Math.max(0, Number(root.querySelector('[data-fee-preview-sales]')?.value || 0));
    const units = Math.max(1, Number(root.querySelector('[data-fee-preview-units]')?.value || 1));
    const warehouse = warehouseAllocations.reduce((sum, allocation) => sum + Number(allocation.price_per_unit || 0) * Number(allocation.unit_amount || 0), 0);
    if (allocationTotal) allocationTotal.value = money(warehouse);
    const packShip = Math.max(0, Number(data.get('pack_ship_fee_per_unit') || 0)) * units;
    const marketplace = sales * Math.max(0, Number(data.get('marketplace_fee_percent') || 0)) / 100;
    const totalFees = warehouse + packShip + marketplace;
    const payout = data.get('payout_basis') === 'gross_sales' ? sales : Math.max(0, sales - totalFees);
    const output = root.querySelector('[data-fee-preview-output]');
    if (output) output.innerHTML = `<span>Product sales <strong>${money(sales)}</strong></span><span>Warehouse fee <strong>${money(warehouse)}</strong></span><span>Pack &amp; Ship fee <strong>${money(packShip)}</strong></span><span>Marketplace fee <strong>${money(marketplace)}</strong></span><b>Estimated payout <strong>${money(payout)}</strong></b>`;
  };
  const renderPayouts = (payouts = []) => {
    if (!payoutList) return;
    payoutList.innerHTML = payouts.length ? `<div class="seller-payout-records">${payouts.map((item) => `<article><div><strong>${text(item.reference, 'Payout')}</strong><span>${safeDate(item.period_start)} – ${safeDate(item.period_end)}</span></div><b>${money(item.amount)}</b><span class="seller-payout-status">${text(item.status)}</span></article>`).join('')}</div>` : '<p class="seller-payout-empty">No payout records yet.</p>';
  };
  if (!sellerId) {
    name.textContent = 'Seller not selected';
    status.textContent = 'Return to Manage Sellers and open Payout & Fee for a seller.';
    return;
  }
  const [{ data, error }, feeResult, rulesResult] = await Promise.all([
    supabase.rpc('admin_marketplace_sellers'),
    supabase.rpc('admin_marketplace_seller_get_fee_configuration', { p_seller_id: sellerId }),
    supabase.rpc('admin_warehouse_fee_rules_list'),
  ]);
  if (error) {
    name.textContent = 'Seller details unavailable';
    status.textContent = error.message || 'Could not load seller details.';
    return;
  }
  const seller = (data?.sellers || []).find((item) => String(item.id) === String(sellerId));
  name.textContent = seller?.business_name || 'Seller not found';
  if (!seller) { status.textContent = 'Seller not found.'; return; }
  warehouseRules = Array.isArray(rulesResult.data) ? rulesResult.data : [];
  if (rulesResult.error) setStatus('[data-fee-save-status]', `${rulesResult.error.message} Apply migration 0128 to load warehouse storage types.`, true);
  const renderAllocationRows = (allocations = []) => {
    if (!allocationRows) return;
    warehouseAllocations = allocations.map((allocation) => ({
      rule_id: String(allocation.rule_id || allocation.id || ''),
      storage_type: allocation.storage_type || '',
      billing_unit: allocation.billing_unit || '',
      price_per_unit: Number(allocation.price_per_unit || 0),
      unit_amount: Number(allocation.unit_amount || 0),
    }));
    if (!allocations.length) {
      allocationRows.innerHTML = '<p class="seller-warehouse-allocation-empty">No warehouse storage allocated. This seller has no warehouse fee.</p>';
      updatePreview();
      return;
    }
    allocationRows.innerHTML = warehouseAllocations.map((allocation, index) => {
      const lineTotal = allocation.price_per_unit * allocation.unit_amount;
      return `<article class="seller-warehouse-allocation-row" data-warehouse-allocation-row><div class="seller-warehouse-allocation-summary"><strong>${text(allocation.storage_type)}</strong><span class="seller-warehouse-allocation-rate">${money(allocation.price_per_unit)} / ${text(allocation.billing_unit)} / month</span><strong class="seller-warehouse-line-total">${money(lineTotal)} <span>/ month</span></strong><span class="seller-warehouse-allocation-amount">${Number(allocation.unit_amount).toLocaleString('en-MY', { maximumFractionDigits: 2 })} ${text(allocation.billing_unit)}</span></div><div class="seller-warehouse-allocation-row-actions"><button type="button" data-edit-warehouse-allocation="${index}">Edit</button><button type="button" class="seller-warehouse-remove-allocation-icon" data-remove-warehouse-allocation="${index}" aria-label="Remove storage allocation" title="Remove"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 14h11l1-14M9 7V4h6v3"/></svg></button></div></article>`;
    }).join('');
    updatePreview();
  };
  const refreshAllocationModal = () => {
    const selectedRule = warehouseRules.find((rule) => String(rule.id) === String(allocationModalRule?.value));
    const amount = Math.max(0, Number(allocationModalAmount?.value || 0));
    if (allocationModalUnit) allocationModalUnit.textContent = selectedRule?.billing_unit || '';
    if (allocationModalRate) allocationModalRate.textContent = selectedRule ? `${money(selectedRule.price_per_unit)} / ${selectedRule.billing_unit} / month` : 'Choose a storage type to see its rate.';
    if (allocationModalTotal) allocationModalTotal.textContent = `${money(Number(selectedRule?.price_per_unit || 0) * amount)} / month`;
    if (allocationModalStatus) allocationModalStatus.textContent = '';
  };
  const openAllocationModal = (index = null) => {
    if (!allocationModal || !allocationModalRule || !allocationModalAmount) return;
    editingAllocationIndex = index;
    const current = index == null ? null : warehouseAllocations[index];
    // A seller can use the same storage type more than once (for separate
    // areas, zones, or allocations), so don't hide types already selected.
    const available = warehouseRules.filter((rule) => rule.is_active || String(rule.id) === String(current?.rule_id));
    allocationModalRule.innerHTML = `<option value="">Choose storage type</option>${available.map((rule) => `<option value="${text(rule.id)}">${text(rule.storage_type)} · ${text(rule.billing_unit)} · ${money(rule.price_per_unit)} / ${text(rule.billing_unit)} / month${rule.is_active ? '' : ' (Inactive)'}</option>`).join('')}`;
    allocationModalRule.value = current?.rule_id || '';
    allocationModalAmount.value = current?.unit_amount ?? '';
    const heading = allocationModal.querySelector('#seller-warehouse-allocation-title');
    if (heading) heading.textContent = current ? 'Edit Storage Allocation' : 'Add Storage Allocation';
    allocationModal.hidden = false;
    // Keep the overlay neutral even if portal-wide button styles change.
    allocationModal.style.backgroundColor = 'rgba(25, 23, 21, .56)';
    document.body.classList.add('seller-allocation-modal-open');
    refreshAllocationModal();
    (current ? allocationModalAmount : allocationModalRule).focus();
  };
  const closeAllocationModal = () => {
    if (!allocationModal) return;
    allocationModal.hidden = true;
    document.body.classList.remove('seller-allocation-modal-open');
    editingAllocationIndex = null;
    addAllocationButton?.focus();
  };
  const persistWarehouseAllocations = async (allocations) => {
    const values = new FormData(feeForm);
    const normalized = allocations.filter((item) => item.rule_id && Number(item.unit_amount) > 0);
    const result = await supabase.rpc('admin_marketplace_seller_save_fee_configuration', {
      p_seller_id: sellerId,
      p_pack_ship_fee_per_unit: Number(values.get('pack_ship_fee_per_unit') || 0),
      p_marketplace_fee_percent: Number(values.get('marketplace_fee_percent') || 0),
      p_payout_basis: values.get('payout_basis'),
      p_warehouse_allocations: normalized,
    });
    if (result.error) throw result.error;
    const refreshed = await supabase.rpc('admin_marketplace_seller_get_fee_configuration', { p_seller_id: sellerId });
    if (refreshed.error) throw refreshed.error;
    renderAllocationRows(Array.isArray(refreshed.data?.warehouse_allocations) ? refreshed.data.warehouse_allocations : normalized);
    return refreshed.data;
  };
  renderPayouts(seller.payouts || []);
  if (!feeResult.error && feeResult.data) {
    const config = feeResult.data;
    renderAllocationRows(Array.isArray(config.warehouse_allocations) ? config.warehouse_allocations : []);
    feeForm.elements.pack_ship_fee_per_unit.value = Number(config.pack_ship_fee_per_unit || 0);
    feeForm.elements.marketplace_fee_percent.value = Number(config.marketplace_fee_percent || 0);
    feeForm.elements.payout_basis.value = config.payout_basis || 'net_after_fees';
  } else if (feeResult.error) {
    setStatus('[data-fee-save-status]', `${feeResult.error.message} Apply migration 0126 to enable fee settings.`, true);
  }
  feeForm.addEventListener('input', updatePreview);
  feeForm.addEventListener('change', updatePreview);
  allocationRows?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-remove-warehouse-allocation]');
    if (remove) {
      const nextAllocations = warehouseAllocations.filter((_, index) => index !== Number(remove.dataset.removeWarehouseAllocation));
      remove.disabled = true;
      setStatus('[data-fee-save-status]', 'Saving storage allocation…');
      try {
        await persistWarehouseAllocations(nextAllocations);
        setStatus('[data-fee-save-status]', 'Storage allocation removed and saved.');
      } catch (error) {
        remove.disabled = false;
        setStatus('[data-fee-save-status]', error.message || 'Could not save the storage allocation change.', true);
      }
      return;
    }
    const edit = event.target.closest('[data-edit-warehouse-allocation]');
    if (edit) openAllocationModal(Number(edit.dataset.editWarehouseAllocation));
  });
  addAllocationButton?.addEventListener('click', () => {
    if (!warehouseRules.some((rule) => rule.is_active)) {
      setStatus('[data-fee-save-status]', 'Add an active storage type in Manage Fee & Payout first.', true);
      return;
    }
    openAllocationModal();
  });
  allocationModalRule?.addEventListener('change', refreshAllocationModal);
  allocationModalAmount?.addEventListener('input', refreshAllocationModal);
  allocationModal?.querySelectorAll('[data-close-warehouse-allocation]').forEach((button) => button.addEventListener('click', closeAllocationModal));
  allocationModal?.querySelector('[data-save-warehouse-allocation]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const rule = warehouseRules.find((item) => String(item.id) === String(allocationModalRule?.value));
    const amount = Number(allocationModalAmount?.value);
    if (!rule || !Number.isFinite(amount) || amount <= 0) {
      if (allocationModalStatus) allocationModalStatus.textContent = 'Choose a storage type and enter an area size greater than zero.';
      return;
    }
    const selected = { rule_id: String(rule.id), storage_type: rule.storage_type, billing_unit: rule.billing_unit, price_per_unit: Number(rule.price_per_unit || 0), unit_amount: amount };
    const nextAllocations = warehouseAllocations.slice();
    if (editingAllocationIndex == null) nextAllocations.push(selected);
    else nextAllocations[editingAllocationIndex] = selected;
    button.disabled = true;
    if (allocationModalStatus) allocationModalStatus.textContent = 'Saving storage allocation…';
    try {
      await persistWarehouseAllocations(nextAllocations);
      setStatus('[data-fee-save-status]', 'Storage allocation saved.');
      closeAllocationModal();
    } catch (error) {
      if (allocationModalStatus) allocationModalStatus.textContent = error.message || 'Could not save the storage allocation. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
  allocationModal?.addEventListener('click', (event) => { if (event.target === allocationModal) closeAllocationModal(); });
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && allocationModal && !allocationModal.hidden) closeAllocationModal(); });
  root.querySelectorAll('[data-fee-preview-sales], [data-fee-preview-units]').forEach((input) => input.addEventListener('input', updatePreview));
  updatePreview();
  feeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = feeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('[data-fee-save-status]', 'Saving…');
    let saveError = null;
    try {
      await persistWarehouseAllocations(warehouseAllocations);
    } catch (error) {
      saveError = error;
    }
    button.disabled = false;
    setStatus('[data-fee-save-status]', saveError ? saveError.message : 'Fee settings saved.', Boolean(saveError));
    if (!saveError) updatePreview();
  });
  payoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(payoutForm);
    const button = payoutForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('[data-payout-save-status]', 'Saving…');
    const result = await supabase.rpc('admin_marketplace_seller_record_payout', {
      p_seller_id: sellerId,
      p_period_start: values.get('period_start'),
      p_period_end: values.get('period_end'),
      p_amount: Number(values.get('amount') || 0),
      p_status: values.get('status'),
      p_statement_url: values.get('statement_url') || '',
    });
    button.disabled = false;
    if (result.error) { setStatus('[data-payout-save-status]', result.error.message, true); return; }
    payoutForm.reset();
    const refreshed = await supabase.rpc('admin_marketplace_sellers');
    const refreshedSeller = (refreshed.data?.sellers || []).find((item) => String(item.id) === String(sellerId));
    renderPayouts(refreshedSeller?.payouts || []);
    setStatus('[data-payout-save-status]', 'Payout recorded.');
  });
  calculatePayoutButton.addEventListener('click', async () => {
    const start = payoutForm.elements.period_start.value;
    const end = payoutForm.elements.period_end.value;
    const resultNode = root.querySelector('[data-payout-calculation-result]');
    if (!start || !end) { resultNode.textContent = 'Choose both dates first.'; return; }
    calculatePayoutButton.disabled = true;
    resultNode.textContent = 'Calculating…';
    const result = await supabase.rpc('admin_marketplace_seller_calculate_payout', {
      p_seller_id: sellerId, p_period_start: start, p_period_end: end,
    });
    calculatePayoutButton.disabled = false;
    if (result.error) { resultNode.textContent = result.error.message; resultNode.classList.add('is-error'); return; }
    resultNode.classList.remove('is-error');
    const totals = result.data || {};
    payoutForm.elements.amount.value = Number(totals.payout_amount || 0).toFixed(2);
    resultNode.textContent = `${Number(totals.units || 0)} units · sales ${money(totals.gross_sales)} · fees ${money(Number(totals.marketplace_fee || 0) + Number(totals.service_fee || 0))}`;
  });
}

export function setupAdminSellerManagement() {
  const root = document.querySelector('[data-admin-sellers]');
  if (!root) return;
  const list = root.querySelector('[data-seller-admin-list]');
  const productRequestList = root.querySelector('[data-seller-admin-product-requests]');
  const adminError = (error) => error?.message || 'The change could not be saved.';
  let showWaitingListRequests = false;
  const load = async () => {
    list.textContent = 'Loading seller configuration…';
    const [result, requestsResult] = await Promise.all([
      supabase.rpc('admin_marketplace_sellers'),
      supabase.rpc('admin_marketplace_seller_product_requests'),
    ]);
    if (result.error) { list.innerHTML = `<p class="seller-error">${text(result.error.message, 'Seller configuration is unavailable. Apply migrations 0113 and 0114.')}</p>`; }
    const data = result.data || { sellers: [], products: [] };
    const productRequests = Array.isArray(requestsResult.data) ? requestsResult.data : [];
    if (requestsResult.error) {
      productRequestList.innerHTML = `<p class="seller-error">${text(requestsResult.error.message, 'Seller product requests are unavailable. Check the seller product request migration and permissions.')}</p>`;
    } else {
      const pendingRequests = productRequests.filter((request) => request.status === 'Pending Review');
      const waitingListRequests = productRequests.filter((request) => request.status === 'In Waiting List');
      const visibleRequests = showWaitingListRequests ? waitingListRequests : pendingRequests;
      const viewToggle = root.querySelector('[data-seller-request-view-toggle]');
      if (viewToggle) viewToggle.textContent = showWaitingListRequests ? 'Back to Product Requests' : `Waiting List${waitingListRequests.length ? ` (${waitingListRequests.length})` : ''}`;
      productRequestList.innerHTML = visibleRequests.length ? visibleRequests.map((request) => {
        const product = request.product_data || {};
        const seller = data.sellers.find((item) => item.id === request.seller_id);
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const hasAdminNote = Boolean(String(request.admin_note || '').trim());
        const reviewButtons = `<form class="seller-review-product-request" data-review-product-request data-request-id="${text(request.id)}"><label>Admin note<input name="admin_note" maxlength="1000" value="${text(request.admin_note, '')}" placeholder="Required for Reject or In Waiting List"/></label><div class="seller-review-product-actions"><button type="submit" data-decision="Approve"${hasAdminNote ? ' disabled' : ''}>Approve</button><button type="submit" class="seller-danger-button" data-decision="Reject">Reject</button>${request.status !== 'In Waiting List' ? '<button type="submit" class="seller-outline-button" data-decision="In Waiting List">In Waiting List</button>' : ''}</div><span role="status" aria-live="polite"></span></form>`;
        const photos = (Array.isArray(product.images) ? product.images : []).map((url) => `<img src="${text(url)}" alt="${text(product.name, 'Product')} photo" loading="lazy"/>`).join('');
        return `<article class="seller-admin-product-request"><div class="seller-admin-product-request-heading"><div><span class="seller-status">${text(request.status)}</span><h4>${text(product.name, 'Product request')}</h4><small>${text(seller?.business_name || 'Seller')} · ${text(seller?.contact_email || '')} · ${text(request.request_type, 'New Product')} · ${text(product.category, 'Other')} · ${safeDate(request.submitted_at)}</small></div></div><div class="seller-admin-product-request-details"><p><strong>Product details</strong><br/>${text(product.description, 'No description')}<br/>Pet types: ${text(product.petTypes, 'Not specified')}</p><p><strong>Options / variants</strong><br/>${variants.map((variant) => `${text(variant.option)}${variant.option ? ' · ' : ''}${text(variant.variant || variant.label, 'Standard')} · RM ${Number(variant.price || 0).toFixed(2)}`).join('<br/>') || 'No options provided'}</p></div>${photos ? `<div class="seller-admin-request-photos">${photos}</div>` : ''}${reviewButtons}</article>`;
      }).join('') : `<p>${showWaitingListRequests ? 'No requests are in the waiting list.' : 'No product requests awaiting review.'}</p>`;
    }
    if (result.error) return;
    list.innerHTML = data.sellers.length ? data.sellers.map((seller) => {
      const assignedEmails = [...new Set((seller.assigned_users || []).map((user) => user.email).filter(Boolean))];
      return `<details class="seller-admin-card" data-seller-admin-card="${text(seller.id)}"><summary class="seller-admin-card-heading"><div><span>SELLER</span><h2>${text(seller.business_name)}</h2></div><div class="seller-admin-card-summary-meta"><span>${(seller.products || []).length} products</span><span>${assignedEmails.length ? 'Access enabled' : 'Access disabled'}</span></div></summary><div class="seller-admin-card-content"><div class="seller-admin-card-details"><div><p><strong>Account</strong> ${text(assignedEmails.join(', ') || seller.contact_email || 'No account assigned')}</p><p class="seller-admin-seller-details-feedback" data-seller-details-feedback role="status" aria-live="polite"></p></div><div class="seller-admin-card-actions"><button type="button" data-edit-seller-details>Edit Details</button><a class="seller-payout-fee-link" href="#admin-seller-payout-fee?sellerId=${encodeURIComponent(seller.id)}">Payout &amp; Fee</a></div></div>
      <dl class="seller-admin-seller-detail-list"><div><dt>Business name</dt><dd data-seller-value="business_name">${text(seller.business_name, '—')}</dd></div><div><dt>Contact name</dt><dd data-seller-value="contact_name">${text(seller.contact_name, '—')}</dd></div><div><dt>Contact phone</dt><dd data-seller-value="contact_phone">${text(seller.contact_phone, '—')}</dd></div><div><dt>Business address</dt><dd data-seller-value="business_address">${text(seller.business_address, '—')}</dd></div></dl>
      <section class="seller-admin-danger-zone" aria-labelledby="seller-danger-title-${text(seller.id)}"><div><h3 id="seller-danger-title-${text(seller.id)}">Danger Zone</h3><p>Deleting this seller permanently removes their seller portal access.</p></div><button type="button" class="seller-danger-button" data-delete-seller="${text(seller.id)}">Delete Seller</button></section>
      <dialog class="seller-admin-details-dialog" data-seller-details-dialog aria-labelledby="seller-details-title-${text(seller.id)}"><form class="seller-admin-seller-details-form" data-seller-details data-seller-id="${text(seller.id)}"><div class="seller-admin-details-dialog-heading"><h2 id="seller-details-title-${text(seller.id)}">Edit Seller Details</h2><button type="button" data-close-seller-details aria-label="Close edit seller details">×</button></div><label>Business name<input name="business_name" maxlength="160" required value="${text(seller.business_name)}"/></label><label>Contact name<input name="contact_name" maxlength="120" value="${text(seller.contact_name)}"/></label><label>Contact phone<input name="contact_phone" type="tel" maxlength="40" value="${text(seller.contact_phone)}"/></label><label class="seller-admin-seller-address">Business address<textarea name="business_address" rows="3" maxlength="500" required>${text(seller.business_address)}</textarea></label><div class="seller-admin-details-dialog-actions"><button type="submit">Save Seller Details</button></div><span role="status" aria-live="polite"></span></form></dialog>
      </div></details>`;
    }).join('') : '<p>No seller accounts assigned yet.</p>';
  };
  root.addEventListener('submit', async (event) => {
    const create = event.target.closest('[data-create-seller]');
    if (create) {
      event.preventDefault(); const status = create.querySelector('[role="status"]'); const form = new FormData(create);
      status.textContent = 'Saving seller access…';
      const { error } = await supabase.rpc('admin_marketplace_seller_assign', { p_email: form.get('email'), p_business_name: form.get('business_name'), p_contact_name: form.get('contact_name'), p_contact_phone: form.get('contact_phone'), p_business_address: form.get('business_address') });
      status.textContent = error ? error.message : 'Seller access assigned.'; if (!error) { create.reset(); create.closest('[data-seller-assign-dialog]')?.close(); await load(); } return;
    }
    const productReview = event.target.closest('[data-review-product-request]');
    if (productReview) {
      event.preventDefault();
      const decision = event.submitter?.dataset.decision;
      if (!decision) return;
      const status = productReview.querySelector('[role="status"]');
      const form = new FormData(productReview);
      const adminNote = String(form.get('admin_note') || '').trim();
      if (['Reject', 'In Waiting List'].includes(decision) && !adminNote) {
        status.textContent = `Add an admin note before choosing ${decision}.`;
        productReview.elements.admin_note.focus();
        return;
      }
      if (decision === 'Approve' && adminNote) {
        status.textContent = 'Clear the admin note before approving this product request.';
        productReview.elements.admin_note.focus();
        return;
      }
      status.textContent = 'Saving review…';
      const { error } = await supabase.rpc('admin_marketplace_seller_review_product_request', {
        p_request_id: productReview.dataset.requestId, p_decision: decision, p_note: adminNote,
      });
      status.textContent = error ? adminError(error) : `${decision} saved.`;
      if (!error) await load();
      return;
    }
    const sellerDetailsForm = event.target.closest('[data-seller-details]');
    if (sellerDetailsForm) {
      event.preventDefault();
      const status = sellerDetailsForm.querySelector('[role="status"]');
      const form = new FormData(sellerDetailsForm);
      status.textContent = 'Saving seller details…';
      const { error } = await supabase.rpc('admin_marketplace_seller_update_details', {
        p_seller_id: sellerDetailsForm.dataset.sellerId,
        p_business_name: form.get('business_name'),
        p_contact_name: form.get('contact_name'),
        p_contact_phone: form.get('contact_phone'),
        p_business_address: form.get('business_address'),
      });
      if (error) status.textContent = adminError(error);
      else {
        const businessName = String(form.get('business_name') || '').trim();
        const sellerCard = sellerDetailsForm.closest('[data-seller-admin-card]');
        const summaryName = sellerCard?.querySelector('.seller-admin-card-heading h2');
        if (summaryName) summaryName.textContent = businessName;
        ['business_name', 'contact_name', 'contact_phone', 'business_address'].forEach((field) => {
          const value = String(form.get(field) || '').trim();
          const display = sellerCard?.querySelector(`[data-seller-value="${field}"]`);
          if (display) display.textContent = value || '—';
        });
        sellerCard?.querySelector('[data-seller-details-dialog]')?.close();
        const feedback = sellerCard?.querySelector('[data-seller-details-feedback]');
        if (feedback) feedback.textContent = 'Seller details saved.';
      }
      return;
    }
  });
  root.addEventListener('input', (event) => {
    const noteInput = event.target.closest('[data-review-product-request] [name="admin_note"]');
    if (!noteInput) return;
    const approveButton = noteInput.closest('[data-review-product-request]')?.querySelector('[data-decision="Approve"]');
    if (approveButton) approveButton.disabled = Boolean(noteInput.value.trim());
  });
  root.addEventListener('click', async (event) => {
    const openSellerAssign = event.target.closest('[data-open-seller-assign]');
    if (openSellerAssign) {
      root.querySelector('[data-seller-assign-dialog]')?.showModal();
      return;
    }
    const closeSellerAssign = event.target.closest('[data-close-seller-assign]');
    if (closeSellerAssign) {
      closeSellerAssign.closest('[data-seller-assign-dialog]')?.close();
      return;
    }
    const sellerAssignDialog = event.target.closest('[data-seller-assign-dialog]');
    if (sellerAssignDialog && event.target === sellerAssignDialog) {
      sellerAssignDialog.close();
      return;
    }
    const editSellerDetails = event.target.closest('[data-edit-seller-details]');
    if (editSellerDetails) {
      editSellerDetails.closest('[data-seller-admin-card]')?.querySelector('[data-seller-details-dialog]')?.showModal();
      return;
    }
    const closeSellerDetails = event.target.closest('[data-close-seller-details]');
    if (closeSellerDetails) {
      closeSellerDetails.closest('[data-seller-details-dialog]')?.close();
      return;
    }
    const requestViewToggle = event.target.closest('[data-seller-request-view-toggle]');
    if (requestViewToggle) {
      showWaitingListRequests = !showWaitingListRequests;
      await load();
      return;
    }
    const deleteSeller = event.target.closest('[data-delete-seller]');
    if (deleteSeller) {
      if (!window.confirm('Delete this seller? Their Seller Portal access will be removed and they will be hidden from Manage Sellers. Product mappings, sales, payout records, and request history will be retained. Continue?')) return;
      const { error } = await supabase.rpc('admin_marketplace_seller_delete', { p_seller_id: deleteSeller.dataset.deleteSeller });
      if (error) window.alert(adminError(error)); else await load();
    }
  });
  void load();
}
