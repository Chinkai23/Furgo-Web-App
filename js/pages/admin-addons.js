// Central Manager/Director catalog editor for customer-facing service add-ons.
import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { recordAdminAction } from '../admin-audit.js';
import { groomingSettingsKey, loadGroomingSettings } from './grooming-data.js';
import { hotelSettingsKey, loadHotelSettings } from './hotel-data.js';
import { daycareSettingsKey, loadDaycareSettings } from './daycare-data.js';

const catalogs = [
  { key: 'grooming', title: 'Grooming', settingsKey: groomingSettingsKey, load: loadGroomingSettings, cloudKey: 'grooming' },
  { key: 'hotel', title: 'Pet Hotel', settingsKey: hotelSettingsKey, load: loadHotelSettings },
  { key: 'daycare', title: 'Pet Daycare', settingsKey: daycareSettingsKey, load: loadDaycareSettings },
];

function addonRows(catalog) {
  const settings = catalog.load();
  return (settings.addOns || []).map((item) => `<article class="admin-addon-item" data-admin-addon-row data-addon-id="${escapeHTML(item.id)}">
    <label>Add-on name<input data-addon-field="name" value="${escapeHTML(item.name || '')}" maxlength="70" required /></label>
    <label>Price (MYR)<input data-addon-field="price" type="number" min="0" step="0.01" value="${Number(item.price) || 0}" required /></label>
    <label class="admin-addon-description">Customer details<input data-addon-field="description" value="${escapeHTML(item.description || '')}" maxlength="180" /></label>
    <label class="admin-addon-active"><input data-addon-field="active" type="checkbox" ${item.active === false ? '' : 'checked'} /> Available to customers</label>
    <button class="button button-light" type="button" data-addon-delete>Delete</button>
  </article>`).join('') || '<p class="admin-addon-empty">No add-ons yet. Add one below.</p>';
}

export function adminAddOnsPage() {
  const role = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').role;
  if (!['manager', 'director'].includes(role)) return '<main class="admin-portal-page"><h1>Manager or Director access is required to manage add-ons.</h1><a class="button button-primary" href="#admin">Back to Admin Home</a></main>';
  const sections = catalogs.map((catalog) => `<section class="admin-market-panel admin-addon-catalog" data-addon-catalog="${catalog.key}">
    <div class="admin-market-panel-heading"><div><span>Manage Add-on</span><h2>${catalog.title}</h2></div><p>Edit the customer-facing name, details, price, and availability. Existing orders keep their saved add-on details.</p></div>
    <div class="admin-addon-list">${addonRows(catalog)}</div>
    <div class="admin-addon-new"><h3>Add An Add-on</h3><div class="admin-addon-new-grid"><label>Add-on name<input data-new-addon-name maxlength="70" /></label><label>Price (MYR)<input data-new-addon-price type="number" min="0" step="0.01" value="0" /></label><label class="admin-addon-description">Customer details<input data-new-addon-description maxlength="180" /></label></div></div>
  </section>`).join('');
  return `<main class="admin-portal-page admin-addons-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header>
    <header class="admin-grooming-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Service configuration</span><h1>Manage Add-on</h1></div></header>
    <p class="admin-addon-intro">Manage add-ons for Grooming, Pet Hotel, and Pet Daycare. Hidden add-ons stay in the catalog but are no longer offered to customers.</p>
    <form data-admin-addons-form>${sections}<div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Add-on Changes</button><span data-admin-addons-feedback role="status" aria-live="polite"></span></div></form>
  </main>`;
}

function nextId() { return `addon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function setupAdminAddOns() {
  const form = document.querySelector('[data-admin-addons-form]');
  if (!form) return;
  const feedback = form.querySelector('[data-admin-addons-feedback]');

  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-addon-delete]');
    if (!button) return;
    const row = button.closest('[data-admin-addon-row]');
    if (!row || !window.confirm('Delete this add-on from the customer catalog? Existing orders keep their saved details.')) return;
    row.remove();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const updates = new Map();
    for (const catalog of catalogs) {
      const section = form.querySelector(`[data-addon-catalog="${catalog.key}"]`);
      const settings = catalog.load();
      const addOns = [...section.querySelectorAll('[data-admin-addon-row]')].map((row) => ({
        id: row.dataset.addonId,
        name: row.querySelector('[data-addon-field="name"]').value.trim(),
        price: Number(row.querySelector('[data-addon-field="price"]').value),
        description: row.querySelector('[data-addon-field="description"]').value.trim(),
        active: row.querySelector('[data-addon-field="active"]').checked,
      }));
      const nameInput = section.querySelector('[data-new-addon-name]');
      const newName = nameInput.value.trim();
      if (newName) {
        addOns.push({ id: nextId(), name: newName, price: Number(section.querySelector('[data-new-addon-price]').value), description: section.querySelector('[data-new-addon-description]').value.trim(), active: true });
      }
      updates.set(catalog, { ...settings, addOns });
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const groomingCatalog = catalogs[0];
      const groomingSettings = updates.get(groomingCatalog);
      if (authData.user) {
        const { error } = await supabase.from('service_settings').upsert({ service_key: 'grooming', settings: groomingSettings, updated_by: authData.user.id, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      for (const catalog of catalogs) localStorage.setItem(catalog.settingsKey, JSON.stringify(updates.get(catalog)));
      for (const catalog of catalogs) void recordAdminAction('service_addons_updated', 'service_addons', catalog.key, { count: updates.get(catalog).addOns.length });
      window.dispatchEvent(new Event('hashchange'));
    } catch (error) {
      feedback.textContent = `Could not save add-ons: ${error.message || 'Please try again.'}`;
    }
  });
}
