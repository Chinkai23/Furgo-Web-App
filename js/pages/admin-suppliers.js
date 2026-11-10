import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

export function adminSuppliersPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  return `<main class="admin-portal-page admin-access-page admin-suppliers-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}</span><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>Advanced Management</span><h1>Manage Supplier</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Marketplace access</span><h2>Assign Supplier Access</h2></div><p>Assign an existing Furgo account to a supplier company. Supplier accounts are managed here, separately from admin access.</p></div>
      <form class="admin-team-form" data-supplier-assignment-form><label>Existing account email<input name="email" type="email" autocomplete="email" placeholder="person@example.com" required /></label><label>Supplier company name<input name="companyName" type="text" autocomplete="organization" maxlength="100" placeholder="Enter supplier company name" required /></label><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Assign Supplier</button><span data-supplier-assignment-feedback role="status" aria-live="polite"></span></div></form>
      <button class="button button-light admin-supplier-list-toggle" type="button" data-toggle-supplier-list aria-expanded="false" aria-controls="managed-supplier-list">Show Supplier List</button>
      <div id="managed-supplier-list" class="admin-team-list" data-managed-suppliers role="status" aria-live="polite" hidden>Loading suppliers…</div>
    </section>
    <section class="admin-market-panel admin-supplier-applications"><div class="admin-market-panel-heading"><div><span>Applications</span><h2>Supplier Requests</h2></div><p>Review customer applications to join the Marketplace as a supplier.</p></div><div data-supplier-applications role="status" aria-live="polite">Loading applications…</div></section>
  </main>`;
}

export function setupAdminSuppliers() {
  const root = document.querySelector('.admin-suppliers-page');
  if (!root) return;
  const form = root.querySelector('[data-supplier-assignment-form]');
  const feedback = root.querySelector('[data-supplier-assignment-feedback]');
  const supplierList = root.querySelector('[data-managed-suppliers]');
  const supplierListToggle = root.querySelector('[data-toggle-supplier-list]');
  const applications = root.querySelector('[data-supplier-applications]');
  let suppliers = [];
  let applicationRows = [];

  supplierListToggle?.addEventListener('click', () => {
    const isExpanded = supplierListToggle.getAttribute('aria-expanded') === 'true';
    supplierListToggle.setAttribute('aria-expanded', String(!isExpanded));
    supplierListToggle.textContent = isExpanded ? 'Show Supplier List' : 'Hide Supplier List';
    supplierList.hidden = isExpanded;
  });

  const loadSuppliers = async () => {
    supplierList.textContent = 'Loading suppliers…';
    const { data, error } = await supabase.rpc('get_marketplace_supplier_accounts');
    if (error) { supplierList.textContent = `Supplier accounts could not load: ${error.message}`; return; }
    suppliers = data || [];
    supplierList.innerHTML = suppliers.length ? suppliers.map((supplier) => {
      return `<article class="admin-team-member"><div><strong>${escapeHTML(supplier.display_name || supplier.email || 'Furgo user')}</strong><small>${escapeHTML(supplier.email || 'Email unavailable')} · Supplier</small><a class="admin-supplier-view-shop" href="#seller?name=${escapeHTML(encodeURIComponent(supplier.supplier_name || ''))}">View Supplier Shop</a></div><form class="admin-supplier-company-form" data-supplier-company-form data-user-id="${escapeHTML(supplier.supplier_user_id)}"><label for="supplier-company-${escapeHTML(supplier.supplier_user_id)}">Supplier company name</label><input id="supplier-company-${escapeHTML(supplier.supplier_user_id)}" name="companyName" value="${escapeHTML(supplier.supplier_name)}" maxlength="100" required /><button class="button button-primary" type="submit">Save</button><span role="status" aria-live="polite"></span></form></article>`;
    }).join('') : '<p class="admin-market-empty">No supplier accounts assigned yet.</p>';
  };

  const loadApplications = async () => {
    applications.textContent = 'Loading applications…';
    const { data, error } = await supabase.rpc('get_furgo_role_applications', { p_role: 'supplier' });
    if (error) { applications.textContent = `Supplier requests could not load: ${error.message}. Apply the new Supabase migration to enable applications.`; return; }
    applicationRows = Array.isArray(data) ? data : [];
    applications.innerHTML = applicationRows.length ? applicationRows.map((request) => {
      const actions = request.status === 'pending'
        ? `<div class="admin-supplier-application-actions"><button class="button button-primary" type="button" data-review-role-app="approve" data-id="${escapeHTML(request.id)}">Approve &amp; Assign Supplier</button><button class="button button-light" type="button" data-review-role-app="reject" data-id="${escapeHTML(request.id)}">Reject</button></div>`
        : `<span class="admin-team-readonly">${escapeHTML(request.status)}</span>`;
      return `<article class="admin-supplier-application"><div><strong>${escapeHTML(request.display_name || 'Furgo customer')}</strong><small>${escapeHTML(request.email || 'Email unavailable')} · Applied ${escapeHTML(request.created_at ? new Date(request.created_at).toLocaleDateString('en-MY') : '')}</small><p><b>Company:</b> ${escapeHTML(request.company_name || 'Not provided yet')}</p>${request.message ? `<p>${escapeHTML(request.message)}</p>` : ''}${request.review_note ? `<p><b>Furgo response:</b> ${escapeHTML(request.review_note)}</p>` : ''}</div>${actions}</article>`;
    }).join('') : '<p class="admin-market-empty">No supplier applications yet.</p>';
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    feedback.textContent = 'Assigning supplier access…';
    const { error } = await supabase.rpc('assign_marketplace_supplier_account', { p_email: String(values.get('email') || '').trim(), p_supplier_name: String(values.get('companyName') || '').trim() });
    if (error) { feedback.textContent = error.message || 'Supplier access could not be assigned.'; return; }
    feedback.textContent = 'Supplier access assigned.';
    form.reset();
    await loadSuppliers();
  });

  supplierList?.addEventListener('submit', async (event) => {
    const companyForm = event.target.closest('[data-supplier-company-form]');
    if (!companyForm) return;
    event.preventDefault();
    const status = companyForm.querySelector('[role="status"]');
    status.textContent = 'Saving…';
    const { error } = await supabase.rpc('update_marketplace_supplier_company_name', {
      p_supplier_user_id: companyForm.dataset.userId,
      p_supplier_name: String(new FormData(companyForm).get('companyName') || '').trim(),
    });
    if (error) { status.textContent = error.message || 'Company name could not be saved.'; return; }
    status.textContent = 'Saved.';
    await loadSuppliers();
  });

  applications?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-review-role-app]');
    if (!button) return;
    const request = applicationRows.find((row) => row.id === button.dataset.id);
    if (!request) return;
    let companyName = request.company_name || '';
    let reviewNote = '';
    if (button.dataset.reviewRoleApp === 'approve' && !companyName) companyName = window.prompt('Enter the supplier company name to assign:', '')?.trim() || '';
    if (button.dataset.reviewRoleApp === 'approve' && !companyName) return;
    if (button.dataset.reviewRoleApp === 'reject') reviewNote = window.prompt('Optional feedback for the applicant:', '') || '';
    button.disabled = true;
    const { error } = await supabase.rpc('review_furgo_role_application', { p_application_id: request.id, p_decision: button.dataset.reviewRoleApp, p_company_name: companyName, p_outlet_id: null, p_review_note: reviewNote });
    if (error) { button.disabled = false; window.alert(error.message || 'The application could not be updated.'); return; }
    await Promise.all([loadApplications(), loadSuppliers()]);
  });

  void Promise.all([loadSuppliers(), loadApplications()]);
}
