import { escapeHTML } from './shared.js';
import { supabase } from './supabase.js';

const notificationCopy = {
  marketplace_product_request: { action: 'Review product request', href: '#admin-marketplace-manage' },
  marketplace_order: { action: 'Open orders', tab: 'orders' },
  marketplace_product_status: { action: 'View products', tab: 'home' },
};
let activeNotificationRoot = null;
let activeNotificationChannel = null;
let notificationGeneration = 0;

export function portalNotificationsMarkup(portal) {
  return `<section class="portal-notifications" data-portal-notifications="${escapeHTML(portal)}" aria-label="Notifications">
    <details class="portal-notification-details">
      <summary class="notification-button" aria-label="Notifications"><img src="Image/Icon/Icon-10.png" alt="" /><b data-notification-count hidden>0</b></summary>
      <div class="portal-notification-panel"><h2>Notifications</h2><div class="portal-notification-list" data-notification-list><p class="portal-notification-empty">Loading notifications…</p></div></div>
    </details>
  </section>`;
}

export function setupPortalNotifications() {
  const root = document.querySelector('[data-portal-notifications]');
  if (root === activeNotificationRoot) return;
  notificationGeneration += 1;
  const generation = notificationGeneration;
  if (activeNotificationChannel) void supabase.removeChannel(activeNotificationChannel);
  activeNotificationChannel = null;
  activeNotificationRoot = root;
  if (!root) return;
  const list = root.querySelector('[data-notification-list]');
  const count = root.querySelector('[data-notification-count]');
  const portal = root.dataset.portalNotifications;
  let userId = null;
  let channel = null;
  let loading = false;

  const render = async () => {
    if (!userId || loading) return;
    loading = true;
    const [itemsResult, unreadResult] = await Promise.all([
      supabase.from('portal_notifications').select('id,event_type,title,message,entity_id,created_at,read_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('portal_notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    loading = false;
    if (itemsResult.error || unreadResult.error) {
      if (list) list.innerHTML = '<p class="portal-notification-empty">Notifications are unavailable. Apply the latest Supabase migration and try again.</p>';
      console.warn('Portal notifications could not load:', itemsResult.error || unreadResult.error);
      return;
    }
    const rows = itemsResult.data || [];
    const unread = unreadResult.count || 0;
    count.hidden = unread === 0;
    count.textContent = unread > 99 ? '99+' : String(unread);
    count.setAttribute('aria-label', `${unread} unread notifications`);
    if (!rows.length) {
      list.innerHTML = '<p class="portal-notification-empty">You’re all caught up.</p>';
      return;
    }
    list.innerHTML = rows.map((item) => {
      const config = notificationCopy[item.event_type] || {};
      const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at));
      const action = portal === 'supplier' && config.tab
        ? `<button type="button" data-notification-tab="${escapeHTML(config.tab)}">${escapeHTML(config.action)}</button>`
        : config.href ? `<a href="${escapeHTML(config.href)}">${escapeHTML(config.action)}</a>` : '';
      return `<article class="portal-notification-item${item.read_at ? '' : ' is-unread'}"><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.message)}</p><time datetime="${escapeHTML(item.created_at)}">${escapeHTML(timestamp)}</time></div><div class="portal-notification-actions">${action}${item.read_at ? '' : `<button type="button" data-notification-read="${escapeHTML(item.id)}">Mark read</button>`}</div></article>`;
    }).join('');
  };

  list?.addEventListener('click', async (event) => {
    const readButton = event.target.closest('[data-notification-read]');
    if (readButton) {
      const { error } = await supabase.from('portal_notifications').update({ read_at: new Date().toISOString() }).eq('id', readButton.dataset.notificationRead);
      if (error) { console.warn('Notification could not be marked read:', error); return; }
      await render();
      return;
    }
    const tabButton = event.target.closest('[data-notification-tab]');
    if (tabButton) {
      document.querySelector(`[data-supplier-tab="${CSS.escape(tabButton.dataset.notificationTab)}"]`)?.click();
      root.querySelector('details')?.removeAttribute('open');
    }
  });

  void supabase.auth.getUser().then(({ data, error }) => {
    if (error) throw error;
    if (generation !== notificationGeneration) return;
    userId = data.user?.id;
    if (!userId) return;
    void render();
    channel = supabase.channel(`portal-notifications-${portal}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_notifications', filter: `recipient_user_id=eq.${userId}` }, () => void render())
      .subscribe();
    activeNotificationChannel = channel;
  }).catch((error) => console.warn('Portal notification updates could not start:', error));
  root.addEventListener('toggle', () => { if (root.querySelector('details')?.open) void render(); }, true);
  window.addEventListener('pagehide', () => {
    if (generation !== notificationGeneration) return;
    if (activeNotificationChannel) void supabase.removeChannel(activeNotificationChannel);
    activeNotificationChannel = null;
    activeNotificationRoot = null;
    notificationGeneration += 1;
  }, { once: true });
}
