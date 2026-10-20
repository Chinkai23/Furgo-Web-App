import { bottomNavigation, escapeHTML, loadHelpCenterDetails } from '../shared.js';

// Help Center screen with starter FAQs while Furgo's live support service is being planned.
export function helpCenterPage(returnTo = 'profile') {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const details = loadHelpCenterDetails();
  const backTarget = returnTo === 'home' ? '#home' : '#profile';
  const backLabel = returnTo === 'home' ? 'Back to Home' : 'Back to My Profile';
  return `<main class="profile-page support-destination"><header class="profile-heading"><a class="profile-back" href="${backTarget}" aria-label="${backLabel}">‹</a><h1>Help Center</h1></header><section class="profile-card help-card"><h2>How can we help?</h2><p>Choose a topic below to find help with Furgo.</p><details><summary>Account and profile</summary><p>Review your profile from My Profile. Name edits are available in Edit Profile; phone and email changes need verified account support.</p></details><details><summary>Marketplace orders</summary><p>Order tracking and returns will be available when marketplace services are connected.</p></details><details><summary>Grooming, hotel, and daycare</summary><p>Booking changes and service questions will be supported here as those services are added.</p></details><a class="profile-edit-link help-feedback-link" href="#feedback?from=help-center&return=${encodeURIComponent(returnTo)}">Share feedback</a></section><section class="profile-card help-contact-card" aria-label="About Furgo and customer service"><h2>About Us</h2><p class="help-about-copy">${escapeHTML(details.aboutUs)}</p><dl><div><dt>Customer service number</dt><dd>${escapeHTML(details.phone)}</dd></div><div><dt>Address</dt><dd>${escapeHTML(details.address)}</dd></div></dl></section>${bottomNavigation('help', icon, returnTo)}</main>`;
}
