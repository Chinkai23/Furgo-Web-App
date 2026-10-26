// Central Manager/Director setup for Pet Taxi, shared by all three booking services.
import { escapeHTML } from '../shared.js';
import { recordAdminAction } from '../admin-audit.js';
import { loadPetTaxiSettings, petTaxiSettingsKey } from './pet-taxi-data.js';

const settings = () => loadPetTaxiSettings();

export function adminPetTaxiPage() {
  const role = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').role;
  if (!['executive', 'staff', 'manager', 'director'].includes(role)) return '<main class="admin-portal-page"><h1>Admin access is required to manage Pet Taxi.</h1><a class="button button-primary" href="#admin">Back to Admin Home</a></main>';
  const taxi = settings();
  return `<main class="admin-portal-page admin-pet-taxi-settings-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header>
    <header class="admin-grooming-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Shared service configuration</span><h1>Manage Pet Taxi</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>One catalog for every service</span><h2>Pet Taxi Pricing & Routes</h2></div><p>Changes here apply to Grooming, Pet Hotel, and Pet Daycare bookings.</p></div>
      <form data-admin-pet-taxi-settings><div class="admin-pet-taxi-settings-grid">
        <label>Base fare (MYR)<input name="baseFare" type="number" min="0" step="0.01" value="${Number(taxi.baseFare)}" required /></label>
        <label>Fare per kilometre (MYR)<input name="farePerKm" type="number" min="0" step="0.01" value="${Number(taxi.farePerKm)}" required /></label>
        <label class="admin-pet-taxi-wide">Pickup / drop-off schedule (comma-separated, 24-hour time)<input name="scheduleSlots" value="${escapeHTML(taxi.scheduleSlots.join(', '))}" placeholder="09:00, 12:00, 15:00" required /></label>
        <label class="admin-pet-taxi-wide">Route estimates (one per line: City | Outlet name or * | km)<textarea name="routes" rows="8" required>${escapeHTML(taxi.routes.map((route) => `${route.city} | ${route.outlet} | ${route.distanceKm}`).join('\n'))}</textarea><small>Use * as the outlet when a city route applies to any service outlet. Exact outlet routes take priority.</small></label>
      </div><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Pet Taxi Settings</button><span data-admin-pet-taxi-feedback role="status" aria-live="polite"></span></div></form>
    </section>
  </main>`;
}

export function setupAdminPetTaxi() {
  const form = document.querySelector('[data-admin-pet-taxi-settings]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const slots = [...new Set(form.elements.scheduleSlots.value.split(',').map((time) => time.trim()).filter(Boolean))];
    const routes = form.elements.routes.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [city, outlet, km] = line.split('|').map((value) => value.trim());
      return { city, outlet, distanceKm: Number(km) };
    });
    const feedback = form.querySelector('[data-admin-pet-taxi-feedback]');
    if (!slots.length || slots.some((time) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time))) {
      feedback.textContent = 'Enter pickup times in 24-hour format, such as 09:00, 12:00, 15:00.';
      return;
    }
    if (!routes.length || routes.some((route) => !route.city || !route.outlet || !Number.isFinite(route.distanceKm) || route.distanceKm <= 0)) {
      feedback.textContent = 'Check each route. Use: City | Outlet name or * | distance in km.';
      return;
    }
    const updated = { baseFare: Number(form.elements.baseFare.value), farePerKm: Number(form.elements.farePerKm.value), scheduleSlots: slots, routes };
    localStorage.setItem(petTaxiSettingsKey, JSON.stringify(updated));
    void recordAdminAction('pet_taxi_settings_updated', 'service', 'pet_taxi', { baseFare: updated.baseFare, farePerKm: updated.farePerKm, routeCount: routes.length });
    feedback.textContent = 'Pet Taxi settings saved for Grooming, Pet Hotel, and Pet Daycare.';
  });
}
