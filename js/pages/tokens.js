import { bottomNavigation, escapeHTML } from '../shared.js';
import { cachedFurgoCoinBalance } from '../coin-wallet.js';

function formatLastCheckinDate(dateKey, today) {
  if (!dateKey) return '—';
  if (dateKey === today) return 'Today';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function checkinTimelineMarkup(state = {}, loading = false) {
  const today = String(state.today || '');
  const checkedInToday = Boolean(state.checked_in_today);
  const totalStreak = Math.max(0, Number(state.streak) || 0);
  const streak = totalStreak % 7;
  const cycleCompletedToday = checkedInToday && totalStreak > 0 && streak === 0;
  const steps = Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    const complete = cycleCompletedToday || day <= streak;
    const current = !checkedInToday && day === streak + 1;
    return `<li class="token-streak-day${complete ? ' is-complete' : ''}${current ? ' is-current' : ''}" data-token-streak-step="${day}"><span class="token-streak-marker" aria-hidden="true">${complete ? '<img src="Image/Other%20Image/Paw.png" alt="" />' : day}</span><span>Day ${day}</span></li>`;
  }).join('');
  const status = loading
    ? 'Loading check-in status…'
    : cycleCompletedToday
      ? '7-day cycle complete · back to day 0'
      : checkedInToday
        ? `You’re on day ${streak || 7} of your streak`
        : 'Check in today to continue your streak';
  const lastCheckin = String(state.last_checkin_date || '');
  const buttonText = loading ? 'Loading…' : checkedInToday ? 'Checked In Today' : 'Check In Today';
  return `<div class="token-streak-timeline" data-token-streak-timeline><div class="token-streak-heading"><strong>7-Day Check-In</strong><span data-token-streak-status>${escapeHTML(status)}</span></div><ol data-token-streak-list>${steps}</ol><button class="token-streak-checkin-button" type="button" data-token-checkin ${loading || checkedInToday ? 'disabled' : ''}>${buttonText}</button><p class="token-last-checkin" data-token-last-checkin role="status" aria-live="polite">Last Check In: ${escapeHTML(formatLastCheckinDate(lastCheckin, today))}</p><p class="token-checkin-feedback" data-token-checkin-feedback role="status" aria-live="polite"></p></div>`;
}

export function tokensPage() {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const balance = cachedFurgoCoinBalance();
  const timeline = checkinTimelineMarkup({}, true);

  return `<main class="profile-page account-page tokens-page">
    <header class="profile-heading"><a class="profile-back" href="#home" aria-label="Back to Home">‹</a><h1>Furgo Coins</h1></header>
    <section class="token-balance-card"><div class="token-balance-summary"><img src="Image/Other%20Image/Pet%20Token-1.png" alt="" /><div><span>Your Furgo Coins balance</span><strong><span data-furgo-coins-balance>${balance.toLocaleString()}</span> <small>Coins</small></strong></div></div>${timeline}</section>
    <section class="profile-card account-card token-info-section" aria-labelledby="token-earn-heading">
      <h2 id="token-earn-heading">Ways to Earn Furgo Coins</h2>
      <div class="token-info-list">
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">✓</span><div><h3>Daily Check-In</h3><p>Check in daily to build your 7-day streak. Coin reward details are coming soon.</p></div></article>
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">♡</span><div><h3>Shop the Marketplace</h3><p>Eligible purchases may earn coins. Details are coming soon.</p></div></article>
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">⌂</span><div><h3>Book a Furgo Service</h3><p>Eligible service bookings may earn coins. Details are coming soon.</p></div></article>
      </div>
    </section>
    <section class="profile-card account-card token-info-section" aria-labelledby="token-exchange-heading">
      <h2 id="token-exchange-heading">Exchange Furgo Coins</h2>
      <p class="token-info-empty">Coin exchange options will appear here once redemption details are ready.</p>
    </section>
    ${bottomNavigation('', icon)}
  </main>`;
}

export function setupTokensPage(supabase) {
  const root = document.querySelector('.tokens-page');
  const timeline = root?.querySelector('[data-token-streak-timeline]');
  if (!root || !timeline) return;

  const showState = (state, loading = false) => {
    const currentTimeline = root.querySelector('[data-token-streak-timeline]');
    if (currentTimeline) currentTimeline.outerHTML = checkinTimelineMarkup(state, loading);
  };

  const readState = async () => {
    if (!supabase?.rpc) throw new Error('Check-in is not connected. Please try again later.');
    const { data, error } = await supabase.rpc('get_furgo_coin_checkin_state');
    if (error) throw error;
    return data || {};
  };

  void readState().then((state) => showState(state)).catch((error) => {
    const button = root.querySelector('[data-token-checkin]');
    const feedback = root.querySelector('[data-token-checkin-feedback]');
    if (button) { button.disabled = true; button.textContent = 'Check-In Unavailable'; }
    if (feedback) feedback.textContent = error?.message || 'Could not load check-in status.';
  });

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-token-checkin]');
    if (!button || button.disabled || button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    button.disabled = true;
    button.textContent = 'Checking In…';
    const feedback = root.querySelector('[data-token-checkin-feedback]');
    if (feedback) feedback.textContent = '';
    try {
      if (!supabase?.rpc) throw new Error('Check-in is not connected. Please try again later.');
      const { data, error } = await supabase.rpc('claim_furgo_coin_checkin');
      if (error) throw error;
      showState(data || {});
      const nextFeedback = root.querySelector('[data-token-checkin-feedback]');
      if (nextFeedback && data?.checked_in_now) nextFeedback.textContent = 'Check-in saved.';
    } catch (error) {
      const nextFeedback = root.querySelector('[data-token-checkin-feedback]');
      if (nextFeedback) nextFeedback.textContent = error?.message || 'Could not check in. Please try again.';
      button.dataset.busy = 'false';
      button.disabled = false;
      button.textContent = 'Check In Today';
    }
  });
}
