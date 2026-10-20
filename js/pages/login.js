import { header } from '../shared.js';

// Login screen: let returning customers use either their Malaysian phone number or email with a password.
export function loginPage() {
  const fields = `<div class="form-field"><label for="login-identifier">Phone number / Email Address</label><input id="login-identifier" name="identifier" type="text" inputmode="text" autocomplete="username" placeholder="Use email while phone login is being configured" required data-login-identifier /></div>
    <div class="form-field"><label for="password">Password</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required /><button class="show-password" type="button" aria-label="Show password">Show</button></div></div>
    <div class="form-options"><a class="text-link" href="#login" data-forgot>Forgot password?</a></div>`;
  return `${header()}<main class="auth-shell"><section class="auth-panel"><h2>Welcome back</h2><p class="auth-intro">Log in to keep all your pet care in one place.</p><div class="form-feedback" role="status" aria-live="polite"></div><form data-auth-form="login">${fields}<button class="button button-primary auth-submit" type="submit">Log in <span aria-hidden="true">→</span></button></form><p class="auth-switch">New to Furgo? <a class="text-link" href="#register">Create an account</a></p></section></main><footer class="auth-footer">© ${new Date().getFullYear()} Furgo · Better Care For Every Pet</footer>`;
}
