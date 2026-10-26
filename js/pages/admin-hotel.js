import { escapeHTML } from '../shared.js';
import { availableHotelUnits, hotelBookingsKey, hotelSettingsKey, loadHotelBookings, loadHotelSettings } from './hotel-data.js';
import { recordAdminAction } from '../admin-audit.js';
import { adminServiceBannerSettingsPanel } from './admin-service-banners.js';
import { customerOrderStatus } from '../order-status.js';
import { adminOrderCardMarkup, adminOrderStage, adminOrderStageFilters, adminOrderStatusControl, adminOtherServiceOrderLinks } from '../admin-order-ui.js';

// Admin Hotel page: manages room inventory, rates, add-ons, transport, vouchers, and boarding records.
export function adminHotelPage({ settingsOnly = false, stage = 'new' } = {}) {
  const profile = JSON.parse(sessionStorage.getItem("furgo-demo-user-profile") || "{}");
  const settings = loadHotelSettings();
  const calendarSettings = ['director', 'admin'].includes(profile.role) ? settings : {
    ...settings,
    outlets: settings.outlets.filter((outlet) => outlet.toLowerCase() === String(profile.outletName || '').trim().toLowerCase()),
  };
  let bookings = loadHotelBookings()
    .filter((booking) => ['director', 'admin'].includes(profile.role) || (profile.outletName && String(booking.outlet || '').trim().toLowerCase() === String(profile.outletName).trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const allBookings = [...bookings];
  const selectedStage = ['new', 'progressing', 'completed'].includes(stage) ? stage : 'new';
  const stageBookings = allBookings.map((booking) => ({ ...booking, serviceId: 'hotel' }));
  const visibleBookings = stageBookings.filter((booking) => adminOrderStage(booking) === selectedStage);
  bookings = visibleBookings;
  const roomRows = settings.rooms.map((room) => `<details class="admin-hotel-room" open><summary>${escapeHTML(room.name)}${room.active === false ? ' · Hidden' : ''}</summary><div class="admin-hotel-fields" data-hotel-room-id="${escapeHTML(room.id)}"><label>Room type name<input data-hotel-room-field="name" value="${escapeHTML(room.name)}" required /></label><label>Nightly rate (MYR)<input data-hotel-room-field="nightlyRate" type="number" min="0" step="0.01" value="${Number(room.nightlyRate)}" required /></label><label>Number of units<input data-hotel-room-field="capacity" type="number" min="0" step="1" value="${Number(room.capacity)}" required /></label><label>Dimensions<input data-hotel-room-field="dimensions" value="${escapeHTML(room.dimensions || '')}" /></label><label class="admin-hotel-wide">Description<input data-hotel-room-field="description" value="${escapeHTML(room.description || '')}" /></label><label class="admin-hotel-wide">Amenities<input data-hotel-room-field="amenities" value="${escapeHTML(room.amenities || '')}" /></label><label>Room image<input type="file" accept="image/png,image/jpeg,image/webp" data-hotel-room-photo />${room.photo ? `<img class="admin-hotel-photo-preview" src="${escapeHTML(room.photo)}" alt="Current ${escapeHTML(room.name)} room" />` : ''}</label><label class="admin-hotel-active"><input data-hotel-room-field="active" type="checkbox" ${room.active === false ? '' : 'checked'} /> Available to customers</label><label class="admin-hotel-active"><input data-hotel-room-field="doubleRoom" type="checkbox" ${room.doubleRoom ? 'checked' : ''} /> Double room (pets may share)</label><button class="button button-light" type="button" data-delete-hotel-room="${escapeHTML(room.id)}">Delete room type</button></div></details>`).join('');
  const addOnRows = settings.addOns.map((item) => `<div class="admin-hotel-addon-row" data-hotel-addon-id="${escapeHTML(item.id)}"><label>Service name<input data-hotel-addon-field="name" value="${escapeHTML(item.name)}" required /></label><label>Price (MYR)<input data-hotel-addon-field="price" type="number" min="0" step="0.01" value="${Number(item.price)}" required /></label><label class="admin-hotel-wide">Description<input data-hotel-addon-field="description" value="${escapeHTML(item.description || '')}" /></label><label class="admin-hotel-active"><input data-hotel-addon-field="active" type="checkbox" ${item.active === false ? '' : 'checked'} /> Active</label><button class="button button-light" type="button" data-delete-hotel-addon="${escapeHTML(item.id)}">Delete</button></div>`).join('');
  const orders = bookings.map((booking) => { const cardDetails = `<article class="admin-hotel-booking"><div class="admin-hotel-booking-top"><div><span>${escapeHTML(booking.reference)} · ${escapeHTML(new Date(booking.createdAt).toLocaleString())}</span><h3>${escapeHTML(booking.petName)} · ${escapeHTML(booking.roomName)}</h3></div><b>${escapeHTML(customerOrderStatus({ ...booking, serviceId: 'hotel' }))}</b></div><div class="admin-hotel-booking-grid"><div><small>Customer & emergency</small><strong>${escapeHTML(booking.customerName)} · ${escapeHTML(booking.customerPhone)}</strong><span>${escapeHTML(booking.emergencyName)} · ${escapeHTML(booking.emergencyPhone)}</span></div><div><small>Pet health gate</small><strong>${escapeHTML(booking.petSpecies || 'Pet')} · ${escapeHTML(booking.petBreed)} · ${escapeHTML(booking.petWeight)} kg</strong><span>${escapeHTML(booking.vaccinationStatus || 'Vaccination card needs staff review')} · ${booking.vaccinationCards?.length || 0} card(s)</span>${booking.vaccinationCards?.map((card) => `<a href="${escapeHTML(card.data)}" target="_blank" rel="noopener">${escapeHTML(card.name)}</a>`).join('') || ''}${booking.redFlags ? `<em>⚑ ${escapeHTML(booking.redFlags)}</em>` : ''}</div><div><small>Stay & room</small><strong>${escapeHTML(booking.checkIn)} to ${escapeHTML(booking.checkOut)} · ${Number(booking.nights)} night(s)</strong><span>${escapeHTML(booking.outlet)} · ${hotelMoney(booking.nightlyRate)}/night · ${escapeHTML(booking.assignedUnit || 'Room unit not assigned')}${booking.roomArrangement === 'shared' ? ' · Shared room for selected pets' : ''}</span></div><div><small>Add-ons</small><strong>${booking.addOns?.map((item) => `${escapeHTML(item.name)} (${hotelMoney(item.price)})`).join(', ') || 'No care add-ons'}${booking.grooming ? ` · Grooming ${escapeHTML(booking.grooming.packageName)} on ${escapeHTML(booking.grooming.date)} at ${escapeHTML(booking.grooming.time)}` : ''}</strong><span>${booking.taxi ? `Taxi ${booking.taxi.pickup ? 'pickup' : ''}${booking.taxi.pickup && booking.taxi.dropoff ? ' + ' : ''}${booking.taxi.dropoff ? 'drop-off' : ''} · ${escapeHTML(booking.taxi.address)} · ${escapeHTML(booking.taxi.schedule)} · ${hotelMoney(booking.taxi.fare)}` : 'No Pet Taxi'}</span></div><div><small>Payment audit</small><strong>${escapeHTML(booking.paymentStatus || 'Payment pending')}</strong><span>${escapeHTML(booking.paymentMethod || '')} · ${hotelMoney(booking.total)}${booking.voucherCode ? ` · Voucher ${escapeHTML(booking.voucherCode)}` : ''}</span>${booking.paymentProof ? `<a href="${escapeHTML(booking.paymentProof.data)}" target="_blank" rel="noopener">Customer transfer slip: ${escapeHTML(booking.paymentProof.name)}</a>` : ''}</div></div>${adminOrderStatusControl({ ...booking, serviceId: 'hotel' }, hotelBookingsKey)}<div class="admin-hotel-booking-actions"><div><small>Order Status</small><strong>${escapeHTML(customerOrderStatus({ ...booking, serviceId: 'hotel' }))}</strong></div><label>Assigned room / unit<input data-hotel-unit="${escapeHTML(booking.id)}" value="${escapeHTML(booking.assignedUnit || '')}" placeholder="e.g. Standard 03" /></label><button class="button button-light" type="button" data-save-hotel-booking="${escapeHTML(booking.id)}">Save booking</button><label class="admin-hotel-upload">Upload official receipt<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-hotel-receipt="${escapeHTML(booking.id)}" /></label><label class="admin-hotel-upload">Add daily photo or video<input type="file" accept="image/*,video/mp4,video/webm" data-hotel-media="${escapeHTML(booking.id)}" /></label></div>${booking.receipt ? `<p class="admin-hotel-upload-status">Current receipt: ${escapeHTML(booking.receipt.name)}</p>` : ''}${booking.mediaLogs?.length ? `<p class="admin-hotel-upload-status">${booking.mediaLogs.length} daily care update(s) uploaded.</p>` : ''}</article>`; return adminOrderCardMarkup({ order: { ...booking, serviceId: 'hotel' }, serviceLabel: 'Pet Hotel', title: [booking.petName, booking.packageName || booking.roomName || booking.planName].filter(Boolean).join(' · '), summary: [booking.roomName, booking.checkIn, booking.checkOut, booking.outlet].filter(Boolean).join(' · '), reference: booking.reference, date: booking.createdAt || booking.date || booking.checkIn, total: booking.total, details: cardDetails }); }).join('');

  return `<main class="admin-portal-page admin-hotel-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header><header class="admin-grooming-heading"><a href="#admin" aria-label="Admin Home">‹</a><div><span>${settingsOnly ? 'Service setup' : 'Service operations'}</span><h1>${settingsOnly ? 'Manage Pet Hotel' : 'Pet Hotel Order'}</h1></div></header><section class="admin-market-stats"><article><span>Bookings</span><strong>${allBookings.length}</strong></article><article><span>Progressing Orders</span><strong>${allBookings.filter((booking) => adminOrderStage({ ...booking, serviceId: 'hotel' }) === 'progressing').length}</strong></article><article><span>Completed Or Cancelled</span><strong>${allBookings.filter((booking) => adminOrderStage({ ...booking, serviceId: 'hotel' }) === 'completed').length}</strong></article></section><section class="admin-market-panel" ${settingsOnly ? '' : 'hidden'}><div class="admin-market-panel-heading"><div><span>Manage Service</span><h2>Rooms, Prices & Service Options</h2></div><p>Room inventory and rates apply to customer date-range searches. Confirmed stays reserve a unit until cancellation or checkout.</p></div><form class="admin-hotel-settings" data-admin-hotel-settings><div class="admin-hotel-settings-grid"><div class="admin-outlet-readonly"><strong>Service outlets</strong><span>${settings.outlets.map(escapeHTML).join(' · ') || 'No active outlets. Add outlets in Manage Outlets.'}</span><small>Outlet names are managed centrally in Admin Access → Manage Outlets.</small></div><label>Booking window (days ahead)<input name="bookingHorizonDays" type="number" min="1" max="365" value="${Number(settings.bookingHorizonDays)}" required /></label><label>Grooming times during stay (comma-separated)<input name="groomingTimeSlots" value="${escapeHTML(settings.groomingTimeSlots.join(', '))}" placeholder="10:00, 13:00, 15:00" /></label><label>Hotel voucher code<input name="voucherCode" value="${escapeHTML(settings.voucher.code)}" maxlength="24" /></label><label>Voucher type<select name="voucherType"><option value="percent" ${settings.voucher.type === 'percent' ? 'selected' : ''}>Percentage</option><option value="fixed" ${settings.voucher.type === 'fixed' ? 'selected' : ''}>Fixed MYR amount</option></select></label><label>Voucher value<input name="voucherValue" type="number" min="0" step="0.01" value="${Number(settings.voucher.value)}" /></label><label>Voucher minimum spend (MYR)<input name="voucherMinimumSpend" type="number" min="0" step="0.01" value="${Number(settings.voucher.minimumSpend)}" /></label><label class="admin-hotel-active"><input name="voucherEnabled" type="checkbox" ${settings.voucher.enabled ? 'checked' : ''} /> Voucher active</label></div><h3>Room Types And Inventory</h3><div class="admin-hotel-room-list">${roomRows}</div><div class="admin-hotel-add-room"><h3>Add A Room Type</h3><div class="admin-hotel-settings-grid"><label>Room type name<input name="newRoomName" maxlength="60" /></label><label>Nightly rate (MYR)<input name="newRoomRate" type="number" min="0" step="0.01" value="0" /></label><label>Number of units<input name="newRoomCapacity" type="number" min="0" step="1" value="1" /></label><label>Dimensions<input name="newRoomDimensions" placeholder="e.g. 1.2m × 1.5m" /></label><label class="admin-hotel-wide">Description<input name="newRoomDescription" /></label><label class="admin-hotel-wide">Amenities<input name="newRoomAmenities" /></label><label>Room image<input type="file" name="newRoomPhoto" accept="image/png,image/jpeg,image/webp" /></label><label class="admin-hotel-active"><input type="checkbox" name="newRoomDoubleRoom" /> Double room (pets may share)</label></div></div><h3>Optional Care Add-Ons</h3><div class="admin-hotel-addon-list">${addOnRows}</div><div class="admin-hotel-add-addon"><h3>Add An Optional Service</h3><div class="admin-hotel-settings-grid"><label>Service name<input name="newAddonName" /></label><label>Price (MYR)<input name="newAddonPrice" type="number" min="0" step="0.01" value="0" /></label><label class="admin-hotel-wide">Description<input name="newAddonDescription" /></label></div></div><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Pet Hotel Settings</button><span data-admin-hotel-feedback role="status"></span></div></form></section>${settingsOnly ? '' : `<div data-hotel-calendar-host>${hotelCalendarMarkup(calendarSettings, allBookings)}</div>`}<section class="admin-market-panel" ${settingsOnly ? 'hidden' : ''}><div class="admin-market-panel-heading"><div><span>Live Appointments</span><h2>Pet Hotel Order Board</h2></div></div>${adminOrderStageFilters(stageBookings, 'hotel', selectedStage)}<div class="admin-hotel-booking-list">${orders || '<p class="admin-market-empty">No Pet Hotel bookings in this section.</p>'}</div></section>${settingsOnly ? adminServiceBannerSettingsPanel('hotel') : ''}${settingsOnly ? '' : adminOtherServiceOrderLinks('hotel')}</main>`;
}

const hotelMoney = (value) => `MYR ${Number(value || 0).toFixed(2)}`;
const refreshAdminHotel = () => window.dispatchEvent(new Event('hashchange'));

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hotelCalendarData() {
  let profile = {};
  try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
  const settings = loadHotelSettings();
  const companyWide = ['director', 'admin'].includes(profile.role);
  const outletName = String(profile.outletName || '').trim().toLowerCase();
  const visibleSettings = companyWide ? settings : {
    ...settings,
    outlets: settings.outlets.filter((outlet) => outlet.toLowerCase() === outletName),
  };
  const bookings = loadHotelBookings().filter((booking) => companyWide || (outletName && String(booking.outlet || '').trim().toLowerCase() === outletName));
  return { settings: visibleSettings, bookings };
}

function hotelCalendarMarkup(settings, bookings, { outlet = settings.outlets[0], startDate = localDateString(new Date()), view = 'week' } = {}) {
  const safeView = view === 'month' ? 'month' : 'week';
  const anchor = new Date(`${startDate}T12:00:00`);
  if (safeView === 'week') anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  const dates = safeView === 'month'
    ? Array.from({ length: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() }, (_, index) => new Date(anchor.getFullYear(), anchor.getMonth(), index + 1, 12))
    : Array.from({ length: 7 }, (_, index) => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + index, 12));
  const dateHeaders = dates.map((date) => `<th scope="col"><span>${date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</strong></th>`).join('');
  const roomRows = settings.rooms.filter((room) => room.active !== false).flatMap((room) => {
    const units = Array.from({ length: Math.max(0, Number(room.capacity) || 0) }, (_, index) => `Unit ${String(index + 1).padStart(2, '0')}`);
    return units.map((unit, unitIndex) => `<tr><th scope="row"><span>${escapeHTML(room.name)}</span><small>${unit}</small></th>${dates.map((date) => {
      const day = localDateString(date);
      const next = localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12));
      const unitAvailability = availableHotelUnits(room, outlet, day, next, bookings);
      const available = unitAvailability[unitIndex]?.available !== false;
      const reservations = bookings.filter((booking) => booking.outlet === outlet
        && (booking.roomId === room.id || (booking.petRooms || []).some((item) => item.roomId === room.id))
        && !/cancel|complete/i.test(String(booking.status || booking.adminStatus || ''))
        && String(booking.checkIn || '') < next && String(booking.checkOut || '') > day);
      const reservation = reservations.find((booking) => {
        const assignedUnits = (booking.petRooms || []).filter((item) => item.roomId === room.id).map((item) => item.assignedUnit).filter(Boolean);
        const assigned = assignedUnits.length ? assignedUnits : [...(booking.assignedUnits || []), booking.assignedUnit].filter(Boolean);
        return assigned.includes(unit);
      }) || (!available ? reservations[unitIndex] || reservations[0] : null);
      return `<td><span class="admin-hotel-calendar-cell ${available ? 'is-available' : 'is-reserved'}"${reservation ? ` title="${escapeHTML(`${reservation.petName || 'Guest'} · ${reservation.reference || 'Reservation'}`)}"` : ''}>${available ? 'Available' : escapeHTML(reservation?.petName || 'Reserved')}</span></td>`;
    }).join('')}</tr>`);
  }).join('');
  const outlets = settings.outlets.map((name) => `<option value="${escapeHTML(name)}" ${name === outlet ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('');
  const lastDate = dates[dates.length - 1];
  const title = safeView === 'month' ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${dates[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${lastDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `<section class="admin-market-panel admin-hotel-availability-panel" aria-labelledby="hotel-room-map-title"><div class="admin-market-panel-heading"><div><span>Room Availability</span><h2 id="hotel-room-map-title">Hotel Room Map</h2></div><p>View room availability by outlet and date.</p></div><div class="admin-hotel-calendar-toolbar"><label>Outlet<select data-hotel-calendar-outlet>${outlets}</select></label><label>Start date<input data-hotel-calendar-date type="date" value="${escapeHTML(startDate)}" /></label><div class="admin-hotel-calendar-view" role="group" aria-label="Calendar view"><button type="button" data-hotel-calendar-view="week" class="${safeView === 'week' ? 'is-active' : ''}">Week</button><button type="button" data-hotel-calendar-view="month" class="${safeView === 'month' ? 'is-active' : ''}">Month</button></div><div class="admin-hotel-calendar-navigation"><button type="button" data-hotel-calendar-step="-1" aria-label="Previous ${safeView}">‹</button><strong>${title}</strong><button type="button" data-hotel-calendar-step="1" aria-label="Next ${safeView}">›</button></div></div><div class="admin-hotel-calendar-legend"><span><i class="is-available"></i>Available</span><span><i class="is-reserved"></i>Reserved</span></div><div class="admin-hotel-calendar-scroll"><table class="admin-hotel-calendar"><thead><tr><th scope="col">Room / Unit</th>${dateHeaders}</tr></thead><tbody>${roomRows || `<tr><td colspan="${dates.length + 1}">No active room units. Add room types in Manage Pet Hotel.</td></tr>`}</tbody></table></div></section>`;
}

// Saves inventory and service settings so the customer availability search uses the new values.
export function setupAdminHotel() {
  const calendarHost = document.querySelector('[data-hotel-calendar-host]');
  calendarHost?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-hotel-calendar-view]');
    const stepButton = event.target.closest('[data-hotel-calendar-step]');
    if (!viewButton && !stepButton) return;
    const outlet = calendarHost.querySelector('[data-hotel-calendar-outlet]')?.value;
    const dateValue = calendarHost.querySelector('[data-hotel-calendar-date]')?.value || localDateString(new Date());
    const view = viewButton?.dataset.hotelCalendarView || calendarHost.querySelector('[data-hotel-calendar-view].is-active')?.dataset.hotelCalendarView || 'week';
    const date = new Date(`${dateValue}T12:00:00`);
    if (stepButton) {
      const step = Number(stepButton.dataset.hotelCalendarStep);
      if (view === 'month') { date.setDate(1); date.setMonth(date.getMonth() + step); }
      else date.setDate(date.getDate() + step * 7);
    }
    const { settings, bookings } = hotelCalendarData();
    calendarHost.innerHTML = hotelCalendarMarkup(settings, bookings, { outlet, startDate: localDateString(date), view });
  });
  calendarHost?.addEventListener('change', (event) => {
    if (!event.target.matches('[data-hotel-calendar-outlet], [data-hotel-calendar-date]')) return;
    const outlet = calendarHost.querySelector('[data-hotel-calendar-outlet]')?.value;
    const startDate = calendarHost.querySelector('[data-hotel-calendar-date]')?.value || localDateString(new Date());
    const view = calendarHost.querySelector('[data-hotel-calendar-view].is-active')?.dataset.hotelCalendarView || 'week';
    const { settings, bookings } = hotelCalendarData();
    calendarHost.innerHTML = hotelCalendarMarkup(settings, bookings, { outlet, startDate, view });
  });
  const form = document.querySelector('[data-admin-hotel-settings]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const prior = loadHotelSettings();
    const rooms = [];
    for (const row of form.querySelectorAll('[data-hotel-room-id]')) {
      const get = (key) => row.querySelector(`[data-hotel-room-field="${key}"]`);
      const old = prior.rooms.find((room) => room.id === row.dataset.hotelRoomId);
      let photo = old?.photo || '';
      const photoFile = row.querySelector('[data-hotel-room-photo]')?.files?.[0];
      if (photoFile) {
        if (photoFile.size > 700 * 1024) { form.querySelector('[data-admin-hotel-feedback]').textContent = 'Room images must be 700 KB or smaller.'; return; }
        photo = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(photoFile); });
        if (!photo) { form.querySelector('[data-admin-hotel-feedback]').textContent = 'A room photo could not be read.'; return; }
      }
      rooms.push({ ...old, id: row.dataset.hotelRoomId, name: get('name').value.trim(), nightlyRate: Number(get('nightlyRate').value), capacity: Number(get('capacity').value), dimensions: get('dimensions').value.trim(), description: get('description').value.trim(), amenities: get('amenities').value.trim(), active: get('active').checked, doubleRoom: get('doubleRoom').checked, photo });
    }
    const newRoomName = form.elements.newRoomName.value.trim();
    if (newRoomName) {
      const photoFile = form.elements.newRoomPhoto.files?.[0];
      let photo = '';
      if (photoFile) {
        if (photoFile.size > 700 * 1024) { form.querySelector('[data-admin-hotel-feedback]').textContent = 'Room images must be 700 KB or smaller.'; return; }
        photo = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(photoFile); });
        if (!photo) { form.querySelector('[data-admin-hotel-feedback]').textContent = 'A room photo could not be read.'; return; }
      }
      rooms.push({ id: `room-${Date.now()}`, name: newRoomName, nightlyRate: Number(form.elements.newRoomRate.value), capacity: Number(form.elements.newRoomCapacity.value), dimensions: form.elements.newRoomDimensions.value.trim(), description: form.elements.newRoomDescription.value.trim(), amenities: form.elements.newRoomAmenities.value.trim(), active: true, doubleRoom: form.elements.newRoomDoubleRoom.checked, photo });
    }
    const addOns = [...form.querySelectorAll('[data-hotel-addon-id]')].map((row) => ({ id: row.dataset.hotelAddonId, name: row.querySelector('[data-hotel-addon-field="name"]').value.trim(), price: Number(row.querySelector('[data-hotel-addon-field="price"]').value), description: row.querySelector('[data-hotel-addon-field="description"]').value.trim(), active: row.querySelector('[data-hotel-addon-field="active"]').checked }));
    const newAddonName = form.elements.newAddonName.value.trim();
    if (newAddonName) addOns.push({ id: `addon-${Date.now()}`, name: newAddonName, price: Number(form.elements.newAddonPrice.value), description: form.elements.newAddonDescription.value.trim(), active: true });
    const outlets = prior.outlets;
    const groomingTimeSlots = [...new Set(form.elements.groomingTimeSlots.value.split(',').map((value) => value.trim()).filter(Boolean))];
    const feedback = form.querySelector('[data-admin-hotel-feedback]');
    if (!rooms.length || !addOns.length || !outlets.length) { feedback.textContent = 'Keep at least one room type and add-on option, and add an active outlet in Manage Outlets.'; return; }
    if (!groomingTimeSlots.length) { feedback.textContent = 'Add at least one time for hotel grooming appointments.'; return; }
    if (groomingTimeSlots.some((time) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time))) { feedback.textContent = 'Use 24-hour times, such as 10:00, 13:00, 15:00.'; return; }
    const updated = { ...prior, bookingHorizonDays: Number(form.elements.bookingHorizonDays.value), outlets, rooms, addOns, groomingTimeSlots, voucher: { code: form.elements.voucherCode.value.trim().toUpperCase(), type: form.elements.voucherType.value, value: Number(form.elements.voucherValue.value), minimumSpend: Number(form.elements.voucherMinimumSpend.value), enabled: form.elements.voucherEnabled.checked } };
    localStorage.setItem(hotelSettingsKey, JSON.stringify(updated));
    void recordAdminAction('hotel_settings_updated', 'service', 'pet_hotel');
    refreshAdminHotel();
  });
  form.addEventListener('click', (event) => {
    const deleteRoom = event.target.closest('[data-delete-hotel-room]');
    const deleteAddon = event.target.closest('[data-delete-hotel-addon]');
    if (!deleteRoom && !deleteAddon) return;
    const settings = loadHotelSettings();
    if (deleteRoom) {
      if (settings.rooms.length < 2) { window.alert('Keep at least one room type.'); return; }
      if (!window.confirm('Delete this room type? Existing reservations keep their saved room details.')) return;
      settings.rooms = settings.rooms.filter((item) => item.id !== deleteRoom.dataset.deleteHotelRoom);
    } else {
      if (settings.addOns.length < 2) { window.alert('Keep at least one optional care add-on.'); return; }
      if (!window.confirm('Delete this add-on? Existing reservations keep their saved service details.')) return;
      settings.addOns = settings.addOns.filter((item) => item.id !== deleteAddon.dataset.deleteHotelAddon);
    }
    localStorage.setItem(hotelSettingsKey, JSON.stringify(settings));
    void recordAdminAction(deleteRoom ? 'hotel_room_removed' : 'hotel_addon_removed', deleteRoom ? 'hotel_room' : 'hotel_addon', deleteRoom ? deleteRoom.dataset.deleteHotelRoom : deleteAddon.dataset.deleteHotelAddon);
    refreshAdminHotel();
  });

  document.querySelectorAll('[data-save-hotel-booking]').forEach((button) => button.addEventListener('click', () => {
    const bookings = loadHotelBookings();
    const booking = bookings.find((item) => item.id === button.dataset.saveHotelBooking);
    const unit = document.querySelector(`[data-hotel-unit="${CSS.escape(button.dataset.saveHotelBooking)}"]`)?.value.trim() || '';
    if (!booking) return;
    if (unit && loadHotelBookings().some((other) => other.id !== booking.id && other.roomId === booking.roomId && other.outlet === booking.outlet && other.assignedUnit === unit && !/cancel|completed/i.test(String(other.status || '')) && other.checkIn < booking.checkOut && other.checkOut > booking.checkIn)) {
      window.alert('That room unit is already assigned to an overlapping stay. Choose another unit.');
      return;
    }
    booking.assignedUnit = unit;
    localStorage.setItem(hotelBookingsKey, JSON.stringify(bookings));
    void recordAdminAction('hotel_room_assigned', 'pet_hotel_booking', booking.reference || booking.id, { assignedUnit: unit });
    refreshAdminHotel();
  }));

  // Attach an official payment receipt to the booking for customer My Orders access.
  document.querySelectorAll('[data-hotel-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 1024 * 1024) { window.alert('Receipts must be 1 MB or smaller.'); input.value = ''; return; }
    const data = await readFile(file); if (!data) { window.alert('Receipt could not be read.'); return; }
    const bookings = loadHotelBookings(); const booking = bookings.find((item) => item.id === input.dataset.hotelReceipt); if (!booking) return;
    const previousStatus = booking.receipt?.previousStatus || booking.adminStatus || booking.status || 'New Order';
    const previousPaymentStatus = booking.receipt?.previousPaymentStatus ?? booking.paymentStatus;
    booking.receipt = { name: file.name, data, uploadedAt: new Date().toISOString(), previousStatus, previousPaymentStatus }; booking.paymentStatus = 'Official receipt uploaded';
    if (!/checked in|complete|cancel/i.test(previousStatus)) booking.adminStatus = 'Received Order';
    localStorage.setItem(hotelBookingsKey, JSON.stringify(bookings));
    void recordAdminAction('receipt_uploaded', 'pet_hotel_booking', booking.reference || booking.id);
    refreshAdminHotel();
  }));

  // Stores staff photos or short videos on the active stay care feed for the customer portal.
  document.querySelectorAll('[data-hotel-media]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/') && !['video/mp4', 'video/webm'].includes(file.type)) { window.alert('Choose a photo or MP4/WebM video.'); input.value = ''; return; }
    if (file.size > 1200 * 1024) { window.alert('Stay updates must be 1.2 MB or smaller.'); input.value = ''; return; }
    const data = await readFile(file); if (!data) { window.alert('Stay update could not be read.'); return; }
    const bookings = loadHotelBookings(); const booking = bookings.find((item) => item.id === input.dataset.hotelMedia); if (!booking) return;
    booking.mediaLogs = [...(booking.mediaLogs || []), { name: file.name, type: file.type, data, uploadedAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10) }];
    localStorage.setItem(hotelBookingsKey, JSON.stringify(bookings));
    void recordAdminAction('hotel_care_update_uploaded', 'pet_hotel_booking', booking.reference || booking.id);
    refreshAdminHotel();
  }));
}

// Reads a selected receipt or care-feed file as a local browser preview URL.
function readFile(file) {
  return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
}
