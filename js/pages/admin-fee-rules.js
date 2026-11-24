import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;

export function adminFeeRulesPage() {
  return `<main class="admin-portal-page admin-fee-rules-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <div class="admin-market-heading"><a href="#admin-seller-management" aria-label="Back to Manage Sellers">‹</a><div><span>Manage Sellers</span><h1>Manage Fee &amp; Payout</h1></div></div>
    <div class="admin-fee-rule-summaries">
      <section class="admin-fee-rule-summary">
        <header><div><span>Seller Fee Rules</span><h2><img src="Image/Icon/Icon-02.png" alt="" />Warehouse Fee</h2><p>Set monthly storage rates for seller allocations.</p></div><button type="button" class="button button-primary" data-open-fee-dialog="warehouse">Manage</button></header>
      </section>
      <section class="admin-fee-rule-summary">
        <header><div><span>Seller Fee Rules</span><h2><img src="Image/Icon/Icon-24.png" alt="" />Pack &amp; Ship Fee</h2><p>Set parcel fees by chargeable weight.</p></div><button type="button" class="button button-primary" data-open-fee-dialog="pack-ship">Manage</button></header>
      </section>
      <section class="admin-fee-rule-summary">
        <header><div><span>Seller Fee Rules</span><h2><img src="Image/Icon/Icon-04.png" alt="" />Marketplace Fee</h2><p>Set a fee as a percentage of each product’s selling price.</p></div><button type="button" class="button button-primary" data-open-fee-dialog="marketplace">Manage</button></header>
      </section>
    </div>
    <dialog class="admin-fee-rule-dialog" data-fee-dialog="warehouse" aria-labelledby="warehouse-fee-dialog-title">
      <section class="admin-market-panel admin-fee-rule-dialog-panel">
      <header class="admin-market-panel-heading"><div><span>Seller Fee Rules</span><h2 id="warehouse-fee-dialog-title"><img src="Image/Icon/Icon-02.png" alt="" />Warehouse Fee</h2></div><button type="button" class="admin-fee-dialog-close" data-close-fee-dialog aria-label="Close Warehouse Fee">×</button><p>Set each monthly storage rate here. Open a seller’s Payout &amp; Fee page from Manage Sellers to select storage types, enter allocated amounts, and calculate that seller’s monthly fee.</p></header>
      <div class="admin-warehouse-fee-list" data-warehouse-fee-list aria-live="polite"><p>Loading warehouse fee rules…</p></div>
      <div class="admin-warehouse-fee-actions"><button type="button" class="button button-primary" data-add-warehouse-fee-rule>Add Storage Type</button><span data-warehouse-fee-status role="status" aria-live="polite"></span></div>
      </section>
    </dialog>
    <dialog class="admin-fee-rule-dialog" data-fee-dialog="pack-ship" aria-labelledby="pack-ship-dialog-title">
      <section class="admin-market-panel admin-pack-ship-panel admin-fee-rule-dialog-panel">
      <header class="admin-market-panel-heading"><div><span>Seller Fee Rules</span><h2 id="pack-ship-dialog-title"><img src="Image/Icon/Icon-24.png" alt="" />Pack &amp; Ship Fee</h2></div><button type="button" class="admin-fee-dialog-close" data-close-fee-dialog aria-label="Close Pack &amp; Ship Fee">×</button><p>Set a parcel fee by chargeable weight. Chargeable weight is the greater of actual weight and volumetric weight.</p></header>
      <form class="admin-pack-ship-config" data-pack-ship-settings>
        <label>Volumetric divisor (cm³ per kg)<input name="volumetric_divisor" type="number" min="1" step="1" value="5000" required /></label>
        <p>Volumetric weight = length × width × height ÷ divisor. The divisor can be changed to match Furgo’s courier pricing agreement.</p>
        <button class="button button-primary" type="submit">Save Divisor</button>
      </form>
      <section class="admin-pack-ship-calculator" aria-labelledby="admin-pack-ship-calculator-title">
        <div><h3 id="admin-pack-ship-calculator-title">Test a Parcel</h3><p>Enter dimensions and actual weight to preview the matching fee band.</p></div>
        <div class="admin-pack-ship-dimensions">
          <label>Length (cm)<input data-pack-dimension="length" type="number" min="0" step="0.1" placeholder="e.g. 30" /></label>
          <label>Width (cm)<input data-pack-dimension="width" type="number" min="0" step="0.1" placeholder="e.g. 20" /></label>
          <label>Height (cm)<input data-pack-dimension="height" type="number" min="0" step="0.1" placeholder="e.g. 15" /></label>
          <label>Actual weight (kg)<input data-pack-dimension="weight" type="number" min="0" step="0.001" placeholder="e.g. 1.2" /></label>
        </div>
        <p class="admin-pack-ship-estimate" data-pack-ship-estimate aria-live="polite">Enter parcel dimensions and actual weight to preview the fee.</p>
      </section>
      <h3 class="admin-pack-ship-rules-title">Chargeable Weight Fee Bands</h3>
      <p class="admin-pack-ship-rules-help">Add ascending weight limits and a price per parcel. A “No maximum” band covers any weight above the previous limit.</p>
      <div class="admin-pack-ship-list" data-pack-ship-list aria-live="polite"><p>Loading Pack &amp; Ship rules…</p></div>
      <div class="admin-warehouse-fee-actions"><button type="button" class="button button-primary" data-add-pack-ship-rule>Add Weight Band</button><span data-pack-ship-status role="status" aria-live="polite"></span></div>
      </section>
    </dialog>
    <dialog class="admin-fee-rule-dialog" data-fee-dialog="marketplace" aria-labelledby="marketplace-fee-dialog-title">
      <section class="admin-market-panel admin-marketplace-fee-panel admin-fee-rule-dialog-panel">
      <header class="admin-market-panel-heading"><div><span>Seller Fee Rules</span><h2 id="marketplace-fee-dialog-title"><img src="Image/Icon/Icon-04.png" alt="" />Marketplace Fee</h2></div><button type="button" class="admin-fee-dialog-close" data-close-fee-dialog aria-label="Close Marketplace Fee">×</button><p>Set the fee as a percentage of the product selling price. The preview below is for testing only and does not change the saved rule.</p></header>
      <form class="admin-marketplace-fee-config" data-marketplace-fee-settings>
        <label>Marketplace fee (% of product price)<input name="fee_percent" type="number" min="0" max="100" step="0.01" value="0" required /></label>
        <button class="button button-primary" type="submit">Save Fee Rule</button>
      </form>
      <section class="admin-marketplace-fee-preview" aria-labelledby="marketplace-fee-preview-title">
        <header><h3 id="marketplace-fee-preview-title">Test Fee Preview</h3><p>Enter a sample product price to see the fee amount. This value is not saved.</p></header>
        <label>Sample product price (MYR)<input data-marketplace-product-price type="number" min="0" step="0.01" value="100" /></label>
        <p class="admin-marketplace-fee-estimate" data-marketplace-fee-estimate aria-live="polite">A 0% fee on RM 100.00 is RM 0.00.</p>
      </section>
      <p class="admin-marketplace-fee-status" data-marketplace-fee-status role="status" aria-live="polite"></p>
      </section>
    </dialog>
    <a class="admin-portal-customer-link" href="#admin-seller-management">Back to Manage Sellers</a>
  </main>`;
}

