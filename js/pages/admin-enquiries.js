import { escapeHTML, loadHelpCenterDetails } from '../shared.js';
import { supabase } from '../supabase.js';

function enquiryCard(enquiry, index) {
  const receivedAt = enquiry.created_at ? new Date(enquiry.created_at) : null;
  const repliedAt = enquiry.replied_at ? new Date(enquiry.replied_at) : null;
  const replied = Boolean(enquiry.reply && repliedAt);
  return `<article class="admin-enquiry-card"><header><div><span>Enquiry ${index + 1} · <b class="admin-enquiry-status ${replied ? 'is-replied' : 'is-pending'}">${replied ? 'Replied' : 'Awaiting Reply'}</b></span><h2>${escapeHTML(enquiry.topic || 'General Enquiry')}</h2></div><time datetime="${escapeHTML(enquiry.created_at || '')}">Received ${escapeHTML(receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt.toLocaleString('en-MY') : 'Date Not Recorded')}</time></header><p class="admin-enquiry-message">${escapeHTML(enquiry.message || '')}</p>${replied ? `<section class="admin-enquiry-reply"><header><strong>Reply Sent By ${escapeHTML(enquiry.replied_by_name || 'Admin')}</strong><time datetime="${escapeHTML(enquiry.replied_at)}">${escapeHTML(!Number.isNaN(repliedAt.getTime()) ? repliedAt.toLocaleString('en-MY') : '')}</time></header><p>${escapeHTML(enquiry.reply)}</p></section>` : ''}<form class="admin-enquiry-reply-form" data-enquiry-reply-form data-enquiry-id="${escapeHTML(enquiry.id)}"><label for="reply-${escapeHTML(enquiry.id)}">${replied ? 'Update Reply' : 'Reply To Customer'}</label><textarea id="reply-${escapeHTML(enquiry.id)}" name="reply" maxlength="3000" required placeholder="Write a reply…">${escapeHTML(enquiry.reply || '')}</textarea><div><span data-enquiry-reply-feedback role="status" aria-live="polite"></span><button class="button button-primary" type="submit">${replied ? 'Update Reply' : 'Send Reply'}</button></div></form></article>`;
}

// Admin inbox for customer enquiries and shared Help Center details.
export function adminEnquiriesPage() {
  const details = loadHelpCenterDetails();
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const canEditHelp = ['manager', 'director', 'admin'].includes(profile.role);
  const helpDetailsForm = canEditHelp ? `<section class="admin-market-panel admin-help-content-panel"><div class="admin-market-panel-heading"><div><span>Help Center Content</span><h2>About Us &amp; Contact Details</h2></div><p>These details appear on the customer Help Center.</p></div><dl class="admin-help-details-view"><div><dt>About Us</dt><dd data-help-about>${escapeHTML(details.aboutUs || 'Not set')}</dd></div><div><dt>Customer Service Number</dt><dd data-help-phone>${escapeHTML(details.phone || 'Not set')}</dd></div><div><dt>Address</dt><dd data-help-address>${escapeHTML(details.address || 'Not set')}</dd></div></dl><div class="admin-market-form-actions"><button class="button button-primary" type="button" data-edit-help-details>EDIT DETAILS</button><span data-admin-help-details-feedback role="status" aria-live="polite"></span></div><dialog class="admin-help-details-dialog" data-help-details-dialog aria-labelledby="admin-help-details-title"><header><div><span>Help Center Content</span><h2 id="admin-help-details-title">Edit Details</h2></div><button class="admin-help-details-close" type="button" data-close-help-details aria-label="Close edit form">×</button></header><form class="admin-help-details-form" data-admin-help-details><label>About Us<textarea name="aboutUs" rows="4" maxlength="1200">${escapeHTML(details.aboutUs)}</textarea></label><label>Customer Service Number<input name="phone" type="tel" maxlength="40" value="${escapeHTML(details.phone)}" /></label><label>Address<textarea name="address" rows="3" maxlength="500">${escapeHTML(details.address)}</textarea></label><div class="admin-market-form-actions"><button class="button button-light" type="button" data-cancel-help-details>CANCEL</button><button class="button button-primary" type="submit">SAVE DETAILS</button></div></form></dialog></section>` : '';

  return `<main class="admin-portal-page admin-enquiries-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Home</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>Customer Support</span><h1>Help &amp; Enquiries</h1></div></header><section class="admin-market-stats"><article><span>Enquiries Received</span><strong data-enquiry-total>—</strong></article><article><span>Awaiting Reply</span><strong data-enquiry-pending>—</strong></article><article><span>Replied</span><strong data-enquiry-replied>—</strong></article></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer Support</span><h2>Enquiry Inbox</h2></div><p>All admin levels can reply. Admin replies and their send times are visible here; customers see the reply without the staff member’s name.</p></div><div class="admin-enquiry-list" data-enquiry-list role="status" aria-live="polite">Loading Enquiries…</div></section>${helpDetailsForm}</main>`;
}

