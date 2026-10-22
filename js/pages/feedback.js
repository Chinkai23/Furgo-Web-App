import { bottomNavigation } from '../shared.js';

// Feedback screen: collects a prototype-only message in the browser session.
export function feedbackPage(returnTo = 'profile', helpReturnTo = 'profile') {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const backTarget = returnTo === 'help-center' ? `#help-center?from=${encodeURIComponent(helpReturnTo === 'home' ? 'home' : 'profile')}` : returnTo === 'home' ? '#home' : '#profile';
  const backLabel = returnTo === 'help-center' ? 'Back to Help Center' : returnTo === 'home' ? 'Back to Home' : 'Back to My Profile';
  const helpOrigin = returnTo === 'help-center' ? helpReturnTo : returnTo;
  return `<main class="profile-page support-destination"><header class="profile-heading"><a class="profile-back" href="${backTarget}" aria-label="${backLabel}">‹</a><h1>Share Feedback</h1></header><section class="profile-card"><form class="support-form" data-support-form><h2>We’d Love To Hear From You</h2><div class="form-field"><label for="support-topic">Feedback topic</label><select id="support-topic" name="topic" required><option value="" selected disabled>Choose a topic</option><option>App experience</option><option>Services</option><option>Other</option></select></div><div class="form-field"><label for="support-message">Your feedback</label><textarea id="support-message" name="message" rows="5" placeholder="Share your thoughts" required maxlength="1000"></textarea></div><div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary edit-save-button" type="submit">Send Feedback</button><p class="demo-note">Furgo’s admin team can reply to your enquiry. Replies appear in the Help Center.</p></form></section>${bottomNavigation('help', icon, helpOrigin === 'home' ? 'home' : 'profile')}<div class="home-toast" role="status" aria-live="polite"></div></main>`;
}
