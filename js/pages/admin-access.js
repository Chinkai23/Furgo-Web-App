import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';
import { cacheSharedOutlets } from './outlet-directory.js';

const levels = {
  driver: { name: 'Driver', order: 0, summary: 'Access the Pet Taxi driver portal.' },
  executive: { name: 'Executive', order: 1, summary: 'Manage orders, check-ins, service settings, and the marketplace.' },
  manager: { name: 'Manager', order: 2, summary: 'Manage orders, promotions, Marketplace, Grooming, Pet Hotel, and Daycare.' },
  director: { name: 'Director', order: 3, summary: 'Full portal access, including customer records, search insights, and product and service reports.' },
};
let directorRemovalNotificationTimer;

function featureCard(title, description, href, allowed) {
  if (!allowed) return '';
  return `<a class="admin-access-feature is-available" href="${href}"><span class="admin-access-feature-state">Available</span><strong>${title}</strong><small>${description}</small></a>`;
}

export function adminAccessPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const level = levels[profile.role] || levels.executive;
  const isManager = level.order >= 2;
  const isDirector = level.order >= 3;
  const availableFeatures = [
    featureCard('Current Order & Check-In', 'Review current orders and check customers in.', '#admin-orders', true),
    featureCard('Promotions', 'Create, update, and remove home page promotions.', '#admin-promotions', true),
    featureCard('Marketplace', 'View and manage marketplace orders, payments, and fulfillment.', '#admin-marketplace', true),
    featureCard('Manage Marketplace', 'Manage product listings, product details, and supplier mapping.', '#admin-marketplace-manage', true),
    featureCard('Grooming', isManager ? 'Manage appointment settings, bookings, and grooming operations.' : 'View bookings, safety notes, and grooming operations.', '#admin-grooming', true),
    featureCard('Pet Hotel', isManager ? 'Manage rooms, pricing, availability, and reservations.' : 'View room availability, care notes, and reservations.', '#admin-hotel', true),
    featureCard('Pet Daycare', isManager ? 'Manage rates, capacity, add-ons, and bookings.' : 'View the daily roster, care notes, and bookings.', '#admin-daycare', true),
    featureCard('Activity log', isManager ? 'Review actions performed by Executives, Managers, and Directors.' : 'Review actions performed by Executive admins.', '#admin-audit', true),
    featureCard('Product & Service Insights', 'Review purchase timelines, nutrition and product demand, pet demographics, service demand, and locations.', '#admin-product-insights', isDirector),
    featureCard('Customers', 'Open customer accounts, pet records, and Search Insights.', '#admin-customers', isDirector),
  ].filter(Boolean).join('');

  const managerOptions = isDirector
    ? '<option value="executive">Executive</option><option value="manager">Manager</option><option value="director">Director</option><option value="driver">Driver</option>'
    : '<option value="executive">Executive</option>';
  const outletSetup = isDirector ? `<section class="admin-market-panel admin-outlet-panel"><div class="admin-market-panel-heading"><div><span>Outlet setup</span><h2>Manage Outlets</h2></div><p>Add the exact outlet name used on service bookings, plus a shortform. The shortform appears beside an assigned admin’s name.</p></div><form class="admin-outlet-form" data-admin-outlet-form><input type="hidden" name="outletId" /><label>Outlet name<input name="name" maxlength="100" placeholder="Furgo Pet Care - Petaling Jaya" required /></label><label>Shortform<input name="shortform" maxlength="8" minlength="2" pattern="[A-Za-z0-9]{2,8}" placeholder="PJ" required /></label><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Add Outlet</button><button class="button button-light" type="button" data-cancel-outlet-edit hidden>Cancel edit</button><span data-admin-outlet-feedback role="status" aria-live="polite"></span></div></form><div class="admin-outlet-list" data-admin-outlet-list role="status" aria-live="polite">Loading outlets…</div></section>` : '';
  const outletField = isDirector
    ? '<label data-team-outlet-field>Assigned outlet<select name="outletId" data-team-outlet required><option value="">Choose an outlet</option></select></label>'
    : `<label data-team-outlet-field>Assigned outlet<input value="${escapeHTML(profile.outletName ? `${profile.outletName} (${profile.outletShortform || ''})` : 'No outlet assigned') }" readonly /><input type="hidden" name="outletId" value="${escapeHTML(profile.outletId || '')}" /></label>`;
  const canViewTeam = level.order >= 1;
  const teamManagement = canViewTeam ? `<section class="admin-market-panel admin-team-panel"><div class="admin-market-panel-heading"><div><span>Team access</span><h2>${isManager ? 'Manage Portal Users' : 'Outlet Admins'}</h2></div><p>${isDirector ? 'Assign Executive and Manager accounts to an outlet. Director access remains company-wide. Removing a Director requires approval from every other Director.' : isManager ? 'View admins assigned to your outlet and add, edit, or remove Executive accounts.' : `Admins assigned to ${profile.outletName || 'your outlet'}.`}</p></div>${isManager ? `<form class="admin-team-form" data-admin-team-form><label>Existing account email<input name="email" type="email" autocomplete="email" placeholder="person@example.com" required /></label><label>Account level<select name="level" required>${managerOptions}</select></label>${outletField}<input type="hidden" name="action" value="add" /><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Add user</button><button class="button button-light" type="button" data-cancel-team-edit hidden>Cancel edit</button><span data-admin-team-feedback role="status" aria-live="polite"></span></div></form>` : ''}${isDirector ? `<div class="admin-team-filters"><label>Outlet<select data-team-outlet-filter><option value="all">All outlets</option></select></label><label>Admin level<select data-team-level-filter><option value="all">All levels</option><option value="director">Director</option><option value="manager">Manager</option><option value="executive">Executive</option><option value="driver">Driver</option></select></label></div>` : ''}<div class="admin-team-list" data-admin-team-list role="status" aria-live="polite">Loading team members…</div></section>` : '';
  const directorApprovals = isDirector ? `<section class="admin-market-panel admin-director-approval-panel" data-director-approval-panel hidden><div class="admin-market-panel-heading"><div><span>Director governance</span><h2>Removal Approvals</h2></div><p>Every Director except the requester and the Director named in a request must approve it. One rejection stops the request.</p></div><div data-director-removal-requests role="status" aria-live="polite">Loading approval requests…</div></section>` : '';
  return `<main class="admin-portal-page admin-access-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin-access"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}${profile.outletShortform ? ` · ${escapeHTML(profile.outletShortform)}` : ''}</span><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="${isDirector ? '#admin' : '#admin-orders'}" aria-label="Back to portal">‹</a><div><span>Access level</span><h1>${level.name}</h1></div></header><section class="admin-access-level-summary"><span>YOUR ADMIN LEVEL</span><h2>${level.name}</h2></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Portal permissions</span><h2>Your Available Functions</h2></div><p>Your access follows the permissions assigned to your account.</p></div><div class="admin-access-feature-grid">${availableFeatures}</div></section>${directorApprovals}${outletSetup}${teamManagement}</main>`;
}

