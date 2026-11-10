// Central Manager/Director setup for Pet Taxi, shared by all three booking services.
import { escapeHTML } from '../shared.js';
import { recordAdminAction } from '../admin-audit.js';
import { loadPetTaxiSettings, petTaxiSettingsKey } from './pet-taxi-data.js';
import { loadGroomingSettings } from './grooming-data.js';

const settings = () => loadPetTaxiSettings();

export function adminPetTaxiPage() {
  const role = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').role;
  if (!['executive', 'staff', 'manager', 'director'].includes(role)) return '<main class="admin-portal-page"><h1>Admin access is required to manage Pet Taxi.</h1><a class="button button-primary" href="#admin">Back to Admin Home</a></main>';
  const taxi = settings();
  const outlets = loadGroomingSettings().outlets;
  const outletOptions = (selected) => `${selected && selected !== '*' && !outlets.includes(selected) ? `<option value="" selected disabled>Outlet unavailable — choose a current outlet</option>` : ''}<option value="*" ${selected === '*' ? 'selected' : ''}>All outlets</option>${outlets.map((outlet) => `<option value="${escapeHTML(outlet)}" ${outlet === selected ? 'selected' : ''}>${escapeHTML(outlet)}</option>`).join('')}`;
  const scheduleRows = taxi.scheduleSlots.map((time) => `<div class="admin-pet-taxi-schedule-row"><label>Pickup / drop-off time<input type="time" data-taxi-time value="${escapeHTML(time)}" required /></label><button class="button button-light" type="button" data-remove-taxi-time aria-label="Remove pickup time">Remove</button></div>`).join('');
  const routeRows = taxi.routes.map((route) => `<div class="admin-pet-taxi-route-row"><label>Outlet selection<select data-taxi-outlet required>${outletOptions(route.outlet)}</select></label><label>Area<input data-taxi-area value="${escapeHTML(route.city)}" placeholder="e.g. Petaling Jaya" required /></label><label>Fare (MYR)<input data-taxi-fare type="number" min="0.01" step="0.01" value="${Number(route.fare) || ''}" placeholder="e.g. 25.00" required /></label><button class="button button-light" type="button" data-remove-taxi-route aria-label="Remove route">Remove</button></div>`).join('');
  return `<main class="admin-portal-page admin-pet-taxi-settings-page">
    <header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header>
    <header class="admin-grooming-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Shared service configuration</span><h1>Manage Pet Taxi</h1></div></header>
    <section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>One catalog for every service</span><h2>Pet Taxi Pricing & Routes</h2></div><p>Changes here apply to Grooming, Pet Hotel, and Pet Daycare bookings.</p></div>
      <form data-admin-pet-taxi-settings><section class="admin-pet-taxi-repeat-section"><div class="admin-pet-taxi-repeat-heading"><div><h3>Pickup / drop-off schedule</h3><p>Choose each available time for Pet Taxi trips.</p></div><button class="button button-light" type="button" data-add-taxi-time>Add time</button></div><div class="admin-pet-taxi-schedule-list" data-taxi-schedule-list>${scheduleRows}</div></section>
      <section class="admin-pet-taxi-repeat-section"><div class="admin-pet-taxi-repeat-heading"><div><h3>Route prices</h3><p>Set the fare for each outlet and area. The matching fare is charged per one-way trip and per pet; pickup and drop-off are counted as separate trips.</p></div><button class="button button-light" type="button" data-add-taxi-route>Add route</button></div><div class="admin-pet-taxi-route-list" data-taxi-route-list>${routeRows}</div></section>
      <div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Pet Taxi Settings</button><span data-admin-pet-taxi-feedback role="status" aria-live="polite"></span></div></form>
    </section>
  </main>`;
}

export function setupAdminPetTaxi() {
  const form = document.querySelector('[data-admin-pet-taxi-settings]');
  if (!form) return;
  const scheduleList = form.querySelector('[data-taxi-schedule-list]');
  const routeList = form.querySelector('[data-taxi-route-list]');
  const availableOutlets = loadGroomingSettings().outlets;
  const updateRemoveButtons = () => {
    scheduleList.querySelectorAll('[data-remove-taxi-time]').forEach((button) => { button.disabled = scheduleList.children.length <= 1; });
    routeList.querySelectorAll('[data-remove-taxi-route]').forEach((button) => { button.disabled = routeList.children.length <= 1; });
  };
  updateRemoveButtons();
  form.querySelector('[data-add-taxi-time]')?.addEventListener('click', () => {
    scheduleList.insertAdjacentHTML('beforeend', '<div class="admin-pet-taxi-schedule-row"><label>Pickup / drop-off time<input type="time" data-taxi-time required /></label><button class="button button-light" type="button" data-remove-taxi-time aria-label="Remove pickup time">Remove</button></div>');
    scheduleList.lastElementChild.querySelector('input')?.focus();
    updateRemoveButtons();
  });
  form.querySelector('[data-add-taxi-route]')?.addEventListener('click', () => {
    const options = `<option value="*">All outlets</option>${availableOutlets.map((outlet) => `<option value="${escapeHTML(outlet)}">${escapeHTML(outlet)}</option>`).join('')}`;
    routeList.insertAdjacentHTML('beforeend', `<div class="admin-pet-taxi-route-row"><label>Outlet selection<select data-taxi-outlet required>${options}</select></label><label>Area<input data-taxi-area placeholder="e.g. Petaling Jaya" required /></label><label>Fare (MYR)<input data-taxi-fare type="number" min="0.01" step="0.01" placeholder="e.g. 25.00" required /></label><button class="button button-light" type="button" data-remove-taxi-route aria-label="Remove route">Remove</button></div>`);
    routeList.lastElementChild.querySelector('[data-taxi-area]')?.focus();
    updateRemoveButtons();
  });
  form.addEventListener('click', (event) => {
    const removeTime = event.target.closest('[data-remove-taxi-time]');
    const removeRoute = event.target.closest('[data-remove-taxi-route]');
    if (removeTime && scheduleList.children.length > 1) removeTime.closest('.admin-pet-taxi-schedule-row').remove();
    if (removeRoute && routeList.children.length > 1) removeRoute.closest('.admin-pet-taxi-route-row').remove();
    updateRemoveButtons();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const slots = [...new Set([...form.querySelectorAll('[data-taxi-time]')].map((input) => input.value.trim()).filter(Boolean))];
    const routes = [...routeList.querySelectorAll('.admin-pet-taxi-route-row')].map((row) => ({ city: row.querySelector('[data-taxi-area]').value.trim(), outlet: row.querySelector('[data-taxi-outlet]').value, fare: Number(row.querySelector('[data-taxi-fare]').value) }));
    const feedback = form.querySelector('[data-admin-pet-taxi-feedback]');
    if (!slots.length || slots.some((time) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time))) {
      feedback.textContent = 'Add at least one pickup / drop-off time.';
      return;
    }
    if (!routes.length || routes.some((route) => !route.city || !route.outlet || !Number.isFinite(route.fare) || route.fare <= 0)) {
      feedback.textContent = 'Complete the outlet, area, and fare for every route.';
      return;
    }
    const updated = { ...settings(), scheduleSlots: slots, routes };
    localStorage.setItem(petTaxiSettingsKey, JSON.stringify(updated));
    void recordAdminAction('pet_taxi_settings_updated', 'service', 'pet_taxi', { routeCount: routes.length });
    feedback.textContent = 'Pet Taxi settings saved for Grooming, Pet Hotel, and Pet Daycare.';
  });
}
