import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadPetProfiles } from './home.js';
import { loadGroomingSettings, groomingWeightTier } from './grooming-data.js';
import { availableHotelUnits, hotelBookingsKey, loadHotelBookings, loadHotelSettings } from './hotel-data.js';
import { saveDedicatedBooking } from '../app-data-sync.js';
import { loadPetTaxiSettings, matchPetTaxiRoute } from './pet-taxi-data.js';
import { renderPetTaxiAddressPicker, setupPetTaxiAddressPicker } from './pet-taxi-addresses.js';
import { customerServiceBannerMarkup } from './service-banners.js';

const hotelMoney = (value) => `MYR ${Number(value || 0).toFixed(2)}`;

// Customer Pet Hotel: renders date-based room options, selected-pet health checks, and optional services.
export function petHotelPage() {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const pets = loadPetProfiles();
  const settings = loadHotelSettings();
  const petTaxi = loadPetTaxiSettings();
  const profile = (() => { try { return JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { return {}; } })();
  const addresses = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); } catch { return []; } })();
  const petCards = pets.map((pet) => `<button class="grooming-pet-card ${pet.id === pets[0]?.id ? 'is-selected' : ''}" type="button" data-hotel-pet-choice="${escapeHTML(pet.id)}" aria-pressed="${pet.id === pets[0]?.id}"><img class="grooming-pet-photo" src="${escapeHTML(pet.photo || icon('Profile Picture.png'))}" alt="" /><span class="grooming-pet-card-copy"><strong>${escapeHTML(pet.name)}</strong><span>${escapeHTML(pet.breed || 'Breed not added')}</span><small>${escapeHTML(pet.weight || 'Weight not added')} kg</small></span>${pet.id === pets[0]?.id ? `<span class="grooming-pet-selected-mark"><img src="${icon('Icon-13.png')}" alt="Selected" /></span>` : ''}</button>`).join('');
  const outletOptions = settings.outlets.map((outlet) => `<option>${escapeHTML(outlet)}</option>`).join('');
  const roomCards = settings.rooms.filter((room) => room.active !== false).map((room) => `<article class="hotel-room-card" data-hotel-room-card="${escapeHTML(room.id)}"><span class="hotel-room-image">${room.photo ? `<img src="${escapeHTML(room.photo)}" alt="${escapeHTML(room.name)}" />` : '<span aria-hidden="true">🐾</span>'}</span><span class="hotel-room-copy"><strong>${escapeHTML(room.name)}</strong><small>${escapeHTML(room.dimensions || 'Room dimensions on request')} · ${Number(room.capacity)} units</small><span>${escapeHTML(room.description || '')}</span><small class="hotel-room-amenities">${escapeHTML(room.amenities || '')}</small><b>${hotelMoney(room.nightlyRate)} <small>/ night</small></b><span class="hotel-room-availability" data-room-availability>Choose dates to see available rooms</span></span><div class="hotel-room-unit-grid" data-hotel-units aria-label="${escapeHTML(room.name)} room units">Select your stay dates to view rooms.</div></article>`).join('');
  const roomGroups = pets.map((pet) => `<div class="hotel-room-pet-group" data-hotel-room-pet="${escapeHTML(pet.id)}" ${pet.id !== pets[0]?.id ? 'hidden' : ''}><h3>Select A Room Package For ${escapeHTML(pet.name)}</h3><div class="hotel-room-list" data-hotel-room-list data-room-pet-id="${escapeHTML(pet.id)}">${roomCards || '<p>No room types are currently available. Please check again later.</p>'}</div></div>`).join('');
  const addOnCards = settings.addOns.filter((item) => item.active !== false).map((item) => `<label class="hotel-addon-card"><input type="checkbox" name="hotelAddOn" value="${escapeHTML(item.id)}" data-hotel-addon /><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.description || '')}</small><b>${hotelMoney(item.price)}</b></span></label>`).join('');
  const groomingSettings = loadGroomingSettings();
  const grooming = pets.map((pet) => `<div data-hotel-grooming-pet="${escapeHTML(pet.id)}" ${pet.id !== pets[0]?.id ? 'hidden' : ''}><h3>Select A Service Package For ${escapeHTML(pet.name)}</h3>${groomingSettings.packages.filter((item) => item.active !== false).map((item, index) => `<label class="hotel-grooming-card"><input type="radio" name="hotelGroomingPackage-${escapeHTML(pet.id)}" value="${escapeHTML(item.id)}" data-hotel-grooming-package data-package-pet="${escapeHTML(pet.id)}" ${index === 0 ? 'checked' : ''} /><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.description || '')}</small><b data-hotel-grooming-price>${hotelMoney(item.small)}</b></span></label>`).join('')}</div>`).join('');
  const taxiSchedule = `${renderPetTaxiAddressPicker({ addresses, profile, selectName: 'taxiAddress', manualName: 'taxiManualAddress' })}<div class="hotel-taxi-options"><label><input type="checkbox" name="taxiPickup" data-hotel-taxi /> Pickup for check-in</label><label><input type="checkbox" name="taxiDropoff" data-hotel-taxi /> Drop-off after check-out</label></div><p class="hotel-taxi-estimate" data-hotel-taxi-estimate>Choose a saved or manual address to see an estimate.</p><label class="grooming-field">Taxi schedule<select name="taxiSchedule"><option value="">Choose a pickup time</option>${petTaxi.scheduleSlots.map((time) => `<option value="${escapeHTML(time)}">${escapeHTML(time)}</option>`).join('')}</select></label>`;

  return `<main class="grooming-page hotel-page"><header class="grooming-header grooming-header-centered"><a class="grooming-back" href="#home" aria-label="Back to Home">‹</a><h1>Pet Hotel</h1><a class="grooming-header-orders" href="#orders?service=hotel&from=hotel" aria-label="My Orders"><img src="${icon('Icon-18.png')}" alt="" /></a></header>
    ${customerServiceBannerMarkup('hotel')}
    <form class="grooming-booking-form hotel-booking-form" data-hotel-booking>
      <section class="grooming-section"><div class="grooming-section-heading"><span>01</span><div><h2>Choose Your Pet</h2><p>Select one or more pets for this stay. Tap a selected pet again to remove it.</p></div></div><div class="grooming-pet-carousel" data-hotel-pet-carousel>${petCards || '<p>No pet profiles yet. Add a pet profile before booking a stay.</p>'}</div><input type="hidden" name="petId" value="${escapeHTML(pets[0]?.id || '')}" /><input type="hidden" name="petIds" value="${escapeHTML(pets[0]?.id || '')}" /><div class="hotel-health-gate" data-hotel-health-gate></div><label class="hotel-vaccination-confirm" data-hotel-vaccination-confirm><input type="checkbox" name="vaccinationCurrent" required /> I confirm the selected pets’ vaccination records are current and valid for the full stay.</label><a class="hotel-vaccination-link" data-hotel-pet-profile href="${pets[0] ? `#pet-profile?id=${encodeURIComponent(pets[0].id)}&from=hotel` : '#pet-profile?mode=add&from=hotel'}">More Pet Profile</a></section>
      <section class="grooming-section"><div class="grooming-section-heading"><span>02</span><div><h2>Choose Your Stay Dates</h2><p>Tap a check-in date, then tap a check-out date to complete your range.</p></div></div><div class="hotel-range-display"><div><small>Check-in</small><strong data-hotel-check-in-display>Choose date</strong></div><span aria-hidden="true">→</span><div><small>Check-out</small><strong data-hotel-check-out-display>Choose date</strong></div></div><input type="hidden" name="checkIn" data-hotel-check-in value="" /><input type="hidden" name="checkOut" data-hotel-check-out value="" /><div class="hotel-calendar" data-hotel-calendar aria-label="Select check-in and check-out dates"><div class="hotel-calendar-heading"><button type="button" data-hotel-calendar-nav="previous" aria-label="Previous month">‹</button><strong data-hotel-calendar-month></strong><button type="button" data-hotel-calendar-nav="next" aria-label="Next month">›</button></div><div class="hotel-calendar-grid" data-hotel-calendar-grid role="grid"></div><div class="hotel-calendar-legend"><span><i class="is-legend-selected"></i>Selected</span><span><i class="is-legend-range"></i>Stay dates</span><span><i class="is-legend-unavailable"></i>Unavailable</span></div></div><label class="grooming-field hotel-outlet-field">Furgo outlet<select name="outlet" data-hotel-outlet required>${outletOptions}</select></label><p class="hotel-date-summary" data-hotel-date-summary>Select check-in and check-out dates to view rooms available for the full stay.</p><input type="hidden" name="roomAssignments" value="{}" data-hotel-room-assignments /><div class="hotel-room-sharing" data-hotel-room-sharing hidden><label><input type="checkbox" name="shareHotelRoom" data-hotel-share-room /> Keep the selected pets together in one room</label><p>Your pets will share the selected room.</p></div><p class="hotel-double-room-empty" data-hotel-double-room-empty hidden>No room types are currently marked as double rooms. Please contact Furgo for help.</p>${roomGroups || '<p>No pet profiles yet.</p>'}</section>
      <section class="grooming-section hotel-pet-taxi-section"><div class="grooming-section-heading"><span><img class="pet-taxi-service-icon" src="Image/Icon/MVP Icon-05.png" alt="" /></span><div><h2>Pet Taxi (Add On)</h2><p>Add pickup or drop-off to your Pet Hotel booking.</p></div></div><label class="hotel-addon-toggle"><input type="checkbox" name="includeTaxi" data-hotel-include-taxi /> Add Pet Taxi pickup or drop-off <small>From MYR ${Number(petTaxi.baseFare).toFixed(2)} + MYR ${Number(petTaxi.farePerKm).toFixed(2)} / km</small></label><div class="hotel-taxi-fields" data-hotel-taxi-fields hidden>${taxiSchedule}</div></section>
      <section class="grooming-section"><div class="grooming-section-heading"><span>04</span><div><h2>Other Add On Services</h2><p>Choose optional services for your pet’s stay.</p></div></div><div class="hotel-addon-list">${addOnCards || '<p>No optional care services are available right now.</p>'}</div><label class="hotel-addon-toggle"><input type="checkbox" name="includeGrooming" data-hotel-include-grooming /> Add grooming during the stay</label><div class="hotel-grooming-fields" data-hotel-grooming-fields hidden><div class="hotel-grooming-list">${grooming || '<p>No grooming add-ons are currently available.</p>'}</div><div class="grooming-form-grid hotel-form-grid"><label class="grooming-field">Preferred grooming date<input type="date" name="groomingDate" data-hotel-grooming-date /></label><label class="grooming-field">Preferred grooming time<select name="groomingTime">${settings.groomingTimeSlots.map((time) => `<option value="${escapeHTML(time)}">${escapeHTML(time)}</option>`).join('')}</select></label></div><p class="hotel-grooming-estimate" data-hotel-grooming-estimate></p></div></section>
      <section class="grooming-section"><div class="grooming-section-heading"><span>05</span><div><h2>Emergency Contact</h2><p>We’ll use this contact if we need to reach you during the stay.</p></div></div><div class="grooming-form-grid hotel-form-grid"><label class="grooming-field">Contact name<input name="emergencyName" value="${escapeHTML(profile.name || '')}" required /></label><label class="grooming-field">Phone number<input name="emergencyPhone" type="tel" value="${escapeHTML(profile.phone || '')}" required /></label></div></section>
      <section class="grooming-section grooming-payment-section"><div class="grooming-section-heading"><span>06</span><div><h2>Checkout & Payment</h2><p>Review your stay, add a promo code, then choose a payment method.</p></div></div><div class="hotel-voucher-row"><label class="grooming-field">Promo code<input name="voucherCode" placeholder="Enter promo code" data-hotel-voucher /></label><button class="button button-light" type="button" data-apply-hotel-voucher>Apply</button></div><p class="hotel-voucher-feedback" data-hotel-voucher-feedback role="status">${settings.voucher.enabled ? `Demo code: ${escapeHTML(settings.voucher.code)}` : 'No Pet Hotel promo code is active.'}</p><div class="hotel-payment-options"><label><input type="radio" name="paymentMethod" value="gateway" checked /><span><strong>Online payment</strong><small>Card, FPX / online banking, or e-wallet</small></span></label><label><input type="radio" name="paymentMethod" value="wallet" /><span><strong>Furgo Credit</strong><small>Available balance: ${hotelMoney(Number(localStorage.getItem('furgo-demo-credit-balance') || 0))}</small></span></label><label><input type="radio" name="paymentMethod" value="bank-transfer" /><span><strong>Manual bank transfer</strong><small>Attach a transfer slip for staff verification.</small></span></label></div><label class="grooming-field hotel-transfer-upload" data-hotel-transfer hidden>Transfer slip (image/PDF, max 1 MB)<input type="file" name="transferSlip" accept="image/png,image/jpeg,image/webp,application/pdf" /></label><div class="hotel-booking-summary"><h3>Stay Estimate</h3><p><span>Room stay</span><b data-hotel-room-total>MYR 0.00</b></p><p data-hotel-addons-row hidden><span>Care add-ons</span><b data-hotel-addons-total>MYR 0.00</b></p><p data-hotel-grooming-row hidden><span>Grooming</span><b data-hotel-grooming-total>MYR 0.00</b></p><p data-hotel-taxi-row hidden><span>Pet taxi estimate</span><b data-hotel-taxi-total>MYR 0.00</b></p><p data-hotel-discount-row hidden><span>Promo discount</span><b data-hotel-discount>− MYR 0.00</b></p><div class="grooming-total-row"><span>Estimated total</span><strong data-hotel-grand-total>MYR 0.00</strong></div></div><div class="form-feedback" data-hotel-feedback role="status" aria-live="polite"></div><button class="button button-primary grooming-submit" type="submit" ${pets.length ? '' : 'disabled'}>Confirm Pet Hotel Booking</button><p class="grooming-prototype-note">Your booking is saved to your account. Payment and map integrations are not connected in this prototype.</p></section>
    </form>${bottomNavigation('hotel', icon)}<div class="home-toast" role="status" aria-live="polite"></div></main>`;
}

// Wires pet selection, room availability, live pricing, optional services, and booking submission.
export function setupHotelBooking() {
  const form = document.querySelector('[data-hotel-booking]');
  if (!form) return;
  let discount = 0;
  let appliedCode = '';
  const settings = loadHotelSettings();
  const message = form.querySelector('[data-hotel-feedback]');
  const selectedPets = () => (form.elements.petIds.value || form.elements.petId.value || '').split(',').filter(Boolean).map((id) => loadPetProfiles().find((pet) => pet.id === id)).filter(Boolean);
  const selectedPet = () => selectedPets()[0];
  const calendar = form.querySelector('[data-hotel-calendar]');
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const bookingDateLimit = () => { const now = new Date(); return dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(loadHotelSettings().bookingHorizonDays || 180))); };
  const renderCalendar = () => {
    const liveSettings = loadHotelSettings();
    const now = new Date();
    const earliestMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const limit = new Date(`${bookingDateLimit()}T12:00:00`);
    const latestMonth = new Date(limit.getFullYear(), limit.getMonth(), 1);
    if (calendarMonth < earliestMonth) calendarMonth = earliestMonth;
    if (calendarMonth > latestMonth) calendarMonth = latestMonth;
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekdayOffset = new Date(year, month, 1).getDay();
    const today = dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const checkIn = form.elements.checkIn.value;
    const checkOut = form.elements.checkOut.value;
    const headings = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<span class="hotel-calendar-weekday" role="columnheader">${day}</span>`).join('');
    const blanks = Array.from({ length: weekdayOffset }, () => '<span class="hotel-calendar-empty" aria-hidden="true"></span>').join('');
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const value = dateValue(new Date(year, month, day));
      const closed = (liveSettings.closedDates || []).includes(value);
      const disabled = value < today || value > bookingDateLimit() || closed;
      const selected = value === checkIn || value === checkOut;
      const inRange = Boolean(checkIn && checkOut && value > checkIn && value < checkOut);
      const date = new Date(year, month, day);
      const label = date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `<button type="button" class="hotel-calendar-day ${selected ? 'is-selected' : ''} ${inRange ? 'is-in-range' : ''} ${value === today ? 'is-today' : ''}" role="gridcell" data-hotel-calendar-date="${value}" aria-label="${label}${closed ? ', unavailable' : ''}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>${day}</button>`;
    }).join('');
    calendar.querySelector('[data-hotel-calendar-month]').textContent = calendarMonth.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    calendar.querySelector('[data-hotel-calendar-grid]').innerHTML = `${headings}${blanks}${days}`;
    calendar.querySelector('[data-hotel-calendar-nav="previous"]').disabled = calendarMonth <= earliestMonth;
    calendar.querySelector('[data-hotel-calendar-nav="next"]').disabled = calendarMonth >= latestMonth;
    const format = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose date';
    form.querySelector('[data-hotel-check-in-display]').textContent = format(checkIn);
    form.querySelector('[data-hotel-check-out-display]').textContent = format(checkOut);
  };
  const nights = () => {
    const start = new Date(`${form.elements.checkIn.value}T00:00:00`);
    const end = new Date(`${form.elements.checkOut.value}T00:00:00`);
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start ? Math.ceil((end - start) / 86400000) : 0;
  };
  const readRoomAssignments = () => { try { return JSON.parse(form.elements.roomAssignments.value || '{}'); } catch { return {}; } };
  const writeRoomAssignments = (assignments) => { form.elements.roomAssignments.value = JSON.stringify(assignments); };
  const shareHotelRoom = () => selectedPets().length > 1 && form.elements.shareHotelRoom.checked;
  const updateRoomSharingOption = () => {
    const sharingOption = form.querySelector('[data-hotel-room-sharing]');
    const show = selectedPets().length > 1;
    sharingOption.hidden = !show;
    if (!show) form.elements.shareHotelRoom.checked = false;
  };
  const chosenRoom = (petId) => {
    const assignment = readRoomAssignments()[petId];
    return settings.rooms.find((room) => room.id === assignment?.roomId && room.active !== false && assignment?.unit && (!shareHotelRoom() || room.doubleRoom === true));
  };
  const updateHealthGate = () => {
    const pets = selectedPets();
    const pet = pets[0];
    const hasCard = pets.length > 0 && pets.every((item) => item.vaccinationCards?.length);
    const gate = form.querySelector('[data-hotel-health-gate]');
    gate.innerHTML = !pet ? '<strong>Add a pet profile and current vaccination card to book Pet Hotel.</strong>' : !hasCard ? '<strong>Vaccination cards required.</strong> Every selected pet needs a current card in its profile.' : '<strong>Vaccination cards uploaded.</strong> Confirm they remain current for the full stay. Staff will review them.';
    const confirm = form.querySelector('[data-hotel-vaccination-confirm]');
    confirm.hidden = !hasCard;
    form.elements.vaccinationCurrent.required = hasCard;
    if (!hasCard) form.elements.vaccinationCurrent.checked = false;
    const profileLink = form.querySelector('[data-hotel-pet-profile]');
    profileLink.href = pets.length === 1 ? `#pet-profile?id=${encodeURIComponent(pet.id)}&from=hotel` : '#pet-profile?from=hotel';
  };
  const refreshRooms = () => {
    const checkIn = form.elements.checkIn.value;
    const checkOut = form.elements.checkOut.value;
    const outlet = form.elements.outlet.value;
    const validRange = checkIn && checkOut && checkOut > checkIn;
    const today = new Date();
    const maximumDate = bookingDateLimit();
    if (form.elements.includeGrooming.checked) {
      form.elements.groomingDate.min = checkIn || dateValue(today);
      form.elements.groomingDate.max = checkOut || maximumDate;
    }
    const count = validRange ? nights() : 0;
    const closedStayDate = validRange && (loadHotelSettings().closedDates || []).find((date) => date >= checkIn && date < checkOut);
    form.querySelector('[data-hotel-date-summary]').textContent = closedStayDate ? `The outlet is not accepting stays on ${closedStayDate}. Please select different dates.` : validRange ? `${count} night${count === 1 ? '' : 's'} · choose an available room unit below.` : 'Select check-in, then check-out, to check room availability.';
    renderCalendar();
    const bookings = loadHotelBookings();
    const assignments = readRoomAssignments();
    const sharing = shareHotelRoom();
    const selected = selectedPets();
    const sharedPetIds = new Set(selected.map((pet) => pet.id));
    const sharedNames = selected.map((pet) => pet.name).join(' & ');
    const doubleRoomEmpty = form.querySelector('[data-hotel-double-room-empty]');
    const doubleRoomsExist = settings.rooms.some((room) => room.active !== false && room.doubleRoom === true);
    doubleRoomEmpty.hidden = !sharing || doubleRoomsExist;
    form.querySelectorAll('[data-hotel-room-pet]').forEach((group) => {
      const petId = group.dataset.hotelRoomPet;
      const currentAssignment = assignments[petId];
      const heading = group.querySelector('h3');
      if (heading) heading.textContent = sharing ? `Select A Shared Room For ${sharedNames}` : `Select A Room Package For ${selected.find((pet) => pet.id === petId)?.name || 'Your Pet'}`;
      let roomSelectionStillValid = false;
      group.querySelectorAll('[data-hotel-room-card]').forEach((card) => {
        const room = settings.rooms.find((item) => item.id === card.dataset.hotelRoomCard);
        card.hidden = sharing && room?.doubleRoom !== true;
        const units = room ? availableHotelUnits(room, outlet, checkIn, checkOut, bookings) : [];
        const availableCount = closedStayDate ? 0 : units.filter((unit) => unit.available).length;
        card.querySelector('[data-room-availability]').textContent = validRange ? `${availableCount} of ${units.length} units available` : 'Choose dates to see room availability';
        const isThisRoom = currentAssignment?.roomId === room?.id;
        card.querySelector('[data-hotel-units]').innerHTML = validRange && !closedStayDate ? units.map(({ unit, available }) => {
          const assignedToOtherPet = !sharing && Object.entries(assignments).some(([otherPetId, assignment]) => otherPetId !== petId && assignment?.unit === unit && assignment?.roomId === room?.id);
          const unitAvailable = available && !assignedToOtherPet;
          const selected = isThisRoom && currentAssignment?.unit === unit && unitAvailable;
          if (selected) roomSelectionStillValid = true;
          return `<button type="button" class="hotel-unit-seat ${unitAvailable ? 'is-available' : 'is-unavailable'} ${selected ? 'is-selected' : ''}" data-hotel-unit-choice="${escapeHTML(unit)}" data-room-id="${escapeHTML(room.id)}" data-pet-id="${escapeHTML(petId)}" aria-label="${escapeHTML(room.name)} ${escapeHTML(unit)}: ${unitAvailable ? 'available' : 'unavailable'}" aria-pressed="${selected}" ${unitAvailable ? '' : 'disabled'}>${escapeHTML(unit.replace('Unit ', ''))}</button>`;
        }).join('') : '<span class="hotel-unit-prompt">Choose dates to view availability</span>';
        card.classList.toggle('is-selected', isThisRoom && roomSelectionStillValid);
      });
      if (!roomSelectionStillValid) delete assignments[petId];
      group.hidden = !sharedPetIds.has(petId) || (sharing && petId !== selected[0]?.id);
    });
    writeRoomAssignments(assignments);
    refreshQuote();
  };
  const addressAndRoute = () => {
    let address;
    if (form.elements.taxiAddress.value !== 'new') {
      try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(form.elements.taxiAddress.value)]; } catch { address = null; }
    }
    const location = [address?.city, address?.state, address?.street, form.elements.taxiManualAddress.value].filter(Boolean).join(' ').toLowerCase();
    const taxiSettings = loadPetTaxiSettings();
    const route = matchPetTaxiRoute(location, form.elements.outlet.value, taxiSettings);
    const km = route ? Number(route.distanceKm) : 0;
    return { address, route, km, fare: km ? Number(taxiSettings.baseFare) + km * Number(taxiSettings.farePerKm) : 0 };
  };
  const refreshTaxi = () => {
    const taxiOn = form.elements.includeTaxi.checked;
    const { route, km, fare } = addressAndRoute();
    const trips = Number(form.elements.taxiPickup.checked) + Number(form.elements.taxiDropoff.checked);
    const petCount = selectedPets().length;
    form.querySelector('[data-hotel-taxi-estimate]').textContent = !taxiOn ? 'Pet taxi is not selected.' : route ? `${route.city} to ${form.elements.outlet.value} · ${km} km one way · ${hotelMoney(fare * trips * petCount)} estimated for ${trips} trip${trips === 1 ? '' : 's'} and ${petCount} pet${petCount === 1 ? '' : 's'}.` : 'Route estimate unavailable. Use an address in a city configured by Admin.';
    refreshQuote();
  };
  const refreshQuote = () => {
    const pets = selectedPets();
    const pet = pets[0];
    const sharing = shareHotelRoom();
    const roomLines = pets.map((selected) => ({ pet: selected, room: chosenRoom(selected.id), assignment: readRoomAssignments()[selected.id] }));
    const room = roomLines[0]?.room;
    const nightCount = nights();
    const pricedRooms = sharing
      ? [...new Map(roomLines.filter((line) => line.room && line.assignment?.unit).map((line) => [`${line.assignment.roomId}:${line.assignment.unit}`, line])).values()]
      : roomLines;
    const roomTotal = nightCount ? pricedRooms.reduce((sum, line) => sum + Number(line.room?.nightlyRate || 0) * nightCount, 0) : 0;
    const addOnTotal = [...form.querySelectorAll('[data-hotel-addon]:checked')].reduce((sum, input) => sum + Number(settings.addOns.find((item) => item.id === input.value)?.price || 0), 0) * pets.length;
    const liveGroomingSettings = loadGroomingSettings();
    const groomingItems = pets.map((selected) => {
      const radio = [...form.querySelectorAll('[data-hotel-grooming-package]:checked')].find((input) => input.dataset.packagePet === selected.id);
      const item = liveGroomingSettings.packages.find((packageItem) => packageItem.id === radio?.value);
      return { pet: selected, item, price: Number(item?.[groomingWeightTier(selected.weight, liveGroomingSettings)] || 0) };
    });
    const groomingPrice = form.elements.includeGrooming.checked ? groomingItems.reduce((sum, item) => sum + item.price, 0) : 0;
    const groomingItem = groomingItems[0]?.item;
    form.querySelectorAll('[data-hotel-grooming-package]').forEach((radio) => {
      const item = liveGroomingSettings.packages.find((packageItem) => packageItem.id === radio.value);
      const packagePet = loadPetProfiles().find((selected) => selected.id === radio.dataset.packagePet);
      const price = Number(item?.[groomingWeightTier(packagePet?.weight, liveGroomingSettings)] || 0);
      const output = radio.closest('.hotel-grooming-card')?.querySelector('[data-hotel-grooming-price]');
      if (output) output.textContent = hotelMoney(price);
    });
    const { fare } = addressAndRoute();
    const trips = form.elements.includeTaxi.checked ? Number(form.elements.taxiPickup.checked) + Number(form.elements.taxiDropoff.checked) : 0;
    const taxiTotal = fare * trips * pets.length;
    const subtotal = roomTotal + addOnTotal + groomingPrice + taxiTotal;
    const voucher = loadHotelSettings().voucher;
    if (appliedCode && (!voucher.enabled || appliedCode !== String(voucher.code).toUpperCase() || subtotal < Number(voucher.minimumSpend || 0))) { discount = 0; appliedCode = ''; }
    const total = Math.max(0, subtotal - discount);
    form.querySelector('[data-hotel-room-total]').textContent = hotelMoney(roomTotal);
    form.querySelector('[data-hotel-addons-total]').textContent = hotelMoney(addOnTotal);
    form.querySelector('[data-hotel-addons-row]').hidden = addOnTotal <= 0;
    form.querySelector('[data-hotel-grooming-total]').textContent = hotelMoney(groomingPrice);
    form.querySelector('[data-hotel-grooming-row]').hidden = groomingPrice <= 0;
    form.querySelector('[data-hotel-taxi-total]').textContent = hotelMoney(taxiTotal);
    form.querySelector('[data-hotel-taxi-row]').hidden = taxiTotal <= 0;
    form.querySelector('[data-hotel-discount]').textContent = `− ${hotelMoney(discount)}`;
    form.querySelector('[data-hotel-discount-row]').hidden = discount <= 0;
    form.querySelector('[data-hotel-grand-total]').textContent = hotelMoney(total);
    form.dataset.total = String(total);
    const groomingEstimate = form.querySelector('[data-hotel-grooming-estimate]');
    groomingEstimate.textContent = form.elements.includeGrooming.checked && groomingItem ? groomingItems.map((entry) => `${entry.pet.name}: ${entry.item?.name || 'Choose a package'} (${hotelMoney(entry.price)})`).join(' · ') : '';
    form.querySelectorAll('[data-hotel-grooming-pet]').forEach((section) => { section.hidden = !pets.some((selected) => selected.id === section.dataset.hotelGroomingPet); });
    return { pet, pets, room, roomLines, shareRoom: sharing, nightCount, roomTotal, addOnTotal, groomingItem, groomingItems, groomingPrice, taxiTotal, taxiFare: fare, taxiTrips: trips, total };
  };
  const updateOptional = () => {
    const groomingOn = form.elements.includeGrooming.checked;
    form.querySelector('[data-hotel-grooming-fields]').hidden = !groomingOn;
    form.elements.groomingDate.required = groomingOn;
    const chosenIds = new Set(selectedPets().map((item) => item.id));
    form.querySelectorAll('[data-hotel-grooming-package]').forEach((radio) => { radio.required = groomingOn && chosenIds.has(radio.dataset.packagePet); });
    form.querySelector('[data-hotel-taxi-fields]').hidden = !form.elements.includeTaxi.checked;
    const manual = form.elements.taxiAddress.value === 'new';
    form.querySelector('[data-pet-taxi-address-editor]').hidden = !manual || !form.elements.includeTaxi.checked;
    form.elements.taxiAddress.required = form.elements.includeTaxi.checked;
    form.elements.taxiSchedule.required = form.elements.includeTaxi.checked;
    refreshTaxi();
    refreshQuote();
  };

  form.querySelector('[data-hotel-pet-carousel]').addEventListener('click', (event) => {
    const card = event.target.closest('[data-hotel-pet-choice]');
    if (!card) return;
    const chosen = new Set((form.elements.petIds.value || '').split(',').filter(Boolean));
    if (chosen.has(card.dataset.hotelPetChoice)) chosen.delete(card.dataset.hotelPetChoice); else chosen.add(card.dataset.hotelPetChoice);
    if (!chosen.size) chosen.add(card.dataset.hotelPetChoice);
    form.elements.petIds.value = [...chosen].join(',');
    form.elements.petId.value = [...chosen][0];
    updateRoomSharingOption();
    const assignments = readRoomAssignments();
    Object.keys(assignments).forEach((petId) => { if (!chosen.has(petId)) delete assignments[petId]; });
    if (shareHotelRoom()) {
      const sharedAssignment = Object.values(assignments)[0];
      if (sharedAssignment) [...chosen].forEach((petId) => { assignments[petId] = { ...sharedAssignment }; });
    }
    writeRoomAssignments(assignments);
    form.querySelectorAll('[data-hotel-pet-choice]').forEach((item) => {
      const selected = chosen.has(item.dataset.hotelPetChoice);
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
      item.querySelector('.grooming-pet-selected-mark')?.remove();
      if (selected) { const mark = document.createElement('span'); mark.className = 'grooming-pet-selected-mark'; mark.innerHTML = '<img src="Image/Icon/Icon-13.png" alt="Selected" />'; item.append(mark); }
    });
    updateHealthGate(); updateOptional(); refreshRooms();
  });
  form.querySelector('[data-hotel-pet-profile]').addEventListener('click', (event) => { if (selectedPets().length < 2) return; event.preventDefault(); window.alert('Multiple pets are selected. Choose one pet before opening a pet profile.'); });
  form.querySelectorAll('[data-hotel-room-list]').forEach((roomList) => roomList.addEventListener('click', (event) => {
    const unit = event.target.closest('[data-hotel-unit-choice]');
    if (!unit || unit.disabled) return;
    const assignments = readRoomAssignments();
    const assignment = { roomId: unit.dataset.roomId, unit: unit.dataset.hotelUnitChoice };
    if (shareHotelRoom()) selectedPets().forEach((pet) => { assignments[pet.id] = { ...assignment }; });
    else assignments[unit.dataset.petId] = assignment;
    writeRoomAssignments(assignments);
    refreshRooms();
  }));
  calendar.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-hotel-calendar-nav]');
    if (nav) {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (nav.dataset.hotelCalendarNav === 'next' ? 1 : -1), 1);
      renderCalendar();
      return;
    }
    const day = event.target.closest('[data-hotel-calendar-date]');
    if (!day || day.disabled) return;
    const date = day.dataset.hotelCalendarDate;
    if (!form.elements.checkIn.value || form.elements.checkOut.value || date <= form.elements.checkIn.value) {
      form.elements.checkIn.value = date;
      form.elements.checkOut.value = '';
    } else {
      form.elements.checkOut.value = date;
    }
    writeRoomAssignments({});
    refreshRooms();
    updateHealthGate();
  });
  form.elements.outlet.addEventListener('change', refreshRooms);
  form.querySelectorAll('[data-hotel-addon]').forEach((input) => input.addEventListener('change', refreshQuote));
  form.querySelectorAll('[data-hotel-grooming-package]').forEach((input) => input.addEventListener('change', refreshQuote));
  form.elements.includeGrooming.addEventListener('change', updateOptional);
  form.elements.shareHotelRoom.addEventListener('change', () => { writeRoomAssignments({}); refreshRooms(); });
  form.elements.includeTaxi.addEventListener('change', updateOptional);
  form.querySelectorAll('[data-hotel-taxi]').forEach((input) => input.addEventListener('change', refreshTaxi));
  form.elements.taxiAddress.addEventListener('change', updateOptional);
  setupPetTaxiAddressPicker(form, refreshTaxi);
  form.elements.taxiManualAddress.addEventListener('input', refreshTaxi);
  form.querySelector('[data-apply-hotel-voucher]').addEventListener('click', () => {
    const voucher = loadHotelSettings().voucher;
    const quote = refreshQuote();
    const code = form.elements.voucherCode.value.trim().toUpperCase();
    const note = form.querySelector('[data-hotel-voucher-feedback]');
    if (!voucher.enabled || !code || code !== String(voucher.code).toUpperCase()) { discount = 0; appliedCode = ''; note.textContent = 'That Pet Hotel promo code is not active.'; }
    else if (quote.roomTotal + quote.addOnTotal + quote.groomingPrice + quote.taxiTotal < Number(voucher.minimumSpend || 0)) { discount = 0; appliedCode = ''; note.textContent = `This code needs a minimum spend of ${hotelMoney(voucher.minimumSpend)}.`; }
    else { const subtotal = quote.roomTotal + quote.addOnTotal + quote.groomingPrice + quote.taxiTotal; discount = Math.min(subtotal, voucher.type === 'fixed' ? Number(voucher.value) : subtotal * Number(voucher.value) / 100); appliedCode = code; note.textContent = `${code} applied.`; }
    refreshQuote();
  });
  form.querySelectorAll('[name="paymentMethod"]').forEach((input) => input.addEventListener('change', () => {
    const needsSlip = form.elements.paymentMethod.value === 'bank-transfer';
    const upload = form.querySelector('[data-hotel-transfer]');
    upload.hidden = !needsSlip;
    form.elements.transferSlip.required = needsSlip;
  }));
  window.addEventListener('storage', (event) => {
    if ([hotelSettingsKey, hotelBookingsKey].includes(event.key)) refreshRooms();
  });
  updateRoomSharingOption(); updateHealthGate(); updateOptional(); refreshRooms();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.elements.checkIn.value || !form.elements.checkOut.value || form.elements.checkOut.value <= form.elements.checkIn.value) {
      message.textContent = 'Choose a check-in and check-out date from the calendar.';
      message.classList.add('visible');
      return;
    }
    if (!form.reportValidity()) return;
    const quote = refreshQuote();
    const pets = quote.pets;
    const pet = quote.pet;
    if (!pet || pets.some((item) => !item.vaccinationCards?.length) || !form.elements.vaccinationCurrent.checked) { message.textContent = 'Every selected pet needs an uploaded vaccination card. Confirm that the records remain current for the full stay.'; message.classList.add('visible'); return; }
    const assignmentsAreShared = quote.shareRoom && quote.roomLines.every((line) => line.assignment?.roomId === quote.roomLines[0]?.assignment?.roomId && line.assignment?.unit === quote.roomLines[0]?.assignment?.unit);
    if (quote.roomLines.length !== pets.length || quote.roomLines.some((line) => !line.room || !line.assignment?.unit) || (quote.shareRoom && !assignmentsAreShared) || !quote.nightCount) { message.textContent = quote.shareRoom ? 'Choose one available shared room for all selected pets.' : 'Choose an available room package and unit for every selected pet.'; message.classList.add('visible'); return; }
    const selectedUnits = quote.roomLines.map((line) => ({ line, unit: availableHotelUnits(line.room, form.elements.outlet.value, form.elements.checkIn.value, form.elements.checkOut.value).find((item) => item.unit === line.assignment.unit) }));
    const expectedUnitCount = quote.shareRoom ? 1 : pets.length;
    if (selectedUnits.some(({ unit }) => !unit?.available) || new Set(selectedUnits.map(({ line }) => `${line.assignment.roomId}:${line.assignment.unit}`)).size !== expectedUnitCount) { message.textContent = quote.shareRoom ? 'The selected shared room is no longer available. Choose another room.' : 'One or more selected rooms were just booked or assigned twice. Choose a different available unit for each pet.'; message.classList.add('visible'); refreshRooms(); return; }
    if (form.elements.includeTaxi.checked && (!quote.taxiTrips || !quote.taxiFare || !form.elements.taxiSchedule.value)) { message.textContent = 'Choose at least one taxi trip, a configured address route, and a pickup/drop-off schedule.'; message.classList.add('visible'); return; }
    const file = form.elements.transferSlip.files?.[0];
    let paymentProof = null;
    if (form.elements.paymentMethod.value === 'bank-transfer') {
      if (!file || file.size > 1024 * 1024) { message.textContent = 'Choose a transfer slip no larger than 1 MB.'; message.classList.add('visible'); return; }
      paymentProof = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: reader.result }); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
      if (!paymentProof) { message.textContent = 'The transfer slip could not be read.'; message.classList.add('visible'); return; }
    }
    const paymentMethod = form.elements.paymentMethod.value;
    if (paymentMethod === 'wallet') {
      const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
      if (balance < quote.total) { message.textContent = 'Your Furgo Credit balance is not enough. Choose another method or top up.'; message.classList.add('visible'); return; }
    }
    const profile = (() => { try { return JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { return {}; } })();
    const addressIndex = form.elements.taxiAddress.value === 'new' ? -1 : Number(form.elements.taxiAddress.value);
    const addresses = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); } catch { return []; } })();
    const taxiAddress = addressIndex >= 0 ? addresses[addressIndex] : { street: form.elements.taxiManualAddress.value.trim(), city: '', state: '' };
    const addOns = [...form.querySelectorAll('[data-hotel-addon]:checked')].map((input) => settings.addOns.find((item) => item.id === input.value)).filter(Boolean).map((item) => ({ id: item.id, name: item.name, price: Number(item.price), quantity: pets.length, lineTotal: Number(item.price) * pets.length }));
    const booking = {
      id: `hotel-${Date.now()}`, userId: profile.id || '', reference: `HT-${Date.now().toString().slice(-7)}`, createdAt: new Date().toISOString(),
      customerName: profile.name || 'Furgo Customer', customerEmail: profile.email || '', customerPhone: profile.phone || '', emergencyName: form.elements.emergencyName.value.trim(), emergencyPhone: form.elements.emergencyPhone.value.trim(),
      petId: pet.id, petIds: pets.map((item) => item.id), petName: pets.map((item) => item.name).join(' | '), pets: pets.map((item) => ({ id: item.id, name: item.name, species: item.species || 'Dog', breed: item.breed || 'Not provided', weight: item.weight || '0', redFlags: (item.remarks || []).join(' · ') || item.redFlagRemark || '', vaccinationCards: item.vaccinationCards || [] })), petSpecies: pets.map((item) => item.species || 'Dog').join(' | '), petBreed: pets.map((item) => item.breed || 'Not provided').join(' | '), petWeight: pets.map((item) => item.weight || '0').join(' | '), redFlags: pets.map((item) => `${item.name}: ${(item.remarks || []).join(' · ') || item.redFlagRemark || ''}`).filter(Boolean).join(' | '), vaccinationCards: pets.flatMap((item) => item.vaccinationCards || []), vaccinationStatus: 'Owner confirmed · pending staff review',
      outlet: form.elements.outlet.value, roomArrangement: quote.shareRoom ? 'shared' : 'separate', roomId: quote.room.id, roomName: quote.room.name, assignedUnit: quote.roomLines[0]?.assignment?.unit || '', assignedUnits: quote.roomLines.map((line) => line.assignment.unit), petRooms: quote.roomLines.map((line) => ({ petId: line.pet.id, petName: line.pet.name, roomId: line.room.id, roomName: line.room.name, assignedUnit: line.assignment.unit, nightlyRate: Number(line.room.nightlyRate), total: quote.shareRoom ? Number(line.room.nightlyRate) * quote.nightCount / pets.length : Number(line.room.nightlyRate) * quote.nightCount })), checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value, nights: quote.nightCount, nightlyRate: Number(quote.room.nightlyRate), roomTotal: quote.roomTotal,
      addOns, grooming: form.elements.includeGrooming.checked && quote.groomingItem ? { packageId: quote.groomingItem.id, packageName: quote.groomingItems.map((entry) => `${entry.pet.name}: ${entry.item?.name || ''}`).join(' | '), price: quote.groomingPrice, packages: quote.groomingItems.map((entry) => ({ petId: entry.pet.id, petName: entry.pet.name, packageId: entry.item?.id || '', packageName: entry.item?.name || '', price: entry.price })), date: form.elements.groomingDate.value, time: form.elements.groomingTime.value } : null,
      taxi: form.elements.includeTaxi.checked ? { pickup: form.elements.taxiPickup.checked, dropoff: form.elements.taxiDropoff.checked, address: [taxiAddress.street, taxiAddress.city, taxiAddress.state].filter(Boolean).join(', '), city: taxiAddress.city || '', schedule: form.elements.taxiSchedule.value, distanceKm: quote.taxiFare ? (quote.taxiFare - Number(loadPetTaxiSettings().baseFare)) / Number(loadPetTaxiSettings().farePerKm) : 0, fare: quote.taxiFare * quote.taxiTrips * pets.length } : null,
      voucherCode: appliedCode, discount, total: quote.total, paymentMethod, paymentStatus: paymentMethod === 'wallet' ? 'Paid with Furgo Credit' : paymentMethod === 'bank-transfer' ? 'Awaiting verification' : 'Pending online payment',
      status: paymentMethod === 'wallet' ? 'Pending / Confirmed' : 'Pending / Confirmed', paymentProof, receipt: null, mediaLogs: [], statusHistory: [{ status: 'Pending / Confirmed', changedAt: new Date().toISOString(), changedBy: 'Customer' }],
    };
    try {
      await saveDedicatedBooking(hotelBookingsKey, booking, [...loadHotelBookings(), booking]);
    } catch (error) {
      message.textContent = `We could not save your Pet Hotel booking: ${error.message || 'Please try again.'}`;
      message.classList.add('visible');
      return;
    }
    if (paymentMethod === 'wallet') {
      const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
      localStorage.setItem('furgo-demo-credit-balance', String(balance - quote.total));
      const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
      transactions.push({ id: `hotel-${Date.now()}`, type: 'Pet Hotel booking', amount: -quote.total, timestamp: new Date().toISOString() });
      localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
    }
    window.location.hash = '#orders?service=hotel&from=hotel';
  });
}