export function setupAdminAccess() {
  const root = document.querySelector('.admin-access-page');
  const team = root?.querySelector('[data-admin-team-list]');
  const form = root?.querySelector('[data-admin-team-form]');
  const outletFilter = root?.querySelector('[data-team-outlet-filter]');
  const levelFilter = root?.querySelector('[data-team-level-filter]');
  const outletForm = root?.querySelector('[data-admin-outlet-form]');
  const outletList = root?.querySelector('[data-admin-outlet-list]');
  const approvals = root?.querySelector('[data-director-removal-requests]');
  const notificationBadge = document.querySelector('[data-director-removal-badge]');
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const callerLevel = levels[profile.role] || levels.executive;
  let outlets = [];
  let teamMembers = [];
  if (directorRemovalNotificationTimer) window.clearInterval(directorRemovalNotificationTimer);
  const renderRemovalApprovals = async () => {
    if (callerLevel.order < 3) return;
    const { data, error } = await supabase.rpc('get_director_removal_requests');
    if (error) {
      if (approvals) approvals.textContent = 'Director approval workflow is not connected yet. Apply migration 0012 in Supabase.';
      if (notificationBadge) notificationBadge.hidden = true;
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const actionable = rows.filter((request) => request.status === 'pending' && !request.is_requester && !request.my_vote);
    const outstanding = actionable.length;
    const approvalPanel = root?.querySelector('[data-director-approval-panel]');
    if (approvalPanel) approvalPanel.hidden = outstanding === 0;
    if (notificationBadge) {
      notificationBadge.textContent = outstanding > 9 ? '9+' : String(outstanding);
      notificationBadge.hidden = outstanding === 0;
      notificationBadge.setAttribute('aria-label', `${outstanding} pending Director approval${outstanding === 1 ? '' : 's'}`);
    }
    if (!approvals) return;
    approvals.innerHTML = actionable.map((request) => {
      const decisionActions = `<div class="admin-director-approval-actions"><button class="button button-primary" type="button" data-director-removal-vote="approve" data-request-id="${escapeHTML(request.id)}">Approve</button><button class="button button-light" type="button" data-director-removal-vote="reject" data-request-id="${escapeHTML(request.id)}">Reject</button></div>`;
      const status = `${Number(request.approvals_received || 0)} of ${Number(request.approvals_required || 0)} approvals received`;
      return `<article class="admin-director-approval"><div><strong>${escapeHTML(request.target_name || request.target_email || 'Director')} · Director removal</strong><p>Requested by ${escapeHTML(request.requester_name || request.requester_email || 'Director')} · ${escapeHTML(status)}</p></div>${decisionActions}</article>`;
    }).join('');
  };
  if (callerLevel.order === 3 && notificationBadge) {
    void renderRemovalApprovals();
    directorRemovalNotificationTimer = window.setInterval(() => {
      if (!document.querySelector('[data-director-removal-badge]')) {
        window.clearInterval(directorRemovalNotificationTimer);
        directorRemovalNotificationTimer = undefined;
        return;
      }
      void renderRemovalApprovals();
    }, 30000);
  }
  if (!root || !team) return;
  const renderOutlets = async () => {
    if (callerLevel.order < 3) return;
    const { data, error } = await supabase.rpc('get_admin_outlets');
    if (error) {
      if (outletList) outletList.textContent = 'Outlet setup is not connected yet. Apply migration 0026 in Supabase.';
      return;
    }
    outlets = Array.isArray(data) ? data : [];
    cacheSharedOutlets(outlets);
    const selector = form.elements.outletId;
    if (selector?.tagName === 'SELECT') {
      const current = selector.value;
      selector.innerHTML = '<option value="">Choose an outlet</option>' + outlets.map((outlet) => `<option value="${escapeHTML(outlet.id)}">${escapeHTML(outlet.name)} (${escapeHTML(outlet.shortform)})</option>`).join('');
      if (current && outlets.some((outlet) => outlet.id === current)) selector.value = current;
    }
    if (outletFilter) {
      const current = outletFilter.value || 'all';
      outletFilter.innerHTML = '<option value="all">All outlets</option>' + outlets.map((outlet) => `<option value="${escapeHTML(outlet.id)}">${escapeHTML(outlet.name)} (${escapeHTML(outlet.shortform)})</option>`).join('');
      if (current === 'all' || outlets.some((outlet) => outlet.id === current)) outletFilter.value = current;
    }
    if (outletList) outletList.innerHTML = outlets.length
      ? outlets.map((outlet) => `<article class="admin-outlet-item"><div><strong>${escapeHTML(outlet.name)}</strong><span>${escapeHTML(outlet.shortform)}</span></div><div class="admin-outlet-actions"><button class="button button-light" type="button" data-edit-admin-outlet="${escapeHTML(outlet.id)}">Edit</button><button class="button button-light" type="button" data-delete-admin-outlet="${escapeHTML(outlet.id)}">Delete</button></div></article>`).join('')
      : '<p class="admin-market-empty">No outlets yet. Add the first outlet above.</p>';
  };
  const renderTeam = async () => {
    if (callerLevel.order < 1) return;
    team.textContent = 'Loading team members…';
    const { data, error } = await supabase.rpc('get_admin_team');
    if (error) {
      team.textContent = 'Team access is not connected yet. Apply the admin access migration in Supabase.';
      return;
    }
    teamMembers = Array.isArray(data) ? data : [];
    renderTeamRows();
  };
  const renderTeamRows = () => {
    const selectedOutlet = outletFilter?.value || 'all';
    const selectedLevel = levelFilter?.value || 'all';
    const members = teamMembers.filter((member) => (selectedOutlet === 'all' || member.outlet_id === selectedOutlet)
      && (selectedLevel === 'all' || member.level === selectedLevel));
    team.innerHTML = members.length ? members.map((member) => {
      const memberLevel = levels[member.level] || levels.executive;
      const canManage = member.level !== 'driver' && memberLevel.order < callerLevel.order;
      const canRemoveDriver = member.level === 'driver' && callerLevel.order >= 2;
      const canRemoveDirector = callerLevel.order === 3 && memberLevel.order === 3
        && member.email && member.email.toLowerCase() !== String(profile.email || '').toLowerCase();
      const controls = `${canManage ? `<button class="button button-light" type="button" data-edit-team-member data-email="${escapeHTML(member.email || '')}" data-level="${escapeHTML(member.level || '')}" data-outlet-id="${escapeHTML(member.outlet_id || '')}">Edit</button>` : ''}${canManage || canRemoveDirector || canRemoveDriver ? `<button class="button button-light" type="button" data-remove-team-member data-email="${escapeHTML(member.email || '')}" data-level="${escapeHTML(member.level || '')}" data-outlet-id="${escapeHTML(member.outlet_id || '')}">Remove</button>` : '<span class="admin-team-readonly">Same level · Read only</span>'}`;
      const outletSuffix = member.outlet_shortform ? ` · ${member.outlet_shortform}` : '';
      return `<article class="admin-team-member"><div><strong>${escapeHTML(member.display_name || 'Furgo user')}${outletSuffix ? ` · ${escapeHTML(member.outlet_shortform)}` : ''}</strong><small>${escapeHTML(member.email || 'Email unavailable')} · ${escapeHTML(memberLevel.name)}${member.outlet_name ? ` · ${escapeHTML(member.outlet_name)}` : ''}</small></div>${controls}</article>`;
    }).join('') : `<p class="admin-market-empty">${teamMembers.length ? 'No admins match these filters.' : 'No portal users yet.'}</p>`;
  };

  const submitTeamAction = async (email, level, action, outletId = '') => {
    const feedback = form?.querySelector('[data-admin-team-feedback]');
    if (!form || !feedback) return false;
    const requestsDirectorRemoval = action === 'remove' && level === 'director';
    if (requestsDirectorRemoval) {
      feedback.textContent = 'Submitting approval request…';
      const { error } = await supabase.rpc('request_director_removal', { p_target_email: email });
      if (error) {
        feedback.textContent = error.message || 'The Director removal request could not be created.';
        return false;
      }
      feedback.textContent = 'Request submitted. Every other Director must approve it before access is removed.';
      await renderRemovalApprovals();
      return true;
    }
    feedback.textContent = 'Saving…';
    const { error } = await supabase.rpc('manage_admin_team_member', { p_email: email, p_level: level || null, p_action: action, p_outlet_id: outletId || null });
    if (error) {
      feedback.textContent = error.message || 'The team access change could not be saved.';
      return false;
    }
    feedback.textContent = action === 'remove' ? 'Portal access removed.' : 'Portal access saved.';
    await renderTeam();
    return true;
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const saved = await submitTeamAction(String(values.get('email') || '').trim(), String(values.get('level') || ''), String(values.get('action') || 'add'), String(values.get('outletId') || ''));
    if (saved) resetTeamForm();
  });
  team.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-team-member]');
    if (edit) {
      if (!form) return;
      form.elements.email.value = edit.dataset.email || '';
      form.elements.level.value = edit.dataset.level || 'executive';
      if (form.elements.outletId) form.elements.outletId.value = edit.dataset.outletId || profile.outletId || '';
      updateOutletRequirement();
      const driverOption = form.elements.level.querySelector('option[value="driver"]');
      if (driverOption) driverOption.disabled = true;
      form.elements.action.value = 'update';
      form.querySelector('[type="submit"]').textContent = 'Save changes';
      form.querySelector('[data-cancel-team-edit]').hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const remove = event.target.closest('[data-remove-team-member]');
    if (remove && window.confirm(remove.dataset.level === 'director'
      ? `Request removal of Director access for ${remove.dataset.email}? All other Directors must approve.`
      : `Remove portal access for ${remove.dataset.email}?`)) {
      await submitTeamAction(remove.dataset.email || '', remove.dataset.level || '', 'remove', remove.dataset.outletId || profile.outletId || '');
    }
  });
  approvals?.addEventListener('click', async (event) => {
    const voteButton = event.target.closest('[data-director-removal-vote]');
    if (!voteButton) return;
    const decision = voteButton.dataset.directorRemovalVote;
    if (decision === 'reject' && !window.confirm('Reject this Director removal request? The request will close without removing access.')) return;
    voteButton.disabled = true;
    const { data, error } = await supabase.rpc('vote_director_removal_request', {
      p_request_id: voteButton.dataset.requestId,
      p_decision: decision,
    });
    if (error) {
      voteButton.disabled = false;
      approvals.insertAdjacentHTML('afterbegin', `<p class="admin-director-approval-error" role="alert">${escapeHTML(error.message || 'Your vote could not be saved.')}</p>`);
      return;
    }
    await renderRemovalApprovals();
    await renderTeam();
  });
  form?.querySelector('[data-cancel-team-edit]')?.addEventListener('click', resetTeamForm);
  const updateOutletRequirement = () => {
    if (!form) return;
    const needsOutlet = ['executive', 'manager'].includes(form.elements.level.value);
    form.elements.outletId?.closest('[data-team-outlet-field]')?.toggleAttribute('hidden', !needsOutlet);
    if (form.elements.outletId) form.elements.outletId.required = needsOutlet && form.elements.outletId.tagName === 'SELECT';
  };
  form?.elements.level?.addEventListener('change', updateOutletRequirement);
  if (form) updateOutletRequirement();
  outletForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = outletForm.querySelector('[data-admin-outlet-feedback]');
    const values = new FormData(outletForm);
    const outletId = String(values.get('outletId') || '');
    feedback.textContent = 'Saving…';
    const { error } = outletId
      ? await supabase.rpc('update_admin_outlet', { p_id: outletId, p_name: String(values.get('name') || '').trim(), p_shortform: String(values.get('shortform') || '').trim().toUpperCase() })
      : await supabase.rpc('manage_admin_outlet', { p_name: String(values.get('name') || '').trim(), p_shortform: String(values.get('shortform') || '').trim().toUpperCase() });
    if (error) {
      feedback.textContent = outletId && /update_admin_outlet|schema cache|function .*not found/i.test(error.message || '')
        ? 'Apply Supabase migration 0029 to enable outlet editing.'
        : error.message || 'The outlet could not be saved.';
      return;
    }
    feedback.textContent = outletId ? 'Outlet updated.' : 'Outlet added.';
    outletForm.reset();
    outletForm.querySelector('[type="submit"]').textContent = 'Add Outlet';
    outletForm.querySelector('[data-cancel-outlet-edit]').hidden = true;
    await renderOutlets();
    await renderTeam();
  });
  outletList?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-admin-outlet]');
    if (edit) {
      const outlet = outlets.find((entry) => entry.id === edit.dataset.editAdminOutlet);
      if (!outlet || !outletForm) return;
      outletForm.elements.outletId.value = outlet.id;
      outletForm.elements.name.value = outlet.name;
      outletForm.elements.shortform.value = outlet.shortform;
      outletForm.querySelector('[type="submit"]').textContent = 'Save Changes';
      outletForm.querySelector('[data-cancel-outlet-edit]').hidden = false;
      outletForm.querySelector('[data-admin-outlet-feedback]').textContent = '';
      outletForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const remove = event.target.closest('[data-delete-admin-outlet]');
    if (!remove) return;
    const outlet = outlets.find((entry) => entry.id === remove.dataset.deleteAdminOutlet);
    if (!outlet || !window.confirm(`Delete ${outlet.name}? Admins assigned to this outlet will become unassigned. Existing orders will keep the outlet name.`)) return;
    const feedback = outletForm?.querySelector('[data-admin-outlet-feedback]');
    if (feedback) feedback.textContent = 'Deleting outlet…';
    const { data, error } = await supabase.rpc('delete_admin_outlet', { p_id: outlet.id });
    if (error) {
      if (feedback) feedback.textContent = /delete_admin_outlet|schema cache|function .*not found/i.test(error.message || '')
        ? 'Apply Supabase migration 0029 to enable outlet deletion.'
        : error.message || 'The outlet could not be deleted.';
      return;
    }
    const unassignedCount = Number(data?.unassigned_admins || 0);
    if (feedback) feedback.textContent = unassignedCount
      ? `Outlet deleted. ${unassignedCount} assigned admin${unassignedCount === 1 ? ' is' : 's are'} now unassigned and need a new outlet.`
      : 'Outlet deleted.';
    outletForm?.reset();
    if (outletForm) {
      outletForm.querySelector('[type="submit"]').textContent = 'Add Outlet';
      outletForm.querySelector('[data-cancel-outlet-edit]').hidden = true;
    }
    await renderOutlets();
    await renderTeam();
  });
  outletForm?.querySelector('[data-cancel-outlet-edit]')?.addEventListener('click', () => {
    outletForm.reset();
    outletForm.querySelector('[type="submit"]').textContent = 'Add Outlet';
    outletForm.querySelector('[data-cancel-outlet-edit]').hidden = true;
    outletForm.querySelector('[data-admin-outlet-feedback]').textContent = '';
  });
  outletFilter?.addEventListener('change', renderTeamRows);
  levelFilter?.addEventListener('change', renderTeamRows);
  function resetTeamForm() {
    if (!form) return;
    form.reset();
    const driverOption = form.elements.level.querySelector('option[value="driver"]');
    if (driverOption) driverOption.disabled = false;
    form.elements.action.value = 'add';
    form.querySelector('[type="submit"]').textContent = 'Add user';
    form.querySelector('[data-cancel-team-edit]').hidden = true;
    updateOutletRequirement();
  }
  void renderOutlets();
  void renderTeam();
}

