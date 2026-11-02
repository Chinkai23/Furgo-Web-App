import { bottomNavigation, escapeHTML } from '../shared.js';

// Edit Profile screen: username can be changed, while the phone ID and email are read-only.
export function editProfilePage(returnTo = 'profile') {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const isPortalProfile = ['admin', 'admin-access', 'driver'].includes(returnTo);
  const backHref = returnTo === 'admin' ? '#admin' : returnTo === 'admin-access' ? '#admin-access' : returnTo === 'driver' ? '#driver' : returnTo === 'home' ? '#home' : '#profile';
  const backLabel = returnTo === 'admin' || returnTo === 'admin-access' ? 'Back to Admin Portal' : returnTo === 'driver' ? 'Back to Driver Portal' : returnTo === 'home' ? 'Back to Home' : 'Back to My Profile';
  return `<main class="profile-page edit-profile-page${isPortalProfile ? ' portal-edit-profile-page' : ''}">
    ${isPortalProfile ? `<header class="admin-portal-header"><a class="admin-portal-brand" href="${backHref}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${returnTo === 'driver' ? 'Driver Portal' : 'Admin Portal'}</span></a></header>` : ''}
    <header class="profile-heading"><a class="profile-back" href="${backHref}" aria-label="${backLabel}">‹</a><h1>Edit Profile</h1></header>
    <form class="edit-profile-form" data-profile-form><h2>Your Information</h2>
      <div class="edit-field"><label for="profile-name">Username</label><input id="profile-name" name="name" autocomplete="name" value="${escapeHTML(profile.name || '')}" required maxlength="80" /></div>
      <div class="edit-field"><label for="profile-phone">User ID. Phone Number</label><input id="profile-phone" value="${escapeHTML(profile.phone || 'Not provided in this demo')}" readonly aria-readonly="true" /></div>
      <div class="edit-field"><label for="profile-email">Email Address</label><input id="profile-email" value="${escapeHTML(profile.email || 'Not provided in this demo')}" readonly aria-readonly="true" /></div>
      <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary edit-save-button" type="submit">Save Edit</button>
    </form>
    <form class="edit-profile-form change-password-form" data-change-password-form><h2>Change Password</h2><p>Enter your current password, then choose a new password.</p>
      <div class="edit-field"><label for="profile-current-password">Current Password</label><input id="profile-current-password" name="currentPassword" type="password" autocomplete="current-password" required /></div>
      <div class="edit-field"><label for="profile-new-password">New Password</label><input id="profile-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" required /></div>
      <div class="edit-field"><label for="profile-confirm-password">Confirm New Password</label><input id="profile-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required /></div>
      <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary edit-save-button" type="submit">Update Password</button>
    </form>
    ${isPortalProfile ? '' : bottomNavigation(returnTo === 'home' ? 'home' : 'profile', icon)}<div class="home-toast" role="status" aria-live="polite"></div>
  </main>`;
}