function ruleRow(rule = {}) {
  const id = String(rule.id || '');
  return `<form class="admin-warehouse-fee-row" data-warehouse-fee-row data-rule-id="${escapeHTML(id)}">
    <label>Storage type<input name="storage_type" required maxlength="100" value="${escapeHTML(rule.storage_type || '')}" placeholder="e.g. Standard shelf" /></label>
    <label>Billing unit<input name="billing_unit" required maxlength="60" value="${escapeHTML(rule.billing_unit || '')}" placeholder="e.g. sq ft, pallet, rack" /></label>
    <label>Price per unit / month (MYR)<input name="price_per_unit" type="number" min="0" step="0.01" required value="${Number(rule.price_per_unit || 0).toFixed(2)}" /></label>
    <label class="admin-warehouse-fee-active"><span>Rule status</span><select name="is_active"><option value="true" ${rule.is_active !== false ? 'selected' : ''}>Active</option><option value="false" ${rule.is_active === false ? 'selected' : ''}>Inactive</option></select></label>
    <div class="admin-warehouse-fee-row-actions"><button type="submit" class="button button-primary">Save Rule</button>${id ? '<button type="button" class="button admin-warehouse-fee-delete" data-delete-warehouse-fee aria-label="Delete warehouse fee rule" title="Delete warehouse fee rule"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg></button>' : '<button type="button" class="button button-light" data-remove-warehouse-fee-draft>Cancel</button>'}</div>
    <small class="admin-warehouse-fee-saved">${id ? `${escapeHTML(rule.is_active === false ? 'Inactive' : 'Active')} · ${escapeHTML(money(rule.price_per_unit))} per ${escapeHTML(rule.billing_unit || 'unit')} / month` : 'Unsaved rule'}</small>
  </form>`;
}

