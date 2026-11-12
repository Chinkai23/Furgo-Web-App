import { bottomNavigation, escapeHTML } from '../shared.js';
import { cachedFurgoCoinBalance, refreshFurgoCoinBalance } from '../coin-wallet.js';

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
    const reward = day <= 4 ? 1 : day <= 6 ? 5 : 20;
    const complete = cycleCompletedToday || day <= streak;
    const current = !checkedInToday && day === streak + 1;
    return `<li class="token-streak-day${complete ? ' is-complete' : ''}${current ? ' is-current' : ''}" data-token-streak-step="${day}"><span class="token-streak-reward">+${reward} <img src="Image/Other%20Image/Pet%20Token-1.png" alt="Furgo Coin" /></span><span class="token-streak-marker" aria-hidden="true">${complete ? '<img src="Image/Other%20Image/Paw.png" alt="" />' : day}</span><span>Day ${day}</span></li>`;
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

function topupSectionMarkup() {
  return `<section class="profile-card account-card token-info-section token-topup-section" aria-labelledby="token-topup-heading">
    <h2 id="token-topup-heading">Top Up Furgo Coins</h2>
    <p class="token-info-empty">Furgo Coins top-ups will be available after online payments are connected.</p>
  </section>`;
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
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">✓</span><div><h3>Daily Check-In</h3><p>Check in daily for Furgo Coins: +1 on Days 1–4, +5 on Days 5–6, and +20 on Day 7.</p></div></article>
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">♡</span><div><h3>Shop the Marketplace</h3><p>Eligible purchases may earn coins. Details are coming soon.</p></div></article>
        <article class="token-info-item"><span class="token-info-icon" aria-hidden="true">⌂</span><div><h3>Book a Furgo Service</h3><p>Eligible service bookings may earn coins. Details are coming soon.</p></div></article>
      </div>
      <article class="token-topup-entry"><div><h3>Top Up Furgo Coins</h3><p>Top-ups will launch once online payments are connected.</p></div><a class="button button-primary" href="#coin-topup">Coming Soon</a></article>
    </section>
    <section class="profile-card account-card token-info-section" aria-labelledby="token-exchange-heading">
      <h2 id="token-exchange-heading">Exchange Furgo Coins</h2>
      <div class="token-exchange-rewards" data-token-exchange-list aria-live="polite"><p class="token-info-empty">Loading available rewards…</p></div>
      <div class="token-exchange-history"><h3>Your Redemptions</h3><div data-token-exchange-history><p class="token-info-empty">Loading your redemptions…</p></div></div>
    </section>
    ${bottomNavigation('', icon)}
  </main>`;
}

export function coinTopupPage() {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  return `<main class="profile-page account-page tokens-page tokens-topup-page">
    <header class="profile-heading"><a class="profile-back" href="#tokens" aria-label="Back to Furgo Coins">‹</a><h1>Top Up Furgo Coins</h1></header>
    ${topupSectionMarkup()}
    ${bottomNavigation('', icon)}
  </main>`;
}

export function setupTokensPage(supabase) {
  const root = document.querySelector('.tokens-page');
  const timeline = root?.querySelector('[data-token-streak-timeline]');
  if (!root) return;

  const exchangeList = root.querySelector('[data-token-exchange-list]');
  const exchangeHistory = root.querySelector('[data-token-exchange-history]');
  const loadExchangeHistory = async () => {
    if (!exchangeHistory) return;
    try {
      const { data, error } = await supabase.from('furgo_coin_exchange_redemptions')
        .select('id,reward_name,coin_cost,status,created_at,fulfilled_at,voucher_code,voucher_category,voucher_discount_type,voucher_discount_value,voucher_minimum_spend,used_at')
        .order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      exchangeHistory.innerHTML = data?.length
        ? `<ul>${data.map((row) => {
          const category = ({ marketplace: 'Marketplace', grooming: 'Grooming', 'pet-hotel': 'Pet Hotel', 'pet-daycare': 'Pet Daycare', 'pet-taxi': 'Pet Taxi' })[row.voucher_category];
          const voucher = row.voucher_code ? `<small class="token-voucher-code">${escapeHTML(category || 'Voucher')} checkout · Code: <strong>${escapeHTML(row.voucher_code)}</strong>${row.used_at ? ' · Used' : ' · Available'}</small>` : '';
          return `<li><span><strong>${escapeHTML(row.reward_name)}</strong><small>${Number(row.coin_cost).toLocaleString()} Coins · ${escapeHTML(new Date(row.created_at).toLocaleDateString('en-MY'))}</small>${voucher}</span><b class="token-exchange-status ${row.status === 'fulfilled' ? 'is-fulfilled' : ''}">${row.status === 'fulfilled' ? 'Fulfilled' : 'Pending'}</b></li>`;
        }).join('')}</ul>`
        : '<p class="token-info-empty">Your redeemed rewards will appear here.</p>';
    } catch (error) {
      exchangeHistory.innerHTML = `<p class="token-info-empty">Redemption history is unavailable. ${escapeHTML(error?.message || '')}</p>`;
    }
  };
  void loadExchangeHistory();
  const loadExchangeRewards = async () => {
    if (!exchangeList) return;
    try {
      if (!supabase?.from) throw new Error('Furgo Coins exchange is not connected.');
      const { data, error } = await supabase.from('furgo_coin_exchange_items')
        .select('id,name,description,reward_type,voucher_category,voucher_discount_type,voucher_discount_value,voucher_minimum_spend,coin_cost,max_redemptions,redeemed_count,per_user_limit,image_url,terms,starts_at,expires_at')
        .eq('is_active', true).order('coin_cost', { ascending: true });
      if (error) throw error;
      if (!data?.length) {
        exchangeList.innerHTML = '<p class="token-info-empty">No rewards are available right now. Please check back later.</p>';
        return;
      }
      exchangeList.innerHTML = data.map((item) => {
        const image = item.image_url
          ? `<img class="token-exchange-image" src="${escapeHTML(item.image_url)}" alt="${escapeHTML(item.name)}" loading="lazy" />`
          : '<div class="token-exchange-image token-exchange-placeholder" aria-hidden="true">FC</div>';
        const rewardType = ({ voucher: 'Voucher', 'physical-gift': 'Physical gift', 'digital-reward': 'Digital reward', other: 'Reward' })[item.reward_type] || 'Reward';
        const voucherCategory = ({ marketplace: 'Marketplace', grooming: 'Grooming', 'pet-hotel': 'Pet Hotel', 'pet-daycare': 'Pet Daycare', 'pet-taxi': 'Pet Taxi' })[item.voucher_category];
        const voucherTerms = item.reward_type === 'voucher' ? `<small>${escapeHTML(voucherCategory || 'Marketplace')} voucher · ${item.voucher_discount_type === 'percent' ? `${Number(item.voucher_discount_value)}% off` : `MYR ${Number(item.voucher_discount_value).toFixed(2)} off`}${Number(item.voucher_minimum_spend) ? ` · Min. MYR ${Number(item.voucher_minimum_spend).toFixed(2)}` : ''}</small>` : '';
        const stock = Math.max(0, Number(item.max_redemptions) - Number(item.redeemed_count));
        const availability = [item.starts_at && `Available from ${new Date(item.starts_at).toLocaleDateString('en-MY')}`, item.expires_at && `Expires ${new Date(item.expires_at).toLocaleDateString('en-MY')}`].filter(Boolean).join(' · ');
        return `<article class="token-exchange-card" data-token-exchange-card tabindex="0" aria-expanded="false" aria-label="Show details for ${escapeHTML(item.name)}">${image}<div class="token-exchange-copy"><span class="token-exchange-type">${rewardType}</span><h3>${escapeHTML(item.name)}</h3><small>${stock} available · Limit ${Number(item.per_user_limit)} per customer</small><button class="button button-primary" type="button" data-redeem-coin-item="${escapeHTML(item.id)}" data-name="${escapeHTML(item.name)}" data-cost="${Number(item.coin_cost)}">Redeem for ${Number(item.coin_cost).toLocaleString()} Coins</button><span class="token-exchange-feedback" data-redeem-feedback="${escapeHTML(item.id)}" role="status" aria-live="polite"></span><div class="token-exchange-details" data-token-exchange-details hidden><p>${escapeHTML(item.description || 'Redeem this reward with Furgo Coins.')}</p>${voucherTerms}${availability ? `<small>${escapeHTML(availability)}</small>` : ''}${item.terms ? `<div><strong>Redemption details</strong><p>${escapeHTML(item.terms)}</p></div>` : ''}</div></div></article>`;
      }).join('');
    } catch (error) {
      exchangeList.innerHTML = `<p class="token-info-empty">Rewards are unavailable right now. ${escapeHTML(error?.message || '')} Apply the Furgo Coins exchange Supabase setup if it has not been run.</p>`;
    }
  };
  void loadExchangeRewards();
  exchangeList?.addEventListener('click', (event) => {
    if (event.target.closest('[data-redeem-coin-item]')) return;
    const card = event.target.closest('[data-token-exchange-card]');
    if (!card) return;
    const expanded = card.classList.toggle('is-expanded');
    card.setAttribute('aria-expanded', String(expanded));
    const details = card.querySelector('[data-token-exchange-details]');
    if (details) details.hidden = !expanded;
  });
  exchangeList?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('[data-token-exchange-card]');
    if (!card) return;
    event.preventDefault();
    const expanded = card.classList.toggle('is-expanded');
    card.setAttribute('aria-expanded', String(expanded));
    const details = card.querySelector('[data-token-exchange-details]');
    if (details) details.hidden = !expanded;
  });
  exchangeList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-redeem-coin-item]');
    if (!button || button.disabled) return;
    const itemName = button.dataset.name || 'this reward';
    const coinCost = Number(button.dataset.cost || 0);
    if (!window.confirm(`Redeem “${itemName}” for ${coinCost.toLocaleString()} Furgo Coins?`)) return;
    const feedback = exchangeList.querySelector(`[data-redeem-feedback="${CSS.escape(button.dataset.redeemCoinItem)}"]`);
    button.disabled = true;
    if (feedback) feedback.textContent = 'Redeeming…';
    try {
      const { error } = await supabase.rpc('redeem_furgo_coin_exchange_item', { p_item_id: button.dataset.redeemCoinItem });
      if (error) throw error;
      await refreshFurgoCoinBalance(supabase);
      await loadExchangeRewards();
      await loadExchangeHistory();
      const nextFeedback = exchangeList.querySelector(`[data-redeem-feedback="${CSS.escape(button.dataset.redeemCoinItem)}"]`);
      if (nextFeedback) nextFeedback.textContent = 'Reward redeemed. Your Furgo Coins balance has been updated.';
    } catch (error) {
      if (feedback) feedback.textContent = error?.message || 'This reward could not be redeemed.';
      button.disabled = false;
    }
  });

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

  if (timeline) void readState().then((state) => showState(state)).catch((error) => {
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
      if (data?.checked_in_now) await refreshFurgoCoinBalance(supabase);
      const nextFeedback = root.querySelector('[data-token-checkin-feedback]');
      if (nextFeedback && data?.checked_in_now) {
        const reward = Number(data.reward_coins) || 0;
        nextFeedback.textContent = `Check-in saved. +${reward} Furgo Coin${reward === 1 ? '' : 's'} added.`;
      }
    } catch (error) {
      const nextFeedback = root.querySelector('[data-token-checkin-feedback]');
      if (nextFeedback) nextFeedback.textContent = error?.message || 'Could not check in. Please try again.';
      button.dataset.busy = 'false';
      button.disabled = false;
      button.textContent = 'Check In Today';
    }
  });
}
