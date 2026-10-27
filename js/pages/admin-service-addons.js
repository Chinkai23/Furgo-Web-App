import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { recordAdminAction } from '../admin-audit.js';

export function serviceAddOnSection(serviceKey, serviceTitle, addOns = []) {
  const rows = addOns.map((item) => `<article class="admin-addon-item" data-service-addon-row data-addon-id="${escapeHTML(item.id)}">
    <label>Add-on name<input data-addon-field="name" value="${escapeHTML(item.name || '')}" maxlength="70" required /></label>
    <label>Price (MYR)<input data-addon-field="price" type="number" min="0" step="0.01" value="${Number(item.price) || 0}" required /></label>
    <label class="admin-addon-description">Customer details<input data-addon-field="description" value="${escapeHTML(item.description || '')}" maxlength="180" /></label>
    <label class="admin-addon-active"><input data-addon-field="active" type="checkbox" ${item.active === false ? '' : 'checked'} /> Available to customers</label>
    <button class="button button-light" type="button" data-addon-delete>Delete</button>
  </article>`).join('') || '<p class="admin-addon-empty">No add-ons yet. Add one below.</p>';
  return `<section class="admin-market-panel admin-service-addons" data-service-addons="${serviceKey}">
    <div class="admin-market-panel-heading"><div><span>Manage Add-on</span><h2>${serviceTitle} Add-ons</h2></div><p>Edit add-on names, details, prices, and availability. Existing orders keep their saved add-on details.</p></div>
    <form data-service-addon-form="${serviceKey}"><div class="admin-addon-list">${rows}</div>
      <div class="admin-addon-new"><h3>Add An Add-on</h3><div class="admin-addon-new-grid"><label>Add-on name<input data-new-addon-name maxlength="70" /></label><label>Price (MYR)<input data-new-addon-price type="number" min="0" step="0.01" value="0" /></label><label class="admin-addon-description">Customer details<input data-new-addon-description maxlength="180" /></label></div></div>
      <div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Add-on Changes</button><span data-service-addon-feedback role="status" aria-live="polite"></span></div>
    </form>
  </section>`;
}

function nextId() { return `addon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function setupServiceAddOns({ serviceKey, settingsKey, loadSettings, cloudSync = false }) {
  const form = document.querySelector(`[data-service-addon-form="${serviceKey}"]`);
  if (!form) return;
  const feedback = form.querySelector('[data-service-addon-feedback]');
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-addon-delete]');
    if (!button) return;
    if (!window.confirm('Delete this add-on? Existing orders keep their saved details.')) return;
    button.closest('[data-service-addon-row]')?.remove();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const prior = loadSettings();
    const addOns = [...form.querySelectorAll('[data-service-addon-row]')].map((row) => ({
      id: row.dataset.addonId,
      name: row.querySelector('[data-addon-field="name"]').value.trim(),
      price: Number(row.querySelector('[data-addon-field="price"]').value),
      description: row.querySelector('[data-addon-field="description"]').value.trim(),
      active: row.querySelector('[data-addon-field="active"]').checked,
    }));
    const name = form.querySelector('[data-new-addon-name]').value.trim();
    if (name) addOns.push({ id: nextId(), name, price: Number(form.querySelector('[data-new-addon-price]').value), description: form.querySelector('[data-new-addon-description]').value.trim(), active: true });
    const updated = { ...prior, addOns };
    feedback.textContent = 'Saving…';
    try {
      if (cloudSync) {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (data.user) {
          const { error } = await supabase.from('service_settings').upsert({ service_key: serviceKey, settings: updated, updated_by: data.user.id, updated_at: new Date().toISOString() });
          if (error) throw error;
        }
      }
      localStorage.setItem(settingsKey, JSON.stringify(updated));
      void recordAdminAction('service_addons_updated', 'service_addons', serviceKey, { count: addOns.length });
      feedback.textContent = `${serviceTitleFor(serviceKey)} add-ons saved.`;
      window.setTimeout(() => window.dispatchEvent(new Event('hashchange')), 350);
    } catch (error) {
      feedback.textContent = `Could not save add-ons: ${error.message || 'Please try again.'}`;
    }
  });
}

function serviceTitleFor(key) {
  return ({ grooming: 'Grooming', hotel: 'Pet Hotel', daycare: 'Pet Daycare' })[key] || 'Service';
}
