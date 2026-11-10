import { escapeHTML } from './shared.js';
import { supabase } from './supabase.js';

const notificationCopy = {
  marketplace_product_request: { action: 'Review product request', href: '#admin-marketplace-manage' },
  marketplace_order: { action: 'Open orders', tab: 'orders' },
  marketplace_product_status: { action: 'View products', tab: 'home' },
};
const notificationPreferenceEvents = {
  marketplace_product_request: { title: 'Marketplace product requests', description: 'Supplier submissions waiting for Admin review.' },
  marketplace_order: { title: 'New Marketplace orders', description: 'Orders assigned to your Supplier account.' },
  marketplace_product_status: { title: 'Marketplace listing updates', description: 'Furgo changes to your product listing visibility.' },
};
let activeNotificationRoot = null;
let activeNotificationChannel = null;
let notificationGeneration = 0;
let activePreferenceRoot = null;
let notificationOutsideClickHandler = null;
let notificationEscapeHandler = null;
const notificationPreferencesByUser = new Map();

export function notificationPreferencesMarkup(portal = 'customer') {
  const applicableEvents = portal === 'admin'
    ? Object.entries(notificationPreferenceEvents).filter(([eventType]) => eventType === 'marketplace_product_request')
    : portal === 'supplier'
      ? Object.entries(notificationPreferenceEvents).filter(([eventType]) => eventType === 'marketplace_order' || eventType === 'marketplace_product_status')
      : [[`__default`, { title: portal === 'driver' ? 'Driver route and schedule notifications' : 'Customer order and booking notifications', description: `Choose where notifications sent to your ${portal} portal should appear.` }]];
  const rows = applicableEvents.map(([eventType, event]) => `<fieldset class="portal-notification-preference" data-notification-preference="${eventType}"><legend>${escapeHTML(event.title)}</legend><p>${escapeHTML(event.description)}</p><label><input type="checkbox" data-notification-channel="website" checked /> Website</label><label><input type="checkbox" data-notification-channel="browser" /> Browser / phone</label></fieldset>`).join('');
  return `<section class="admin-market-panel portal-notification-preferences" data-notification-preferences="${escapeHTML(portal)}"><div class="admin-market-panel-heading"><div><span>Alerts &amp; preferences</span><h2>Notification Settings</h2></div><p>Choose where each type of notification appears.</p></div><div class="portal-notification-preference-list">${rows}</div><p class="portal-notification-preference-note">Browser alerts require permission and appear while Furgo is open. Alerts while the browser or app is closed need push delivery to be configured.</p><p class="portal-notification-preference-feedback" data-notification-preference-feedback role="status" aria-live="polite"></p></section>`;
}

async function setupPortalNotificationPreferences() {
  const root = document.querySelector('[data-notification-preferences]');
  if (root === activePreferenceRoot) return;
  activePreferenceRoot = root;
  if (!root) return;
  const feedback = root.querySelector('[data-notification-preference-feedback]');
  const { data: authResult, error: authError } = await supabase.auth.getUser();
  if (authError || !authResult.user) {
    if (feedback) feedback.textContent = 'Sign in to save notification preferences to your account.';
    return;
  }
  const userId = authResult.user.id;
  const { data, error } = await supabase.from('portal_notification_preferences').select('preferences').eq('user_id', userId).maybeSingle();
  let preferences = data?.preferences && typeof data.preferences === 'object' ? data.preferences : {};
  notificationPreferencesByUser.set(userId, preferences);
  if (error) {
    if (feedback) feedback.textContent = 'Notification settings need the latest account preferences migration before they can be saved.';
    console.warn('Notification preferences could not load:', error);
  }
  const controls = [...root.querySelectorAll('[data-notification-preference]')];
  const syncControls = () => controls.forEach((row) => {
    const saved = preferences[row.dataset.notificationPreference] || {};
    row.querySelector('[data-notification-channel="website"]').checked = saved.website !== false;
    row.querySelector('[data-notification-channel="browser"]').checked = saved.browser === true;
  });
  syncControls();
  root.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-notification-channel]');
    const row = input?.closest('[data-notification-preference]');
    if (!input || !row) return;
    if (input.dataset.notificationChannel === 'browser' && input.checked) {
      if (!('Notification' in window)) {
        input.checked = false;
        if (feedback) feedback.textContent = 'This browser does not support browser notifications.';
        return;
      }
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          input.checked = false;
          if (feedback) feedback.textContent = 'Allow notifications in your browser settings to enable browser alerts.';
          return;
        }
      }
    }
    const next = {};
    controls.forEach((item) => {
      const eventType = item.dataset.notificationPreference;
      next[eventType] = {
        website: item.querySelector('[data-notification-channel="website"]').checked,
        browser: item.querySelector('[data-notification-channel="browser"]').checked,
      };
    });
    const previous = preferences;
    preferences = next;
    notificationPreferencesByUser.set(userId, preferences);
    if (feedback) feedback.textContent = 'Saving notification settings…';
    const { error: saveError } = await supabase.from('portal_notification_preferences').upsert({ user_id: userId, preferences }, { onConflict: 'user_id' });
    if (saveError) {
      preferences = previous;
      notificationPreferencesByUser.set(userId, preferences);
      syncControls();
      if (feedback) feedback.textContent = 'Could not save settings. Apply the latest account preferences migration and try again.';
      console.warn('Notification preferences could not save:', saveError);
      return;
    }
    if (feedback) feedback.textContent = 'Notification settings saved.';
  });
}

