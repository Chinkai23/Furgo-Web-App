import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const table = 'driver_live_locations';

function locationChannelName(orderKey, orderId) {
  return `driver-location:${orderKey}:${orderId}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function osmEmbedUrl(location) {
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const span = 0.008;
  const bounds = [lon - span, lat - span, lon + span, lat + span].map((value) => value.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function locationMarkup(location) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    return '<p class="live-driver-location-waiting">Waiting for the driver to share their location…</p>';
  }
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
  const age = Math.max(0, Date.now() - new Date(location.updated_at).getTime());
  const updated = new Date(location.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const freshness = age > 45000 ? 'Last known location' : 'Live location';
  return `<iframe class="live-driver-location-map" src="${escapeHTML(osmEmbedUrl(location))}" title="Driver location on map" loading="lazy" referrerpolicy="no-referrer"></iframe><div class="live-driver-location-meta"><span>${freshness} · Updated ${escapeHTML(updated)}</span><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Open larger map</a></div>`;
}

export async function publishDriverLocation({ orderKey, orderId, customerId, latitude, longitude, accuracy }) {
  const driverId = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').id;
  if (!driverId) throw new Error('Sign in again to share your location.');
  const { error } = await supabase.from(table).upsert({
    order_key: orderKey,
    order_id: String(orderId),
    customer_id: customerId,
    driver_id: driverId,
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  }, { onConflict: 'order_key,order_id' });
  if (error) throw error;
}

export function mountDriverLocation(container) {
  if (!container) return () => {};
  const orderKey = container.dataset.orderKey;
  const orderId = String(container.dataset.orderId || '');
  if (!orderKey || !orderId) return () => {};
  let closed = false;
  const render = (location) => {
    if (closed) return;
    const currentMap = container.querySelector('.live-driver-location-map');
    if (location && currentMap && Date.now() - Number(container.dataset.mapUpdatedAt || 0) < 20000) {
      const meta = container.querySelector('.live-driver-location-meta');
      if (meta) {
        const lat = Number(location.latitude);
        const lon = Number(location.longitude);
        const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
        const age = Math.max(0, Date.now() - new Date(location.updated_at).getTime());
        meta.querySelector('span').textContent = `${age > 45000 ? 'Last known location' : 'Live location'} · Updated ${new Date(location.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        meta.querySelector('a').href = mapUrl;
      }
      return;
    }
    container.innerHTML = locationMarkup(location);
    if (location) container.dataset.mapUpdatedAt = String(Date.now());
  };
  let channel;
  void supabase.from(table).select('latitude,longitude,accuracy,updated_at,driver_id')
    .eq('order_key', orderKey).eq('order_id', orderId).maybeSingle()
    .then(({ data, error }) => {
      if (closed) return;
      if (error) container.innerHTML = '<p class="live-driver-location-waiting">Live location is temporarily unavailable.</p>';
      else render(data);
    });
  channel = supabase.channel(locationChannelName(orderKey, orderId))
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `order_id=eq.${orderId}` }, (change) => {
      const row = change.new?.order_id ? change.new : change.old;
      if (String(row?.order_id) !== orderId || row?.order_key !== orderKey) return;
      render(change.eventType === 'DELETE' ? null : row);
    })
    .subscribe();
  return () => { closed = true; if (channel) void supabase.removeChannel(channel); };
}
