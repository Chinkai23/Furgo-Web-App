import { bottomNavigation, escapeHTML } from '../shared.js';
import { notificationPreferencesMarkup } from '../portal-notifications.js';

const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;

export function notificationSettingsPage(from = 'profile') {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const role = profile.role === 'admin' ? 'director' : profile.role || 'customer';
  const isSupplier = role === 'supplier';
  const isDriver = role === 'driver';
  const isAdmin = ['executive', 'manager', 'director'].includes(role);
  const preferencePortal = isAdmin ? 'admin' : isSupplier ? 'supplier' : isDriver ? 'driver' : 'customer';
  const returnTo = {
    profile: '#profile',
    driver: '#profile',
    supplier: '#supplier?tab=profile',
    admin: '#admin-access',
    'admin-access': '#admin-access',
  }[from] || (isSupplier ? '#supplier?tab=profile' : isAdmin ? '#admin-access' : '#profile');

  if (isAdmin || isSupplier) {
    const portalName = isSupplier ? 'Marketplace Supplier' : 'Admin';
    return `<main class="admin-portal-page notification-settings-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="${returnTo}"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>${portalName} Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(profile.name || profile.supplierName || '')}</span></div></header><header class="admin-market-heading"><a href="${returnTo}" aria-label="Back to My Profile">‹</a><div><span>General</span><h1>Notification</h1></div></header>${notificationPreferencesMarkup(preferencePortal)}</main>`;
  }

  return `<main class="profile-page notification-settings-page${isDriver ? ' driver-profile-page' : ''}"><header class="profile-heading"><a class="profile-back" href="${returnTo}" aria-label="Back to My Profile">‹</a><h1>Notification</h1></header><section class="notification-settings-content">${notificationPreferencesMarkup(preferencePortal)}</section>${isDriver ? '' : bottomNavigation('profile', icon)}<div class="home-toast" role="status" aria-live="polite"></div></main>`;
}
