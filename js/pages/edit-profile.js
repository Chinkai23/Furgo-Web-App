import { bottomNavigation, escapeHTML } from '../shared.js';

// Edit Profile screen: username can be changed, while the phone ID and email are read-only.
export function editProfilePage(returnTo = 'profile') {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  return `<main class="profile-page edit-profile-page">
    <header class="profile-heading"><a class="profile-back" href="${returnTo === 'home' ? '#home' : '#profile'}" aria-label="${returnTo === 'home' ? 'Back to Home' : 'Back to My Profile'}">‹</a><h1>Edit Profile</h1></header>
    <form class="edit-profile-form" data-profile-form><h2>Your Information</h2>
      <div class="edit-field"><label for="profile-name">Username</label><input id="profile-name" name="name" autocomplete="name" value="${escapeHTML(profile.name || '')}" required maxlength="80" /></div>
      <div class="edit-field"><label for="profile-phone">User ID. Phone Number</label><input id="profile-phone" value="${escapeHTML(profile.phone || 'Not provided in this demo')}" readonly aria-readonly="true" /></div>
      <div class="edit-field"><label for="profile-email">Email Address</label><input id="profile-email" value="${escapeHTML(profile.email || 'Not provided in this demo')}" readonly aria-readonly="true" /></div>
      <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary edit-save-button" type="submit">Save Edit</button>
    </form>
    ${bottomNavigation(returnTo === 'home' ? 'home' : 'profile', icon)}<div class="home-toast" role="status" aria-live="polite"></div>
  </main>`;
}
