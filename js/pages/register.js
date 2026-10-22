import { header, phoneField } from '../shared.js';

// Registration screen: collect both contact details while OTP is temporarily disabled for development.
export function registerPage() {
  const fields = `<div class="form-field"><label for="name">Your name</label><input id="name" name="name" autocomplete="name" placeholder="e.g. Alex Tan" required /></div>
    <div class="form-field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required /></div>
    ${phoneField('register-phone')}
    <div class="form-field"><label for="password">Create password</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required /><button class="show-password" type="button" aria-label="Show password">Show</button></div></div>
    <div class="form-options terms-row"><label class="check-label"><input type="checkbox" name="terms" required /> I agree to the Terms of Service and Privacy Policy</label></div>`;
  return `${header()}<main class="auth-shell"><section class="auth-panel"><h2>Create Your Account</h2><p class="auth-intro">Join Furgo for thoughtful care at every step.</p><p class="demo-note">Development testing: log in with your email address. Phone login and WhatsApp verification will be enabled after phone service is configured.</p><div class="form-feedback" role="status" aria-live="polite"></div><form data-auth-form="register">${fields}<button class="button button-primary auth-submit" type="submit">Create account <span aria-hidden="true">→</span></button></form><p class="auth-switch">Already have a Furgo account? <a class="text-link" href="#login">Log in</a></p></section></main><footer class="auth-footer">© ${new Date().getFullYear()} Furgo · Better Care For Every Pet</footer>`;
}
