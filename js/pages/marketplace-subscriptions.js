import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadMarketplaceSubscriptionCart, loadMarketplaceSubscriptions, loadMarketplaceProducts, marketplaceSubscriptionLine, safeMarketplaceImage } from './marketplace-data.js';

const subscriptionIntervals = [
  ['month', 1, 'Every 1 Month'],
  ['month', 2, 'Every 2 Months'],
  ['month', 3, 'Every 3 Months'],
];

function nextDeliveryDate(item) {
  const intervalMonths = Math.max(1, Number(item.intervalCount) || 1);
  const startedAt = new Date(item.startedAt || Date.now());
  const addMonths = (date, months) => {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + months);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    return next;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = addMonths(startedAt, intervalMonths);
  while (next < today) next = addMonths(next, intervalMonths);
  return next.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function subscriptionCards(items, type) {
  return items.map((item, index) => {
    const line = marketplaceSubscriptionLine(item);
    if (!line) return '';
    const editing = type === 'active' && item.editing === true;
    const shownInterval = editing ? item.draftInterval : line.interval;
    const shownIntervalCount = editing ? Number(item.draftIntervalCount) || line.intervalCount : line.intervalCount;
    const shownQuantity = editing ? Number(item.draftQuantity) || line.quantity : line.quantity;
    const image = (line.product.images || []).map(safeMarketplaceImage).find(Boolean);
    const visual = image
      ? `<img class="market-subscription-image" src="${escapeHTML(image)}" alt="${escapeHTML(line.product.name)}" />`
      : `<span class="market-subscription-image" aria-hidden="true">${escapeHTML(line.product.emoji || '🐾')}</span>`;
    const cadence = subscriptionIntervals.map(([unit, count, label]) => `<option value="${unit}:${count}" ${shownInterval === unit && shownIntervalCount === count ? 'selected' : ''}>${label}</option>`).join('');
    const group = type === 'active' ? 'active-subscription' : 'subscription-cart';
    const subscribeAction = type === 'cart' ? `<button class="button button-primary market-subscription-confirm" type="button" data-subscription-confirm="${index}">Subscribe Now</button>` : '';
    const activeActions = type === 'active' ? (editing
      ? `<button class="market-subscription-edit-action is-save" type="button" data-subscription-save="${index}">Save Changes</button><button class="market-subscription-edit-action is-cancel" type="button" data-subscription-cancel-edit="${index}">Cancel</button>`
      : `<button class="market-subscription-edit-action" type="button" data-subscription-edit="${index}">Edit Subscription</button>`) : '';
    const activeMeta = type === 'active' ? `<button class="market-subscription-remove-active" type="button" data-subscription-remove="${group}:${index}">Remove Subscription</button>` : '';
    const title = `<div class="market-subscription-item-heading"><div><span class="market-product-category">${escapeHTML(line.product.category || 'Product')}</span><h3>${escapeHTML(line.product.name)}</h3></div>${activeMeta}</div>`;
    const removeCart = type === 'cart' ? `<button class="market-subscription-remove" type="button" data-subscription-remove="${group}:${index}" aria-label="Remove ${escapeHTML(line.product.name)}" title="Remove item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 14h11l1-14M9 7V4h6v3" /></svg></button>` : '';
    const activeDeliveryDate = `<div class="market-subscription-next-delivery"><span>Next delivery</span><strong>${escapeHTML(nextDeliveryDate({ ...item, interval: shownInterval, intervalCount: shownIntervalCount }))}</strong></div>`;
    const activeControls = editing
      ? `<label>Delivery frequency<select data-subscription-interval="${group}:${index}">${cadence}</select></label><label>Quantity<input type="number" min="1" max="${Number(line.variant.stock)}" value="${shownQuantity}" data-subscription-quantity="${group}:${index}" /></label><div class="market-subscription-secondary-row">${activeDeliveryDate}<div class="market-subscription-actions">${activeActions}</div></div>`
      : `<div class="market-subscription-value"><span>Delivery frequency</span><strong>${escapeHTML(subscriptionIntervals.find(([unit, count]) => unit === shownInterval && count === shownIntervalCount)?.[2] || 'Every 1 Month')}</strong></div><div class="market-subscription-value"><span>Quantity</span><strong>${shownQuantity}</strong></div><div class="market-subscription-secondary-row">${activeDeliveryDate}<div class="market-subscription-actions">${activeActions}</div></div>`;
    const cartControls = `<label>Delivery frequency<select data-subscription-interval="${group}:${index}">${cadence}</select></label><label>Quantity<input type="number" min="1" max="${Number(line.variant.stock)}" value="${shownQuantity}" data-subscription-quantity="${group}:${index}" /></label>${removeCart}<div class="market-subscription-actions">${subscribeAction}</div>`;
    return `<article class="market-subscription-item ${type === 'active' ? 'is-active' : 'is-cart'}">${visual}<div class="market-subscription-item-copy">${title}<p>${escapeHTML(line.variant.label || 'Standard')} · MYR ${Number(line.variant.price).toFixed(2)} each delivery</p><div class="market-subscription-controls">${type === 'active' ? activeControls : cartControls}</div></div></article>`;
  }).join('');
}

export function marketplaceSubscriptionsPage() {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const products = loadMarketplaceProducts();
  const cart = loadMarketplaceSubscriptionCart();
  const active = loadMarketplaceSubscriptions();
  const cartLines = cart.map((item) => marketplaceSubscriptionLine(item, products)).filter(Boolean);
  const activeLines = active.map((item) => marketplaceSubscriptionLine(item, products)).filter(Boolean);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const activeCount = activeLines.reduce((sum, line) => sum + line.quantity, 0);
  const empty = !cartLines.length && !activeLines.length;
  const cartSection = cartLines.length
    ? `<section class="market-subscription-cart-section" aria-labelledby="market-subscription-cart-heading"><div class="market-subscription-section-heading"><div><span class="market-kicker">Not subscribed yet</span><h2 id="market-subscription-cart-heading">Subscription Cart</h2></div><span>${cartCount} item${cartCount === 1 ? '' : 's'}</span></div><p class="market-subscription-section-copy">Review your delivery schedule and quantity, then select Subscribe to activate the subscription in this preview.</p><div class="market-subscription-list">${subscriptionCards(cart, 'cart')}</div></section>`
    : '';
  const activeSection = activeLines.length
    ? `<section class="market-subscription-active-section" aria-labelledby="market-active-subscriptions-heading"><div class="market-subscription-section-heading"><div><span class="market-kicker">Confirmed for repeat delivery</span><h2 id="market-active-subscriptions-heading">Active Subscriptions</h2></div><span>${activeCount} item${activeCount === 1 ? '' : 's'}</span></div><p class="market-subscription-section-copy">Edit the frequency or quantity, or remove a product from your active subscriptions.</p><div class="market-subscription-list">${subscriptionCards(active, 'active')}</div></section>`
    : '';
  return `<main class="marketplace-page"><header class="marketplace-header"><a class="market-back" href="#marketplace" aria-label="Back to Marketplace">‹</a><div><span class="market-kicker">Repeat deliveries</span><h1>Subscriptions</h1></div><div class="market-header-actions"><a class="market-favorites-link" href="#favourites" aria-label="My favourites"><img src="${icon('Icon-15.png')}" alt="" /></a><a class="market-cart-link" href="#cart" aria-label="Shopping cart"><img src="${icon('Icon-14.png')}" alt="" /></a></div></header>${empty ? `<section class="market-empty-cart market-subscription-empty"><img src="${icon('Icon-21.png')}" alt="" /><h2>Your Subscription Cart Is Empty</h2><p>Choose a product and select “Subscribe This Product” to add it here.</p><a class="button button-primary" href="#marketplace">Browse Marketplace</a></section>` : `<section class="market-subscription-page">${cartSection}${activeSection}<p class="market-subscription-prototype-note">Subscription preview only. Automatic card charges, reminder messages, and supplier orders are not active yet.</p></section>`}${bottomNavigation('marketplace', icon)}<div class="home-toast" role="status" aria-live="polite"></div></main>`;
}