export function setupAdminFeeRules() {
  const root = document.querySelector('.admin-fee-rules-page');
  if (!root) return;
  root.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-fee-dialog]');
    if (openButton) {
      root.querySelector(`[data-fee-dialog="${openButton.dataset.openFeeDialog}"]`)?.showModal();
      return;
    }
    const closeButton = event.target.closest('[data-close-fee-dialog]');
    if (closeButton) {
      closeButton.closest('dialog')?.close();
      return;
    }
    if (event.target.matches('.admin-fee-rule-dialog')) event.target.close();
  });
  const list = root.querySelector('[data-warehouse-fee-list]');
  const status = root.querySelector('[data-warehouse-fee-status]');
  const addButton = root.querySelector('[data-add-warehouse-fee-rule]');
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const load = async () => {
    list.innerHTML = '<p>Loading warehouse fee rules…</p>';
    const { data, error } = await supabase.rpc('admin_warehouse_fee_rules_list');
    if (error) {
      list.innerHTML = '<p class="admin-warehouse-fee-empty">Warehouse fee rules could not load.</p>';
      setStatus(`Apply the warehouse fee rules migration in Supabase, then reload. ${error.message}`, true);
      return;
    }
    const rules = Array.isArray(data) ? data : [];
    list.innerHTML = rules.length
      ? rules.map((rule) => ruleRow(rule)).join('')
      : '<p class="admin-warehouse-fee-empty">No storage types have been set up yet. Add the first rule below.</p>';
    setStatus('');
  };

  addButton.addEventListener('click', () => {
    list.querySelector('[data-warehouse-fee-row][data-rule-id=""]')?.remove();
    list.insertAdjacentHTML('beforeend', ruleRow({ is_active: true }));
    list.querySelector('[data-warehouse-fee-row][data-rule-id=""] input[name="storage_type"]')?.focus();
  });

  list.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-warehouse-fee-row]');
    if (!form) return;
    event.preventDefault();
    const values = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setStatus('Saving rule…');
    const { error } = await supabase.rpc('admin_warehouse_fee_rule_save', {
      p_id: form.dataset.ruleId || null,
      p_storage_type: String(values.get('storage_type') || '').trim(),
      p_billing_unit: String(values.get('billing_unit') || '').trim(),
      p_price_per_unit: Number(values.get('price_per_unit')),
      p_is_active: values.get('is_active') === 'true',
    });
    if (error) {
      submit.disabled = false;
      setStatus(`Rule could not be saved: ${error.message}`, true);
      return;
    }
    setStatus('Warehouse fee rule saved.');
    await load();
  });

  list.addEventListener('click', async (event) => {
    if (event.target.closest('[data-remove-warehouse-fee-draft]')) {
      event.target.closest('[data-warehouse-fee-row]')?.remove();
      return;
    }
    const remove = event.target.closest('[data-delete-warehouse-fee]');
    if (!remove) return;
    const form = remove.closest('[data-warehouse-fee-row]');
    if (!window.confirm('Delete this warehouse fee rule? Seller allocation records use saved rate snapshots and will be kept. Rules still assigned to a seller cannot be deleted.')) return;
    remove.disabled = true;
    setStatus('Deleting rule…');
    const { error } = await supabase.rpc('admin_warehouse_fee_rule_delete', { p_id: form.dataset.ruleId });
    if (error) {
      remove.disabled = false;
      setStatus(`Rule could not be deleted: ${error.message}`, true);
      return;
    }
    setStatus('Warehouse fee rule deleted.');
    await load();
  });

  void load();

  setupPackShipRules(root);
  setupMarketplaceFeeRule(root);
}

function setupMarketplaceFeeRule(root) {
  const form = root.querySelector('[data-marketplace-fee-settings]');
  const productPrice = root.querySelector('[data-marketplace-product-price]');
  const estimate = root.querySelector('[data-marketplace-fee-estimate]');
  const status = root.querySelector('[data-marketplace-fee-status]');
  if (!form || !productPrice || !estimate || !status) return;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const refreshEstimate = () => {
    const percent = Math.max(0, Number(form.elements.fee_percent.value || 0));
    const price = Math.max(0, Number(productPrice.value || 0));
    estimate.textContent = `${percent.toFixed(2)}% of ${money(price)} is ${money(price * percent / 100)} per item.`;
  };
  const load = async () => {
    const { data, error } = await supabase.rpc('admin_marketplace_fee_rule_get');
    if (error) {
      setStatus(`Apply migration 0133 in Supabase, then reload. ${error.message}`, true);
      return;
    }
    form.elements.fee_percent.value = String(Number(data?.fee_percent || 0));
    refreshEstimate();
  };

  form.addEventListener('input', refreshEstimate);
  productPrice.addEventListener('input', refreshEstimate);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const feePercent = Number(form.elements.fee_percent.value);
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      setStatus('Enter a fee percentage from 0 to 100.', true);
      return;
    }
    button.disabled = true;
    setStatus('Saving Marketplace Fee rule…');
    const { error } = await supabase.rpc('admin_marketplace_fee_rule_save', { p_fee_percent: feePercent });
    button.disabled = false;
    if (error) {
      setStatus(`Marketplace Fee rule could not be saved: ${error.message}`, true);
      return;
    }
    setStatus('Marketplace Fee rule saved.');
    refreshEstimate();
  });

  void load();
}