export function portalNotificationsMarkup(portal) {
  return `<section class="portal-notifications" data-portal-notifications="${escapeHTML(portal)}" aria-label="Notifications">
    <details class="portal-notification-details">
      <summary class="notification-button" aria-label="Notifications"><img src="Image/Icon/Icon-10.png" alt="" /><b data-notification-count hidden>0</b></summary>
      <div class="portal-notification-panel"><h2>Notifications</h2><div class="portal-notification-list" data-notification-list><p class="portal-notification-empty">Loading notifications…</p></div></div>
    </details>
  </section>`;
}

export function setupPortalNotifications() {
  void setupPortalNotificationPreferences();
  const root = document.querySelector('[data-portal-notifications]');
  const preferenceRoot = document.querySelector('[data-notification-preferences]');
  const subscriptionElement = root || preferenceRoot;
  if (subscriptionElement === activeNotificationRoot) return;
  notificationGeneration += 1;
  const generation = notificationGeneration;
  if (activeNotificationChannel) void supabase.removeChannel(activeNotificationChannel);
  activeNotificationChannel = null;
  activeNotificationRoot = subscriptionElement;
  if (notificationOutsideClickHandler) document.removeEventListener('click', notificationOutsideClickHandler);
  if (notificationEscapeHandler) document.removeEventListener('keydown', notificationEscapeHandler);
  notificationOutsideClickHandler = null;
  notificationEscapeHandler = null;
  if (!subscriptionElement) return;
  const list = root?.querySelector('[data-notification-list]');
  const count = root?.querySelector('[data-notification-count]');
  const notificationButton = root?.querySelector('summary.notification-button');
  const portal = root?.dataset.portalNotifications || preferenceRoot?.dataset.notificationPreferences || 'customer';
  let userId = null;
  let channel = null;
  let loading = false;
  let preferences = {};

  const render = async () => {
    if (!root || !userId || loading) return;
    loading = true;
    const itemsResult = await supabase.from('portal_notifications').select('id,event_type,title,message,entity_id,created_at,read_at').order('created_at', { ascending: false }).limit(30);
    loading = false;
    if (itemsResult.error) {
      if (list) list.innerHTML = '<p class="portal-notification-empty">Notifications are unavailable. Apply the latest Supabase migration and try again.</p>';
      console.warn('Portal notifications could not load:', itemsResult.error);
      return;
    }
    const rows = itemsResult.data || [];
    preferences = notificationPreferencesByUser.get(userId) || preferences;
    const websiteEnabled = (eventType) => (preferences[eventType] || preferences.__default)?.website !== false;
    const visibleRows = rows.filter((item) => websiteEnabled(item.event_type));
    const unread = visibleRows.filter((item) => !item.read_at).length;
    count.hidden = unread === 0;
    notificationButton?.classList.toggle('has-unread-notifications', unread > 0);
    count.textContent = unread > 99 ? '99+' : String(unread);
    count.setAttribute('aria-label', `${unread} unread notifications`);
    if (!visibleRows.length) {
      list.innerHTML = '<p class="portal-notification-empty">No website notifications to show.</p>';
      return;
    }
    list.innerHTML = visibleRows.map((item) => {
      const config = notificationCopy[item.event_type] || {};
      const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at));
      const action = portal === 'supplier' && config.tab
        ? `<button type="button" data-notification-tab="${escapeHTML(config.tab)}">${escapeHTML(config.action)}</button>`
        : config.href ? `<a href="${escapeHTML(config.href)}">${escapeHTML(config.action)}</a>` : '';
      return `<article class="portal-notification-item${item.read_at ? '' : ' is-unread'}"><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.message)}</p><time datetime="${escapeHTML(item.created_at)}">${escapeHTML(timestamp)}</time></div><div class="portal-notification-actions">${action}</div></article>`;
    }).join('');
  };

  list?.addEventListener('click', async (event) => {
    const tabButton = event.target.closest('[data-notification-tab]');
    if (tabButton) {
      document.querySelector(`[data-supplier-tab="${CSS.escape(tabButton.dataset.notificationTab)}"]`)?.click();
      root.querySelector('details')?.removeAttribute('open');
    }
  });

  void supabase.auth.getUser().then(async ({ data, error }) => {
    if (error) throw error;
    if (generation !== notificationGeneration) return;
    userId = data.user?.id;
    if (!userId) return;
    const preferenceResult = await supabase.from('portal_notification_preferences').select('preferences').eq('user_id', userId).maybeSingle();
    if (!preferenceResult.error && preferenceResult.data?.preferences) {
      preferences = preferenceResult.data.preferences;
      notificationPreferencesByUser.set(userId, preferences);
    }
    void render();
    channel = supabase.channel(`portal-notifications-${portal}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_notifications', filter: `recipient_user_id=eq.${userId}` }, (payload) => {
        void render();
        const item = payload.eventType === 'INSERT' ? payload.new : null;
        preferences = notificationPreferencesByUser.get(userId) || preferences;
        const browserEnabled = (preferences[item?.event_type] || preferences.__default)?.browser === true;
        if (item && browserEnabled && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(item.title, { body: item.message, icon: 'Image/Icon/Logo.png', tag: item.id });
        }
      })
      .subscribe();
    activeNotificationChannel = channel;
  }).catch((error) => console.warn('Portal notification updates could not start:', error));
  root?.addEventListener('toggle', async () => {
    const details = root.querySelector('details');
    if (!details?.open) return;
    const { error } = await supabase.from('portal_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (error) console.warn('Notifications could not be marked read automatically:', error);
    await render();
  }, true);
  notificationOutsideClickHandler = root ? (event) => {
    const details = root.querySelector('details');
    if (details?.open && !root.contains(event.target)) details.open = false;
  } : null;
  notificationEscapeHandler = root ? (event) => {
    if (event.key === 'Escape') {
      const details = root.querySelector('details');
      if (details?.open) details.open = false;
    }
  } : null;
  if (notificationOutsideClickHandler) document.addEventListener('click', notificationOutsideClickHandler);
  if (notificationEscapeHandler) document.addEventListener('keydown', notificationEscapeHandler);
  window.addEventListener('pagehide', () => {
    if (generation !== notificationGeneration) return;
    if (activeNotificationChannel) void supabase.removeChannel(activeNotificationChannel);
    if (notificationOutsideClickHandler) document.removeEventListener('click', notificationOutsideClickHandler);
    if (notificationEscapeHandler) document.removeEventListener('keydown', notificationEscapeHandler);
    activeNotificationChannel = null;
    activeNotificationRoot = null;
    activePreferenceRoot = null;
    notificationOutsideClickHandler = null;
    notificationEscapeHandler = null;
    notificationGeneration += 1;
  }, { once: true });
}