export function adminAuditPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const level = levels[profile.role] || levels.manager;
  const levelOptions = level.order === 1
    ? '<option value="executive">Executive</option>'
    : '<option value="all">All levels</option><option value="director">Director</option><option value="manager">Manager</option><option value="executive">Executive</option>';
  const activityDescription = level.order === 1 ? 'Showing actions performed by Executive admins only.' : 'Entries include who acted, their level, what changed, and when.';
  return `<main class="admin-portal-page admin-audit-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin-access"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin-access" aria-label="Back to Admin">‹</a><div><span>${level.name} access</span><h1>Activity Log</h1></div></header><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Portal audit trail</span><h2>Recent Admin Actions</h2></div><p>${activityDescription}</p></div><div class="admin-audit-filters"><label>Staff level<select data-audit-level-filter>${levelOptions}</select></label><label>Action type<select data-audit-action-filter><option value="all">All actions</option><option value="orders">Order management</option><option value="checkin">Customer check-in</option><option value="services">Service management</option><option value="marketplace">Marketplace</option><option value="promotions">Promotions</option><option value="customer">Customer &amp; pet records</option><option value="team">Team access</option><option value="governance">Director approvals</option><option value="other">Other</option></select></label><p data-audit-filter-count aria-live="polite">Loading activity…</p></div><div class="admin-audit-log-list" data-admin-audit-log role="status" aria-live="polite">Loading activity…</div></section></main>`;
}