export function setupAdminEnquiries() {
  const list = document.querySelector('[data-enquiry-list]');
  if (!list) return;
  const helpForm = document.querySelector('[data-admin-help-details]');
  const helpDialog = document.querySelector('[data-help-details-dialog]');
  const editHelpButton = document.querySelector('[data-edit-help-details]');
  const closeHelpDialog = () => helpDialog?.close();
  editHelpButton?.addEventListener('click', () => {
    document.querySelector('[data-admin-help-details-feedback]')?.replaceChildren();
    helpDialog?.showModal();
    helpForm?.elements.aboutUs.focus();
  });
  helpDialog?.querySelector('[data-close-help-details]')?.addEventListener('click', closeHelpDialog);
  helpDialog?.querySelector('[data-cancel-help-details]')?.addEventListener('click', closeHelpDialog);
  helpDialog?.addEventListener('click', (event) => {
    if (event.target === helpDialog) closeHelpDialog();
  });
  helpForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const details = {
      aboutUs: helpForm.elements.aboutUs.value.trim(),
      phone: helpForm.elements.phone.value.trim(),
      address: helpForm.elements.address.value.trim(),
    };
    localStorage.setItem('furgo-demo-help-center-details', JSON.stringify(details));
    document.querySelector('[data-help-about]').textContent = details.aboutUs || 'Not set';
    document.querySelector('[data-help-phone]').textContent = details.phone || 'Not set';
    document.querySelector('[data-help-address]').textContent = details.address || 'Not set';
    closeHelpDialog();
    document.querySelector('[data-admin-help-details-feedback]').textContent = 'Help Center details saved.';
  });

  const renderEnquiries = async () => {
    list.textContent = 'Loading enquiries…';
    const { data, error } = await supabase.from('support_enquiries')
      .select('id,topic,message,created_at,reply,replied_at,replied_by_name')
      .order('created_at', { ascending: false });
    if (error) {
      list.textContent = 'The enquiry inbox is not connected yet. Apply migration 0015 in Supabase.';
      return;
    }
    const enquiries = Array.isArray(data) ? data : [];
    const repliedCount = enquiries.filter((item) => item.reply && item.replied_at).length;
    document.querySelector('[data-enquiry-total]').textContent = String(enquiries.length);
    document.querySelector('[data-enquiry-pending]').textContent = String(enquiries.length - repliedCount);
    document.querySelector('[data-enquiry-replied]').textContent = String(repliedCount);
    list.innerHTML = enquiries.length
      ? enquiries.map(enquiryCard).join('')
      : '<p class="admin-market-empty">No customer enquiries have been submitted yet.</p>';
  };

  list.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-enquiry-reply-form]');
    if (!form) return;
    event.preventDefault();
    const reply = form.elements.reply.value.trim();
    const feedback = form.querySelector('[data-enquiry-reply-feedback]');
    const button = form.querySelector('[type="submit"]');
    if (!reply) return;
    button.disabled = true;
    feedback.textContent = 'Sending reply…';
    const { error } = await supabase.rpc('reply_to_support_enquiry', {
      p_enquiry_id: form.dataset.enquiryId,
      p_reply: reply,
    });
    if (error) {
      button.disabled = false;
      feedback.textContent = error.message || 'The reply could not be saved.';
      return;
    }
    await renderEnquiries();
  });

  void renderEnquiries();
}
