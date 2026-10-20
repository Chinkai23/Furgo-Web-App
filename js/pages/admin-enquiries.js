import { adminBottomNavigation, escapeHTML, loadHelpCenterDetails } from '../shared.js';

// Admin customer enquiry inbox: displays feedback and support requests saved by the customer portal.
export function adminEnquiriesPage() {
  const details = loadHelpCenterDetails();
  let requests = [];
  try {
    const saved = JSON.parse(localStorage.getItem('furgo-demo-support-requests') || '[]');
    requests = Array.isArray(saved) ? saved : [];
  } catch { requests = []; }

  const cards = [...requests].reverse().map((request, index) => {
    const timestamp = request.timestamp ? new Date(request.timestamp).toLocaleString() : 'Date not recorded';
    return `<article class="admin-enquiry-card"><header><div><span>Enquiry ${requests.length - index}</span><h2>${escapeHTML(request.topic || 'General enquiry')}</h2></div><time>${escapeHTML(timestamp)}</time></header><p>${escapeHTML(request.message || '')}</p></article>`;
  }).join('');

  return `<main class="admin-portal-page admin-enquiries-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Customer operations</span><h1>Customer Enquiries</h1></div></header><section class="admin-market-stats"><article><span>Enquiries received</span><strong>${requests.length}</strong></article></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Help Center content</span><h2>About Us & contact details</h2></div><p>These details appear on the customer Help Center. Leave a field empty until it is ready to publish.</p></div><form class="admin-help-details-form" data-admin-help-details><label>About Us<textarea name="aboutUs" rows="4" maxlength="1200">${escapeHTML(details.aboutUs)}</textarea></label><label>Customer service number<input name="phone" type="tel" maxlength="40" value="${escapeHTML(details.phone)}" /></label><label>Address<textarea name="address" rows="3" maxlength="500">${escapeHTML(details.address)}</textarea></label><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Help Center Details</button><span data-admin-help-details-feedback role="status" aria-live="polite"></span></div></form></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer support</span><h2>Enquiry inbox</h2></div><p>Review feedback and support requests submitted through the customer portal.</p></div><div class="admin-enquiry-list">${cards || '<p class="admin-market-empty">No customer enquiries have been submitted yet.</p>'}</div></section></main>`;
}

// Saves admin-edited About Us and contact details for the customer Help Center.
export function setupAdminEnquiries() {
  const form = document.querySelector('[data-admin-help-details]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const details = {
      aboutUs: form.elements.aboutUs.value.trim(),
      phone: form.elements.phone.value.trim(),
      address: form.elements.address.value.trim(),
    };
    localStorage.setItem('furgo-demo-help-center-details', JSON.stringify(details));
    form.querySelector('[data-admin-help-details-feedback]').textContent = 'Help Center details saved.';
  });
}