export function setupAdminAuditPage() {
  const root = document.querySelector('[data-admin-audit-log]');
  if (!root) return;
  const page = root.closest('.admin-audit-page');
  const levelFilter = page?.querySelector('[data-audit-level-filter]');
  const actionFilter = page?.querySelector('[data-audit-action-filter]');
  const countLabel = page?.querySelector('[data-audit-filter-count]');
  let entries = [];
  const categoryFor = (entry) => {
    const action = String(entry.action || '');
    const target = String(entry.target_type || '');
    if (action === 'customer_check_in_updated') return 'checkin';
    if (['portal_access_added', 'portal_access_level_changed', 'portal_access_removed'].includes(action)) return 'team';
    if (action.startsWith('director_removal_')) return 'governance';
    if (action.startsWith('promotion_')) return 'promotions';
    if (action.startsWith('marketplace_') || target.startsWith('marketplace')) return 'marketplace';
    if (['customer_record_status_updated', 'pet_remarks_updated', 'enquiry_replied'].includes(action)) return 'customer';
    if (target.includes('grooming') || target.includes('hotel') || target.includes('daycare') || action.startsWith('grooming_') || action.startsWith('hotel_') || action.startsWith('daycare_')) return 'services';
    if (['order', 'marketplace_order'].includes(target) || action === 'order_status_updated' || action === 'receipt_uploaded') return 'orders';
    return 'other';
  };
  const labels = {
    receipt_uploaded: 'uploaded a receipt',
    order_status_updated: (entry) => `updated the order status${entry.details?.status ? ` to ${entry.details.status}` : ''}`,
    customer_check_in_updated: (entry) => `updated a customer check-in${entry.details?.status ? ` to ${entry.details.status}` : ''}`,
    enquiry_replied: 'replied to a customer enquiry',
    customer_record_status_updated: (entry) => `updated a customer account status${entry.details?.status ? ` to ${entry.details.status}` : ''}`,
    pet_remarks_updated: 'updated care remarks on a pet profile',
    promotion_uploaded: 'uploaded a promotion',
    promotion_removed: 'removed a promotion',
    marketplace_product_saved: 'saved a Marketplace product',
    marketplace_product_removed: 'removed a Marketplace product',
    marketplace_product_hidden: 'hid a Marketplace product',
    marketplace_product_published: 'published a Marketplace product',
    marketplace_offer_settings_updated: 'updated Marketplace offers',
    marketplace_payment_approved: 'approved a Marketplace payment',
    marketplace_payment_rejected: 'rejected a Marketplace payment',
    grooming_settings_updated: 'updated Grooming settings',
    grooming_package_removed: 'removed a Grooming package',
    grooming_booking_status_updated: (entry) => `updated a Grooming booking${entry.details?.status ? ` to ${entry.details.status}` : ''}`,
    hotel_settings_updated: 'updated Pet Hotel settings',
    hotel_room_removed: 'removed a Pet Hotel room type',
    hotel_addon_removed: 'removed a Pet Hotel add-on',
    hotel_care_update_uploaded: 'uploaded a Pet Hotel care update',
    daycare_details_updated: 'updated Pet Daycare details',
    daycare_settings_updated: 'updated Pet Daycare settings',
    daycare_pass_removed: 'removed a Pet Daycare pass',
    daycare_addon_removed: 'removed a Pet Daycare add-on',
    portal_access_added: 'added portal access for a team member',
    portal_access_level_changed: 'changed a team member’s portal level',
    portal_access_removed: 'removed portal access for a team member',
    director_removal_requested: 'requested unanimous approval to remove a Director',
    director_removal_vote_approved: 'approved a Director removal request',
    director_removal_rejected: 'rejected a Director removal request',
    director_removal_completed: 'completed an approved Director removal',
    director_removal_cancelled_approver_removed: 'cancelled a Director removal request because an approver was removed',
  };
  const renderEntries = () => {
    const selectedLevel = levelFilter?.value || 'all';
    const selectedAction = actionFilter?.value || 'all';
    const filtered = entries.filter((entry) => (selectedLevel === 'all' || entry.actor_level === selectedLevel)
      && (selectedAction === 'all' || categoryFor(entry) === selectedAction));
    if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${entries.length} activities`;
    if (!filtered.length) {
      root.innerHTML = '<p class="admin-market-empty">No activities match these filters.</p>';
      return;
    }
    root.innerHTML = filtered.map((entry) => {
      const label = labels[entry.action];
      const description = typeof label === 'function' ? label(entry) : label || String(entry.action || 'recorded an action').replaceAll('_', ' ');
      const subject = entry.details?.name || entry.details?.title || entry.details?.email || entry.details?.target_email || entry.target_id;
      return `<article class="admin-audit-entry"><div><strong>${escapeHTML(entry.actor_name || 'Portal user')} <span>(${escapeHTML(entry.actor_level || 'User')})</span></strong><p>${escapeHTML(description)}${subject ? ` · ${escapeHTML(subject)}` : ''}</p></div><time datetime="${escapeHTML(entry.created_at || '')}">${escapeHTML(entry.created_at ? new Date(entry.created_at).toLocaleString('en-MY') : '')}</time></article>`;
    }).join('');
  };
  levelFilter?.addEventListener('change', renderEntries);
  actionFilter?.addEventListener('change', renderEntries);
  void supabase.rpc('get_admin_audit_log', { p_limit: 500 }).then(({ data, error }) => {
    if (error) {
      root.textContent = 'The activity log is not connected yet. Apply the admin audit migration in Supabase.';
      if (countLabel) countLabel.textContent = 'Activity unavailable';
      return;
    }
    entries = Array.isArray(data) ? data : [];
    renderEntries();
  });
}
