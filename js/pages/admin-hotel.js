import { escapeHTML } from '../shared.js';
import { hotelBookingsKey, hotelSettingsKey, loadHotelBookings, loadHotelSettings } from './hotel-data.js';
import { recordAdminAction } from '../admin-audit.js';
import { adminServiceBannerSettingsPanel } from './admin-service-banners.js';

// Admin Hotel page: manages room inventory, rates, add-ons, transport, vouchers, and boarding records.
export function adminHotelPage({ settingsOnly = false } = {}) {
  const profile = JSON.parse(sessionStorage.getItem("furgo-demo-user-profile") || "{}");
  const isExecutive = ["executive", "staff"].includes(profile.role);
  const settings = loadHotelSettings();
  const bookings = loadHotelBookings().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const roomRows = settings.rooms.map((room) => `<details class="admin-hotel-room" open><summary>${escapeHTML(room.name)}${room.active === false ? ' · Hidden' : ''}</summary><div class="admin-hotel-fields" data-hotel-room-id="${escapeHTML(room.id)}"><label>Room type name<input data-hotel-room-field="name" value="${escapeHTML(room.name)}" required /></label><label>Nightly rate (MYR)<input data-hotel-room-field="nightlyRate" type="number" min="0" step="0.01" value="${Number(room.nightlyRate)}" required /></label><label>Number of units<input data-hotel-room-field="capacity" type="number" min="0" step="1" value="${Number(room.capacity)}" required /></label><label>Dimensions<input data-hotel-room-field="dimensions" value="${escapeHTML(room.dimensions || '')}" /></label><label class="admin-hotel-wide">Description<input data-hotel-room-field="description" value="${escapeHTML(room.description || '')}" /></label><label class="admin-hotel-wide">Amenities<input data-hotel-room-field="amenities" value="${escapeHTML(room.amenities || '')}" /></label><label>Room image<input type="file" accept="image/png,image/jpeg,image/webp" data-hotel-room-photo />${room.photo ? `<img class="admin-hotel-photo-preview" src="${escapeHTML(room.photo)}" alt="Current ${escapeHTML(room.name)} room" />` : ''}</label><label class="admin-hotel-active"><input data-hotel-room-field="active" type="checkbox" ${room.active === false ? '' : 'checked'} /> Available to customers</label><button class="button button-light" type="button" data-delete-hotel-room="${escapeHTML(room.id)}">Delete room type</button></div></details>`).join('');
  const addOnRows = settings.addOns.map((item) => `<div class="admin-hotel-addon-row" data-hotel-addon-id="${escapeHTML(item.id)}"><label>Service name<input data-hotel-addon-field="name" value="${escapeHTML(item.name)}" required /></label><label>Price (MYR)<input data-hotel-addon-field="price" type="number" min="0" step="0.01" value="${Number(item.price)}" required /></label><label class="admin-hotel-wide">Description<input data-hotel-addon-field="description" value="${escapeHTML(item.description || '')}" /></label><label class="admin-hotel-active"><input data-hotel-addon-field="active" type="checkbox" ${item.active === false ? '' : 'checked'} /> Active</label><button class="button button-light" type="button" data-delete-hotel-addon="${escapeHTML(item.id)}">Delete</button></div>`).join('');
  const orders = bookings.map((booking) => `<article class="admin-hotel-booking"><div class="admin-hotel-booking-top"><div><span>${escapeHTML(booking.reference)} · ${escapeHTML(new Date(booking.createdAt).toLocaleString())}</span><h3>${escapeHTML(booking.petName)} · ${escapeHTML(booking.roomName)}</h3></div><b>${escapeHTML(booking.adminStatus || booking.status)}</b></div><div class="admin-hotel-booking-grid"><div><small>Customer & emergency</small><strong>${escapeHTML(booking.customerName)} · ${escapeHTML(booking.customerPhone)}</strong><span>${escapeHTML(booking.emergencyName)} · ${escapeHTML(booking.emergencyPhone)}</span></div><div><small>Pet health gate</small><strong>${escapeHTML(booking.petSpecies || 'Pet')} · ${escapeHTML(booking.petBreed)} · ${escapeHTML(booking.petWeight)} kg</strong><span>${escapeHTML(booking.vaccinationStatus || 'Vaccination card needs staff review')} · ${booking.vaccinationCards?.length || 0} card(s)</span>${booking.vaccinationCards?.map((card) => `<a href="${escapeHTML(card.data)}" target="_blank" rel="noopener">${escapeHTML(card.name)}</a>`).join('') || ''}${booking.redFlags ? `<em>⚑ ${escapeHTML(booking.redFlags)}</em>` : ''}</div><div><small>Stay & room</small><strong>${escapeHTML(booking.checkIn)} to ${escapeHTML(booking.checkOut)} · ${Number(booking.nights)} night(s)</strong><span>${escapeHTML(booking.outlet)} · ${hotelMoney(booking.nightlyRate)}/night · ${escapeHTML(booking.assignedUnit || 'Room unit not assigned')}</span></div><div><small>Add-ons</small><strong>${booking.addOns?.map((item) => `${escapeHTML(item.name)} (${hotelMoney(item.price)})`).join(', ') || 'No care add-ons'}${booking.grooming ? ` · Grooming ${escapeHTML(booking.grooming.packageName)} on ${escapeHTML(booking.grooming.date)} at ${escapeHTML(booking.grooming.time)}` : ''}</strong><span>${booking.taxi ? `Taxi ${booking.taxi.pickup ? 'pickup' : ''}${booking.taxi.pickup && booking.taxi.dropoff ? ' + ' : ''}${booking.taxi.dropoff ? 'drop-off' : ''} · ${escapeHTML(booking.taxi.address)} · ${escapeHTML(booking.taxi.schedule)} · ${hotelMoney(booking.taxi.fare)}` : 'No Pet Taxi'}</span></div><div><small>Payment audit</small><strong>${escapeHTML(booking.paymentStatus || 'Payment pending')}</strong><span>${escapeHTML(booking.paymentMethod || '')} · ${hotelMoney(booking.total)}${booking.voucherCode ? ` · Voucher ${escapeHTML(booking.voucherCode)}` : ''}</span>${booking.paymentProof ? `<a href="${escapeHTML(booking.paymentProof.data)}" target="_blank" rel="noopener">Customer transfer slip: ${escapeHTML(booking.paymentProof.name)}</a>` : ''}</div></div><div class="admin-hotel-booking-actions"><label>Reservation status<select data-hotel-status="${escapeHTML(booking.id)}">${['Pending / Confirmed', 'Checked In', 'Completed', 'Cancelled'].map((status) => `<option ${booking.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label>Assigned room / unit<input data-hotel-unit="${escapeHTML(booking.id)}" value="${escapeHTML(booking.assignedUnit || '')}" placeholder="e.g. Standard 03" /></label><button class="button button-light" type="button" data-save-hotel-booking="${escapeHTML(booking.id)}">Save booking</button><label class="admin-hotel-upload">Upload official receipt<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-hotel-receipt="${escapeHTML(booking.id)}" /></label><label class="admin-hotel-upload">Add daily photo or video<input type="file" accept="image/*,video/mp4,video/webm" data-hotel-media="${escapeHTML(booking.id)}" /></label></div>${booking.receipt ? `<p class="admin-hotel-upload-status">Current receipt: ${escapeHTML(booking.receipt.name)}</p>` : ''}${booking.mediaLogs?.length ? `<p class="admin-hotel-upload-status">${booking.mediaLogs.length} daily care update(s) uploaded.</p>` : ''}</article>`).join('');

  return `<main class="admin-portal-page admin-hotel-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header><header class="admin-grooming-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Boarding operations</span><h1>Pet Hotel</h1></div></header><section class="admin-market-stats"><article><span>Reservations</span><strong>${bookings.length}</strong></article><article><span>Upcoming / active stays</span><strong>${bookings.filter((booking) => ['Pending / Confirmed', 'Checked In'].includes(booking.status)).length}</strong></article><article><span>Room types</span><strong>${settings.rooms.filter((room) => room.active !== false).length}</strong></article></section><section class="admin-market-panel" ${settingsOnly ? '' : 'hidden'}><div class="admin-market-panel-heading"><div><span>Manage Service</span><h2>Rooms, Prices & Service Options</h2></div><p>${isExecutive ? "Manager or Director access is required to change service setup." : "Room inventory and rates apply to customer date-range searches. Confirmed stays reserve a unit until cancellation or checkout."}</p></div><form class="admin-hotel-settings" data-admin-hotel-settings>${isExecutive ? '<fieldset disabled class="admin-executive-locked">' : ''}<div class="admin-hotel-settings-grid"><label>Outlet names (comma-separated)<input name="outlets" value="${escapeHTML(settings.outlets.join(', '))}" required /></label><label>Booking window (days ahead)<input name="bookingHorizonDays" type="number" min="1" max="365" value="${Number(settings.bookingHorizonDays)}" required /></label><label>Grooming times during stay (comma-separated)<input name="groomingTimeSlots" value="${escapeHTML(settings.groomingTimeSlots.join(', '))}" placeholder="10:00, 13:00, 15:00" /></label><label>Hotel voucher code<input name="voucherCode" value="${escapeHTML(settings.voucher.code)}" maxlength="24" /></label><label>Voucher type<select name="voucherType"><option value="percent" ${settings.voucher.type === 'percent' ? 'selected' : ''}>Percentage</option><option value="fixed" ${settings.voucher.type === 'fixed' ? 'selected' : ''}>Fixed MYR amount</option></select></label><label>Voucher value<input name="voucherValue" type="number" min="0" step="0.01" value="${Number(settings.voucher.value)}" /></label><label>Voucher minimum spend (MYR)<input name="voucherMinimumSpend" type="number" min="0" step="0.01" value="${Number(settings.voucher.minimumSpend)}" /></label><label class="admin-hotel-active"><input name="voucherEnabled" type="checkbox" ${settings.voucher.enabled ? 'checked' : ''} /> Voucher active</label></div><h3>Room Types And Inventory</h3><div class="admin-hotel-room-list">${roomRows}</div><div class="admin-hotel-add-room"><h3>Add A Room Type</h3><div class="admin-hotel-settings-grid"><label>Room type name<input name="newRoomName" maxlength="60" /></label><label>Nightly rate (MYR)<input name="newRoomRate" type="number" min="0" step="0.01" value="0" /></label><label>Number of units<input name="newRoomCapacity" type="number" min="0" step="1" value="1" /></label><label>Dimensions<input name="newRoomDimensions" placeholder="e.g. 1.2m × 1.5m" /></label><label class="admin-hotel-wide">Description<input name="newRoomDescription" /></label><label class="admin-hotel-wide">Amenities<input name="newRoomAmenities" /></label><label>Room image<input type="file" name="newRoomPhoto" accept="image/png,image/jpeg,image/webp" /></label></div></div><h3>Optional Care Add-Ons</h3><div class="admin-hotel-addon-list">${addOnRows}</div><div class="admin-hotel-add-addon"><h3>Add An Optional Service</h3><div class="admin-hotel-settings-grid"><label>Service name<input name="newAddonName" /></label><label>Price (MYR)<input name="newAddonPrice" type="number" min="0" step="0.01" value="0" /></label><label class="admin-hotel-wide">Description<input name="newAddonDescription" /></label></div></div><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Pet Hotel Settings</button><span data-admin-hotel-feedback role="status"></span></div>${isExecutive ? '</fieldset>' : ''}</form></section><section class="admin-market-panel" ${settingsOnly ? 'hidden' : ''}><div class="admin-market-panel-heading"><div><span>Reservation board</span><h2>Bookings, Check-Ins & Care Feed</h2></div><p>Review guest and pet safety details, assign room units, update check-in status, upload daily care photos or videos, and add customer receipts.</p></div><div class="admin-hotel-booking-list">${orders || '<p class="admin-market-empty">No Pet Hotel reservations have been placed yet.</p>'}</div></section>${settingsOnly ? adminServiceBannerSettingsPanel('hotel') : ''}</main>`;
}

const hotelMoney = (value) => `MYR ${Number(value || 0).toFixed(2)}`;
const refreshAdminHotel = () => window.dispatchEvent(new Event('hashchange'));

// Saves inventory and service settings so the customer availability search uses the new values.
export function setupAdminHotel() {
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
      rooms.push({ ...old, id: row.dataset.hotelRoomId, name: get('name').value.trim(), nightlyRate: Number(get('nightlyRate').value), capacity: Number(get('capacity').value), dimensions: get('dimensions').value.trim(), description: get('description').value.trim(), amenities: get('amenities').value.trim(), active: get('active').checked, photo });
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
      rooms.push({ id: `room-${Date.now()}`, name: newRoomName, nightlyRate: Number(form.elements.newRoomRate.value), capacity: Number(form.elements.newRoomCapacity.value), dimensions: form.elements.newRoomDimensions.value.trim(), description: form.elements.newRoomDescription.value.trim(), amenities: form.elements.newRoomAmenities.value.trim(), active: true, photo });
    }
    const addOns = [...form.querySelectorAll('[data-hotel-addon-id]')].map((row) => ({ id: row.dataset.hotelAddonId, name: row.querySelector('[data-hotel-addon-field="name"]').value.trim(), price: Number(row.querySelector('[data-hotel-addon-field="price"]').value), description: row.querySelector('[data-hotel-addon-field="description"]').value.trim(), active: row.querySelector('[data-hotel-addon-field="active"]').checked }));
    const newAddonName = form.elements.newAddonName.value.trim();
    if (newAddonName) addOns.push({ id: `addon-${Date.now()}`, name: newAddonName, price: Number(form.elements.newAddonPrice.value), description: form.elements.newAddonDescription.value.trim(), active: true });
    const outlets = [...new Set(form.elements.outlets.value.split(',').map((value) => value.trim()).filter(Boolean))];
    const groomingTimeSlots = [...new Set(form.elements.groomingTimeSlots.value.split(',').map((value) => value.trim()).filter(Boolean))];
    const feedback = form.querySelector('[data-admin-hotel-feedback]');
    if (!rooms.length || !addOns.length || !outlets.length) { feedback.textContent = 'Keep at least one room type, add-on option, and outlet.'; return; }
    if (!groomingTimeSlots.length) { feedback.textContent = 'Add at least one time for hotel grooming appointments.'; return; }
    if (routes.some((route) => !route.city || !outlets.includes(route.outlet) || !Number.isFinite(route.distanceKm) || route.distanceKm <= 0)) { feedback.textContent = 'Check each taxi route line: City | an outlet name | distance in km.'; return; }
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
    const status = document.querySelector(`[data-hotel-status="${CSS.escape(button.dataset.saveHotelBooking)}"]`)?.value;
    const unit = document.querySelector(`[data-hotel-unit="${CSS.escape(button.dataset.saveHotelBooking)}"]`)?.value.trim() || '';
    if (!booking || !status) return;
    if (unit && loadHotelBookings().some((other) => other.id !== booking.id && other.roomId === booking.roomId && other.outlet === booking.outlet && other.assignedUnit === unit && !/cancel|completed/i.test(String(other.status || '')) && other.checkIn < booking.checkOut && other.checkOut > booking.checkIn)) {
      window.alert('That room unit is already assigned to an overlapping stay. Choose another unit.');
      return;
    }
    const role = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').role || 'executive';
    const changedBy = role[0].toUpperCase() + role.slice(1);
    booking.statusHistory = [...(booking.statusHistory || []), { status, previousStatus: booking.status, changedAt: new Date().toISOString(), changedBy }];
    booking.status = status; booking.adminStatus = status; booking.assignedUnit = unit;
    if (status === 'Cancelled') booking.paymentStatus = 'Cancellation / refund review';
    localStorage.setItem(hotelBookingsKey, JSON.stringify(bookings));
    void recordAdminAction('order_status_updated', 'pet_hotel_booking', booking.reference || booking.id, { status });
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
