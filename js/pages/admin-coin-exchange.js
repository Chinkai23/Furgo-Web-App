import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const rewardTypes = [
  ['voucher', 'Voucher'], ['physical-gift', 'Physical gift'],
  ['digital-reward', 'Digital reward'], ['other', 'Other'],
];
const voucherCategories = [
  ['marketplace', 'Marketplace'], ['grooming', 'Grooming'], ['pet-hotel', 'Pet Hotel'],
  ['pet-daycare', 'Pet Daycare'], ['pet-taxi', 'Pet Taxi'],
];

export function adminCoinExchangePage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  return `<main class="admin-portal-page admin-market-management-page admin-coin-exchange-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || profile.email || 'Admin')}</span><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>General Management</span><h1>Manage Coin Exchange</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Reward setup</span><h2 data-coin-exchange-form-title>Add an Exchange Reward</h2></div><p>Create a voucher, gift, or digital reward customers can redeem with Furgo Coins. Set the availability window and redemption limits.</p></div>
      <form class="admin-market-form-grid admin-coin-exchange-form" data-coin-exchange-form>
        <label>Reward name<input name="name" maxlength="120" required placeholder="e.g. RM5 Marketplace Voucher" /></label>
        <label>Furgo Coins required<input name="coinCost" type="number" min="1" step="1" required placeholder="500" /></label>
        <label>Reward type<select name="rewardType">${rewardTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
        <label data-coin-voucher-field hidden>Voucher applies to<select name="voucherCategory">${voucherCategories.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><small>Customers will only see this voucher at the matching checkout.</small></label>
        <label data-coin-voucher-field hidden>Discount type<select name="voucherDiscountType"><option value="fixed">Fixed MYR amount</option><option value="percent">Percentage</option></select></label>
        <label data-coin-voucher-field hidden>Discount value<input name="voucherDiscountValue" type="number" min="0.01" step="0.01" value="5" /></label>
        <label data-coin-voucher-field hidden>Minimum spend (MYR)<input name="voucherMinimumSpend" type="number" min="0" step="0.01" value="0" /></label>
        <label>Maximum redemptions<input name="maxRedemptions" type="number" min="1" step="1" required placeholder="100" /><small>Overall stock limit. Must be at least the number already redeemed.</small></label>
        <label>Limit per customer<input name="perUserLimit" type="number" min="1" max="100" step="1" value="1" required /></label>
        <label>Starts at<input name="startsAt" type="datetime-local" /></label>
        <label>Expires at<input name="expiresAt" type="datetime-local" /><small>Leave blank if this reward has no expiry.</small></label>
        <label class="admin-coin-exchange-image-field">Reward image<input name="image" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPG, or WEBP · up to 5 MB</small><img data-coin-exchange-preview alt="Reward image preview" hidden /></label>
        <label class="admin-coin-exchange-wide">Description<textarea name="description" maxlength="1200" rows="3" placeholder="What the customer receives and how to claim it"></textarea></label>
        <label class="admin-coin-exchange-wide">Terms and redemption instructions<textarea name="terms" maxlength="1200" rows="3" placeholder="Include restrictions, delivery details, and how to use the reward"></textarea></label>
        <label class="admin-coin-exchange-active"><input name="isActive" type="checkbox" checked /> Show this reward to customers when it is within its availability dates</label>
        <input name="id" type="hidden" /><input name="imageUrl" type="hidden" />
        <div class="admin-market-form-actions admin-coin-exchange-actions"><button class="button button-primary" type="submit" data-coin-exchange-save>Save Reward</button><button class="button button-light" type="button" data-coin-exchange-cancel hidden>Cancel edit</button><span data-coin-exchange-feedback role="status" aria-live="polite"></span></div>
      </form>
    </section>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Current catalogue</span><h2>Exchange Rewards</h2></div><p>Customers can redeem active rewards during their availability window, while stock remains.</p></div><div class="admin-coin-exchange-list" data-coin-exchange-list role="status" aria-live="polite">Loading rewards…</div></section>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer activity</span><h2>Recent Redemptions</h2></div><p>Mark physical or manually issued rewards as fulfilled after delivery or handover.</p></div><div class="admin-coin-redemption-list" data-coin-redemption-list role="status" aria-live="polite">Loading redemptions…</div><p class="admin-coin-exchange-feedback" data-redemption-feedback role="status" aria-live="polite"></p></section>
  </main>`;
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function setupAdminCoinExchange() {
  const root = document.querySelector('.admin-coin-exchange-page');
  const form = root?.querySelector('[data-coin-exchange-form]');
  const list = root?.querySelector('[data-coin-exchange-list]');
  const redemptionList = root?.querySelector('[data-coin-redemption-list]');
  if (!root || !form || !list || !redemptionList) return;

  const feedback = form.querySelector('[data-coin-exchange-feedback]');
  const saveButton = form.querySelector('[data-coin-exchange-save]');
  const cancelButton = form.querySelector('[data-coin-exchange-cancel]');
  const preview = form.querySelector('[data-coin-exchange-preview]');
  const voucherFields = [...form.querySelectorAll('[data-coin-voucher-field]')];
  const updateVoucherFields = () => {
    const show = form.elements.rewardType.value === 'voucher';
    voucherFields.forEach((field) => { field.hidden = !show; });
    form.elements.voucherDiscountValue.required = show;
  };
  const redemptionFeedback = root.querySelector('[data-redemption-feedback]');
  const loadRedemptions = async () => {
    const { data, error } = await supabase.from('furgo_coin_exchange_redemptions')
      .select('id,reward_name,user_id,coin_cost,status,created_at,fulfilled_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) {
      redemptionList.innerHTML = `<p class="admin-market-empty">Redemptions could not load: ${escapeHTML(error.message)}.</p>`;
      return;
    }
    redemptionList.innerHTML = data?.length ? data.map((row) => `<article class="admin-coin-redemption-item"><div><h3>${escapeHTML(row.reward_name)}</h3><p>${Number(row.coin_cost).toLocaleString()} Coins · Customer ${escapeHTML(row.user_id.slice(0, 8))} · ${escapeHTML(new Date(row.created_at).toLocaleString('en-MY'))}</p></div><span class="admin-coin-exchange-state ${row.status === 'fulfilled' ? 'is-active' : ''}">${row.status === 'fulfilled' ? 'Fulfilled' : 'Pending'}</span>${row.status === 'pending' ? `<button class="button button-light" type="button" data-fulfill-coin-redemption="${escapeHTML(row.id)}">Mark Fulfilled</button>` : ''}</article>`).join('') : '<p class="admin-market-empty">No customer redemptions yet.</p>';
  };
  const loadItems = async () => {
    list.textContent = 'Loading rewards…';
    const { data, error } = await supabase.from('furgo_coin_exchange_items')
      .select('id,name,description,reward_type,voucher_category,voucher_discount_type,voucher_discount_value,voucher_minimum_spend,coin_cost,starts_at,expires_at,max_redemptions,redeemed_count,per_user_limit,image_url,terms,is_active,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      list.innerHTML = `<p class="admin-market-empty">Rewards could not load: ${escapeHTML(error.message)}. Apply the Furgo Coins exchange Supabase migration to enable management.</p>`;
      return;
    }
    const items = data || [];
    if (!items.length) {
      list.innerHTML = '<p class="admin-market-empty">No exchange rewards yet. Add the first reward using the form above.</p>';
      return;
    }
    list.innerHTML = items.map((item) => {
      const remaining = Math.max(0, Number(item.max_redemptions) - Number(item.redeemed_count));
      const image = item.image_url ? `<img src="${escapeHTML(item.image_url)}" alt="" loading="lazy" />` : '<div class="admin-coin-exchange-placeholder" aria-hidden="true">FC</div>';
      const dates = `${item.starts_at ? `Starts ${escapeHTML(new Date(item.starts_at).toLocaleString('en-MY'))}` : 'Available now'}${item.expires_at ? ` · Expires ${escapeHTML(new Date(item.expires_at).toLocaleString('en-MY'))}` : ' · No expiry'}`;
      const voucherDetails = item.reward_type === 'voucher' ? `<div><dt>Applies to</dt><dd>${escapeHTML(voucherCategories.find(([value]) => value === item.voucher_category)?.[1] || 'Marketplace')}</dd></div><div><dt>Discount</dt><dd>${item.voucher_discount_type === 'percent' ? `${Number(item.voucher_discount_value)}% off` : `MYR ${Number(item.voucher_discount_value).toFixed(2)} off`}${Number(item.voucher_minimum_spend) ? ` · Min MYR ${Number(item.voucher_minimum_spend).toFixed(2)}` : ''}</dd></div>` : '';
      return `<article class="admin-coin-exchange-item" data-coin-exchange-item="${escapeHTML(item.id)}" data-redeemed="${Number(item.redeemed_count)}">${image}<div class="admin-coin-exchange-item-main"><div class="admin-coin-exchange-item-title"><h3>${escapeHTML(item.name)}</h3><span class="admin-coin-exchange-state ${item.is_active ? 'is-active' : ''}">${item.is_active ? 'Active' : 'Hidden'}</span></div><p>${escapeHTML(item.description || 'No description provided.')}</p><dl><div><dt>Cost</dt><dd>${Number(item.coin_cost).toLocaleString()} Coins</dd></div>${voucherDetails}<div><dt>Stock</dt><dd>${remaining} left · ${Number(item.redeemed_count)} redeemed</dd></div><div><dt>Per customer</dt><dd>${Number(item.per_user_limit)}</dd></div><div><dt>Availability</dt><dd>${dates}</dd></div></dl></div><div class="admin-coin-exchange-item-actions"><button class="button button-light" type="button" data-edit-coin-reward="${escapeHTML(item.id)}">Edit</button><button class="button button-light" type="button" data-toggle-coin-reward="${escapeHTML(item.id)}" data-active="${item.is_active}">${item.is_active ? 'Hide' : 'Show'}</button></div></article>`;
    }).join('');
  };

  const clearForm = () => {
    form.reset();
    form.elements.id.value = '';
    form.elements.imageUrl.value = '';
    form.elements.perUserLimit.value = '1';
    form.elements.isActive.checked = true;
    form.elements.maxRedemptions.min = '1';
    form.elements.voucherCategory.value = 'marketplace';
    form.elements.voucherDiscountType.value = 'fixed';
    form.elements.voucherDiscountValue.value = '5';
    form.elements.voucherMinimumSpend.value = '0';
    updateVoucherFields();
    if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
    root.querySelector('[data-coin-exchange-form-title]').textContent = 'Add an Exchange Reward';
    saveButton.textContent = 'Save Reward';
    cancelButton.hidden = true;
    if (feedback) feedback.textContent = '';
  };

  form.elements.rewardType.addEventListener('change', updateVoucherFields);
  updateVoucherFields();

  form.elements.image.addEventListener('change', () => {
    const file = form.elements.image.files?.[0];
    if (!preview) return;
    if (!file) { preview.hidden = true; preview.removeAttribute('src'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      form.elements.image.value = '';
      if (feedback) feedback.textContent = 'Choose a PNG, JPG, or WEBP image no larger than 5 MB.';
      preview.hidden = true;
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  cancelButton.addEventListener('click', clearForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const itemId = String(data.get('id') || '');
    const max = Number(data.get('maxRedemptions'));
    const current = itemId ? list.querySelector(`[data-coin-exchange-item="${CSS.escape(itemId)}"]`) : null;
    const redeemed = Number(current?.dataset.redeemed || 0);
    if (!Number.isInteger(max) || max < Math.max(1, redeemed)) {
      if (feedback) feedback.textContent = `Maximum redemptions must be at least ${Math.max(1, redeemed)}.`;
      return;
    }
    saveButton.disabled = true;
    if (feedback) feedback.textContent = 'Saving reward…';
    let imageUrl = String(data.get('imageUrl') || '');
    let uploadedPath = '';
    try {
      const imageFile = form.elements.image.files?.[0];
      if (imageFile) {
        const safeName = imageFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        uploadedPath = `${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('furgo-coin-rewards').upload(uploadedPath, imageFile, { contentType: imageFile.type, upsert: false, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('furgo-coin-rewards').getPublicUrl(uploadedPath).data.publicUrl;
      }
      const startsLocal = String(data.get('startsAt') || '');
      const expiresLocal = String(data.get('expiresAt') || '');
      const payload = {
        name: String(data.get('name') || '').trim(),
        description: String(data.get('description') || '').trim(),
        reward_type: String(data.get('rewardType') || 'voucher'),
        voucher_category: String(data.get('voucherCategory') || 'marketplace'),
        voucher_discount_type: String(data.get('voucherDiscountType') || 'fixed'),
        voucher_discount_value: Number(data.get('voucherDiscountValue') || 0),
        voucher_minimum_spend: Number(data.get('voucherMinimumSpend') || 0),
        coin_cost: Number(data.get('coinCost')),
        starts_at: startsLocal ? new Date(startsLocal).toISOString() : new Date().toISOString(),
        expires_at: expiresLocal ? new Date(expiresLocal).toISOString() : null,
        max_redemptions: max,
        per_user_limit: Number(data.get('perUserLimit')),
        image_url: imageUrl,
        terms: String(data.get('terms') || '').trim(),
        is_active: Boolean(form.elements.isActive.checked),
      };
      if (payload.expires_at && new Date(payload.expires_at) <= new Date(payload.starts_at)) throw new Error('Expiry must be after the start time.');
      const result = itemId
        ? await supabase.from('furgo_coin_exchange_items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', itemId)
        : await supabase.from('furgo_coin_exchange_items').insert(payload);
      if (result.error) throw result.error;
      if (feedback) feedback.textContent = 'Reward saved.';
      clearForm();
      await loadItems();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('furgo-coin-rewards').remove([uploadedPath]).catch(() => {});
      if (feedback) feedback.textContent = error?.message || 'The reward could not be saved.';
    } finally {
      saveButton.disabled = false;
    }
  });

  list.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-coin-reward]');
    const toggle = event.target.closest('[data-toggle-coin-reward]');
    const itemId = edit?.dataset.editCoinReward || toggle?.dataset.toggleCoinReward;
    if (!itemId) return;
    const { data: item, error } = await supabase.from('furgo_coin_exchange_items').select('*').eq('id', itemId).single();
    if (error || !item) { if (feedback) feedback.textContent = error?.message || 'Reward could not be loaded.'; return; }
    if (toggle) {
      toggle.disabled = true;
      const { error: updateError } = await supabase.from('furgo_coin_exchange_items').update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq('id', itemId);
      if (updateError) { toggle.disabled = false; if (feedback) feedback.textContent = updateError.message; return; }
      await loadItems();
      return;
    }
    form.elements.id.value = item.id;
    form.elements.name.value = item.name;
    form.elements.coinCost.value = item.coin_cost;
    form.elements.rewardType.value = item.reward_type;
    form.elements.voucherCategory.value = item.voucher_category || 'marketplace';
    form.elements.voucherDiscountType.value = item.voucher_discount_type || 'fixed';
    form.elements.voucherDiscountValue.value = item.voucher_discount_value ?? 5;
    form.elements.voucherMinimumSpend.value = item.voucher_minimum_spend ?? 0;
    updateVoucherFields();
    form.elements.maxRedemptions.value = item.max_redemptions;
    form.elements.maxRedemptions.min = String(Math.max(1, Number(item.redeemed_count) || 0));
    form.elements.perUserLimit.value = item.per_user_limit;
    form.elements.startsAt.value = dateInputValue(item.starts_at);
    form.elements.expiresAt.value = dateInputValue(item.expires_at);
    form.elements.description.value = item.description || '';
    form.elements.terms.value = item.terms || '';
    form.elements.imageUrl.value = item.image_url || '';
    form.elements.isActive.checked = Boolean(item.is_active);
    if (preview) { preview.src = item.image_url || ''; preview.hidden = !item.image_url; }
    root.querySelector('[data-coin-exchange-form-title]').textContent = 'Edit Exchange Reward';
    saveButton.textContent = 'Save Changes';
    cancelButton.hidden = false;
    if (feedback) feedback.textContent = `Already redeemed ${Number(item.redeemed_count)} time(s).`; 
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  redemptionList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-fulfill-coin-redemption]');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Saving…';
    const { error } = await supabase.rpc('fulfill_furgo_coin_exchange_redemption', { p_redemption_id: button.dataset.fulfillCoinRedemption });
    if (error) {
      button.disabled = false;
      button.textContent = 'Mark Fulfilled';
      if (redemptionFeedback) redemptionFeedback.textContent = error.message;
      return;
    }
    if (redemptionFeedback) redemptionFeedback.textContent = 'Redemption marked as fulfilled.';
    await loadRedemptions();
  });

  void loadItems();
  void loadRedemptions();
}