const weightText = (value) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`;

function packShipBandLabel(rule, index, rules) {
  const previous = rules.slice(0, index).filter((item) => item.max_chargeable_weight_kg !== null).at(-1);
  if (rule.max_chargeable_weight_kg === null) return previous ? `Above ${weightText(previous.max_chargeable_weight_kg)}` : 'Any chargeable weight';
  return previous
    ? `Above ${weightText(previous.max_chargeable_weight_kg)} to ${weightText(rule.max_chargeable_weight_kg)}`
    : `Up to ${weightText(rule.max_chargeable_weight_kg)}`;
}

function packShipRuleRow(rule = {}, index = 0, rules = []) {
  const id = String(rule.id || '');
  const openEnded = rule.max_chargeable_weight_kg === null;
  const displayBand = id ? packShipBandLabel(rule, index, rules) : 'New weight band';
  return `<form class="admin-pack-ship-tier" data-pack-ship-tier data-rule-id="${escapeHTML(id)}">
    <div class="admin-pack-ship-tier-heading"><strong>${escapeHTML(displayBand)}</strong>${id ? '<span>Saved rate</span>' : '<span>New rate</span>'}</div>
    <label>Maximum chargeable weight (kg)<input name="max_chargeable_weight_kg" type="number" min="0.001" step="0.001" value="${openEnded ? '' : Number(rule.max_chargeable_weight_kg || 0)}" ${openEnded ? 'disabled' : ''} placeholder="e.g. 1" /></label>
    <label class="admin-pack-ship-open-ended"><input name="no_maximum" type="checkbox" ${openEnded ? 'checked' : ''} /> No maximum (final band)</label>
    <label>Price per parcel (MYR)<input name="rate_myr" type="number" min="0" step="0.01" required value="${Number(rule.rate_myr || 0).toFixed(2)}" /></label>
    <div class="admin-pack-ship-tier-actions"><button type="submit" class="button button-primary">Save Band</button>${id ? '<button type="button" class="button button-light" data-delete-pack-ship-tier>Delete</button>' : '<button type="button" class="button button-light" data-remove-pack-ship-draft>Cancel</button>'}</div>
  </form>`;
}

function setupPackShipRules(root) {
  const list = root.querySelector('[data-pack-ship-list]');
  const status = root.querySelector('[data-pack-ship-status]');
  const addButton = root.querySelector('[data-add-pack-ship-rule]');
  const settingsForm = root.querySelector('[data-pack-ship-settings]');
  const estimate = root.querySelector('[data-pack-ship-estimate]');
  let volumetricDivisor = 5000;
  let rules = [];
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const refreshEstimate = () => {
    const getDimension = (key) => Number(root.querySelector(`[data-pack-dimension="${key}"]`)?.value || 0);
    const length = getDimension('length');
    const width = getDimension('width');
    const height = getDimension('height');
    const actualWeight = getDimension('weight');
    if (!(length > 0 && width > 0 && height > 0) || actualWeight < 0) {
      estimate.textContent = 'Enter parcel dimensions and actual weight to preview the fee.';
      return;
    }
    const volumetricWeight = (length * width * height) / Math.max(volumetricDivisor, 1);
    const chargeableWeight = Math.max(actualWeight, volumetricWeight);
    const matchingRule = rules.find((rule) => rule.max_chargeable_weight_kg === null || chargeableWeight <= Number(rule.max_chargeable_weight_kg));
    const prefix = `Volumetric weight ${weightText(volumetricWeight)} · Chargeable weight ${weightText(chargeableWeight)}`;
    estimate.textContent = matchingRule
      ? `${prefix} · Pack & Ship fee ${money(matchingRule.rate_myr)}`
      : `${prefix} · No fee band covers this weight yet.`;
  };
  const load = async () => {
    list.innerHTML = '<p>Loading Pack &amp; Ship rules…</p>';
    const { data, error } = await supabase.rpc('admin_pack_ship_fee_rules_list');
    if (error) {
      list.innerHTML = '<p class="admin-warehouse-fee-empty">Pack &amp; Ship rules could not load.</p>';
      setStatus(`Apply migration 0131 in Supabase, then reload. ${error.message}`, true);
      return;
    }
    const payload = data && typeof data === 'object' ? data : {};
    volumetricDivisor = Number(payload.volumetric_divisor || 5000);
    settingsForm.elements.volumetric_divisor.value = String(volumetricDivisor);
    rules = Array.isArray(payload.rules) ? payload.rules : [];
    list.innerHTML = rules.length
      ? rules.map((rule, index) => packShipRuleRow(rule, index, rules)).join('')
      : '<p class="admin-warehouse-fee-empty">No Pack &amp; Ship bands have been set up yet. Add the first rate below.</p>';
    setStatus('');
    refreshEstimate();
  };

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = settingsForm.querySelector('[type="submit"]');
    const divisor = Number(new FormData(settingsForm).get('volumetric_divisor'));
    if (!(divisor > 0)) {
      setStatus('Enter a volumetric divisor greater than zero.', true);
      return;
    }
    button.disabled = true;
    setStatus('Saving divisor…');
    const { error } = await supabase.rpc('admin_pack_ship_fee_divisor_save', { p_volumetric_divisor: divisor });
    button.disabled = false;
    if (error) {
      setStatus(`Divisor could not be saved: ${error.message}`, true);
      return;
    }
    volumetricDivisor = divisor;
    setStatus('Volumetric divisor saved.');
    refreshEstimate();
  });

  addButton.addEventListener('click', () => {
    list.querySelector('[data-pack-ship-tier][data-rule-id=""]')?.remove();
    list.insertAdjacentHTML('beforeend', packShipRuleRow());
    list.querySelector('[data-pack-ship-tier][data-rule-id=""] input[name="max_chargeable_weight_kg"]')?.focus();
  });

  list.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[name="no_maximum"]');
    if (!checkbox) return;
    const maxInput = checkbox.closest('[data-pack-ship-tier]')?.querySelector('[name="max_chargeable_weight_kg"]');
    if (!maxInput) return;
    maxInput.disabled = checkbox.checked;
    maxInput.required = !checkbox.checked;
    if (checkbox.checked) maxInput.value = '';
  });

  list.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-pack-ship-tier]');
    if (!form) return;
    event.preventDefault();
    const values = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    const noMaximum = values.get('no_maximum') === 'on';
    const maxWeight = noMaximum ? null : Number(values.get('max_chargeable_weight_kg'));
    const rate = Number(values.get('rate_myr'));
    if ((!noMaximum && !(maxWeight > 0)) || !(rate >= 0)) {
      setStatus('Enter a positive maximum weight, or choose No maximum, and a non-negative parcel price.', true);
      return;
    }
    button.disabled = true;
    setStatus('Saving weight band…');
    const { error } = await supabase.rpc('admin_pack_ship_fee_rule_save', {
      p_id: form.dataset.ruleId || null,
      p_max_chargeable_weight_kg: maxWeight,
      p_rate_myr: rate,
    });
    if (error) {
      button.disabled = false;
      setStatus(`Weight band could not be saved: ${error.message}`, true);
      return;
    }
    setStatus('Pack & Ship weight band saved.');
    await load();
  });

  list.addEventListener('click', async (event) => {
    if (event.target.closest('[data-remove-pack-ship-draft]')) {
      event.target.closest('[data-pack-ship-tier]')?.remove();
      return;
    }
    const deleteButton = event.target.closest('[data-delete-pack-ship-tier]');
    if (!deleteButton) return;
    const form = deleteButton.closest('[data-pack-ship-tier]');
    if (!window.confirm('Delete this Pack & Ship weight band?')) return;
    deleteButton.disabled = true;
    setStatus('Deleting weight band…');
    const { error } = await supabase.rpc('admin_pack_ship_fee_rule_delete', { p_id: form.dataset.ruleId });
    if (error) {
      deleteButton.disabled = false;
      setStatus(`Weight band could not be deleted: ${error.message}`, true);
      return;
    }
    setStatus('Pack & Ship weight band deleted.');
    await load();
  });

  root.querySelectorAll('[data-pack-dimension]').forEach((input) => input.addEventListener('input', refreshEstimate));
  void load();
}
