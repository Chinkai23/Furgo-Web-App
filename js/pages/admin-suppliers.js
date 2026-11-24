import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

export function adminSuppliersPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  return `<main class="admin-portal-page admin-access-page admin-suppliers-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}</span><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>Advanced Management</span><h1>Manage Store</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Warehouse access</span><h2>Stores</h2></div><p>Add accounts directly to the relevant warehouse. Accounts assigned to the same store share its products, stock batches, and inventory history.</p></div>
      <div id="managed-supplier-list" class="admin-team-list" data-managed-suppliers role="status" aria-live="polite">Loading stores…</div>
    </section>
  </main>`;
}

export function setupAdminSuppliers() {
  const root = document.querySelector('.admin-suppliers-page');
  if (!root) return;
  const supplierList = root.querySelector('[data-managed-suppliers]');
  let suppliers = [];

  const loadSuppliers = async () => {
    supplierList.textContent = 'Loading stores…';
    const [{ data, error }, { data: summaryData, error: summaryError }] = await Promise.all([
      supabase.rpc('get_marketplace_supplier_accounts'),
      supabase.rpc('get_marketplace_store_warehouse_summaries'),
    ]);
    if (error) { supplierList.textContent = `Store accounts could not load: ${error.message}`; return; }
    suppliers = data || [];
    const summaries = new Map((Array.isArray(summaryData) ? summaryData : []).map((summary) => [
      String(summary.store_key || '').trim().toLocaleLowerCase(), summary,
    ]));
    const groups = new Map();
    for (const account of suppliers) {
      const key = String(account.supplier_name || '').trim().toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, { name: String(account.supplier_name || 'Store').trim(), accounts: [] });
      if (account.supplier_user_id) groups.get(key).accounts.push(account);
    }
    supplierList.innerHTML = groups.size ? [...groups.values()].map((store) => {
      const summary = summaries.get(store.name.toLocaleLowerCase());
      const summaryAvailable = !summaryError && Boolean(summary);
      const productTypes = summaryAvailable ? Number(summary.product_types || 0) : null;
      const totalStock = summaryAvailable ? Number(summary.total_stock || 0) : null;
      const accountsMarkup = store.accounts.length
        ? store.accounts.map((account) => `<li><div><strong>${escapeHTML(account.display_name || account.email || 'Furgo user')}</strong><span>${escapeHTML(account.email || 'Email unavailable')}</span></div><button class="button admin-store-remove-account-button" type="button" data-remove-store-account="${escapeHTML(account.supplier_user_id)}" data-store-name="${escapeHTML(store.name)}" data-account-label="${escapeHTML(account.email || account.display_name || 'this account')}">Remove from Store</button></li>`).join('')
        : '<li class="admin-store-empty-accounts">No accounts assigned. This warehouse remains available to assign later.</li>';
      const assignAccountMarkup = `<form class="admin-store-account-add-form" data-store-account-form data-store-name="${escapeHTML(store.name)}"><label>Add account to this Store<input name="email" type="email" autocomplete="email" placeholder="Enter one account email" required /></label><div><button class="button button-primary" type="submit">Assign Account</button><span role="status" aria-live="polite"></span></div></form>`;
      const deleteBlocked = !summaryAvailable;
      const statsNotice = summaryAvailable ? '' : 'Warehouse totals could not load. Apply migration 0099 and refresh.';
      const deleteNote = 'This store has stock in its warehouse. Reduce all batches to zero before deleting the store.';
      const deleteTitle = 'Warehouse stock total is unavailable.';
      const deleteAttributes = deleteBlocked
        ? `disabled aria-disabled="true" title="${escapeHTML(deleteTitle)}"`
        : '';
      const storeSettingsMarkup = `<section class="admin-store-settings" data-store-settings hidden aria-label="${escapeHTML(store.name)} settings"><h4>Store Settings</h4><form class="admin-supplier-company-form" data-store-rename-form data-store-name="${escapeHTML(store.name)}"><label>Store name<input name="companyName" value="${escapeHTML(store.name)}" maxlength="100" required /></label><button class="button button-primary" type="submit">Save Name</button><span role="status" aria-live="polite"></span></form><button class="button admin-store-delete-button" type="button" data-delete-store="${escapeHTML(store.name)}" data-store-stock-total="${summaryAvailable ? totalStock : ''}" ${deleteAttributes}>Delete Store</button><p class="admin-store-delete-note" data-store-delete-warning hidden>${escapeHTML(deleteNote)}</p></section>`;
      const productTypesText = productTypes === null ? '—' : String(productTypes);
      const totalStockText = totalStock === null
        ? '—'
        : `${totalStock.toLocaleString()} ${totalStock === 1 ? 'unit' : 'units'}`;
      const statsNoticeMarkup = statsNotice
        ? `<p class="admin-store-metrics-notice" role="status">${escapeHTML(statsNotice)}</p>`
        : '';
      const ownerIds = store.accounts.map((account) => String(account.supplier_user_id || '')).filter(Boolean);
      const warehouseEntryMarkup = `<button class="button admin-store-open-warehouse-button" type="button" data-open-store-warehouse="${escapeHTML(store.name)}" data-store-owner-ids="${escapeHTML(ownerIds.join(','))}">Open Store Portal</button>`;
      return `<article class="admin-store-group">
        <div class="admin-store-group-heading">
          <div><span>Warehouse</span><h3>${escapeHTML(store.name)}</h3><small>${store.accounts.length} ${store.accounts.length === 1 ? 'account' : 'accounts'}</small></div>
          <div class="admin-store-group-actions">${warehouseEntryMarkup}<button class="button admin-store-settings-button" type="button" data-toggle-store-settings aria-expanded="false" aria-label="Store settings for ${escapeHTML(store.name)}"><img src="Image/Icon/Icon-19.png" alt="" /></button></div>
        </div>
        ${storeSettingsMarkup}
        <div class="admin-store-metrics" aria-label="Warehouse details">
          <div><span>Product types</span><strong>${productTypesText}</strong></div>
          <div><span>Total stock</span><strong>${totalStockText}</strong></div>
        </div>
        ${statsNoticeMarkup}
        <ul class="admin-store-account-list">${accountsMarkup}</ul>
        ${assignAccountMarkup}
      </article>`;
    }).join('') : '<p class="admin-market-empty">No stores assigned yet.</p>';
  };

  supplierList?.addEventListener('submit', async (event) => {
    const assignmentForm = event.target.closest('[data-store-account-form]');
    if (assignmentForm) {
      event.preventDefault();
      const status = assignmentForm.querySelector('[role="status"]');
      const email = String(new FormData(assignmentForm).get('email') || '').trim();
      if (!email) { status.textContent = 'Enter one account email.'; return; }
      status.textContent = 'Assigning account…';
      const { error } = await supabase.rpc('assign_marketplace_store_accounts', {
        p_emails: [email],
        p_supplier_name: assignmentForm.dataset.storeName,
      });
      if (error) { status.textContent = error.message || 'Store access could not be assigned.'; return; }
      await loadSuppliers();
      return;
    }
    const companyForm = event.target.closest('[data-store-rename-form]');
    if (!companyForm) return;
    event.preventDefault();
    const status = companyForm.querySelector('[role="status"]');
    status.textContent = 'Saving…';
    const { error } = await supabase.rpc('rename_marketplace_store', {
      p_current_store_name: companyForm.dataset.storeName,
      p_supplier_name: String(new FormData(companyForm).get('companyName') || '').trim(),
    });
    if (error) { status.textContent = error.message || 'Company name could not be saved.'; return; }
    status.textContent = 'Saved.';
    await loadSuppliers();
  });

  supplierList?.addEventListener('click', async (event) => {
    const openWarehouseButton = event.target.closest('[data-open-store-warehouse]');
    if (openWarehouseButton) {
      openWarehouseButton.disabled = true;
      const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      const currentOwnerIds = String(openWarehouseButton.dataset.storeOwnerIds || '').split(',').filter(Boolean);
      const { data: historicalOwnerIds, error: ownerError } = await supabase.rpc('get_marketplace_store_warehouse_owner_ids', {
        p_store_name: openWarehouseButton.dataset.openStoreWarehouse,
      });
      if (ownerError) {
        openWarehouseButton.disabled = false;
        window.alert(ownerError.message || 'The warehouse could not be opened.');
        return;
      }
      const ownerIds = [...new Set([...currentOwnerIds, ...(historicalOwnerIds || [])].filter(Boolean))];
      const context = {
        storeName: openWarehouseButton.dataset.openStoreWarehouse,
        ownerIds: ownerIds.length ? ownerIds : [profile.id].filter(Boolean),
        enteredAt: Date.now(),
      };
      sessionStorage.setItem('furgo-director-store-context', JSON.stringify(context));
      window.location.hash = '#supplier?tab=home&directorStore=1';
      return;
    }
    const settingsButton = event.target.closest('[data-toggle-store-settings]');
    if (settingsButton) {
      const settings = settingsButton.closest('.admin-store-group')?.querySelector('[data-store-settings]');
      if (settings) {
        settings.hidden = !settings.hidden;
        settingsButton.setAttribute('aria-expanded', String(!settings.hidden));
      }
      return;
    }
    const removeAccountButton = event.target.closest('[data-remove-store-account]');
    if (removeAccountButton) {
      const accountId = removeAccountButton.dataset.removeStoreAccount;
      const storeName = removeAccountButton.dataset.storeName;
      const accountLabel = removeAccountButton.dataset.accountLabel;
      if (!window.confirm(`Remove ${accountLabel} from “${storeName}”? This removes their Store Portal access, but keeps the warehouse and its stock.`)) return;
      removeAccountButton.disabled = true;
      const { error } = await supabase.rpc('remove_marketplace_store_account', {
        p_supplier_name: storeName,
        p_supplier_user_id: accountId,
      });
      if (error) {
        window.alert(error.message || 'The account could not be removed from this Store.');
        removeAccountButton.disabled = false;
        return;
      }
      await loadSuppliers();
      return;
    }
    const button = event.target.closest('[data-delete-store]');
    if (!button || button.disabled) return;
    const stockTotal = Number(button.dataset.storeStockTotal);
    if (Number.isFinite(stockTotal) && stockTotal > 0) {
      const warning = button.parentElement.querySelector('[data-store-delete-warning]');
      if (warning) warning.hidden = false;
      return;
    }
    const storeName = button.dataset.deleteStore;
    if (!window.confirm(`Delete “${storeName}” and its warehouse? This removes the store accounts, products, and zero-stock batches permanently.`)) return;
    button.disabled = true;
    const { error } = await supabase.rpc('delete_marketplace_store', { p_supplier_name: storeName });
    if (error) {
      window.alert(error.message || 'The store could not be deleted.');
      button.disabled = false;
      return;
    }
    await loadSuppliers();
  });

  void loadSuppliers();
}
