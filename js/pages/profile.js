import { bottomNavigation, escapeHTML } from '../shared.js';

// My Profile screen: account summary, settings groups, support links, and logout action.
export function profilePage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const name = profile.name || 'Pet Parent';
  const phone = profile.phone || 'Not provided in this demo';
  const email = profile.email || 'Not provided in this demo';
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const menuRow = (label, href, action = '') => `<a class="profile-menu-row" href="${href}" ${action}><span>${label}</span><span class="profile-chevron" aria-hidden="true">›</span></a>`;
  return `<main class="profile-page">
    <header class="profile-heading"><a class="profile-back" href="#home" aria-label="Back to home">‹</a><h1>My Profile</h1></header>
    <section class="profile-summary" aria-label="Account details"><div class="profile-summary-top"><h2>${escapeHTML(name)}</h2><a class="profile-edit-link" href="#edit-profile?from=profile">Edit Profile</a></div><p>${escapeHTML(phone)}</p><p>${escapeHTML(email)}</p></section>
    <nav class="profile-menu" aria-label="Profile settings">
      <section class="profile-menu-group"><h2>General</h2>${menuRow('Address', '#address?from=profile')}${menuRow('Payment Method', '#payment-method?from=profile')}${menuRow('My Furgo Credit', '#credit?from=profile')}</section>
      <section class="profile-menu-group"><h2>Support</h2>${menuRow('Help Center', '#help-center?from=profile')}${menuRow('Share Feedback', '#feedback?from=profile')}</section>
    </nav>
    <button class="profile-logout" type="button" data-logout>Logout</button>
    ${bottomNavigation('profile', icon)}<div class="home-toast" role="status" aria-live="polite"></div>
  </main>`;
}
