import { escapeHTML } from './shared.js';
import { supabase } from './supabase.js';

const notificationCopy = {
  marketplace_product_request: { action: 'Review seller request', href: '#admin-seller-management' },
  marketplace_order: { action: 'Open orders', tab: 'orders' },
  marketplace_product_status: { action: 'View products', tab: 'home' },
  marketplace_order_status: { action: 'View order', href: '#orders' },
  service_booking_update: { action: 'View booking', href: '#orders' },
  pet_reminder: { action: 'View pet care', href: '#pet-profile' },
  pet_care_update: { action: 'View pet profile', href: '#pet-profile' },
  furgo_update: { action: 'Explore Furgo', href: '#home' },
};
const notificationPreferenceEvents = {
  marketplace_product_request: { title: 'Marketplace product requests', description: 'Seller product submissions waiting for Admin review.' },
  marketplace_order: { title: 'New Marketplace orders', description: 'Orders assigned to your Store account.' },
  marketplace_product_status: { title: 'Marketplace listing updates', description: 'Furgo changes to your product listing visibility.' },
};
const customerNotificationCategories = {
  orders_services: { title: 'Orders & services', description: 'Marketplace orders, grooming, pet hotel, and daycare booking updates.' },
  pet_reminders: { title: 'Pet reminders', description: 'Medicine and supplement reminders, plus reminders you create for your pets.' },
  pet_care_updates: { title: 'Pet care updates', description: 'Changes and updates to your pets’ profiles and care records.' },
  furgo_updates: { title: 'Furgo updates', description: 'Product news, service announcements, and important Furgo updates.' },
};
const notificationCategoryByEvent = {
  marketplace_order_status: 'orders_services',
  service_booking_update: 'orders_services',
  pet_reminder: 'pet_reminders',
  pet_care_update: 'pet_care_updates',
  furgo_update: 'furgo_updates',
};
let activeNotificationRoot = null;
let activeNotificationChannel = null;
let notificationGeneration = 0;
let activePreferenceRoot = null;
let notificationOutsideClickHandler = null;
let notificationEscapeHandler = null;
const notificationPreferencesByUser = new Map();

export function notificationPreferencesMarkup(portal = 'customer') {
  const applicableEvents = portal === 'customer'
    ? Object.entries(customerNotificationCategories)
    : portal === 'admin'
    ? Object.entries(notificationPreferenceEvents).filter(([eventType]) => eventType === 'marketplace_product_request')
    : portal === 'supplier'
      ? Object.entries(notificationPreferenceEvents).filter(([eventType]) => eventType === 'marketplace_order' || eventType === 'marketplace_product_status')
      : [[`__default`, { title: portal === 'driver' ? 'Driver route and schedule notifications' : 'Customer order and booking notifications', description: `Choose where notifications sent to your ${portal} portal should appear.` }]];
  const rows = applicableEvents.map(([eventType, event]) => `<fieldset class="portal-notification-preference" data-notification-preference="${escapeHTML(eventType)}"><legend>${escapeHTML(event.title)}</legend><p>${escapeHTML(event.description)}</p><label><input type="checkbox" data-notification-channel="website" checked /> Website inbox</label><label><input type="checkbox" data-notification-channel="browser" /> Browser / phone alerts</label></fieldset>`).join('');
  const pushNote = portal === 'customer'
    ? 'Browser and phone alerts need notification permission. Background delivery also requires Furgo push setup; on iPhone, install Furgo to the Home Screen first.'
    : 'Browser alerts require permission and appear while Furgo is open. Background delivery needs push setup.';
  return `<section class="admin-market-panel portal-notification-preferences" data-notification-preferences="${escapeHTML(portal)}"><div class="admin-market-panel-heading"><div><span>Alerts &amp; preferences</span><h2>Notification Settings</h2></div><p>Choose where each type of notification appears.</p></div><div class="portal-notification-preference-list">${rows}</div><p class="portal-notification-preference-note">${pushNote}</p><p class="portal-notification-preference-feedback" data-notification-preference-feedback role="status" aria-live="polite"></p></section>`;
}

function getNotificationPreference(preferences, eventType) {
  const category = notificationCategoryByEvent[eventType];
  return preferences[category] || preferences[eventType] || preferences.__default || {};
}

async function subscribeForPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { enabled: false, reason: 'This browser does not support background push alerts.' };
  try {
    const { data, error } = await supabase.functions.invoke('notification-config');
    if (error || !data?.vapidPublicKey) return { enabled: false, reason: 'Background push setup is not complete yet.' };
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(data.vapidPublicKey) });
    const json = subscription.toJSON();
    const { error: saveError } = await supabase.rpc('save_portal_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
      p_user_agent: navigator.userAgent,
    });
    if (saveError) return { enabled: false, reason: 'Push subscription storage is not ready. Apply the notification migration.' };
    return { enabled: true };
  } catch (error) {
    return { enabled: false, reason: error?.message || 'Background push could not be enabled on this device.' };
  }
}

function decodeVapidKey(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function showPortalBrowserNotification(eventType, title, body, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return false;
    let preferences = notificationPreferencesByUser.get(userId);
    if (!preferences) {
      const { data } = await supabase.from('portal_notification_preferences').select('preferences').eq('user_id', userId).maybeSingle();
      preferences = data?.preferences || {};
      notificationPreferencesByUser.set(userId, preferences);
    }
    if (!getNotificationPreference(preferences, eventType).browser) return false;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { body, icon: 'Image/Icon/Logo.png', ...options });
    return true;
  } catch (error) {
    console.warn('Browser notification could not be shown:', error);
    return false;
  }
}

export async function createPetReminderInboxNotification(title, body, entityId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return false;
    const { error } = await supabase.rpc('create_customer_pet_reminder_notification', {
      p_title: title,
      p_message: body,
      p_entity_id: entityId,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Pet reminder could not be added to the notification inbox:', error);
    return false;
  }
}

async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('portal_push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  } catch (error) {
    console.warn('Push subscription could not be removed:', error);
  }
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
    const saved = preferences[row.dataset.notificationPreference] || (root.dataset.notificationPreferences === 'customer' ? preferences.__default : null) || {};
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
      if (root.dataset.notificationPreferences === 'customer') {
        const pushResult = await subscribeForPush(userId);
        if (pushResult.enabled) {
          if (feedback) feedback.textContent = 'This device is ready for browser and phone alerts.';
        } else if (feedback) {
          feedback.textContent = `${pushResult.reason} Alerts will appear while Furgo is open when supported.`;
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
    if (root.dataset.notificationPreferences === 'customer' && !Object.values(next).some((item) => item.browser)) {
      await unsubscribeFromPush(userId);
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
    const websiteEnabled = (eventType) => getNotificationPreference(preferences, eventType).website !== false;
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
        const browserEnabled = getNotificationPreference(preferences, item?.event_type || '').browser === true;
        if (item && browserEnabled && 'Notification' in window && Notification.permission === 'granted') {
          void showPortalBrowserNotification(item.event_type, item.title, item.message, { tag: item.id });
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
