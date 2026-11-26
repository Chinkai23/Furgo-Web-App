// Realtime notifications invalidate reads. They never apply business payloads.
export function createRecoveryQueue({ isCurrent, refresh, onError, delay = 120 }) {
  const pending = new Set();
  let timer;
  let running = false;
  let stopped = false;
  let subscribed = false;
  const current = () => !stopped && isCurrent();
  const schedule = () => {
    if (running || timer || !current()) return;
    timer = setTimeout(async () => {
      timer = undefined;
      running = true;
      const groups = [...pending];
      pending.clear();
      try { await refresh(groups, current); }
      catch (error) { if (current()) onError(error); }
      finally {
        running = false;
        if (pending.size) schedule();
      }
    }, delay);
  };
  const invalidate = (...groups) => {
    if (!current()) return;
    for (const group of groups) pending.add(group);
    schedule();
  };
  return {
    invalidate,
    status(status, onDisconnect) {
      if (!current()) return;
      if (status === 'SUBSCRIBED') {
        if (!subscribed) invalidate('all');
        subscribed = true;
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        subscribed = false;
        onDisconnect();
      }
    },
    stop() { stopped = true; clearTimeout(timer); pending.clear(); },
  };
}

export function syncFailureMessage(error) {
  const code = error?.code;
  const status = error?.status;
  if (status === 401 || ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return 'Your session could not be verified. Sign in again and reload.';
  if (status === 403 || code === '42501') return 'This account could not access the data. Check your portal access and reload.';
  if (status === 0 || error instanceof TypeError || /^(fetch failed|failed to fetch|networkerror)/i.test(error?.message || '')) return 'The connection was interrupted. Reconnect and reload to verify the latest data.';
  return 'Furgo could not confirm the cloud data. Reload to retry or contact Furgo Support.';
}

let stopPortal;
let portalChannelId = 0;

export function stopPortalRecovery() {
  stopPortal?.();
  stopPortal = undefined;
}

// Only an active Store or Seller view owns this channel.
export function watchPortalData({ client, root, tables, refresh, report, isCurrent, needsStockRefresh = () => false }) {
  stopPortalRecovery();
  const queue = createRecoveryQueue({
    isCurrent: () => root.isConnected && isCurrent(),
    refresh,
    onError: (error) => report(syncFailureMessage(error)),
  });
  const wake = () => queue.invalidate('all');
  const channel = client.channel(`furgo-active-portal:${++portalChannelId}`);
  for (const table of tables) {
    const filter = { event: '*', schema: 'public', table };
    if (table === 'app_data') filter.filter = 'record_id=eq.shared:furgo-demo-marketplace-products:shared';
    channel.on('postgres_changes', filter, wake);
  }
  channel.subscribe((status) => queue.status(status, () => report('Live updates are disconnected. Reconnect or reload to refresh.')));
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  // Warehouse-only changes do not emit a published event. While an inventory
  // view is visible, use a low-frequency read through the same scoped readers.
  const stockTimer = setInterval(() => {
    if (!document.hidden && navigator.onLine !== false && needsStockRefresh()) wake();
  }, 90000);
  stopPortal = () => {
    clearInterval(stockTimer);
    queue.stop();
    window.removeEventListener('online', wake);
    window.removeEventListener('focus', wake);
    void client.removeChannel(channel).catch(() => report('The previous live connection could not be closed. Reload to retry.'));
  };
  wake();
  return queue;
}

// A Store tracking form owns its DOM until the save is confirmed or it is
// cancelled. A read started before either transition cannot repaint it later.
export function createTrackingRefreshGuard() {
  const editing = new Set();
  let revision = 0;
  return {
    open(form) {
      if (editing.has(form)) return;
      editing.add(form);
      revision += 1;
    },
    close(form) { if (editing.delete(form)) revision += 1; },
    active: () => editing.size > 0,
    capture() {
      const started = revision;
      return () => !editing.size && revision === started;
    },
  };
}
