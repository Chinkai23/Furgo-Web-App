import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const receiptMarkup = (slip) => {
  if (!slip || typeof slip !== 'object' || typeof slip.data !== 'string') return '<span class="admin-coin-topup-no-slip">No transfer slip attached</span>';
  const match = slip.data.match(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/i);
  if (!match) return '<span class="admin-coin-topup-no-slip">Unsupported transfer slip</span>';
  const href = escapeHTML(slip.data);
  const label = escapeHTML(slip.name || 'View transfer slip');
  return `<a class="admin-coin-topup-slip-link" href="${href}" target="_blank" rel="noopener noreferrer">View transfer slip · ${label}</a>`;
};

export function adminCoinTopupsPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  return `<main class="admin-portal-page admin-coin-topups-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || profile.email || 'Admin')}</span><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>General Management</span><h1>Furgo Coins Top-Ups</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Payment verification</span><h2>Pending Top-Up Requests</h2></div><p>Check the transfer slip and payment before approving. Approval adds the requested coins to the customer’s Supabase wallet.</p></div><div class="admin-coin-topup-list" data-admin-coin-topup-list role="status" aria-live="polite">Loading top-up requests…</div></section>
    <p class="admin-coin-topup-safety-note">Only approve after confirming the funds have arrived. Online payment remains unavailable until a payment gateway is connected.</p>
  </main>`;
}

export function setupAdminCoinTopups() {
  const root = document.querySelector('.admin-coin-topups-page');
  const list = root?.querySelector('[data-admin-coin-topup-list]');
  if (!root || !list) return;

  const loadRequests = async () => {
    list.textContent = 'Loading top-up requests…';
    const { data, error } = await supabase.from('furgo_coin_topup_requests')
      .select('id,user_id,amount_myr,coin_amount,payment_method,status,transfer_slip,created_at')
      .eq('status', 'pending-verification')
      .order('created_at', { ascending: true });
    if (error) {
      list.innerHTML = `<p class="admin-market-empty">Top-up requests could not load: ${escapeHTML(error.message)}. Apply the Furgo Coins Supabase migration to enable this page.</p>`;
      return;
    }
    const requests = data || [];
    if (!requests.length) {
      list.innerHTML = '<p class="admin-market-empty">There are no pending Furgo Coins top-up requests.</p>';
      return;
    }
    let profiles = {};
    try {
      const ids = [...new Set(requests.map((request) => request.user_id).filter(Boolean))];
      if (ids.length) {
        const { data: rows } = await supabase.from('profiles').select('id,display_name,email').in('id', ids);
        profiles = Object.fromEntries((rows || []).map((profile) => [profile.id, profile]));
      }
    } catch { /* Request IDs remain available if profile details are not readable. */ }

    list.innerHTML = requests.map((request) => {
      const customer = profiles[request.user_id] || {};
      const customerLabel = customer.display_name || customer.email || request.user_id;
      const date = request.created_at ? new Date(request.created_at).toLocaleString('en-MY') : 'Date unavailable';
      return `<article class="admin-coin-topup-request" data-topup-request="${escapeHTML(request.id)}">
        <div class="admin-coin-topup-request-main"><span class="admin-coin-topup-request-kicker">Bank transfer · Pending verification</span><h3>${escapeHTML(customerLabel)}</h3><p>${escapeHTML(customer.email || request.user_id)}</p><dl><div><dt>Payment</dt><dd>MYR ${Number(request.amount_myr).toFixed(2)}</dd></div><div><dt>Coins to credit</dt><dd>${Number(request.coin_amount).toLocaleString()} Furgo Coins</dd></div><div><dt>Submitted</dt><dd>${escapeHTML(date)}</dd></div></dl>${receiptMarkup(request.transfer_slip)}</div>
        <div class="admin-coin-topup-actions"><button class="button button-primary" type="button" data-topup-decision="approve" data-id="${escapeHTML(request.id)}">Approve &amp; Add Coins</button><button class="button button-light" type="button" data-topup-decision="reject" data-id="${escapeHTML(request.id)}">Reject</button><span role="status" aria-live="polite"></span></div>
      </article>`;
    }).join('');
  };

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-topup-decision]');
    if (!button || button.disabled) return;
    const requestId = button.dataset.id;
    const decision = button.dataset.topupDecision;
    let reason = '';
    if (decision === 'approve' && !window.confirm('Confirm the transfer has arrived and approve the Furgo Coins top-up?')) return;
    if (decision === 'reject') {
      reason = window.prompt('Enter a reason for rejecting this top-up:')?.trim() || '';
      if (!reason) return;
    }
    const card = button.closest('[data-topup-request]');
    const status = card?.querySelector('[role="status"]');
    button.disabled = true;
    if (status) status.textContent = decision === 'approve' ? 'Approving…' : 'Rejecting…';
    const { error } = await supabase.rpc('review_furgo_coin_topup', {
      p_request_id: requestId,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) {
      button.disabled = false;
      if (status) status.textContent = error.message || 'Could not review this request.';
      return;
    }
    await loadRequests();
  });

  void loadRequests();
}
