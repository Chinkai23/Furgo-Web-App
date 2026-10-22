// Shared Furgo UI pieces used by more than one screen.
export const paw = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M17.1 20.2c3.2-.4 6.7 1.4 8.9 4.3 2.3-2.9 5.8-4.7 9-4.3 4.5.5 6.7 4.4 4.9 8.1-1.1 2.2-3.5 3.7-6.4 4.1-2.8.4-4.7 2.3-7.5 2.3s-4.7-1.9-7.5-2.3c-2.9-.4-5.3-1.9-6.4-4.1-1.8-3.7.4-7.6 5-8.1Z" fill="currentColor"/><ellipse cx="12.4" cy="16.2" rx="4.1" ry="5.2" transform="rotate(-24 12.4 16.2)" fill="currentColor"/><ellipse cx="22.2" cy="11.7" rx="4.1" ry="5.2" transform="rotate(-8 22.2 11.7)" fill="currentColor"/><ellipse cx="32.3" cy="12.4" rx="4.1" ry="5.2" transform="rotate(12 32.3 12.4)" fill="currentColor"/><ellipse cx="40.3" cy="18.2" rx="4.1" ry="5.2" transform="rotate(28 40.3 18.2)" fill="currentColor"/></svg>`;

// Escapes saved demo profile values before rendering them in HTML.
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Reads admin-managed About Us and customer service details for the Help Center.
export function loadHelpCenterDetails() {
  try {
    const details = JSON.parse(localStorage.getItem('furgo-demo-help-center-details') || '{}');
    return {
      aboutUs: typeof details.aboutUs === 'string' ? details.aboutUs : '',
      phone: typeof details.phone === 'string' ? details.phone : '',
      address: typeof details.address === 'string' ? details.address : '',
    };
  } catch {
    return { aboutUs: '', phone: '', address: '' };
  }
}

// Builds the shared website header used by Login, Register, and onboarding.
export function header() {
  return `<header class="site-header"><a class="brand" href="#home" aria-label="Furgo home"><img class="brand-image" src="Image/Icon/Logo 3.png" alt="Furgo — Better Care For Every Pet" /></a><nav class="nav-links" aria-label="Main navigation"><a href="#services">Our services</a><a href="#about">Why Furgo</a></nav><div class="nav-actions"><a class="nav-login" href="#login">Log in</a><a class="button button-primary" href="#register">Get started <span aria-hidden="true">↗</span></a></div></header>`;
}

// Builds the shared mobile footer; only the Home page marks Home active, while service pages keep it neutral.
export function bottomNavigation(active, icon, helpReturnTo = active === 'home' ? 'home' : 'profile') {
  const isHomeActive = active === 'home';
  const isActivityActive = active === 'activity';
  const isHelpActive = active === 'help';
  const isProfileActive = active === 'profile';
  // Keep the Activity page's Back link pointed at the section that opened it.
  const ordersReturnTo = ['grooming', 'marketplace', 'hotel', 'daycare', 'profile'].includes(active) ? active : 'home';

  return `<nav class="bottom-nav" aria-label="Bottom navigation"><a class="bottom-item ${isHomeActive ? 'active' : ''}" href="#home"><img src="${icon(isHomeActive ? 'Icon-02.png' : 'Icon-01.png')}" alt="" /><span>Home</span></a><a class="bottom-item ${isActivityActive ? 'active' : ''}" href="#orders?from=${encodeURIComponent(ordersReturnTo)}"><img src="${icon(isActivityActive ? 'Icon-04.png' : 'Icon-03.png')}" alt="" /><span>My Order</span></a><a class="bottom-item bottom-store" href="#check-in" aria-label="Check In"><img src="${icon('Icon-09.png')}" alt="" /></a><a class="bottom-item ${isHelpActive ? 'active' : ''}" href="#help-center?from=${encodeURIComponent(helpReturnTo)}"><img src="${icon(isHelpActive ? 'Icon-06.png' : 'Icon-05.png')}" alt="" /><span>Help</span></a><a class="bottom-item ${isProfileActive ? 'active' : ''}" href="#profile"><img src="${icon(isProfileActive ? 'Icon-08.png' : 'Icon-07.png')}" alt="" /><span>My Profile</span></a></nav>`;
}

// Builds the matching Admin footer for dashboard, order scanning, and customer enquiries.
export function adminBottomNavigation(active = '', role = 'director') {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const isDirector = role === 'director' || role === 'admin';
  const levelName = isDirector ? 'Director' : role === 'manager' ? 'Manager' : 'Executive';
  return `<nav class="bottom-nav admin-bottom-nav" aria-label="${levelName} navigation"><a class="bottom-item ${active === 'admin' ? 'active' : ''}" href="#admin"><img src="${icon(active === 'admin' ? 'Icon-02.png' : 'Icon-01.png')}" alt="" /><span>Home</span></a><a class="bottom-item ${active === 'orders' ? 'active' : ''}" href="#admin-orders"><img src="${icon(active === 'orders' ? 'Icon-04.png' : 'Icon-03.png')}" alt="" /><span>View Order</span></a><button class="bottom-item bottom-store admin-scan-trigger" type="button" data-admin-footer-scan aria-label="Scan QR order"><img src="${icon('Icon-09.png')}" alt="" /></button><a class="bottom-item ${active === 'enquiries' ? 'active' : ''}" href="#admin-enquiries"><img src="${icon(active === 'enquiries' ? 'Icon-06.png' : 'Icon-05.png')}" alt="" /><span>Help</span></a><a class="bottom-item ${active === 'admin-access' ? 'active' : ''}" href="#admin-access"><img src="${icon(active === 'admin-access' ? 'Icon-08.png' : 'Icon-07.png')}" alt="" /><span class="admin-nav-label">Admin</span>${isDirector ? '<span class="admin-notification-badge" data-director-removal-badge hidden aria-label="Pending Director approvals"></span>' : ''}</a></nav><dialog class="admin-footer-scan-dialog" data-admin-footer-scan-dialog aria-labelledby="admin-footer-scan-title"><header><h2 id="admin-footer-scan-title">Scan Order QR Code</h2><button type="button" data-close-admin-scan aria-label="Close QR scanner">×</button></header><video data-admin-footer-scan-video playsinline muted></video><p data-admin-footer-scan-feedback role="status" aria-live="polite">Starting camera…</p></dialog>`;
}

// Reusable local-format Malaysian mobile field used during registration and onboarding.
export function phoneField(id) {
  return `<div class="form-field"><label for="${id}">Phone number</label><input id="${id}" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="e.g. 0123456789" pattern="01(1[0-9]{8}|[02-9][0-9]{7})" title="Enter a Malaysian mobile number starting with 01 (10 or 11 digits)" maxlength="11" required data-phone-input /></div>`;
}

// Shows controls for requesting and entering the Supabase WhatsApp registration OTP.
export function otpControls() {
  return `<div class="otp-controls"><button class="otp-send-button" type="button" data-send-otp>Send WhatsApp code</button><span class="otp-countdown" data-otp-countdown></span></div><div class="form-field otp-code-field" data-otp-field hidden><label for="whatsapp-code">WhatsApp verification code</label><input id="whatsapp-code" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Enter 6-digit code" data-otp-input /></div><p class="otp-demo-hint" data-otp-hint hidden></p>`;
}
