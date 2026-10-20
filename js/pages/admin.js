import { escapeHTML } from '../shared.js';
import { loadPromotions, maximumPromotions } from './admin-promotions.js';
import { loadGroomingBookings } from './grooming-data.js';
import { loadHotelBookings } from './hotel-data.js';
import { loadDaycareBookings } from './daycare-data.js';
import { countNewAdminOrders, countNewAdminOrdersFor } from './admin-orders.js';
import { driverLocationForOrder, loadPetTaxiJobs } from './driver.js';

// Admin dashboard: show live order and booking counts with quick links to each management window.
export function adminPortalPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const activePromotions = loadPromotions().length;
  const groomingBookings = loadGroomingBookings();
  const hotelBookings = loadHotelBookings();
  const daycareBookings = loadDaycareBookings();
  const newOrders = countNewAdminOrders();
  const newMarketplaceOrders = countNewAdminOrdersFor('marketplace');
  const adminEmail = profile.email || 'admin@gmail.com';
  const taxiJobs = loadPetTaxiJobs({ includeCompleted: true });
  const taxiCards = taxiJobs.map((job) => {
    const location = driverLocationForOrder(job.orderKey, job.id);
    const mapLink = location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=16/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}` : '';
    return `<article class="admin-pet-taxi-card"><header><div><span>${escapeHTML(job.serviceLabel)} · ${escapeHTML(job.reference || job.id)}</span><h3>${escapeHTML(job.petName)} <small>with ${escapeHTML(job.customerName || 'Customer')}</small></h3></div><b>${escapeHTML(job.taxiStatus)}</b></header><dl><div><dt>Schedule</dt><dd>${escapeHTML(job.scheduledDate || 'Date pending')} · ${escapeHTML(job.scheduledTime || 'Time pending')}</dd></div><div><dt>Journey</dt><dd>${escapeHTML(job.journey || 'Pet Taxi')}</dd></div><div><dt>Pickup</dt><dd>${escapeHTML(job.pickupAddress || 'Address not provided')}</dd></div><div><dt>Drop-off</dt><dd>${escapeHTML(job.dropoffAddress || 'Address not provided')}</dd></div><div><dt>Customer</dt><dd>${escapeHTML(job.customerPhone || 'Phone not provided')}</dd></div><div><dt>Pet details</dt><dd>${escapeHTML([job.petBreed, job.petWeight ? `${job.petWeight} kg` : ''].filter(Boolean).join(' · ') || 'Details not provided')}${job.redFlags ? `<small>Care notes: ${escapeHTML(job.redFlags)}</small>` : ''}</dd></div><div><dt>Driver location</dt><dd>${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener noreferrer">View latest location</a><small>${escapeHTML(location.driverEmail || 'Driver')} · ${escapeHTML(new Date(location.timestamp).toLocaleString())}</small>` : 'Not shared yet'}</dd></div></dl></article>`;
  }).join('');

  return `<main class="admin-portal-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(adminEmail)}</span><button type="button" data-logout>Log out</button></div></header>
    <section class="admin-portal-welcome"><span>Furgo management</span><h1>Admin Dashboard</h1><p>Manage customer-facing content for the Furgo portal.</p></section>
    <section class="admin-portal-stats" aria-label="Admin dashboard summary"><a class="admin-portal-stat-link" href="#admin-orders"><span>New orders · All services</span><strong>${newOrders}</strong></a><a class="admin-portal-stat-link" href="#admin-promotions"><span>Active promotions</span><strong>${activePromotions} <small>/ ${maximumPromotions}</small></strong></a><a class="admin-portal-stat-link" href="#admin-marketplace"><span>Marketplace new orders</span><strong>${newMarketplaceOrders}</strong></a><a class="admin-portal-stat-link" href="#admin-grooming"><span>Grooming bookings</span><strong>${groomingBookings.length}</strong></a><a class="admin-portal-stat-link" href="#admin-hotel"><span>Hotel reservations</span><strong>${hotelBookings.length}</strong></a><a class="admin-portal-stat-link" href="#admin-daycare"><span>Daycare bookings & passes</span><strong>${daycareBookings.length}</strong></a></section>
    <section class="admin-portal-tools" aria-label="Admin tools"><article class="admin-portal-tool"><div class="admin-tool-icon" aria-hidden="true">▤</div><div><h2>Order Management</h2><p>Review every new order, update its status, and upload customer receipts or invoices.</p></div><a class="button button-primary" href="#admin-orders">View Orders <span aria-hidden="true">→</span></a></article><article class="admin-portal-tool"><div class="admin-tool-icon" aria-hidden="true">▧</div><div><h2>Home Promotions</h2><p>Upload banners, choose their destination, and manage the eight-promotion limit.</p></div><a class="button button-primary" href="#admin-promotions">Manage Promotions <span aria-hidden="true">→</span></a></article>
      <!-- Service management uses a dashboard window grid for quick access to each portal. -->
      <section class="admin-service-windows" aria-label="Service management windows"><article class="admin-service-window"><img class="admin-service-window-artwork" src="Image/Icon/MVP Icon-01.png" alt="" /><div><h2>Marketplace</h2><p>Manage products, private supplier mappings, incoming orders, and shipping updates.</p></div><a class="button button-primary" href="#admin-marketplace">Manage Marketplace <span aria-hidden="true">→</span></a></article><article class="admin-service-window"><img class="admin-service-window-artwork" src="Image/Icon/MVP Icon-02.png" alt="" /><div><h2>Grooming</h2><p>Configure weight-tier pricing and slot capacity, review safety notes, update bookings, and upload receipts.</p></div><a class="button button-primary" href="#admin-grooming">Manage Grooming <span aria-hidden="true">→</span></a></article><article class="admin-service-window"><img class="admin-service-window-artwork" src="Image/Icon/MVP Icon-04.png" alt="" /><div><h2>Pet Hotel</h2><p>Manage room types, nightly rates, availability, care add-ons, and daily boarding updates.</p></div><a class="button button-primary" href="#admin-hotel">Manage Pet Hotel <span aria-hidden="true">→</span></a></article><article class="admin-service-window"><img class="admin-service-window-artwork" src="Image/Icon/MVP Icon-03.png" alt="" /><div><h2>Pet Daycare</h2><p>Set weight-tier rates, pass rules, daily capacity, care add-ons, and manage the live roster.</p></div><a class="button button-primary" href="#admin-daycare">Manage Daycare <span aria-hidden="true">→</span></a></article></section>
      <section class="admin-pet-taxi-section" aria-labelledby="admin-pet-taxi-title"><div class="admin-pet-taxi-heading"><div><span>Driver operations</span><h2 id="admin-pet-taxi-title">Pet Taxi</h2><p>Review taxi routes, customer and pet details, pickup status, and the driver’s latest shared location.</p></div><a class="button button-light" href="#admin-orders">View all orders</a></div><div class="admin-pet-taxi-list">${taxiCards || '<p class="admin-pet-taxi-empty">No Pet Taxi bookings yet. Taxi requests from Grooming, Pet Hotel, and Pet Daycare will appear here.</p>'}</div></section>
    </section>
    <a class="admin-portal-customer-link" href="#home">Open Customer Portal</a>
  </main>`;
}
