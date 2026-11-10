import { bottomNavigation, escapeHTML, loadHelpCenterDetails } from '../shared.js';
import { supabase } from '../supabase.js';

// Help Center screen with starter FAQs while Furgo's live support service is being planned.
export function helpCenterPage(returnTo = 'profile') {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const isDriver = profile.role === 'driver';
  const isCustomer = !profile.role || profile.role === 'customer';
  const details = loadHelpCenterDetails();
  const backTarget = isDriver ? '#driver' : returnTo === 'home' ? '#home' : returnTo === 'orders' ? '#orders' : '#profile';
  const backLabel = isDriver ? 'Back to Driver Portal' : returnTo === 'home' ? 'Back to Home' : returnTo === 'orders' ? 'Back to My Orders' : 'Back to My Profile';
  const joinFurgo = isCustomer ? `<section class="profile-card furgo-join-card"><h2>Want to work with Furgo?</h2><p>Apply to join our community as a marketplace supplier, outlet staff member, or driver.</p><button class="button button-primary" type="button" data-open-role-application>Apply to Join Furgo</button><form class="furgo-role-application-form" data-role-application-form hidden><label>Your preferred role<select name="role" required><option value="">Choose a role</option><option value="supplier">Marketplace Supplier</option><option value="outlet_staff">Outlet Staff</option><option value="driver">Driver</option></select></label><label data-role-company-field hidden>Supplier company name<input name="companyName" type="text" maxlength="100" placeholder="Your business name" /></label><label>Tell us a little about your application<textarea name="message" maxlength="1000" rows="3" placeholder="Optional"></textarea></label><button class="button button-primary" type="submit">Send Application</button><p data-role-application-feedback role="status" aria-live="polite"></p></form></section>` : '';
  return `<main class="profile-page support-destination${isDriver ? ' driver-profile-page' : ''}"><header class="profile-heading"><a class="profile-back" href="${backTarget}" aria-label="${backLabel}">‹</a><h1>Help Center</h1></header><section class="profile-card help-card"><h2>How Can We Help?</h2><p>Choose a topic below to find help with Furgo.</p><details><summary>Account and profile</summary><p>Review your profile from My Profile. Name edits are available in Edit Profile; phone and email changes need verified account support.</p></details><details><summary>Marketplace orders</summary><p>Order tracking and returns will be available when marketplace services are connected.</p></details><details><summary>Grooming, hotel, and daycare</summary><p>Booking changes and service questions will be supported here as those services are added.</p></details><a class="profile-edit-link help-feedback-link" href="#feedback?from=help-center&return=${encodeURIComponent(isDriver ? 'driver' : returnTo)}">Share feedback</a></section><section class="profile-card customer-enquiries-card"><h2>My Enquiries</h2><p>Check Furgo’s replies to your feedback and support requests.</p><div data-customer-enquiries role="status" aria-live="polite">Loading your enquiries…</div></section><section class="profile-card help-contact-card" aria-label="About Furgo and customer service"><h2>About Us</h2><p class="help-about-copy">${escapeHTML(details.aboutUs)}</p><dl><div><dt>Customer service number</dt><dd>${escapeHTML(details.phone)}</dd></div><div><dt>Address</dt><dd>${escapeHTML(details.address)}</dd></div></dl></section>${joinFurgo}${isDriver ? '' : bottomNavigation('help', icon, returnTo)}</main>`;
}

export function setupRoleApplication() {
  const form = document.querySelector('[data-role-application-form]');
  const openButton = document.querySelector('[data-open-role-application]');
  if (!form || !openButton) return;
  const roleSelect = form.elements.role;
  const companyField = form.querySelector('[data-role-company-field]');
  const companyInput = form.elements.companyName;
  const feedback = form.querySelector('[data-role-application-feedback]');
  openButton.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  roleSelect.addEventListener('change', () => {
    const isSupplier = roleSelect.value === 'supplier';
    companyField.hidden = !isSupplier;
    companyInput.required = isSupplier;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    feedback.textContent = 'Sending your application…';
    const { error } = await supabase.rpc('submit_furgo_role_application', {
      p_role: String(values.get('role') || ''),
      p_company_name: String(values.get('companyName') || '').trim(),
      p_message: String(values.get('message') || '').trim(),
    });
    if (error) {
      feedback.textContent = /submit_furgo_role_application|schema cache|function .*not found/i.test(error.message || '')
        ? 'Applications are not connected yet. Please contact Furgo support.'
        : error.message || 'Your application could not be sent.';
      feedback.classList.add('is-error');
      return;
    }
    feedback.classList.remove('is-error');
    feedback.textContent = 'Application sent. Furgo will review it and contact you with an update.';
    form.reset();
    companyField.hidden = true;
    companyInput.required = false;
  });
}
