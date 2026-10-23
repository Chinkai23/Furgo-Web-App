import { bottomNavigation, escapeHTML } from '../shared.js';
import { loadPetProfiles } from './home.js';
import { loadGroomingSettings, groomingWeightTier as groomingTier } from './grooming-data.js';
import { daycareBookingsKey, daycareOccupancy, daycarePassesKey, daycareWeightTier, loadDaycareBookings, loadDaycarePasses, loadDaycareSettings } from './daycare-data.js';
import { saveDedicatedBooking } from '../app-data-sync.js';
import { loadPetTaxiSettings, matchPetTaxiRoute } from './pet-taxi-data.js';
import { getSelectedProfileAddress, renderPetTaxiAddressPicker, setupPetTaxiAddressPicker } from './pet-taxi-addresses.js';
import { customerServiceBannerMarkup } from './service-banners.js';

const money = (value) => `MYR ${Number(value || 0).toFixed(2)}`;
const readProfile = () => { try { return JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { return {}; } };

// Customer Pet Daycare: builds a pet-aware visit, pass purchase/redemption, and care add-on booking form.
export function petDaycarePage() {
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const settings = loadDaycareSettings();
  const petTaxi = loadPetTaxiSettings();
  const pets = loadPetProfiles();
  const profile = readProfile();
  const addresses = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); } catch { return []; } })();
  const currentEmail = String(profile.email || '').trim().toLowerCase();
  const currentPhone = String(profile.phone || '').replace(/\D/g, '');
  const passes = loadDaycarePasses().filter((pass) => {
    const emailMatches = currentEmail && String(pass.customerEmail || '').trim().toLowerCase() === currentEmail;
    const phoneMatches = currentPhone && String(pass.customerPhone || '').replace(/\D/g, '') === currentPhone;
    return (emailMatches || phoneMatches) && Number(pass.remainingSessions) > 0 && (!pass.expiresOn || pass.expiresOn >= new Date().toISOString().slice(0, 10));
  });
  const activePets = pets.map((pet, index) => `<button class="grooming-pet-card ${index === 0 ? 'is-selected' : ''}" type="button" data-daycare-pet-choice="${escapeHTML(pet.id)}" aria-pressed="${index === 0}"><img class="grooming-pet-photo" src="${escapeHTML(pet.photo || icon('Profile Picture.png'))}" alt="" /><span class="grooming-pet-card-copy"><strong>${escapeHTML(pet.name)}</strong><span>${escapeHTML(pet.species || 'Dog')} · ${escapeHTML(pet.breed || 'Breed not added')}</span><small>${escapeHTML(pet.weight || 'Weight not added')} kg</small></span>${index === 0 ? `<span class="grooming-pet-selected-mark"><img src="${icon('Icon-13.png')}" alt="Selected" /></span>` : ''}</button>`).join('');
  const outletOptions = settings.outlets.map((outlet) => `<option>${escapeHTML(outlet)}</option>`).join('');
  const passesMarkup = settings.passes.filter((pass) => pass.active !== false).map((pass) => `<label class="daycare-pass-card"><input type="radio" name="passPlan" value="${escapeHTML(pass.id)}" ${settings.passes.filter((item) => item.active !== false)[0]?.id === pass.id ? 'checked' : ''} /><span><strong>${escapeHTML(pass.name)}</strong><small>${escapeHTML(pass.description || `${Number(pass.sessions)} visits · valid ${Number(pass.validityDays)} days`)}</small><b>${Number(pass.sessions)} sessions${pass.bonusSessions ? ` + ${Number(pass.bonusSessions)} bonus` : ''}</b><b>${money(pass.price)}</b></span></label>`).join('');
  const activePassOptions = (petId) => passes.filter((pass) => pass.petId === petId).map((pass) => `<option value="${escapeHTML(pass.id)}">${escapeHTML(pass.name)} · ${Number(pass.remainingSessions)} visit${Number(pass.remainingSessions) === 1 ? '' : 's'} left${pass.expiresOn ? ` · expires ${escapeHTML(pass.expiresOn)}` : ''}</option>`).join('');
  const addonMarkup = settings.addOns.filter((item) => item.active !== false).map((item) => `<label class="daycare-addon-card"><input type="checkbox" name="addOn" value="${escapeHTML(item.id)}" data-daycare-addon /><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.description || '')}</small><b>${money(item.price)}</b>${item.id === 'medication' ? '<input class="daycare-medication-note" name="medicationDetails" placeholder="Medication and instructions" aria-label="Medication details" />' : ''}</span></label>`).join('');
  const groomingSettings = loadGroomingSettings();
  const groomingOptions = groomingSettings.packages.filter((item) => item.active !== false).map((item, index) => `<label class="daycare-addon-card"><input type="radio" name="groomingPackage" value="${escapeHTML(item.id)}" data-daycare-grooming-package ${index === 0 ? 'checked' : ''} /><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.description || '')}</small><b data-daycare-grooming-price>${money(item.small)}</b></span></label>`).join('');

  return `<main class="grooming-page daycare-page">
    <header class="grooming-header grooming-header-centered"><a class="grooming-back" href="#home" aria-label="Back to Home">‹</a><h1>Pet Daycare</h1><a class="grooming-header-orders" href="#orders?from=daycare" aria-label="My Order"><img src="${icon('Icon-18.png')}" alt="" /></a></header>
    ${customerServiceBannerMarkup('daycare')}
    <section class="daycare-intro-card"><h2>${escapeHTML(settings.serviceName || 'Furgo Pet Daycare')}</h2><p>${escapeHTML(settings.serviceDescription || '')}</p></section>
    <form class="grooming-booking-form" data-daycare-booking>
      <section class="grooming-section"><div class="grooming-section-heading"><span>01</span><div><h2>Choose Your Pet</h2><p>We’ll use your pet’s profile for care notes, vaccination status, and pricing.</p></div></div>
        ${pets.length ? `<input type="hidden" name="petId" value="${escapeHTML(pets[0].id)}" data-daycare-pet /> <div class="grooming-pet-carousel" data-daycare-pet-carousel>${activePets}</div><div class="grooming-pet-snapshot" data-daycare-pet-snapshot><div><strong data-daycare-pet-name>${escapeHTML(pets[0].name)}</strong><span data-daycare-pet-info>${escapeHTML(pets[0].species || 'Dog')} · ${escapeHTML(pets[0].breed || 'Breed not added')} · ${escapeHTML(pets[0].weight || '—')} kg</span><small data-daycare-vaccine>${pets[0].vaccinationCards?.length ? 'Vaccination record uploaded' : 'Vaccination record required'}</small></div><div><span class="grooming-tier-pill" data-daycare-tier>${daycareWeightTier(pets[0].weight, settings)} size</span><p data-daycare-remarks>${Array.isArray(pets[0].remarks) ? pets[0].remarks.map(escapeHTML).join(' · ') : escapeHTML(pets[0].redFlagRemark || 'No care remarks saved.')}</p></div></div>` : '<p class="grooming-empty-pets">Add a pet profile before booking daycare.</p>'}
        <a class="grooming-add-pet" href="#pet-profile?mode=add&from=daycare">+ Add a pet profile</a>
      </section>
      <section class="grooming-section"><div class="grooming-section-heading"><span>02</span><div><h2>Choose A Booking Option</h2><p>Book a single visit, redeem a pass session, or purchase a pass for future visits.</p></div></div>
        <div class="daycare-mode-switch" role="radiogroup" aria-label="Daycare booking option"><label><input type="radio" name="bookingMode" value="single" checked data-daycare-mode /><span>Single visit</span></label><label><input type="radio" name="bookingMode" value="redeem" data-daycare-mode /><span>Use a pass</span></label><label><input type="radio" name="bookingMode" value="purchase" data-daycare-mode /><span>Buy a pass</span></label></div>
        <div class="daycare-purchase-fields" data-daycare-purchase hidden><h3>Daycare Pass Store</h3><div class="daycare-pass-list">${passesMarkup || '<p>Passes are temporarily unavailable.</p>'}</div></div>
        <div class="daycare-visit-fields" data-daycare-visit><div class="daycare-form-grid"><label class="grooming-field">Daycare outlet<select name="outlet">${outletOptions}</select></label><label class="grooming-field" data-daycare-pass-field>Use active pass<select name="passId"><option value="">${passes.length ? 'Choose an active pass' : 'No active passes. Buy a pass or book a single visit.'}</option>${activePassOptions(pets[0]?.id)}</select></label><label class="grooming-field daycare-date-field">Visit date<input type="date" name="date" data-daycare-date required /></label><label class="grooming-field">Drop-off time<select name="dropoffTime" data-daycare-dropoff required></select></label><label class="grooming-field">Pick-up time<select name="pickupTime" data-daycare-pickup required></select></label><label class="grooming-field" data-daycare-hours-field>Visit length<select name="hours" data-daycare-hours>${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}">${index + 1} hour${index ? 's' : ''}</option>`).join('')}</select></label><div class="daycare-capacity" data-daycare-capacity role="status">Select a date to see availability.</div></div>
        </div>
      </section>
      <section class="grooming-section daycare-pet-taxi-section" data-daycare-taxi-section><div class="grooming-section-heading"><span><img class="pet-taxi-service-icon" src="Image/Icon/MVP Icon-05.png" alt="" /></span><div><h2>Pet Taxi (Add On)</h2><p>Add pickup or drop-off to your Pet Daycare booking.</p></div></div><label class="hotel-addon-toggle daycare-toggle"><input type="checkbox" name="includeTaxi" data-daycare-include-taxi /> Add Pet Taxi pickup / drop-off <small>From MYR ${Number(petTaxi.baseFare).toFixed(2)} + MYR ${Number(petTaxi.farePerKm).toFixed(2)} / km</small></label><div class="daycare-taxi-fields" data-daycare-taxi-fields hidden><div class="daycare-form-grid">${renderPetTaxiAddressPicker({ addresses, profile, selectName: 'taxiAddress', manualName: 'taxiManualAddress' })}<label class="grooming-field">Taxi service<select name="taxiTrip"><option value="pickup">Pickup only</option><option value="dropoff">Drop-off only</option><option value="both">Pickup and drop-off</option></select></label><label class="grooming-field">Taxi schedule<select name="taxiSchedule">${petTaxi.scheduleSlots.map((time) => `<option value="${escapeHTML(time)}">${escapeHTML(time)}</option>`).join('')}</select></label></div><p class="daycare-taxi-estimate" data-daycare-taxi-estimate>Choose an address to see the estimated taxi fare.</p></div></section>
      <section class="grooming-section" data-daycare-care-section><div class="grooming-section-heading"><span>04</span><div><h2>Other Add On Services</h2><p>Select extra care to include during your pet’s visit.</p></div></div><div class="daycare-addon-list">${addonMarkup || '<p>No extra care services are currently available.</p>'}</div>
        <label class="hotel-addon-toggle daycare-toggle"><input type="checkbox" name="includeGrooming" data-daycare-include-grooming /> Add pre-pickup grooming</label><div class="daycare-grooming-fields" data-daycare-grooming-fields hidden><div class="daycare-grooming-list">${groomingOptions}</div><div class="daycare-form-grid"><label class="grooming-field">Grooming date<input type="date" name="groomingDate" data-daycare-grooming-date /></label><label class="grooming-field">Preferred time<select name="groomingTime">${(groomingSettings.timeSlots || []).map((time) => `<option>${escapeHTML(time)}</option>`).join('')}</select></label></div></div>

      </section>
      <section class="grooming-section"><div class="grooming-section-heading"><span>05</span><div><h2>Health Check & Contact</h2><p>For the safety of all pets, a current vaccination record is required before a visit.</p></div></div><div class="daycare-health-gate" data-daycare-health-gate role="status"></div><label class="hotel-vaccination-confirm" data-daycare-vaccine-confirm><input type="checkbox" name="vaccinationCurrent" required /> I confirm this pet’s vaccination record is current and valid for the visit date.</label><div class="daycare-form-grid" data-daycare-contact-fields><label class="grooming-field">Emergency contact name<input name="emergencyName" value="${escapeHTML(profile.name || '')}" required /></label><label class="grooming-field">Emergency contact phone<input name="emergencyPhone" type="tel" inputmode="tel" value="${escapeHTML(profile.phone || '')}" required /></label></div><a class="grooming-vaccination-link" data-daycare-pet-profile href="#pet-profile?from=daycare">Update pet vaccination record</a></section>
      <section class="grooming-section grooming-payment-section"><div class="grooming-section-heading"><span>06</span><div><h2>Review & Payment</h2><p>Apply a daycare offer, then choose a payment method.</p></div></div><div class="grooming-voucher-row"><label class="grooming-field">Promo code<input name="voucherCode" placeholder="Enter promo code" data-daycare-voucher /></label><button class="button button-light" type="button" data-apply-daycare-voucher>Apply</button></div><p class="grooming-voucher-feedback" data-daycare-voucher-feedback role="status">${settings.voucher.enabled ? `Available demo code: ${escapeHTML(settings.voucher.code)}` : 'No daycare promo code is active.'}</p><div class="grooming-payment-options"><label><input type="radio" name="paymentMethod" value="gateway" checked /><span><strong>Online payment</strong><small>Card, FPX / online banking, or e-wallet</small></span></label><label><input type="radio" name="paymentMethod" value="wallet" /><span><strong>Furgo Credit</strong><small>Balance: ${money(Number(localStorage.getItem('furgo-demo-credit-balance') || 0))}</small></span></label><label><input type="radio" name="paymentMethod" value="bank-transfer" /><span><strong>Manual bank transfer</strong><small>Attach a transfer slip for Admin verification</small></span></label></div><label class="grooming-field daycare-transfer" data-daycare-transfer hidden>Transfer slip (image or PDF, max 1 MB)<input name="transferSlip" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /></label>
        <div class="grooming-booking-summary"><h3>Daycare Estimate</h3><p><span data-daycare-base-label>Single visit</span><b data-daycare-base-total>${money(settings.hourlyRates.small)}</b></p><p data-daycare-addons-row hidden><span>Care add-ons</span><b data-daycare-addons-total>${money(0)}</b></p><p data-daycare-grooming-row hidden><span>Pre-pickup grooming</span><b data-daycare-grooming-total>${money(0)}</b></p><p data-daycare-taxi-row hidden><span>Pet Taxi estimate</span><b data-daycare-taxi-total>${money(0)}</b></p><p data-daycare-discount-row hidden><span>Promo discount</span><b data-daycare-discount>${money(0)}</b></p><div class="grooming-total-row"><span>Estimated total</span><strong data-daycare-total>${money(settings.hourlyRates.small)}</strong></div></div><div class="form-feedback" data-daycare-feedback role="status" aria-live="polite"></div><button class="button button-primary grooming-submit" type="submit" ${pets.length ? '' : 'disabled'} data-daycare-submit>Continue to confirmation</button><p class="grooming-prototype-note">Your booking is saved to your account. Payment and map integrations are not connected in this prototype.</p>
      </section>
    </form>${bottomNavigation('daycare', icon)}<div class="home-toast" role="status" aria-live="polite"></div></main>`;
}

// Customer Pet Daycare interactions: validates capacity and health, prices visits and passes, and saves orders.
export function setupDaycareBooking() {
  const form = document.querySelector('[data-daycare-booking]');
  if (!form) return;
  const settings = loadDaycareSettings();
  const profile = readProfile();
  const feedback = form.querySelector('[data-daycare-feedback]');
  let discount = 0;
  let appliedCode = '';
  const date = form.elements.date;
  const modes = [...form.querySelectorAll('[data-daycare-mode]')];
  const currentMode = () => form.querySelector('[data-daycare-mode]:checked')?.value || 'single';
  const pet = () => loadPetProfiles().find((item) => item.id === form.elements.petId.value);
  const tier = () => daycareWeightTier(pet()?.weight, loadDaycareSettings());
  const safeKey = (value) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
  const dateToday = new Date(); dateToday.setHours(0, 0, 0, 0);
  const timeChoices = () => {
    const live = loadDaycareSettings();
    const [startH] = live.openingTime.split(':').map(Number);
    const [endH] = live.closingTime.split(':').map(Number);
    return Array.from({ length: Math.max(1, endH - startH) }, (_, i) => `${String(startH + i).padStart(2, '0')}:00`);
  };
  const renderTimeChoices = () => {
    const choices = timeChoices();
    const dropoff = form.elements.dropoffTime;
    const pickup = form.elements.pickupTime;
    const priorDropoff = dropoff.value;
    const priorPickup = pickup.value;
    dropoff.innerHTML = choices.map((value) => `<option value="${value}">${new Date(`2000-01-01T${value}`).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}</option>`).join('');
    pickup.innerHTML = choices.map((value) => `<option value="${value}">${new Date(`2000-01-01T${value}`).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}</option>`).join('');
    if (choices.includes(priorDropoff)) dropoff.value = priorDropoff;
    if (choices.includes(priorPickup)) pickup.value = priorPickup; else pickup.selectedIndex = Math.min(choices.length - 1, 1);
  };
  const setHealthGate = () => {
    const selected = pet();
    const cards = selected?.vaccinationCards || [];
    const valid = cards.length > 0;
    const gate = form.querySelector('[data-daycare-health-gate]');
    const confirm = form.querySelector('[data-daycare-vaccine-confirm]');
    gate.innerHTML = !selected ? '<strong>Select a pet profile.</strong> A current vaccination card is required before booking.' : !cards.length ? '<strong>Vaccination card missing.</strong> Upload the card to the pet profile to continue.' : '<strong>Vaccination card uploaded.</strong> Please confirm it is current for the visit date. Staff will review the card.';
    const requiredForVisit = currentMode() !== 'purchase';
    confirm.hidden = !requiredForVisit || !cards.length || !valid;
    form.elements.vaccinationCurrent.required = Boolean(requiredForVisit && cards.length && valid);
    if (!requiredForVisit || !cards.length || !valid) form.elements.vaccinationCurrent.checked = false;
    form.querySelector('[data-daycare-pet-profile]').href = selected ? `#pet-profile?id=${encodeURIComponent(selected.id)}&from=daycare` : '#pet-profile?mode=add&from=daycare';
    return valid;
  };
  const capacity = () => {
    const live = loadDaycareSettings();
    const selectedDate = date.value;
    const used = selectedDate ? daycareOccupancy(selectedDate) : 0;
    const available = Math.max(0, Number(live.capacity) - used);
    const closed = (live.closedDates || []).includes(selectedDate);
    const display = form.querySelector('[data-daycare-capacity]');
    display.textContent = !selectedDate ? 'Select a date to see availability.' : closed ? 'This date is closed. Choose another date.' : `${available} of ${Number(live.capacity)} daycare places available.`;
    display.classList.toggle('is-full', closed || available <= 0);
    const slotOpen = Boolean(selectedDate && !closed && available > 0);
    form.querySelector('[data-daycare-submit]').disabled = !loadPetProfiles().length || !slotOpen && currentMode() !== 'purchase';
    return slotOpen;
  };
  const taxiEstimate = () => {
    let address = null;
    if (form.elements.taxiAddress?.value && form.elements.taxiAddress.value !== 'new') {
      try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(form.elements.taxiAddress.value)]; } catch { address = null; }
    }
    const cityText = `${address?.city || ''} ${address?.state || ''} ${form.elements.taxiManualAddress.value || ''}`.toLowerCase();
    const live = loadPetTaxiSettings();
    const route = matchPetTaxiRoute(cityText, form.elements.outlet.value, live);
    const trip = form.elements.taxiTrip.value;
    const tripCount = trip === 'both' ? 2 : 1;
    const fare = route ? (Number(live.baseFare) + Number(route.distanceKm) * Number(live.farePerKm)) * tripCount : 0;
    form.querySelector('[data-daycare-taxi-estimate]').textContent = !form.elements.includeTaxi.checked ? 'Pet Taxi is not selected.' : route ? `${route.city} · ${Number(route.distanceKm)} km one way · ${money(fare)} estimated.` : 'No route estimate found. Enter a configured city to see the demo fare.';
    return fare;
  };
  const quote = () => {
    const live = loadDaycareSettings();
    const selectedPet = pet();
    const mode = currentMode();
    const visitHours = Math.max(1, Number(form.elements.hours.value) || 1);
    const isDayRate = mode === 'single' && visitHours >= 8;
    const basePrice = mode === 'purchase' ? Number(live.passes.find((item) => item.id === form.querySelector('[name="passPlan"]:checked')?.value)?.price || 0) : mode === 'redeem' ? 0 : isDayRate ? Number(live.dailyRates[tier()] || 0) : Number(live.hourlyRates[tier()] || 0) * visitHours;
    const addOnTotal = [...form.querySelectorAll('[data-daycare-addon]:checked')].reduce((sum, input) => sum + Number(live.addOns.find((item) => item.id === input.value)?.price || 0), 0);
    const gsettings = loadGroomingSettings();
    const groom = gsettings.packages.find((item) => item.id === form.querySelector('[data-daycare-grooming-package]:checked')?.value);
    const groomingPrice = form.elements.includeGrooming.checked && groom ? Number(groom[groomingTier(selectedPet?.weight, gsettings)] || 0) : 0;
    form.querySelectorAll('[data-daycare-grooming-package]').forEach((radio) => {
      const item = gsettings.packages.find((entry) => entry.id === radio.value);
      const output = radio.closest('.daycare-addon-card')?.querySelector('[data-daycare-grooming-price]');
      if (output) output.textContent = money(item?.[groomingTier(selectedPet?.weight, gsettings)] || 0);
    });
    const taxi = form.elements.includeTaxi.checked ? taxiEstimate() : 0;
    const subtotal = basePrice + addOnTotal + groomingPrice + taxi;
    const voucher = live.voucher;
    if (appliedCode && (!voucher.enabled || appliedCode !== String(voucher.code).toUpperCase() || subtotal < Number(voucher.minimumSpend || 0))) { discount = 0; appliedCode = ''; }
    const total = Math.max(0, subtotal - discount);
    form.querySelector('[data-daycare-base-label]').textContent = mode === 'purchase' ? 'Daycare pass' : mode === 'redeem' ? 'Pass session redeemed' : `${visitHours}-hour ${isDayRate ? 'day rate' : 'visit'} · ${tier()} weight tier`;
    form.querySelector('[data-daycare-base-total]').textContent = money(basePrice);
    form.querySelector('[data-daycare-addons-total]').textContent = money(addOnTotal);
    form.querySelector('[data-daycare-addons-row]').hidden = addOnTotal <= 0;
    form.querySelector('[data-daycare-grooming-total]').textContent = money(groomingPrice);
    form.querySelector('[data-daycare-grooming-row]').hidden = groomingPrice <= 0;
    form.querySelector('[data-daycare-taxi-total]').textContent = money(taxi);
    form.querySelector('[data-daycare-taxi-row]').hidden = taxi <= 0;
    form.querySelector('[data-daycare-discount]').textContent = `− ${money(discount)}`;
    form.querySelector('[data-daycare-discount-row]').hidden = discount <= 0;
    form.querySelector('[data-daycare-total]').textContent = money(total);
    form.dataset.total = String(total);
    return { selectedPet, mode, visitHours, basePrice, addOnTotal, grooming, groomingPrice, taxi, total };
  };
  const updateMode = () => {
    const mode = currentMode();
    form.querySelector('[data-daycare-purchase]').hidden = mode !== 'purchase';
    form.querySelector('[data-daycare-visit]').hidden = mode === 'purchase';
    form.querySelector('[data-daycare-hours-field]').hidden = mode !== 'single';
    form.querySelector('[data-daycare-pass-field]').hidden = mode !== 'redeem';
    form.querySelector('[data-daycare-grooming-fields]').hidden = !form.elements.includeGrooming.checked || mode === 'purchase';
    form.querySelector('[data-daycare-taxi-fields]').hidden = !form.elements.includeTaxi.checked || mode === 'purchase';
    form.querySelector('[data-daycare-taxi-section]').hidden = mode === 'purchase';
    form.querySelector('[data-daycare-care-section]').hidden = mode === 'purchase';
    if (mode === 'purchase') { form.elements.includeGrooming.checked = false; form.elements.includeTaxi.checked = false; form.querySelectorAll('[data-daycare-addon]').forEach((input) => { input.checked = false; }); }
    form.querySelectorAll('[data-daycare-care-section] input, [data-daycare-care-section] select').forEach((input) => { input.disabled = mode === 'purchase'; });
    form.querySelector('[data-daycare-contact-fields]').hidden = mode === 'purchase';
    form.elements.emergencyName.required = mode !== 'purchase';
    form.elements.emergencyPhone.required = mode !== 'purchase';
    setHealthGate();
    form.querySelector('[data-daycare-purchase]').querySelectorAll('[name="passPlan"]').forEach((input) => { input.required = mode === 'purchase'; });
    form.elements.date.required = mode !== 'purchase';
    form.elements.dropoffTime.required = mode !== 'purchase';
    form.elements.pickupTime.required = mode !== 'purchase';
    form.elements.passId.required = mode === 'redeem';
    form.querySelector('[data-daycare-submit]').textContent = mode === 'purchase' ? 'Purchase Daycare Pass' : mode === 'redeem' ? 'Confirm Pass Booking' : 'Confirm Daycare Booking';
    capacity(); quote();
  };
  const refreshPet = (selected) => {
    form.elements.petId.value = selected.id;
    const passSelect = form.elements.passId;
    passSelect.innerHTML = `<option value="">${passes.some((pass) => pass.petId === selected.id) ? 'Choose an active pass' : 'No active passes for this pet.'}</option>${activePassOptions(selected.id)}`;
    form.querySelector('[data-daycare-pet-name]').textContent = selected.name;
    form.querySelector('[data-daycare-pet-info]').textContent = `${selected.species || 'Dog'} · ${selected.breed || 'Breed not added'} · ${selected.weight || '—'} kg`;
    form.querySelector('[data-daycare-vaccine]').textContent = selected.vaccinationCards?.length ? 'Vaccination record uploaded' : 'Vaccination record required';
    form.querySelector('[data-daycare-tier]').textContent = `${daycareWeightTier(selected.weight, loadDaycareSettings())} size`;
    const remarks = Array.isArray(selected.remarks) ? selected.remarks : [selected.redFlagRemark].filter(Boolean);
    form.querySelector('[data-daycare-remarks]').textContent = remarks.join(' · ') || 'No care remarks saved.';
    form.querySelectorAll('[data-daycare-pet-choice]').forEach((card) => {
      const isChosen = card.dataset.daycarePetChoice === selected.id;
      card.classList.toggle('is-selected', isChosen);
      card.setAttribute('aria-pressed', String(isChosen));
      card.querySelector('.grooming-pet-selected-mark')?.remove();
      if (isChosen) { const mark = document.createElement('span'); mark.className = 'grooming-pet-selected-mark'; mark.innerHTML = '<img src="Image/Icon/Icon-13.png" alt="Selected" />'; card.append(mark); }
    });
    setHealthGate(); quote();
  };

  renderTimeChoices();
  date.min = new Date(dateToday.getTime() - dateToday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const max = new Date(dateToday); max.setDate(max.getDate() + Number(settings.bookingHorizonDays || 90));
  date.max = new Date(max.getTime() - max.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.querySelector('[data-daycare-pet-carousel]').addEventListener('click', (event) => { const card = event.target.closest('[data-daycare-pet-choice]'); const selected = loadPetProfiles().find((item) => item.id === card?.dataset.daycarePetChoice); if (selected) refreshPet(selected); });
  modes.forEach((input) => input.addEventListener('change', updateMode));
  date.addEventListener('change', () => { capacity(); setHealthGate(); quote(); if (form.elements.includeGrooming.checked) form.elements.groomingDate.value = date.value; });
  form.elements.hours.addEventListener('change', () => { const index = form.elements.dropoffTime.selectedIndex; form.elements.pickupTime.selectedIndex = Math.min(form.elements.pickupTime.options.length - 1, index + Number(form.elements.hours.value)); quote(); });
  form.elements.dropoffTime.addEventListener('change', () => { const index = form.elements.dropoffTime.selectedIndex; form.elements.pickupTime.selectedIndex = Math.min(form.elements.pickupTime.options.length - 1, index + Number(form.elements.hours.value)); quote(); });
  form.elements.pickupTime.addEventListener('change', () => { const duration = form.elements.pickupTime.selectedIndex - form.elements.dropoffTime.selectedIndex; if (duration > 0) form.elements.hours.value = String(Math.min(9, duration)); quote(); });
  form.querySelectorAll('[data-daycare-addon]').forEach((input) => input.addEventListener('change', () => { if (input.value === 'medication') form.elements.medicationDetails.required = input.checked; quote(); }));
  form.querySelectorAll('[data-daycare-grooming-package]').forEach((input) => input.addEventListener('change', quote));
  form.elements.includeGrooming.addEventListener('change', () => { const shown = form.elements.includeGrooming.checked && currentMode() !== 'purchase'; form.querySelector('[data-daycare-grooming-fields]').hidden = !shown; form.elements.groomingDate.required = shown; quote(); });
  setupPetTaxiAddressPicker(form, quote);
  form.elements.includeTaxi.addEventListener('change', () => { const included = form.elements.includeTaxi.checked; form.querySelector('[data-daycare-taxi-fields]').hidden = !included; if (form.elements.taxiAddress) form.elements.taxiAddress.required = included; quote(); });
  form.elements.taxiManualAddress.addEventListener('input', quote);
  form.elements.taxiTrip.addEventListener('change', quote);
  form.elements.groomingDate.min = date.min;
  form.elements.groomingDate.addEventListener('change', () => { if (date.value) form.elements.groomingDate.max = date.value; });
  form.querySelectorAll('[name="paymentMethod"]').forEach((input) => input.addEventListener('change', () => { form.querySelector('[data-daycare-transfer]').hidden = form.elements.paymentMethod.value !== 'bank-transfer'; form.elements.transferSlip.required = form.elements.paymentMethod.value === 'bank-transfer'; }));
  form.querySelector('[data-apply-daycare-voucher]').addEventListener('click', () => {
    const live = loadDaycareSettings(); const code = form.elements.voucherCode.value.trim().toUpperCase(); const note = form.querySelector('[data-daycare-voucher-feedback]'); const current = quote();
    if (!live.voucher.enabled || !code || code !== String(live.voucher.code).toUpperCase()) { discount = 0; appliedCode = ''; note.textContent = 'That daycare promo code is not active.'; }
    else if (current.basePrice + current.addOnTotal + current.groomingPrice + current.taxi < Number(live.voucher.minimumSpend || 0)) { discount = 0; appliedCode = ''; note.textContent = `This code needs a minimum spend of ${money(live.voucher.minimumSpend)}.`; }
    else { const subtotal = current.basePrice + current.addOnTotal + current.groomingPrice + current.taxi; discount = Math.min(subtotal, live.voucher.type === 'fixed' ? Number(live.voucher.value) : subtotal * Number(live.voucher.value) / 100); appliedCode = code; note.textContent = `${code} applied.`; }
    quote();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); feedback.textContent = '';
    if (!form.reportValidity()) return;
    const live = loadDaycareSettings(); const selectedPet = pet(); const mode = currentMode(); const current = quote();
    if (!selectedPet) { feedback.textContent = 'Choose a pet profile to continue.'; return; }
    if (mode === 'purchase') {
      const plan = live.passes.find((item) => item.id === form.querySelector('[name="passPlan"]:checked')?.value && item.active !== false);
      if (!plan) { feedback.textContent = 'Choose an available pass.'; return; }
      const amount = Math.max(0, Number(plan.price) - discount);
      const paymentMethod = form.elements.paymentMethod.value;
      if (paymentMethod === 'wallet') { const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0); if (balance < amount) { feedback.textContent = 'Your Furgo Credit balance is too low. Choose another payment method.'; return; } }
      const today = new Date(); const expiry = new Date(today); expiry.setDate(expiry.getDate() + Number(plan.validityDays));
      const pass = { id: `DP-${Date.now()}-${safeKey(selectedPet.id)}`, planId: plan.id, name: plan.name, customerEmail: profile.email || '', customerPhone: profile.phone || '', petId: selectedPet.id, petName: selectedPet.name, totalSessions: Number(plan.sessions) + Number(plan.bonusSessions || 0), remainingSessions: Number(plan.sessions) + Number(plan.bonusSessions || 0), purchasedAt: today.toISOString(), expiresOn: expiry.toISOString().slice(0, 10) };
      const order = { id: pass.id, userId: profile.id || '', reference: pass.id, type: 'pass-purchase', service: 'Pet Daycare Pass', petId: selectedPet.id, petName: selectedPet.name, customerName: profile.name || '', customerEmail: profile.email || '', customerPhone: profile.phone || '', planName: plan.name, sessions: pass.totalSessions, remainingSessions: pass.remainingSessions, expiresOn: pass.expiresOn, total: amount, paymentMethod, paymentStatus: paymentMethod === 'bank-transfer' ? 'Pending Payment Verification' : paymentMethod === 'wallet' ? 'Paid' : 'Pending / Confirmed', status: paymentMethod === 'bank-transfer' ? 'Pending Payment Verification' : 'Pending / Confirmed', createdAt: new Date().toISOString() };
      try {
        await saveDedicatedBooking(daycareBookingsKey, order, [...loadDaycareBookings(), order]);
      } catch (error) {
        feedback.textContent = `We could not save your Daycare pass: ${error.message || 'Please try again.'}`;
        feedback.classList.add('visible');
        return;
      }
      localStorage.setItem(daycarePassesKey, JSON.stringify([...loadDaycarePasses(), pass]));
      if (paymentMethod === 'wallet') {
        const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
        localStorage.setItem('furgo-demo-credit-balance', String(balance - amount));
        const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
        transactions.push({ id: `daycare-pass-${Date.now()}`, type: 'Pet Daycare pass', amount: -amount, timestamp: new Date().toISOString() });
        localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
      }
      window.location.hash = '#orders?service=daycare&from=daycare'; return;
    }
    if (!capacity()) { feedback.textContent = 'This date is full or unavailable. Choose another day.'; return; }
    if (!setHealthGate() || !form.elements.vaccinationCurrent.checked) { feedback.textContent = 'A current vaccination record and confirmation are required.'; return; }
    if (form.elements.pickupTime.value <= form.elements.dropoffTime.value) { feedback.textContent = 'Pick-up time must be later than drop-off time.'; return; }
    let pass = null;
    if (mode === 'redeem') {
      const ownerEmail = String(profile.email || '').trim().toLowerCase();
      const ownerPhone = String(profile.phone || '').replace(/\D/g, '');
      pass = loadDaycarePasses().find((item) => {
        const emailMatches = ownerEmail && String(item.customerEmail || '').trim().toLowerCase() === ownerEmail;
        const phoneMatches = ownerPhone && String(item.customerPhone || '').replace(/\D/g, '') === ownerPhone;
        return item.id === form.elements.passId.value && item.petId === selectedPet.id && (emailMatches || phoneMatches) && Number(item.remainingSessions) > 0 && (!item.expiresOn || item.expiresOn >= date.value);
      });
      if (!pass) { feedback.textContent = 'Choose a valid daycare pass with sessions remaining.'; return; }
    }
    const paymentMethod = form.elements.paymentMethod.value;
    if (paymentMethod === 'wallet' && current.total > 0) { const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0); if (balance < current.total) { feedback.textContent = 'Your Furgo Credit balance is too low. Choose another payment method.'; return; } }
    let paymentProof = null;
    if (paymentMethod === 'bank-transfer') { const file = form.elements.transferSlip.files?.[0]; if (!file) { feedback.textContent = 'Upload a bank transfer slip to continue.'; return; } if (file.size > 1024 * 1024) { feedback.textContent = 'Transfer slips must be 1 MB or smaller.'; return; } paymentProof = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: reader.result }); reader.onerror = () => resolve(null); reader.readAsDataURL(file); }); if (!paymentProof) { feedback.textContent = 'The transfer slip could not be read.'; return; } }
    const selectedAddOns = [...form.querySelectorAll('[data-daycare-addon]:checked')].map((input) => ({ ...live.addOns.find((item) => item.id === input.value), details: input.value === 'medication' ? form.elements.medicationDetails.value.trim() : '' }));
    const record = { id: `DC-${Date.now()}`, userId: profile.id || '', reference: `DC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, type: mode === 'redeem' ? 'pass-redemption' : 'single-visit', customerName: profile.name || '', customerEmail: profile.email || '', customerPhone: profile.phone || '', emergencyName: form.elements.emergencyName.value.trim(), emergencyPhone: form.elements.emergencyPhone.value.trim(), petId: selectedPet.id, petName: selectedPet.name, petSpecies: selectedPet.species || 'Dog', petBreed: selectedPet.breed || '', petWeight: Number(selectedPet.weight) || 0, vaccinationOnFile: Boolean(selectedPet.vaccinationCards?.length), vaccinationCards: selectedPet.vaccinationCards || [], vaccinationStatus: 'Owner confirmed · pending staff review', redFlags: (Array.isArray(selectedPet.remarks) ? selectedPet.remarks : [selectedPet.redFlagRemark].filter(Boolean)).join(' · '), outlet: form.elements.outlet.value, date: date.value, dropoffTime: form.elements.dropoffTime.value, pickupTime: form.elements.pickupTime.value, time: `${form.elements.dropoffTime.value} - ${form.elements.pickupTime.value}`, hours: current.visitHours, weightTier: tier(), passId: pass?.id || '', passName: pass?.name || '', passSessionsRemaining: pass ? Number(pass.remainingSessions) - 1 : 0, addOns: selectedAddOns, includeGrooming: form.elements.includeGrooming.checked, groomingPackage: current.grooming?.name || '', groomingDate: form.elements.includeGrooming.checked ? form.elements.groomingDate.value : '', groomingTime: form.elements.includeGrooming.checked ? form.elements.groomingTime.value : '', includeTaxi: form.elements.includeTaxi.checked, taxiAddress: form.elements.includeTaxi.checked ? ([getSelectedProfileAddress(form.elements.taxiAddress)?.street, getSelectedProfileAddress(form.elements.taxiAddress)?.city, getSelectedProfileAddress(form.elements.taxiAddress)?.state, getSelectedProfileAddress(form.elements.taxiAddress)?.postcode].filter(Boolean).join(', ') || form.elements.taxiManualAddress.value.trim()) : '', taxiTrip: form.elements.includeTaxi.checked ? form.elements.taxiTrip.value : '', taxiSchedule: form.elements.includeTaxi.checked ? form.elements.taxiSchedule.value : '', taxiTotal: current.taxi, voucherCode: appliedCode, subtotal: current.basePrice + current.addOnTotal + current.groomingPrice + current.taxi, discount, total: current.total, paymentMethod, paymentStatus: paymentProof ? 'Pending Payment Verification' : paymentMethod === 'wallet' ? 'Paid' : 'Pending / Confirmed', paymentProof, status: paymentProof ? 'Pending Payment Verification' : 'Pending / Confirmed', adminStatus: 'New', tasks: selectedAddOns.map((item) => ({ name: item.name, completed: false, details: item.details || '' })).concat(current.grooming ? [{ name: `Grooming · ${current.grooming.name}`, completed: false, details: `${form.elements.groomingDate.value} ${form.elements.groomingTime.value}` }] : []), createdAt: new Date().toISOString() };
    try {
      await saveDedicatedBooking(daycareBookingsKey, record, [...loadDaycareBookings(), record]);
    } catch (error) {
      feedback.textContent = `We could not save your Daycare booking: ${error.message || 'Please try again.'}`;
      feedback.classList.add('visible');
      return;
    }
    if (pass) { const balances = loadDaycarePasses().map((item) => item.id === pass.id ? { ...item, remainingSessions: Number(item.remainingSessions) - 1 } : item); localStorage.setItem(daycarePassesKey, JSON.stringify(balances)); }
    if (paymentMethod === 'wallet' && current.total > 0) {
      const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
      localStorage.setItem('furgo-demo-credit-balance', String(balance - current.total));
      const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
      transactions.push({ id: `daycare-${Date.now()}`, type: 'Pet Daycare booking', amount: -current.total, timestamp: new Date().toISOString() });
      localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
    }
    window.location.hash = '#orders?service=daycare&from=daycare';
  });
  form.elements.includeGrooming.dispatchEvent(new Event('change'));
  form.elements.includeTaxi.dispatchEvent(new Event('change'));
  setHealthGate(); capacity(); updateMode();
}
