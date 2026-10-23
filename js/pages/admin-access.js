import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const levels = {
  driver: { name: 'Driver', order: 0, summary: 'Access the Pet Taxi driver portal.' },
  executive: { name: 'Executive', order: 1, summary: 'Manage orders and check-ins, and view service operations.' },
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
    featureCard('Orders & check-in', 'Review orders, update status, upload receipts, and check customers in.', '#admin-orders', true),
    featureCard('Promotions', 'Create, update, and remove home page promotions.', '#admin-promotions', isManager),
    featureCard('Marketplace', isManager ? 'Manage products, offers, supplier information, and marketplace orders.' : 'View products, supplier information, and marketplace orders.', '#admin-marketplace', true),
    featureCard('Grooming', isManager ? 'Manage appointment settings, bookings, and grooming operations.' : 'View bookings, safety notes, and grooming operations.', '#admin-grooming', true),
    featureCard('Pet Hotel', isManager ? 'Manage rooms, pricing, availability, and reservations.' : 'View room availability, care notes, and reservations.', '#admin-hotel', true),
    featureCard('Pet Daycare', isManager ? 'Manage rates, capacity, add-ons, and bookings.' : 'View the daily roster, care notes, and bookings.', '#admin-daycare', true),
    featureCard('Activity log', isManager ? 'Review actions performed by Executives, Managers, and Directors.' : 'Review actions performed by Executive admins.', '#admin-audit', true),
    featureCard('Product & Service Insights', 'Review purchase timelines, nutrition and product demand, pet demographics, service demand, and locations.', '#admin-product-insights', isDirector),
    featureCard('Customers', 'Open customer accounts, pet records, and Search Insights.', '#admin-customers', isDirector),
  ].filter(Boolean).join('');

  const managerOptions = isDirector
    ? '<option value="executive">Executive</option><option value="manager">Manager</option><option value="director">Director</option><option value="driver">Driver</option>'
    : '<option value="executive">Executive</option><option value="driver">Driver</option>';
  const teamManagement = isManager ? `<section class="admin-market-panel admin-team-panel"><div class="admin-market-panel-heading"><div><span>Team access</span><h2>Manage Portal Users</h2></div><p>${isDirector ? 'Add Executive, Manager, Director, or Driver access for existing Furgo accounts. You can edit and remove lower-level users. Removing a Director requires approval from every other Director.' : 'Add, change, or remove Executive and Driver access for existing Furgo accounts.'}</p></div><form class="admin-team-form" data-admin-team-form><label>Existing account email<input name="email" type="email" autocomplete="email" placeholder="person@example.com" required /></label><label>Account level<select name="level" required>${managerOptions}</select></label><input type="hidden" name="action" value="add" /><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Add user</button><button class="button button-light" type="button" data-cancel-team-edit hidden>Cancel edit</button><span data-admin-team-feedback role="status" aria-live="polite"></span></div></form><div class="admin-team-list" data-admin-team-list role="status" aria-live="polite">Loading team members…</div></section>` : '';
  const directorApprovals = isDirector ? `<section class="admin-market-panel admin-director-approval-panel" data-director-approval-panel hidden><div class="admin-market-panel-heading"><div><span>Director governance</span><h2>Removal Approvals</h2></div><p>Every Director except the requester and the Director named in a request must approve it. One rejection stops the request.</p></div><div data-director-removal-requests role="status" aria-live="polite">Loading approval requests…</div></section>` : '';
  return `<main class="admin-portal-page admin-access-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin-access"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || '')}</span><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="${isDirector ? '#admin' : '#admin-orders'}" aria-label="Back to portal">‹</a><div><span>Access level</span><h1>${level.name}</h1></div></header><section class="admin-access-level-summary"><span>YOUR ADMIN LEVEL</span><h2>${level.name}</h2></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Portal permissions</span><h2>Your Available Functions</h2></div><p>Your access follows the permissions assigned to your account.</p></div><div class="admin-access-feature-grid">${availableFeatures}</div></section>${directorApprovals}${teamManagement}</main>`;
}

export function setupAdminAccess() {
  const root = document.querySelector('.admin-access-page');
  const team = root?.querySelector('[data-admin-team-list]');
  const form = root?.querySelector('[data-admin-team-form]');
  const approvals = root?.querySelector('[data-director-removal-requests]');
  const notificationBadge = document.querySelector('[data-director-removal-badge]');
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const callerLevel = levels[profile.role] || levels.executive;
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
  if (!root || !team || !form) return;
  const renderTeam = async () => {
    team.textContent = 'Loading team members…';
    const { data, error } = await supabase.rpc('get_admin_team');
    if (error) {
      team.textContent = 'Team access is not connected yet. Apply the admin access migration in Supabase.';
      return;
    }
    const members = Array.isArray(data) ? data : [];
    team.innerHTML = members.length ? members.map((member) => {
      const memberLevel = levels[member.level] || levels.executive;
      const canManage = member.level !== 'driver' && memberLevel.order < callerLevel.order;
      const canRemoveDriver = member.level === 'driver' && callerLevel.order >= 2;
      const canRemoveDirector = callerLevel.order === 3 && memberLevel.order === 3
        && member.email && member.email.toLowerCase() !== String(profile.email || '').toLowerCase();
      const controls = `${canManage ? `<button class="button button-light" type="button" data-edit-team-member data-email="${escapeHTML(member.email || '')}" data-level="${escapeHTML(member.level || '')}">Edit</button>` : ''}${canManage || canRemoveDirector || canRemoveDriver ? `<button class="button button-light" type="button" data-remove-team-member data-email="${escapeHTML(member.email || '')}" data-level="${escapeHTML(member.level || '')}">Remove</button>` : '<span class="admin-team-readonly">Same level · Read only</span>'}`;
      return `<article class="admin-team-member"><div><strong>${escapeHTML(member.display_name || 'Furgo user')}</strong><small>${escapeHTML(member.email || 'Email unavailable')} · ${escapeHTML(memberLevel.name)}</small></div>${controls}</article>`;
    }).join('') : '<p class="admin-market-empty">No portal users yet.</p>';
  };

  const submitTeamAction = async (email, level, action) => {
    const feedback = form.querySelector('[data-admin-team-feedback]');
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
    const { error } = await supabase.rpc('manage_admin_team_member', { p_email: email, p_level: level || null, p_action: action });
    if (error) {
      feedback.textContent = error.message || 'The team access change could not be saved.';
      return false;
    }
    feedback.textContent = action === 'remove' ? 'Portal access removed.' : 'Portal access saved.';
    await renderTeam();
    return true;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const saved = await submitTeamAction(String(values.get('email') || '').trim(), String(values.get('level') || ''), String(values.get('action') || 'add'));
    if (saved) resetTeamForm();
  });
  team.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-team-member]');
    if (edit) {
      form.elements.email.value = edit.dataset.email || '';
      form.elements.level.value = edit.dataset.level || 'executive';
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
      await submitTeamAction(remove.dataset.email || '', remove.dataset.level || '', 'remove');
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
  form.querySelector('[data-cancel-team-edit]')?.addEventListener('click', resetTeamForm);
  function resetTeamForm() {
    form.reset();
    const driverOption = form.elements.level.querySelector('option[value="driver"]');
    if (driverOption) driverOption.disabled = false;
    form.elements.action.value = 'add';
    form.querySelector('[type="submit"]').textContent = 'Add user';
    form.querySelector('[data-cancel-team-edit]').hidden = true;
  }
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
