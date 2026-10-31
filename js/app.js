// Main app controller: routes between the individual page files and wires shared interactions.
import { fitPetCardRemarks, homePage, loadPetProfiles, petCarouselMarkup, petProfilesStorageKeyForCurrentUser } from './pages/home.js';
import { loginPage } from './pages/login.js';
import { registerPage } from './pages/register.js';
import { onboardingPage } from './pages/onboarding.js';
import { profilePage } from './pages/profile.js';
import { editProfilePage } from './pages/edit-profile.js';
import { helpCenterPage } from './pages/help-center.js';
import { feedbackPage } from './pages/feedback.js';
import { addressPage } from './pages/address.js';
import { paymentMethodPage } from './pages/payment-method.js';
import { creditPage } from './pages/credit.js';
import { marketplaceFavoritesPage, marketplacePage, marketplaceProductPage, marketplaceSellerPage } from './pages/marketplace.js';
import { marketplaceCartPage, marketplaceCheckoutPage } from './pages/cart.js';
import { adminMarketplaceManagePage, adminMarketplacePage, adminMarketplaceProductsPage } from './pages/admin-marketplace.js';
import { marketplaceSupplierPage, supplierOrderRows, supplierProductRows } from './pages/marketplace-supplier.js';
import { adminOrderStage } from './admin-order-ui.js';
import { setupPortalNotifications } from './portal-notifications.js';
import { loadMarketplaceCart, loadMarketplaceFavorites, loadMarketplaceOfferSettings, loadMarketplaceOrders, loadMarketplaceProducts, marketplaceCartKey, marketplaceFavoritesKey, marketplaceLine, marketplaceOfferSettingsKey, marketplaceOrdersKey, marketplaceProductsKey, safeMarketplaceImage } from './pages/marketplace-data.js';
import { petProfilePage } from './pages/pet-profile.js';
import { adminPromotionsPage, loadPromotions, maximumPromotions, normalizePromotionDestination, promotionStorageKey } from './pages/admin-promotions.js';
import { adminPortalPage, setupAdminPortal } from './pages/admin.js';
import { groomingBookingPage, groomingOrdersPage } from './pages/grooming.js';
import { adminGroomingPage } from './pages/admin-grooming.js';
import { setupServiceAddOns } from './pages/admin-service-addons.js';
import { petHotelPage, setupHotelBooking } from './pages/hotel.js';
import { adminHotelPage, setupAdminHotel } from './pages/admin-hotel.js';
import { petDaycarePage, setupDaycareBooking } from './pages/daycare.js';
import { adminDaycarePage, setupAdminDaycare } from './pages/admin-daycare.js';
import { adminPetTaxiPage, setupAdminPetTaxi } from './pages/admin-pet-taxi.js';
import { setupAdminServiceBanners } from './pages/admin-service-banners.js';
import { setupServiceBannerCarousel } from './pages/service-banners.js';
import { loadPetTaxiSettings, matchPetTaxiRoute, petTaxiSettingsKey } from './pages/pet-taxi-data.js';
import { setupPetTaxiAddressPicker } from './pages/pet-taxi-addresses.js';
import { defaultGroomingSettings, groomingBookingsKey, groomingSettingsKey, groomingWeightTier, loadGroomingBookings, loadGroomingSettings } from './pages/grooming-data.js';
import { myOrdersPage, setupMyOrders } from './pages/my-orders.js';
import { adminOrdersPage, setupAdminOrders } from './pages/admin-orders.js';
import { checkInPage, extractCheckInCode, formatCheckInToken, refreshCheckInTokens, setupCheckInInteractions } from './pages/check-in.js';
import { adminBottomNavigation, escapeHTML } from './shared.js';
import { adminEnquiriesPage, setupAdminEnquiries } from './pages/admin-enquiries.js';
import { adminCustomersPage, getCustomerAccountStatus, getCustomerRecordId, saveCustomerRecord, setupAdminCustomers } from './pages/admin-customers.js';
import { driverPortalPage, setupDriverPortal } from './pages/driver.js';
import { adminAccessPage, adminAuditPage, setupAdminAccess, setupAdminAuditPage } from './pages/admin-access.js';
import { adminProductServiceInsightsPage, setupAdminProductServiceInsights } from './pages/admin-product-insights.js';
import { recordAdminAction } from './admin-audit.js';
import { recentSearchesKey, searchPage } from './pages/search.js';
import { localFinderListPage, localFinderPage, localFinderPlacePage, setupLocalFinder } from './pages/local-finder.js';
import { adminLocalFinderPage, setupAdminLocalFinder } from './pages/admin-local-finder.js';
import { supabase, toMalaysianE164 } from './supabase.js';
import { refreshSharedOutlets } from './pages/outlet-directory.js';
import { cacheSyncedRecords, loadCloudAppData } from './app-data-sync.js';
import { startQRScanner } from './qr-scanner.js';

// Section: Supabase-backed authentication state
// Function: Prevent protected routes rendering before the persisted Supabase session is read.
let supabaseAuthReady = false;
let groomingQrSyncListenerInstalled = false;
let activeSupabaseUserId = '';

// Section: Supabase pet records
// Function: Convert the signed-in owner's browser pet model to and from their pet_profiles rows.
const petProfilesStorageKey = 'furgo-demo-pet-profiles';

function petFromDatabase(row, photo = '', vaccinationCards = []) {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name || '',
    breed: row.breed || '',
    sex: row.sex || '',
    birthDate: row.birth_date || '',
    neutered: row.neutered === true ? 'yes' : row.neutered === false ? 'no' : '',
    weight: row.weight_kg == null ? '' : String(row.weight_kg),
    colour: row.colour || '',
    remarks: Array.isArray(row.remarks) ? row.remarks : [],
    photo,
    photoPath: row.photo_path || '',
    vaccinationCards,
    vaccinationValidUntil: row.vaccination_valid_until || '',
  };
}

async function signedPetFile(path) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('pet-records').createSignedUrl(path, 60 * 60 * 24);
  if (error) throw error;
  return data.signedUrl;
}

async function loadCloudPetProfiles(userId) {
  let { data, error } = await supabase.from('pet_profiles').select('*').eq('user_id', userId).order('created_at');
  if (error) throw error;
  let cachedPets = [];
  try { cachedPets = JSON.parse(localStorage.getItem(petProfilesStorageKey) || '[]'); } catch { cachedPets = []; }
  if (!Array.isArray(cachedPets)) cachedPets = [];
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const email = String(profile.email || '').toLowerCase();
  const phone = String(profile.phone || '').replace(/[\s-]/g, '');
  const ownedPets = cachedPets.filter((pet) =>
    (email && String(pet.ownerEmail || '').toLowerCase() === email)
    || (phone && String(pet.ownerPhone || '').replace(/[\s-]/g, '') === phone));
  const backupKey = `furgo-demo-pet-profiles-backup-${userId}`;
  if (ownedPets.length && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(ownedPets));
  if (!data?.length && ownedPets.length) {
    for (const pet of ownedPets) {
      const id = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(pet.id || '') ? pet.id : crypto.randomUUID();
      await saveCloudPet({ ...pet, id }, userId);
    }
    if (ownedPets.length) {
      const refreshed = await supabase.from('pet_profiles').select('*').eq('user_id', userId).order('created_at');
      if (refreshed.error) throw refreshed.error;
      data = refreshed.data;
    }
  }
  const pets = await Promise.all((data || []).map(async (row) => {
    const photo = await signedPetFile(row.photo_path);
    const vaccinationCards = await Promise.all((Array.isArray(row.vaccination_cards) ? row.vaccination_cards : []).map(async (card) => ({
      name: card.name || 'Vaccination record',
      path: card.path || '',
      data: card.path ? await signedPetFile(card.path) : '',
    })));
    return petFromDatabase(row, photo, vaccinationCards);
  }));
  localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(pets));
  return pets;
}

async function uploadPetDataUrl(userId, petId, label, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return '';
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type === 'application/pdf' ? 'pdf' : blob.type.split('/')[1] || 'jpg';
  const path = `${userId}/${petId}/${label}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('pet-records').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

async function saveCloudPet(pet, userId) {
  const petId = pet.id || crypto.randomUUID();
  let photoPath = pet.photoPath || '';
  if (pet.photo?.startsWith('data:')) photoPath = await uploadPetDataUrl(userId, petId, 'profile', pet.photo);
  const cards = await Promise.all((pet.vaccinationCards || []).map(async (card) => ({
    name: card.name || 'Vaccination record',
    path: card.path || await uploadPetDataUrl(userId, petId, 'vaccination', card.data),
  })));
  const row = {
    id: petId,
    user_id: userId,
    name: pet.name,
    breed: pet.breed || '',
    sex: pet.sex || '',
    birth_date: pet.birthDate || null,
    neutered: pet.neutered === 'yes' ? true : pet.neutered === 'no' ? false : null,
    weight_kg: pet.weight === '' || pet.weight == null ? null : Number(pet.weight),
    colour: pet.colour || '',
    remarks: pet.remarks || [],
    photo_path: photoPath || null,
    vaccination_cards: cards,
    vaccination_valid_until: pet.vaccinationValidUntil || null,
  };
  const { data, error } = await supabase.from('pet_profiles').upsert(row).select('*').single();
  if (error) throw error;
  const photo = await signedPetFile(data.photo_path);
  const vaccinationCards = await Promise.all(cards.map(async (card) => ({ ...card, data: await signedPetFile(card.path) })));
  return petFromDatabase(data, photo, vaccinationCards);
}

async function deleteCloudPet(petId, userId) {
  const { data: pet, error: readError } = await supabase.from('pet_profiles').select('photo_path,vaccination_cards').eq('id', petId).eq('user_id', userId).maybeSingle();
  if (readError) throw readError;
  const { error } = await supabase.from('pet_profiles').delete().eq('id', petId).eq('user_id', userId);
  if (error) throw error;
  const paths = [pet?.photo_path, ...(pet?.vaccination_cards || []).map((card) => card.path)].filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('pet-records').remove(paths);
    if (storageError) console.warn('Pet record files could not be removed:', storageError);
  }
}

// Loads customer account records and their pet profiles for the Admin Portal only.
async function loadCloudAdminCustomers() {
  const [{ data: profiles, error: profileError }, { data: controls, error: controlsError }, { data: petRows, error: petsError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from('profiles').select('id,display_name,email,phone_e164,created_at'),
    supabase.from('account_controls').select('user_id,status,admin_note,updated_at'),
    supabase.from('pet_profiles').select('*').order('created_at'),
    supabase.from('user_roles').select('user_id,role'),
  ]);
  if (profileError) throw profileError;
  if (controlsError) throw controlsError;
  if (petsError) throw petsError;
  if (rolesError) throw rolesError;
  const adminUserIds = new Set((roles || []).filter((record) => record.role === 'admin').map((record) => record.user_id));
  const controlByUser = new Map((controls || []).map((record) => [record.user_id, record]));
  const customerByUser = new Map();
  const customers = (profiles || []).filter((profile) => !adminUserIds.has(profile.id)).map((profile) => {
    const phone = profile.phone_e164?.startsWith('+60') ? `0${profile.phone_e164.slice(3)}` : profile.phone_e164 || '';
    const localId = getCustomerRecordId({ phone, email: profile.email });
    const control = controlByUser.get(profile.id);
    const existingStatus = String(control?.status || 'active');
    const status = existingStatus === 'blacklisted' ? 'Blacklisted' : existingStatus === 'restricted' ? 'Restricted' : 'Active';
    const customer = {
      id: localId, authUserId: profile.id, name: profile.display_name || 'Pet Parent', email: profile.email || '',
      phone, status, authChannel: 'Supabase Auth', createdAt: profile.created_at || '',
      adminNote: control?.admin_note || '',
    };
    customerByUser.set(profile.id, customer);
    return customer;
  });
  const pets = await Promise.all((petRows || []).map(async (row) => {
    const owner = customerByUser.get(row.user_id);
    if (!owner) return null;
    const photo = await signedPetFile(row.photo_path);
    const vaccinationCards = await Promise.all((Array.isArray(row.vaccination_cards) ? row.vaccination_cards : []).map(async (card) => ({
      name: card.name || 'Vaccination record', path: card.path || '', data: card.path ? await signedPetFile(card.path) : '',
    })));
    return {
      ...petFromDatabase(row, photo, vaccinationCards), ownerId: owner.id, ownerUserId: owner.authUserId,
      ownerEmail: owner.email, ownerPhone: owner.phone,
    };
  }));
  localStorage.setItem('furgo-demo-customer-records', JSON.stringify(customers));
  localStorage.setItem('furgo-demo-admin-customer-pet-profiles', JSON.stringify(pets.filter(Boolean)));
}

// Section: Supabase grooming bookings
// Function: Share grooming schedule, appointment slots, and booking status across customer/admin sessions.
async function createCloudGroomingBooking(booking, userId) {
  const { data, error } = await supabase.from('grooming_bookings').insert({
    user_id: userId,
    reference: booking.reference,
    outlet: booking.outlet,
    appointment_date: booking.date,
    appointment_time: booking.time,
    status: booking.status,
    details: booking,
  }).select('*').single();
  if (error) throw error;
  return { ...data.details, id: data.id, userId: data.user_id, date: data.appointment_date, time: data.appointment_time, outlet: data.outlet, status: data.status, createdAt: data.created_at };
}

async function updateCloudGroomingBooking(booking) {
  const { error } = await supabase.from('grooming_bookings').update({ status: booking.status, details: booking }).eq('id', booking.id);
  if (error) throw error;
}

async function saveCloudGroomingSettings(settings, userId) {
  const { error } = await supabase.from('service_settings').upsert({ service_key: 'grooming', settings, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function loadCloudGroomingData(userId, role) {
  const hasOperationsAccess = ['admin', 'staff', 'director', 'manager', 'executive', 'driver'].includes(role);
  const [{ data: settingRow, error: settingsError }, bookingsResult] = await Promise.all([
    supabase.from('service_settings').select('settings').eq('service_key', 'grooming').maybeSingle(),
    hasOperationsAccess
      ? supabase.from('grooming_bookings').select('*').order('created_at', { ascending: false })
      : supabase.from('grooming_bookings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  if (settingsError) throw settingsError;
  if (bookingsResult.error) throw bookingsResult.error;
  const savedSettings = settingRow?.settings && Object.keys(settingRow.settings).length ? settingRow.settings : null;
  if (savedSettings) localStorage.setItem(groomingSettingsKey, JSON.stringify(savedSettings));
  else if (['admin', 'director', 'manager'].includes(role)) {
    const localSettings = loadGroomingSettings();
    await saveCloudGroomingSettings(localSettings, userId);
  } else if (!localStorage.getItem(groomingSettingsKey)) {
    localStorage.setItem(groomingSettingsKey, JSON.stringify(defaultGroomingSettings));
  }
  const localBookings = loadGroomingBookings();
  const backupKey = `furgo-demo-grooming-bookings-backup-${userId}`;
  if (localBookings.length && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(localBookings));
  if (!bookingsResult.data?.length && role === 'customer' && localBookings.length) {
    const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
    const email = String(profile.email || '').toLowerCase();
    const phone = String(profile.phone || '').replace(/[\s-]/g, '');
    const ownedBookings = localBookings.filter((booking) =>
      (email && String(booking.customerEmail || '').toLowerCase() === email)
      || (phone && String(booking.customerPhone || '').replace(/[\s-]/g, '') === phone));
    for (const booking of ownedBookings) {
      try { await createCloudGroomingBooking(booking, userId); }
      catch (migrationError) { console.warn('A previous grooming booking could not be migrated:', migrationError); }
    }
    if (ownedBookings.length) {
      const refreshed = await supabase.from('grooming_bookings').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (refreshed.error) throw refreshed.error;
      bookingsResult.data = refreshed.data;
    }
  }
  const bookings = (bookingsResult.data || []).map((row) => ({
    ...(row.details || {}),
    id: row.id,
    userId: row.user_id,
    reference: row.reference,
    outlet: row.outlet,
    date: row.appointment_date,
    time: row.appointment_time,
    status: row.status,
    createdAt: row.created_at,
  }));
  cacheSyncedRecords(groomingBookingsKey, bookings);
  return bookings;
}

// Stores prototype onboarding events and attribution locally for development review.
function recordOnboardingEvent(eventName, channel = 'unknown') {
  const query = new URLSearchParams(window.location.search);
  const events = JSON.parse(sessionStorage.getItem('furgo-demo-onboarding-events') || '[]');
  const utm = Object.fromEntries([...query.entries()].filter(([key]) => key.toLowerCase().startsWith('utm_')));
  events.push({
    event: eventName,
    channel,
    source: query.get('utm_source') || document.referrer || 'direct',
    campaign: query.get('utm_campaign') || '',
    utm,
    referralCode: query.get('ref') || query.get('referral') || '',
    timestamp: new Date().toISOString(),
  });
  sessionStorage.setItem('furgo-demo-onboarding-events', JSON.stringify(events));
}

// Section: WhatsApp registration verification
// Function: Request a real Supabase WhatsApp OTP for a new Malaysian phone account.
function setupPhoneVerification(form) {
  const phoneInput = form.querySelector('[data-phone-input]');
  const sendButton = form.querySelector('[data-send-otp]');
  const otpField = form.querySelector('[data-otp-field]');
  const otpInput = form.querySelector('[data-otp-input]');
  const hint = form.querySelector('[data-otp-hint]');
  const countdown = form.querySelector('[data-otp-countdown]');
  const feedback = form.querySelector('.form-feedback');
  if (!phoneInput || !sendButton || !otpInput) return;

  otpInput.required = false;
  phoneInput.addEventListener('input', () => {
    let currentPhone = '';
    try { currentPhone = toMalaysianE164(phoneInput.value); } catch { /* The field validator displays the format error. */ }
    if (form.dataset.authPhone && currentPhone !== form.dataset.authPhone) {
      form.dataset.otpSent = 'false';
      form.dataset.otpVerified = 'false';
      otpField.hidden = true;
      otpInput.required = false;
      otpInput.value = '';
    }
  });
  sendButton.addEventListener('click', async () => {
    if (sendButton.disabled) return;
    const otpRequired = otpInput.required;
    otpInput.required = false;
    const formIsValid = form.reportValidity();
    otpInput.required = otpRequired;
    if (!formIsValid) return;
    const name = form.querySelector('[name="name"]')?.value.trim() || '';
    const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase() || '';
    const password = form.querySelector('[name="password"]')?.value || '';
    let phone;
    try { phone = toMalaysianE164(phoneInput.value); }
    catch (error) { phoneInput.setCustomValidity(error.message); phoneInput.reportValidity(); return; }
    feedback.textContent = 'Requesting WhatsApp verification code…';
    feedback.classList.add('visible');
    sendButton.disabled = true;
    try {
      if (form.dataset.otpSent === 'true' && form.dataset.authPhone === phone) {
        const { error } = await supabase.auth.resend({ type: 'sms', phone, options: { channel: 'whatsapp' } });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          phone,
          password,
          options: { channel: 'whatsapp', data: { display_name: name, email } },
        });
        if (error) throw error;
        if (data.session) {
          await supabase.auth.signOut();
          throw new Error('Phone confirmation is disabled in Supabase. Enable phone confirmations before accepting registrations.');
        }
      }
      form.dataset.authPhone = phone;
      form.dataset.otpSent = 'true';
      form.dataset.otpVerified = 'false';
      form.dataset.otpAttempts = '0';
      otpField.hidden = false;
      otpInput.disabled = false;
      otpInput.required = true;
      hint.hidden = false;
      hint.textContent = 'Enter the verification code sent to your WhatsApp number.';
      feedback.textContent = 'WhatsApp verification code sent.';
      recordOnboardingEvent('whatsapp_otp_sent', 'phone_direct');
      let secondsLeft = 60;
      sendButton.textContent = 'Resend WhatsApp code';
      countdown.textContent = `Resend in ${secondsLeft}s`;
      const countdownTimer = window.setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
          window.clearInterval(countdownTimer);
          sendButton.disabled = false;
          countdown.textContent = 'You can request another code.';
          return;
        }
        countdown.textContent = `Resend in ${secondsLeft}s`;
      }, 1000);
    } catch (error) {
      sendButton.disabled = false;
      feedback.textContent = friendlyAuthError(error);
    }
  });
}

// Section: WhatsApp registration verification
// Function: Verify the real one-time code sent by Supabase Auth.
async function verifyPhoneCode(form) {
  const otpInput = form.querySelector('[data-otp-input]');
  const feedback = form.querySelector('.form-feedback');
  if (form.dataset.otpVerified === 'true') return true;
  if (Number(form.dataset.otpAttempts || 0) >= 5) {
    feedback.textContent = 'Too many attempts. Wait for the resend timer, then request a new code.';
    feedback.classList.add('visible');
    return false;
  }
  if (form.dataset.otpSent !== 'true') {
    feedback.textContent = 'Request a WhatsApp verification code first.';
    feedback.classList.add('visible');
    return false;
  }
  const attempts = Number(form.dataset.otpAttempts || 0) + 1;
  form.dataset.otpAttempts = String(attempts);
  try {
    const { error } = await supabase.auth.verifyOtp({ phone: form.dataset.authPhone, token: otpInput.value, type: 'sms' });
    if (error) throw error;
    form.dataset.otpVerified = 'true';
    feedback.textContent = 'Phone number verified.';
    feedback.classList.add('visible');
    recordOnboardingEvent('whatsapp_otp_verified', 'phone_direct');
    return true;
  } catch (error) {
    const attemptsLeft = Math.max(0, 5 - attempts);
    feedback.textContent = attemptsLeft ? `${friendlyAuthError(error)} ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.` : 'Too many attempts. Wait for the resend timer, then request a new code.';
    feedback.classList.add('visible');
    recordOnboardingEvent('whatsapp_otp_failed', 'phone_direct');
    return false;
  }
}

// Section: Authentication feedback
// Function: Convert common Supabase Auth failures to actionable customer-facing messages.
function friendlyAuthError(error) {
  const message = String(error?.message || 'Authentication could not be completed.');
  if (/whatsapp|provider|twilio|sms/i.test(message)) return `${message} Check that a WhatsApp OTP provider and sender are configured in Supabase Auth.`;
  if (/invalid login credentials/i.test(message)) return 'The phone/email or password is incorrect.';
  if (/email.*already|already.*email/i.test(message)) return 'That email address is already linked to an account.';
  return message;
}

// Section: Authentication identity
// Function: Load the signed-in user's trusted role, profile, and account status from Supabase.
async function loadSupabaseIdentity(user) {
  activeSupabaseUserId = user.id;
  const [{ data: roleRows, error: roleError }, { data: profile, error: profileError }, { data: account, error: accountError }, portalAccessResult, supplierAccessResult] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('profiles').select('display_name,email,phone_e164').eq('id', user.id).maybeSingle(),
    supabase.from('account_controls').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.from('portal_access').select('level,outlet_id,admin_outlets(name,shortform)').eq('user_id', user.id).maybeSingle(),
    supabase.from('marketplace_supplier_access').select('supplier_name').eq('supplier_user_id', user.id).maybeSingle(),
  ]);
  if (roleError) throw roleError;
  if (profileError) throw profileError;
  if (accountError) throw accountError;
  if (account?.status === 'blacklisted') {
    await supabase.auth.signOut();
    sessionStorage.removeItem('furgo-demo-auth');
    sessionStorage.removeItem('furgo-demo-profile-complete');
    sessionStorage.removeItem('furgo-demo-user-role');
    throw new Error('This account is blacklisted. Please contact Furgo Support for assistance.');
  }
  const portalLevel = portalAccessResult.error ? '' : portalAccessResult.data?.level || '';
  const legacyPortalRole = roleRows?.some(({ role: value }) => value === 'admin') ? 'director'
    : roleRows?.some(({ role: value }) => value === 'staff') ? 'executive' : '';
  const role = ['executive', 'manager', 'director'].includes(portalLevel) ? portalLevel
    : legacyPortalRole || (roleRows?.some(({ role: value }) => value === 'driver') ? 'driver' : supplierAccessResult.data?.supplier_name ? 'supplier' : 'customer');
  const phone = user.phone || profile?.phone_e164 || user.user_metadata?.phone_e164 || '';
  const snapshot = {
    id: user.id,
    name: profile?.display_name || user.user_metadata?.display_name || 'Pet Parent',
    email: profile?.email || user.email || user.user_metadata?.email || '',
    phone: phone.startsWith('+60') ? `0${phone.slice(3)}` : phone,
    role,
    outletId: portalAccessResult.data?.outlet_id || '',
    outletName: portalAccessResult.data?.admin_outlets?.name || '',
    outletShortform: portalAccessResult.data?.admin_outlets?.shortform || '',
    supplierName: supplierAccessResult.data?.supplier_name || '',
    authChannel: user.phone ? 'phone_password' : 'email_password',
  };
  sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(snapshot));
  sessionStorage.setItem('furgo-demo-auth', 'true');
  sessionStorage.setItem('furgo-demo-profile-complete', 'true');
  sessionStorage.setItem('furgo-demo-user-role', role);
  sessionStorage.setItem('furgo-demo-auth-channel', snapshot.authChannel);
  if (role === 'supplier') return snapshot;
  try {
    await loadCloudAppData(user.id, role);
  } catch (error) {
    // Existing features stay usable if the app-data migration has not been applied yet.
    console.warn('Supabase shared app data is not ready yet; using this browser’s saved data:', error);
  }
  if (role === 'director') {
    try { await loadCloudAdminCustomers(); }
    catch (error) { console.warn('Could not load customer management records from Supabase:', error); }
  }
  await loadCloudPetProfiles(user.id);
  try {
    await loadCloudGroomingData(user.id, role);
  } catch (error) {
    // Keep the already-working sign-in available until the user applies the grooming migration.
    console.warn('Supabase grooming tables are not ready yet; using this browser’s saved schedule:', error);
  }
  return snapshot;
}

// Section: Authentication state restoration
// Function: Restore the Supabase session before routing to protected portal pages.
async function initializeSupabaseSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await loadSupabaseIdentity(data.session.user);
    else {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-demo-profile-complete');
      sessionStorage.removeItem('furgo-demo-user-role');
      sessionStorage.removeItem('furgo-demo-user-profile');
    }
  } catch (error) {
    sessionStorage.removeItem('furgo-demo-auth');
    sessionStorage.removeItem('furgo-demo-profile-complete');
    sessionStorage.removeItem('furgo-demo-user-role');
    sessionStorage.removeItem('furgo-demo-user-profile');
    console.error('Could not restore Furgo Supabase session:', error);
  } finally {
    supabaseAuthReady = true;
    const initialPage = window.location.hash.replace('#', '').split('?')[0];
    if (!initialPage || initialPage === 'home') showSplash();
    else render();
  }
}

// Validates Malaysian mobile numbers in the customer's local 01 format.
function malaysianMobileError(value) {
  const phone = value.trim().replace(/[\s-]/g, '');
  return /^01(?:1[0-9]{8}|[02-9][0-9]{7})$/.test(phone)
    ? ''
    : 'Enter a Malaysian mobile number starting with 01 (10 or 11 digits).';
}

// Validates the single login field as either an email address or a local Malaysian mobile number.
function loginIdentifierError(value) {
  const identifier = value.trim();
  if (identifier.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? '' : 'Enter a valid email address.';
  }
  return malaysianMobileError(identifier) ? 'Enter a Malaysian mobile number starting with 01, or use your email address.' : '';
}

// Compresses a selected pet photo so the local prototype can save it in browser storage.
async function petPhotoDataUrl(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Connects the Home pet carousel to photo uploads and saved pet-profile links.
function setupHomePetProfiles() {
  const carousel = document.querySelector('[data-pet-carousel]');
  if (!carousel) return;
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const savePets = (items) => localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(items));
  const renderPets = () => {
    carousel.innerHTML = petCarouselMarkup(icon, loadPetProfiles());
    fitPetCardRemarks(carousel);
    window.requestAnimationFrame(() => fitPetCardRemarks(carousel));
    document.fonts?.ready.then(() => fitPetCardRemarks(carousel));
  };
  const showMessage = (message) => {
    const toast = document.querySelector('.home-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 3000);
  };

  renderPets();

  // Saves a chosen photo with its pet and updates that pet card immediately.
  carousel.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-pet-photo]');
    const file = input?.files?.[0];
    if (!input || !file) return;
    try {
      const photo = await petPhotoDataUrl(file);
      const updatedPets = loadPetProfiles().map((pet) => pet.id === input.dataset.petPhoto ? { ...pet, photo } : pet);
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const pet = updatedPets.find((item) => item.id === input.dataset.petPhoto);
        const savedPet = await saveCloudPet(pet, authData.user.id);
        const cloudPets = updatedPets.map((item) => item.id === pet.id ? savedPet : item);
        savePets(cloudPets);
        renderPets();
        return;
      }
      savePets(updatedPets);
      renderPets();
    } catch (error) {
      console.error('Pet photo could not be saved:', error);
      showMessage('That photo could not be saved. Please try again.');
    }
  });

}

// Saves a new or edited Pet Profile and its removable remark chips in browser storage.
function setupPetProfileForm() {
  const form = document.querySelector('[data-pet-profile-form]');
  if (!form) return;
  const remarksList = form.querySelector('[data-remarks-list]');
  const remarkInput = form.querySelector('[data-remark-draft]');
  const photoInput = form.querySelector('[data-pet-profile-photo]');
  const cropDialog = form.querySelector('[data-photo-crop-dialog]');
  const cropViewport = form.querySelector('[data-photo-crop-viewport]');
  const cropImage = form.querySelector('[data-photo-crop-image]');
  const cropZoom = form.querySelector('[data-photo-crop-zoom]');
  const vaccinationInput = form.querySelector('[data-vaccination-upload]');
  const vaccinationList = form.querySelector('[data-vaccination-list]');
  const breedInput = form.querySelector('[data-breed-input]');
  const breedListbox = form.querySelector('[data-breed-listbox]');
  const photoPreview = form.querySelector('[data-pet-profile-preview]');
  const feedback = form.querySelector('.form-feedback');
  const deleteDialog = form.querySelector('[data-pet-delete-dialog]');
  const petReturnContext = new URLSearchParams(window.location.hash.split('?')[1] || '').get('from') || 'home';
  const petReturnTo = petReturnContext === 'profile' ? '#profile' : petReturnContext === 'grooming' ? '#grooming' : petReturnContext === 'hotel' ? '#hotel' : '#home';
  const initialRemarks = [...remarksList.querySelectorAll('[data-remark-value]')].map((chip) => chip.dataset.remarkValue);
  let remarks = initialRemarks;
  let uploadedPhoto = '';
  let cropSourceImage = null;
  let cropObjectUrl = '';
  let cropLayout = null;
  let vaccinationCards = (() => {
    try {
      const savedPets = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
      const existingPet = savedPets.find((pet) => pet.id === form.dataset.petId);
      return Array.isArray(existingPet?.vaccinationCards) ? existingPet.vaccinationCards : [];
    } catch { return []; }
  })();
  const birthMonth = form.querySelector('[data-birth-month]');
  const birthDay = form.querySelector('[data-birth-day]');
  const birthYear = form.querySelector('[data-birth-year]');
  const birthDateValue = form.querySelector('[data-birth-date-value]');
  let activeBreedOption = -1;
  const visibleBreedOptions = () => [...breedListbox.querySelectorAll('[data-breed-option]')].filter((option) => !option.hidden);
  const closeBreedOptions = () => {
    breedListbox.hidden = true;
    breedInput.setAttribute('aria-expanded', 'false');
    breedInput.removeAttribute('aria-activedescendant');
    activeBreedOption = -1;
  };
  const filterBreedOptions = () => {
    const query = breedInput.value.trim().toLocaleLowerCase();
    let matches = 0;
    breedListbox.querySelectorAll('[data-breed-option]').forEach((option) => {
      option.hidden = !option.dataset.breedOption.toLocaleLowerCase().includes(query);
      if (!option.hidden) matches += 1;
      option.setAttribute('aria-selected', 'false');
    });
    activeBreedOption = -1;
    breedInput.removeAttribute('aria-activedescendant');
    breedListbox.hidden = matches === 0;
    breedInput.setAttribute('aria-expanded', String(matches > 0));
  };
  const selectBreedOption = (option) => {
    if (!option) return;
    breedInput.value = option.dataset.breedOption;
    breedInput.focus();
    closeBreedOptions();
  };
  breedInput.addEventListener('focus', filterBreedOptions);
  breedInput.addEventListener('input', filterBreedOptions);
  breedInput.addEventListener('blur', () => window.setTimeout(closeBreedOptions, 180));
  breedInput.addEventListener('keydown', (event) => {
    const options = visibleBreedOptions();
    if (event.key === 'Escape') { closeBreedOptions(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (breedListbox.hidden) filterBreedOptions();
      const refreshedOptions = visibleBreedOptions();
      if (!refreshedOptions.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeBreedOption = activeBreedOption < 0
        ? (direction > 0 ? 0 : refreshedOptions.length - 1)
        : (activeBreedOption + direction + refreshedOptions.length) % refreshedOptions.length;
      refreshedOptions.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeBreedOption)));
      const active = refreshedOptions[activeBreedOption];
      breedInput.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !breedListbox.hidden && activeBreedOption >= 0) {
      event.preventDefault();
      selectBreedOption(options[activeBreedOption]);
    }
  });
  breedListbox.addEventListener('click', (event) => {
    const option = event.target.closest('[data-breed-option]');
    if (option) selectBreedOption(option);
  });
  const syncBirthDate = () => {
    const month = birthMonth.value;
    const day = birthDay.value;
    const year = birthYear.value;
    birthDateValue.value = month && day && year ? `${year}-${month}-${day}` : '';
  };
  const updateBirthDays = () => {
    const previousDay = Number(birthDay.value);
    const month = Number(birthMonth.value);
    const year = Number(birthYear.value) || 2000;
    const dayCount = month ? new Date(year, month, 0).getDate() : 31;
    const selectedDay = previousDay ? Math.min(previousDay, dayCount) : 0;
    birthDay.replaceChildren(new Option('Day', ''));
    for (let day = 1; day <= dayCount; day += 1) {
      const value = String(day).padStart(2, '0');
      birthDay.add(new Option(value, value, false, Number(value) === selectedDay));
    }
    syncBirthDate();
  };
  birthMonth.addEventListener('change', updateBirthDays);
  birthYear.addEventListener('change', updateBirthDays);
  birthDay.addEventListener('change', syncBirthDate);

  // Keeps the vaccination document list current and lets an owner remove an uploaded card.
  const renderVaccinationCards = () => {
    vaccinationList.replaceChildren();
    if (!vaccinationCards.length) {
      const empty = document.createElement('li');
      empty.className = 'pet-vaccination-empty';
      empty.textContent = 'No vaccination cards uploaded.';
      vaccinationList.append(empty);
      return;
    }
    vaccinationCards.forEach((card, index) => {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = card.data;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = card.name;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.removeVaccinationCard = String(index);
      removeButton.setAttribute('aria-label', `Remove ${card.name}`);
      removeButton.textContent = '×';
      row.append(link, removeButton);
      vaccinationList.append(row);
    });
  };

  // Renders each remark with an X control that removes it before the profile is saved.
  const renderRemarks = () => {
    remarksList.replaceChildren();
    remarks.forEach((remark, index) => {
      const chip = document.createElement('span');
      chip.className = 'pet-remark-chip';
      chip.dataset.remarkValue = remark;
      chip.append(document.createTextNode(remark));
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.removeRemark = String(index);
      removeButton.setAttribute('aria-label', `Delete remark: ${remark}`);
      removeButton.textContent = '×';
      chip.append(removeButton);
      remarksList.append(chip);
    });
  };
  const addRemark = () => {
    const remark = remarkInput.value.trim();
    if (!remark) { remarkInput.focus(); return; }
    remarks.push(remark);
    remarkInput.value = '';
    renderRemarks();
  };

  form.querySelector('[data-add-remark]')?.addEventListener('click', addRemark);
  remarkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addRemark(); }
  });
  remarksList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-remark]');
    if (!removeButton) return;
    remarks.splice(Number(removeButton.dataset.removeRemark), 1);
    renderRemarks();
  });
  vaccinationList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-vaccination-card]');
    if (!removeButton) return;
    vaccinationCards.splice(Number(removeButton.dataset.removeVaccinationCard), 1);
    renderVaccinationCards();
  });
  vaccinationInput.addEventListener('change', async () => {
    const files = Array.from(vaccinationInput.files || []);
    if (vaccinationCards.length + files.length > 3) {
      feedback.textContent = 'You can add up to 3 vaccination card files.';
      feedback.classList.add('visible');
      vaccinationInput.value = '';
      return;
    }
    const existingDocumentBytes = vaccinationCards.reduce((total, card) => total + Math.ceil((card.data?.length || 0) * 0.75), 0);
    if (existingDocumentBytes + files.reduce((total, file) => total + file.size, 0) > 2.5 * 1024 * 1024) {
      feedback.textContent = 'Vaccination card uploads have a combined 2.5 MB limit. Remove a file or choose smaller files.';
      feedback.classList.add('visible');
      vaccinationInput.value = '';
      return;
    }
    try {
      for (const file of files) {
        if (file.size > 1.5 * 1024 * 1024) throw new Error(`${file.name} is larger than 1.5 MB.`);
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isImage && !isPdf) throw new Error(`${file.name} is not an image or PDF.`);
        const data = isImage ? await petPhotoDataUrl(file) : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
          reader.readAsDataURL(file);
        });
        vaccinationCards.push({ name: file.name, type: isImage ? 'image/jpeg' : 'application/pdf', data });
      }
      feedback.textContent = '';
      feedback.classList.remove('visible');
      renderVaccinationCards();
    } catch (error) {
      feedback.textContent = error.message || 'That file could not be uploaded.';
      feedback.classList.add('visible');
      renderVaccinationCards();
    } finally {
      vaccinationInput.value = '';
    }
  });
  // Opens a circular cropper so owners can reposition and zoom their pet photo before saving it.
  const clampCropPosition = () => {
    if (!cropLayout) return;
    cropLayout.left = Math.min(0, Math.max(cropLayout.size - cropLayout.width, cropLayout.left));
    cropLayout.top = Math.min(0, Math.max(cropLayout.size - cropLayout.height, cropLayout.top));
    cropImage.style.width = `${cropLayout.width}px`;
    cropImage.style.height = `${cropLayout.height}px`;
    cropImage.style.left = `${cropLayout.left}px`;
    cropImage.style.top = `${cropLayout.top}px`;
  };
  const closeCropper = () => {
    cropSourceImage = null;
    cropImage.removeAttribute('src');
    photoInput.value = '';
    if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
    cropObjectUrl = '';
    cropLayout = null;
  };
  const openCropper = async (file) => {
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    closeCropper();
    cropObjectUrl = URL.createObjectURL(file);
    cropImage.src = cropObjectUrl;
    await cropImage.decode();
    cropSourceImage = cropImage;
    cropDialog.showModal();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const size = cropViewport.getBoundingClientRect().width || Math.min(window.innerWidth * 0.72, 300);
    if (!size) throw new Error('The photo adjustment area could not be opened. Please try again.');
    const scale = Math.max(size / cropImage.naturalWidth, size / cropImage.naturalHeight);
    cropLayout = {
      size,
      baseWidth: cropImage.naturalWidth * scale,
      baseHeight: cropImage.naturalHeight * scale,
      width: cropImage.naturalWidth * scale,
      height: cropImage.naturalHeight * scale,
    };
    cropLayout.left = (size - cropLayout.width) / 2;
    cropLayout.top = (size - cropLayout.height) / 2;
    cropZoom.value = '1';
    clampCropPosition();
  };
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      await openCropper(file);
      feedback.textContent = '';
      feedback.classList.remove('visible');
    } catch (error) {
      if (cropDialog.open) cropDialog.close();
      feedback.textContent = error.message || 'That photo could not be loaded. Please choose another image.';
      feedback.classList.add('visible');
      photoInput.value = '';
    }
  });
  cropZoom.addEventListener('input', () => {
    if (!cropLayout) return;
    const centerX = cropLayout.left + cropLayout.width / 2;
    const centerY = cropLayout.top + cropLayout.height / 2;
    const zoom = Number(cropZoom.value);
    cropLayout.width = cropLayout.baseWidth * zoom;
    cropLayout.height = cropLayout.baseHeight * zoom;
    cropLayout.left = centerX - cropLayout.width / 2;
    cropLayout.top = centerY - cropLayout.height / 2;
    clampCropPosition();
  });
  cropViewport.addEventListener('pointerdown', (event) => {
    if (!cropLayout) return;
    cropViewport.setPointerCapture(event.pointerId);
    cropViewport.dataset.dragX = String(event.clientX);
    cropViewport.dataset.dragY = String(event.clientY);
  });
  cropViewport.addEventListener('pointermove', (event) => {
    if (!cropLayout || !cropViewport.hasPointerCapture(event.pointerId)) return;
    const previousX = Number(cropViewport.dataset.dragX);
    const previousY = Number(cropViewport.dataset.dragY);
    cropLayout.left += event.clientX - previousX;
    cropLayout.top += event.clientY - previousY;
    cropViewport.dataset.dragX = String(event.clientX);
    cropViewport.dataset.dragY = String(event.clientY);
    clampCropPosition();
  });
  cropViewport.addEventListener('keydown', (event) => {
    if (!cropLayout) return;
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') cropLayout.left -= step;
    else if (event.key === 'ArrowRight') cropLayout.left += step;
    else if (event.key === 'ArrowUp') cropLayout.top -= step;
    else if (event.key === 'ArrowDown') cropLayout.top += step;
    else return;
    event.preventDefault();
    clampCropPosition();
  });
  form.querySelector('[data-cancel-photo-crop]')?.addEventListener('click', () => cropDialog.close());
  form.querySelector('[data-use-photo-crop]')?.addEventListener('click', () => {
    if (!cropSourceImage || !cropLayout) return;
    try {
      const scale = cropLayout.width / cropSourceImage.naturalWidth;
      const sourceX = -cropLayout.left / scale;
      const sourceY = -cropLayout.top / scale;
      const sourceSize = cropLayout.size / scale;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      canvas.getContext('2d').drawImage(cropSourceImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
      uploadedPhoto = canvas.toDataURL('image/jpeg', 0.88);
      photoPreview.src = uploadedPhoto;
      form.querySelector('.pet-profile-photo').classList.add('has-photo');
      form.querySelector('.pet-photo-prompt').textContent = 'Change Photo';
      photoInput.value = '';
      cropDialog.close();
    } catch {
      feedback.textContent = 'That photo could not be cropped. Please choose another image.';
      feedback.classList.add('visible');
    }
  });
  cropDialog.addEventListener('close', closeCropper);
  form.querySelector('[data-open-delete-confirm]')?.addEventListener('click', () => deleteDialog?.showModal());
  form.querySelector('[data-cancel-delete]')?.addEventListener('click', () => deleteDialog?.close());
  form.querySelector('[data-confirm-delete]')?.addEventListener('click', async () => {
    const petId = form.dataset.petId;
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      try {
        await deleteCloudPet(petId, authData.user.id);
      } catch (error) {
        feedback.textContent = `Could not delete this pet profile: ${friendlyAuthError(error)}`;
        feedback.classList.add('visible');
        return;
      }
    }
    let savedPets = [];
    try {
      const storedPets = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
      savedPets = Array.isArray(storedPets) ? storedPets : [];
    } catch { savedPets = []; }
    localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(savedPets.filter((pet) => pet.id !== petId)));
    deleteDialog.close();
    window.location.hash = petReturnTo;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const birthParts = [birthMonth.value, birthDay.value, birthYear.value];
    if (birthParts.some(Boolean) && !birthParts.every(Boolean)) {
      feedback.textContent = 'Choose the month, day, and year, or leave Birth Date blank.';
      feedback.classList.add('visible');
      [birthMonth, birthDay, birthYear].find((field) => !field.value)?.focus();
      return;
    }
    const savedPets = loadPetProfiles();
    const currentId = form.dataset.petId;
    const petId = currentId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(currentId) ? currentId : crypto.randomUUID();
    const existingPet = savedPets.find((pet) => pet.id === petId) || {};
    const pet = {
      ...existingPet,
      id: petId,
      ownerId: existingPet.ownerId || getCustomerRecordId(JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}')),
      ownerEmail: existingPet.ownerEmail || JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').email || '',
      ownerPhone: existingPet.ownerPhone || JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').phone || '',
      name: form.elements.name.value.trim(),
      breed: form.elements.breed.value.trim(),
      sex: form.elements.sex.value,
      birthDate: form.elements.birthDate.value,
      neutered: form.elements.neutered.value,
      weight: form.elements.weight.value,
      colour: existingPet.colour || '',
      photo: uploadedPhoto || existingPet.photo || '',
      photoPath: existingPet.photoPath || '',
      vaccinationCards,
      vaccinationValidUntil: existingPet.vaccinationValidUntil || '',
      remarks,
    };
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      try {
        const savedPet = await saveCloudPet(pet, authData.user.id);
        const updatedPets = existingPet.id ? savedPets.map((item) => item.id === currentId ? savedPet : item) : [...savedPets, savedPet];
        localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(updatedPets));
      } catch (error) {
        feedback.textContent = `Could not save this pet profile: ${friendlyAuthError(error)}`;
        feedback.classList.add('visible');
        return;
      }
    } else {
      const updatedPets = existingPet.id ? savedPets.map((item) => item.id === currentId ? pet : item) : [...savedPets, pet];
      localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(updatedPets));
    }
    window.location.hash = petReturnTo;
  });
}

// Wires customer Marketplace search, product variants, cart, checkout, and order tracking.
function setupMarketplaceInteractions() {
  const toast = (message) => {
    const target = document.querySelector('.home-toast');
    if (!target) return;
    target.textContent = message;
    target.classList.add('visible');
    window.setTimeout(() => target.classList.remove('visible'), 2600);
  };
  // Saves and removes customer favourite products across catalog, product detail, and favourites views.
  document.querySelectorAll('[data-toggle-favorite]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const productId = button.dataset.toggleFavorite;
    const favoriteIds = loadMarketplaceFavorites();
    const isSaved = favoriteIds.includes(productId);
    const updatedFavorites = isSaved ? favoriteIds.filter((id) => id !== productId) : [...favoriteIds, productId];
    localStorage.setItem(marketplaceFavoritesKey, JSON.stringify(updatedFavorites));
    if (window.location.hash.split('?')[0] === '#favourites') { render(); return; }
    document.querySelectorAll('[data-toggle-favorite]').forEach((toggle) => {
      if (toggle.dataset.toggleFavorite !== productId) return;
      const saved = !isSaved;
      const productName = loadMarketplaceProducts().find((product) => product.id === productId)?.name || 'product';
      toggle.setAttribute('aria-pressed', String(saved));
      toggle.setAttribute('aria-label', `${saved ? 'Remove' : 'Add'} ${productName} ${saved ? 'from' : 'to'} favourites`);
      const image = toggle.querySelector('img');
      if (image) image.src = `Image/Icon/${saved ? 'Icon-16.png' : 'Icon-15.png'}`;
    });
    toast(isSaved ? 'Removed from your favourites.' : 'Saved to your favourites.');
  }));
  document.querySelectorAll('[data-favorite-repurchase]').forEach((button) => button.addEventListener('click', () => {
    const product = loadMarketplaceProducts().find((item) => item.id === button.dataset.favoriteRepurchase && !item.hidden && !item.frozenByAdmin);
    const variant = product?.variants.find((item) => !item.frozen && Number(item.stock) > 0);
    if (!variant) return;
    const cart = loadMarketplaceCart();
    const existing = cart.find((item) => item.productId === product.id && item.variantId === variant.id);
    if (existing) existing.quantity = Math.min(variant.stock, Number(existing.quantity) + 1);
    else cart.push({ productId: product.id, variantId: variant.id, quantity: 1 });
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    window.location.hash = '#cart';
  }));
  const productGrid = document.querySelector('[data-market-product-grid]');
  if (productGrid) {
    let category = document.querySelector('[data-marketplace-category].selected')?.dataset.marketplaceCategory || 'All';
    let query = '';
    const filter = () => {
      let count = 0;
      productGrid.querySelectorAll('[data-market-product]').forEach((card) => {
        card.hidden = !((category === 'All' || card.dataset.category === category) && card.dataset.searchIndex.includes(query));
        if (!card.hidden) count += 1;
      });
      document.querySelector('[data-market-results]').textContent = `${count} product${count === 1 ? '' : 's'}`;
      let empty = productGrid.querySelector('.market-empty');
      if (!count && !empty) { empty = document.createElement('p'); empty.className = 'market-empty'; empty.textContent = 'No products match this search. Try another category.'; productGrid.append(empty); }
      else if (count && empty) empty.remove();
    };
    document.querySelectorAll('[data-marketplace-category]').forEach((button) => button.addEventListener('click', () => {
      category = button.dataset.marketplaceCategory;
      document.querySelectorAll('[data-marketplace-category]').forEach((item) => item.classList.toggle('selected', item === button));
      filter();
    }));
    document.querySelector('[data-market-search]')?.addEventListener('submit', (event) => event.preventDefault());
    document.querySelector('[data-market-search] input')?.addEventListener('input', (event) => { query = event.currentTarget.value.trim().toLowerCase(); filter(); });
    filter();
  }

  const variantSelect = document.querySelector('[data-product-variant]');
  const supplierCard = document.querySelector('[data-marketplace-supplier-profile]');
  let supplierProfilesByName = new Map();
  const updateSupplierCard = (supplierName) => {
    if (!supplierCard) return;
    const name = String(supplierName || '').trim();
    supplierCard.dataset.marketplaceSupplierProfile = name;
    if (supplierCard instanceof HTMLAnchorElement) supplierCard.href = `#seller?name=${encodeURIComponent(name)}`;
    supplierCard.querySelector('[data-marketplace-supplier-name]').textContent = name || 'Furgo Marketplace';
    const supplier = supplierProfilesByName.get(name.toLocaleLowerCase());
    const image = supplierCard.querySelector('[data-marketplace-supplier-photo]');
    image.alt = `${name || 'Supplier'} profile photo`;
    image.src = supplier?.avatar_path
      ? supabase.storage.from('supplier-profile-photos').getPublicUrl(supplier.avatar_path).data.publicUrl
      : 'Image/Icon/Supplier%20Profile%20Picture.png';
  };
  if (supplierCard) {
    updateSupplierCard(supplierCard.dataset.marketplaceSupplierProfile);
    void supabase.rpc('get_marketplace_supplier_profiles').then(({ data, error }) => {
      if (error) throw error;
      supplierProfilesByName = new Map((data || []).map((supplier) => [String(supplier.supplier_name || '').toLocaleLowerCase(), supplier]));
      updateSupplierCard(supplierCard.dataset.marketplaceSupplierProfile);
    }).catch((error) => console.warn('Marketplace supplier profiles could not load:', error));
  }
  const updateVariant = () => {
    if (!variantSelect) return;
    const option = variantSelect.selectedOptions[0];
    document.querySelector('[data-pdp-price]').textContent = `MYR ${Number(option.dataset.price).toFixed(2)}`;
    document.querySelector('[data-pdp-stock]').textContent = `${Number(option.dataset.stock)} in stock`;
    const quantity = document.querySelector('[data-product-quantity]');
    quantity.max = option.dataset.stock;
    quantity.value = '1';
    document.querySelector('[data-add-to-cart]').disabled = Number(option.dataset.stock) < 1;
    updateSupplierCard(option.dataset.supplier);
  };
  variantSelect?.addEventListener('change', updateVariant);
  document.querySelectorAll('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => {
    const image = document.querySelector('[data-pdp-image]');
    if (image && button.dataset.imageSrc) {
      image.src = button.dataset.imageSrc;
      image.alt = `${document.querySelector('[data-pdp-visual]')?.ariaLabel || 'Product'} image ${Number(button.dataset.galleryImage) + 1}`;
    }
    document.querySelectorAll('[data-gallery-image]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  document.querySelectorAll('[data-gallery-step]').forEach((button) => button.addEventListener('click', () => {
    const dots = [...document.querySelectorAll('[data-gallery-image]')];
    if (dots.length < 2) return;
    const currentIndex = Math.max(0, dots.findIndex((dot) => dot.classList.contains('selected')));
    const nextIndex = (currentIndex + Number(button.dataset.galleryStep) + dots.length) % dots.length;
    dots[nextIndex].click();
  }));
  document.querySelector('[data-add-to-cart]')?.addEventListener('click', (event) => {
    const productId = event.currentTarget.dataset.addToCart;
    const variantId = variantSelect.value;
    const quantity = Math.max(1, Number(document.querySelector('[data-product-quantity]').value) || 1);
    const variant = loadMarketplaceProducts().find((product) => product.id === productId)?.variants.find((item) => item.id === variantId);
    if (!variant || variant.frozen || variant.stock < quantity) { toast('That quantity is not currently available.'); return; }
    const cart = loadMarketplaceCart();
    const existing = cart.find((item) => item.productId === productId && item.variantId === variantId);
    if (existing) existing.quantity = Math.min(variant.stock, Number(existing.quantity) + quantity);
    else cart.push({ productId, variantId, quantity });
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    window.location.hash = '#cart';
  });
  document.querySelectorAll('[data-cart-quantity]').forEach((button) => button.addEventListener('click', () => {
    const cart = loadMarketplaceCart();
    const item = cart[Number(button.dataset.cartQuantity)];
    const line = item && marketplaceLine(item);
    if (!line) return;
    item.quantity = Math.max(1, Math.min(line.variant.stock, Number(item.quantity) + Number(button.dataset.delta)));
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    render();
  }));
  document.querySelectorAll('[data-remove-cart-item]').forEach((button) => button.addEventListener('click', () => {
    const cart = loadMarketplaceCart();
    cart.splice(Number(button.dataset.removeCartItem), 1);
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    render();
  }));

  const form = document.querySelector('[data-market-checkout]');
  if (form) {
    const addressSelect = form.querySelector('[data-saved-address]');
    const manualAddress = form.querySelector('[data-manual-address]');
    const transferUpload = form.querySelector('[data-transfer-upload]');
    const lines = loadMarketplaceCart().map((item) => marketplaceLine(item)).filter(Boolean);
    const subtotal = lines.reduce((sum, item) => sum + item.total, 0);
    const offerSettings = loadMarketplaceOfferSettings();
    const furgoVouchers = Array.isArray(offerSettings.furgoVouchers) ? offerSettings.furgoVouchers : [offerSettings.voucher].filter(Boolean);
    const freeShippingMinimum = Number(offerSettings.freeShippingMinimum) || 0;
    const shipping = subtotal >= freeShippingMinimum ? 0 : Number(offerSettings.deliveryFee) || 0;
    const discountRow = form.querySelector('[data-checkout-discount]');
    const shippingDiscountRow = form.querySelector('[data-checkout-shipping-discount]');
    const shopVoucherTarget = form.querySelector('[data-marketplace-shop-vouchers]');
    const shopVoucherFeedback = form.querySelector('[data-shop-voucher-feedback]');
    let shopVouchers = [];
    let appliedShopVoucher = null;
    let appliedFurgoVoucher = null;
    const allocateCents = (amount, weights) => {
      const cents = Math.max(0, Math.round(Number(amount || 0) * 100));
      const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
      let assigned = 0;
      return weights.map((weight, index) => {
        const share = index === weights.length - 1
          ? cents - assigned
          : weightTotal ? Math.floor(cents * Math.max(0, Number(weight) || 0) / weightTotal) : Math.floor(cents / weights.length);
        assigned += share;
        return share / 100;
      });
    };
    const lineTotals = lines.map((line) => Math.max(0, Number(line.total) || 0));
    const allocatedShippingBase = allocateCents(shipping, lineTotals);
    const lineMatchesSupplier = (line, supplierName) => String(line.variant.supplierId || line.variant.supplier || '').trim().toLowerCase() === String(supplierName || '').trim().toLowerCase();
    const shopEligibleSubtotal = (voucher) => lines.reduce((sum, line) => sum + (lineMatchesSupplier(line, voucher.supplier_name) ? Number(line.total) || 0 : 0), 0);
    const currentFurgoDiscount = () => Number(form.dataset.furgoDiscount || 0);
    const currentFurgoShippingDiscount = () => form.dataset.furgoFreeShipping === 'true' ? shipping : 0;
    const currentShopDiscount = () => {
      if (!appliedShopVoucher || appliedShopVoucher.discount_type === 'free_shipping') return 0;
      const eligible = shopEligibleSubtotal(appliedShopVoucher);
      if (eligible < Number(appliedShopVoucher.minimum_spend || 0)) return 0;
      const raw = appliedShopVoucher.discount_type === 'percent' ? eligible * Number(appliedShopVoucher.discount_value) / 100 : Number(appliedShopVoucher.discount_value);
      const furgoCents = Math.max(0, Math.round(currentFurgoDiscount() * 100));
      let allocatedFurgoCents = 0;
      let eligibleFurgoCents = 0;
      lines.forEach((line, index) => {
        const share = index === lines.length - 1
          ? furgoCents - allocatedFurgoCents
          : subtotal ? Math.floor(furgoCents * (Number(line.total) || 0) / subtotal) : Math.floor(furgoCents / lines.length);
        allocatedFurgoCents += share;
        if (lineMatchesSupplier(line, appliedShopVoucher.supplier_name)) eligibleFurgoCents += share;
      });
      const remainingEligible = Math.max(0, eligible - eligibleFurgoCents / 100);
      return Math.min(eligible, Math.max(0, subtotal - currentFurgoDiscount()), remainingEligible, Math.round(raw * 100) / 100);
    };
    const currentShopShippingDiscount = () => {
      if (!appliedShopVoucher || appliedShopVoucher.discount_type !== 'free_shipping' || form.dataset.furgoFreeShipping === 'true') return 0;
      if (shopEligibleSubtotal(appliedShopVoucher) < Number(appliedShopVoucher.minimum_spend || 0)) return 0;
      return allocatedShippingBase.reduce((sum, amount, index) => sum + (lineMatchesSupplier(lines[index], appliedShopVoucher.supplier_name) ? amount : 0), 0);
    };
    const updateTotals = () => {
      const discount = Math.min(subtotal, currentFurgoDiscount() + currentShopDiscount());
      const shippingDiscount = Math.min(shipping, currentFurgoShippingDiscount() + currentShopShippingDiscount());
      form.dataset.discount = String(discount);
      form.dataset.shippingDiscount = String(shippingDiscount);
      const payableShipping = Math.max(0, shipping - shippingDiscount);
      form.querySelector('[data-checkout-shipping]').textContent = payableShipping ? `MYR ${payableShipping.toFixed(2)}` : 'Free';
      discountRow.hidden = discount <= 0;
      discountRow.querySelector('b').textContent = `− MYR ${discount.toFixed(2)}`;
      shippingDiscountRow.hidden = shippingDiscount <= 0;
      shippingDiscountRow.querySelector('b').textContent = `− MYR ${shippingDiscount.toFixed(2)}`;
      form.querySelector('[data-checkout-total]').textContent = `MYR ${Math.max(0, subtotal + shipping - discount - shippingDiscount).toFixed(2)}`;
      if (appliedShopVoucher && shopVoucherFeedback) {
        const eligible = shopEligibleSubtotal(appliedShopVoucher);
        shopVoucherFeedback.textContent = eligible < Number(appliedShopVoucher.minimum_spend || 0)
          ? `${appliedShopVoucher.code} needs MYR ${Number(appliedShopVoucher.minimum_spend).toFixed(2)} of ${appliedShopVoucher.supplier_name} products.`
          : `${appliedShopVoucher.code} from ${appliedShopVoucher.supplier_name} applied.`;
        shopVoucherFeedback.className = `market-coupon-feedback ${eligible < Number(appliedShopVoucher.minimum_spend || 0) ? 'error' : 'success'}`;
      }
    };
    const updateAddressFields = () => {
      const saved = addressSelect && addressSelect.value !== 'manual';
      manualAddress.hidden = Boolean(saved);
      manualAddress.querySelectorAll('input').forEach((input) => { input.disabled = Boolean(saved); input.required = !saved && input.name !== 'saveAddress'; });
    };
    const updateTransferField = () => {
      const transfer = form.elements.payment.value === 'bank-transfer';
      transferUpload.hidden = !transfer;
      transferUpload.querySelector('input').required = transfer;
    };
    addressSelect?.addEventListener('change', updateAddressFields);
    form.querySelectorAll('[name="payment"]').forEach((input) => input.addEventListener('change', updateTransferField));
    updateAddressFields();
    updateTransferField();
    updateTotals();
    if (shopVoucherTarget) {
      void supabase.rpc('get_marketplace_shop_vouchers').then(({ data, error }) => {
        if (error) throw error;
        shopVouchers = data || [];
        shopVoucherTarget.innerHTML = shopVouchers.length ? shopVouchers.map((voucher) => {
          const expiry = voucher.expires_at ? ` · Expires ${new Date(`${voucher.expires_at}T00:00:00`).toLocaleDateString()}` : '';
          const discountLabel = voucher.discount_type === 'free_shipping' ? 'Free shipping' : voucher.discount_type === 'percent' ? `${Number(voucher.discount_value)}% off` : `MYR ${Number(voucher.discount_value).toFixed(2)} off`;
          return `<article class="market-shop-voucher-card"><div><span>${escapeHTML(voucher.supplier_name)}</span><strong>${escapeHTML(voucher.code)}</strong><small>${escapeHTML(discountLabel)}${Number(voucher.minimum_spend) ? ` · Min. MYR ${Number(voucher.minimum_spend).toFixed(2)}` : ''}${escapeHTML(expiry)}</small></div><button type="button" data-apply-shop-voucher="${escapeHTML(voucher.id)}">${appliedShopVoucher?.id === voucher.id ? 'Applied' : 'Apply'}</button></article>`;
        }).join('') : '<p class="market-checkout-note">No active Shop Vouchers are available right now.</p>';
      }).catch((error) => { shopVoucherTarget.innerHTML = `<p class="market-checkout-note">Shop Vouchers could not be loaded: ${escapeHTML(error.message || 'Please try again later.')}</p>`; });
      shopVoucherTarget.addEventListener('click', (event) => {
        const button = event.target.closest('[data-apply-shop-voucher]');
        if (!button) return;
        const voucher = shopVouchers.find((entry) => entry.id === button.dataset.applyShopVoucher);
        if (!voucher) return;
        if (appliedShopVoucher?.id === voucher.id) {
          appliedShopVoucher = null;
          shopVoucherFeedback.textContent = `${voucher.code} removed.`;
          shopVoucherFeedback.className = 'market-coupon-feedback';
          shopVoucherTarget.querySelectorAll('[data-apply-shop-voucher]').forEach((item) => { item.textContent = 'Apply'; });
          updateTotals();
          return;
        }
        const eligible = shopEligibleSubtotal(voucher);
        if (eligible < Number(voucher.minimum_spend || 0)) {
          appliedShopVoucher = null;
          shopVoucherFeedback.textContent = `Add more products from ${voucher.supplier_name} to meet the MYR ${Number(voucher.minimum_spend).toFixed(2)} minimum spend.`;
          shopVoucherFeedback.className = 'market-coupon-feedback error';
        } else {
          appliedShopVoucher = voucher;
          shopVoucherFeedback.textContent = `${voucher.code} from ${voucher.supplier_name} applied.`;
          shopVoucherFeedback.className = 'market-coupon-feedback success';
        }
        shopVoucherTarget.querySelectorAll('[data-apply-shop-voucher]').forEach((item) => { item.textContent = appliedShopVoucher?.id === item.dataset.applyShopVoucher ? 'Applied' : 'Apply'; });
        updateTotals();
      });
    }
    form.querySelector('[data-apply-coupon]')?.addEventListener('click', () => {
      const code = form.querySelector('[data-market-coupon]').value.trim().toUpperCase();
      const message = form.querySelector('[data-coupon-feedback]');
      const matchingVoucher = furgoVouchers.find((voucher) => voucher.enabled && String(voucher.code || '').trim().toUpperCase() === code);
      const minimumSpend = Number(matchingVoucher?.minimumSpend) || 0;
      if (matchingVoucher && subtotal >= minimumSpend) {
        appliedFurgoVoucher = matchingVoucher;
        if (matchingVoucher.discountType === 'free_shipping') {
          form.dataset.furgoDiscount = '0';
          form.dataset.furgoFreeShipping = 'true';
          message.textContent = `${matchingVoucher.code} applied. Free shipping added.`;
        } else {
          const rawDiscount = matchingVoucher.discountType === 'percent' ? subtotal * (Number(matchingVoucher.discountValue) / 100) : Number(matchingVoucher.discountValue);
          const discount = Math.min(subtotal, Math.round(rawDiscount * 100) / 100);
          form.dataset.furgoDiscount = String(discount);
          form.dataset.furgoFreeShipping = 'false';
          message.textContent = `${matchingVoucher.code} applied.`;
        }
        message.className = 'market-coupon-feedback success';
      } else {
        appliedFurgoVoucher = null;
        form.dataset.furgoDiscount = '0';
        form.dataset.furgoFreeShipping = 'false';
        message.textContent = matchingVoucher && subtotal < minimumSpend ? `This voucher requires a MYR ${minimumSpend.toFixed(2)} minimum subtotal.` : 'That voucher code is not valid.';
        message.className = 'market-coupon-feedback error';
      }
      updateTotals();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = form.querySelector('.form-feedback');
      if (!form.reportValidity()) return;
      let address;
      if (addressSelect && addressSelect.value !== 'manual') {
        try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(addressSelect.value)]; } catch { address = null; }
      } else address = { name: form.elements.recipient.value.trim(), phone: form.elements.phone.value.trim(), street: form.elements.street.value.trim(), postcode: form.elements.postcode.value.trim(), city: form.elements.city.value.trim(), state: form.elements.state.value.trim() };
      if (!address) { feedback.textContent = 'Choose or enter a delivery address.'; feedback.classList.add('visible'); return; }
      const payment = form.elements.payment.value;
      const discount = Number(form.dataset.discount || 0);
      const furgoDiscount = Math.min(currentFurgoDiscount(), discount);
      const shopDiscount = Math.max(0, discount - furgoDiscount);
      const shippingDiscount = Number(form.dataset.shippingDiscount || 0);
      const furgoShippingDiscount = currentFurgoShippingDiscount();
      const shopShippingDiscount = Math.max(0, shippingDiscount - furgoShippingDiscount);
      const total = Math.max(0, subtotal + shipping - discount - shippingDiscount);
      if (payment === 'wallet') {
        const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
        if (balance < total) {
          feedback.textContent = `Your Furgo Credit balance is MYR ${balance.toFixed(2)}. Add Furgo Credit or choose another payment method.`;
          feedback.classList.add('visible');
          const link = document.createElement('a'); link.href = '#credit?from=checkout'; link.className = 'market-credit-link'; link.textContent = 'Go to My Furgo Credit'; feedback.append(link);
          return;
        }
        localStorage.setItem('furgo-demo-credit-balance', (balance - total).toFixed(2));
      }
      let transferSlip = null;
      if (payment === 'bank-transfer') {
        const file = form.querySelector('[data-transfer-slip]').files?.[0];
        if (!file || file.size > 1.5 * 1024 * 1024) { feedback.textContent = 'Choose a transfer slip up to 1.5 MB.'; feedback.classList.add('visible'); return; }
        transferSlip = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: reader.result }); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
        if (!transferSlip) { feedback.textContent = 'The transfer slip could not be read. Try another file.'; feedback.classList.add('visible'); return; }
      }
      if (form.elements.saveAddress?.checked) {
        const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
        addresses.push({ label: 'Delivery', ...address });
        localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
      }
      const products = loadMarketplaceProducts();
      const allocatedFurgoDiscounts = allocateCents(furgoDiscount, lineTotals);
      const shopWeights = lines.map((line) => appliedShopVoucher && lineMatchesSupplier(line, appliedShopVoucher.supplier_name) ? line.total : 0);
      const allocatedShopDiscounts = allocateCents(shopDiscount, shopWeights);
      const allocatedDiscounts = lineTotals.map((_, index) => Math.min(lineTotals[index], (allocatedFurgoDiscounts[index] || 0) + (allocatedShopDiscounts[index] || 0)));
      const allocatedShipping = allocatedShippingBase.map((amount, index) => {
        if (form.dataset.furgoFreeShipping === 'true') return 0;
        if (appliedShopVoucher?.discount_type === 'free_shipping' && lineMatchesSupplier(lines[index], appliedShopVoucher.supplier_name)) return 0;
        return amount;
      });
      const items = lines.map(({ product, variant, quantity, total: lineTotal }, index) => {
        const allocatedDiscount = allocatedDiscounts[index] || 0;
        const shippingFeeAllocated = allocatedShipping[index] || 0;
        const paidAmount = Math.max(0, Math.round((Number(lineTotal) - allocatedDiscount) * 100) / 100);
        return { lineNumber: index + 1, productId: product.id, variantId: variant.id, name: product.name, category: product.category || 'Uncategorised', nutrition: product.nutrition || '', ingredients: product.ingredients || '', variantLabel: variant.label, supplierId: variant.supplierId || variant.supplier || '', cost: Number(variant.cost) || 0, quantity, unitPrice: variant.price, total: lineTotal, allocatedDiscount, shippingFeeAllocated, paidAmount, refundableAmount: Math.round((paidAmount + shippingFeeAllocated) * 100) / 100 };
      });
      const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      const reference = `FG-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const now = new Date();
      const awaitingOnlinePayment = payment === 'gateway';
      const status = payment === 'bank-transfer' ? 'Pending Payment Verification' : awaitingOnlinePayment ? 'Pending Payment' : 'Paid / Processing';
      const orders = loadMarketplaceOrders();
      if (payment === 'wallet') {
        const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
        transactions.unshift({ label: `Marketplace order ${reference}`, amount: -total, date: new Date().toLocaleDateString() });
        localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
      }
      orders.unshift({ id: `order-${Date.now()}`, userId: profile.id || '', reference, date: now.toLocaleDateString(), createdAt: now.toISOString(), customerEmail: profile.email || '', customerName: profile.name || address.name, customerPhone: profile.phone || address.phone, deliveryPhone: address.phone, address: { name: address.name, phone: address.phone, street: address.street, postcode: address.postcode, city: address.city, state: address.state }, items, subtotal, shipping, shippingDiscount, discount, furgoVoucherDiscount: furgoDiscount, furgoShippingDiscount, furgoVoucherId: appliedFurgoVoucher?.id || '', shopVoucherDiscount: shopDiscount, shopShippingDiscount, shopVoucher: appliedShopVoucher ? { id: appliedShopVoucher.id, code: appliedShopVoucher.code, supplierName: appliedShopVoucher.supplier_name } : null, total, paymentMethod: payment === 'wallet' ? 'Furgo Credit' : payment === 'gateway' ? 'Online Payment' : 'Manual bank transfer', paymentStatus: payment === 'bank-transfer' ? 'Pending Payment Verification' : awaitingOnlinePayment ? 'Pending Payment' : 'Paid', paymentDeadlineAt: awaitingOnlinePayment ? new Date(now.getTime() + 60 * 60 * 1000).toISOString() : '', transferSlip, status, coupon: appliedFurgoVoucher && (furgoDiscount || furgoShippingDiscount) ? String(appliedFurgoVoucher.code || '').toUpperCase() : '', trackingNumber: '', courier: '', trackingUrl: '' });
      localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
      if (!awaitingOnlinePayment) items.forEach((item) => {
        const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
        if (variant) variant.stock = Math.max(0, Number(variant.stock) - item.quantity);
      });
      localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
      localStorage.setItem(marketplaceCartKey, '[]');
      // Return to the Marketplace when a customer opens their new order from checkout.
      window.location.hash = '#orders?from=marketplace';
    });
  }
}

// Handles live product filters and marketplace order fulfillment.
function setupAdminMarketplace() {
  const liveProductFilters = document.querySelector('[data-live-product-filters]');
  if (liveProductFilters) {
    const filterRows = () => {
      const category = liveProductFilters.querySelector('[data-live-filter-trigger="category"]')?.dataset.value || '';
      const supplier = liveProductFilters.querySelector('[data-live-filter-trigger="supplier"]')?.dataset.value || '';
      const listingStatus = liveProductFilters.querySelector('[data-live-filter-trigger="status"]')?.dataset.value || 'all';
      const rows = [...document.querySelectorAll('[data-live-product-row]')];
      let visible = 0;
      rows.forEach((row) => {
        const statusMatches = listingStatus === 'all' || (listingStatus === 'frozen' ? row.dataset.frozen === 'true' : row.dataset.active === 'true');
        const matches = (!category || row.dataset.category === category) && (!supplier || row.dataset.supplier === supplier) && statusMatches;
        row.hidden = !matches;
        const detail = row.nextElementSibling;
        if (detail?.matches('[data-live-product-detail]') && !matches) detail.hidden = true;
        if (matches) visible += 1;
      });
      const empty = document.querySelector('[data-live-product-empty]');
      if (empty) empty.hidden = visible > 0;
    };
    liveProductFilters.addEventListener('click', (event) => {
      const filterTrigger = event.target.closest('[data-live-filter-trigger]');
      const filterChoice = event.target.closest('[data-live-filter-option]');
      const filterMenus = [...liveProductFilters.querySelectorAll('[data-live-filter-menu]')];
      const sortOptions = liveProductFilters.querySelector('[data-live-sort-options]');
      const closeMenus = (except = null) => {
        filterMenus.forEach((menu) => {
          if (menu === except) return;
          menu.querySelector('[data-live-filter-options]')?.setAttribute('hidden', '');
          menu.querySelector('[data-live-filter-trigger]')?.setAttribute('aria-expanded', 'false');
        });
        if (!except) {
          if (sortOptions) sortOptions.hidden = true;
          liveProductFilters.querySelector('[data-live-sort-trigger]')?.setAttribute('aria-expanded', 'false');
        }
      };
      if (filterTrigger && liveProductFilters.contains(filterTrigger)) {
        const menu = filterTrigger.closest('[data-live-filter-menu]');
        const options = menu?.querySelector('[data-live-filter-options]');
        const shouldOpen = Boolean(options?.hidden);
        closeMenus(menu);
        if (sortOptions) sortOptions.hidden = true;
        liveProductFilters.querySelector('[data-live-sort-trigger]')?.setAttribute('aria-expanded', 'false');
        if (options) options.hidden = !shouldOpen;
        filterTrigger.setAttribute('aria-expanded', String(shouldOpen));
        return;
      }
      if (filterChoice && liveProductFilters.contains(filterChoice)) {
        const key = filterChoice.dataset.liveFilterOption;
        const menu = filterChoice.closest('[data-live-filter-menu]');
        const trigger = menu?.querySelector(`[data-live-filter-trigger="${key}"]`);
        if (trigger) {
          trigger.dataset.value = filterChoice.dataset.value || '';
          const label = menu.querySelector(`[data-live-filter-label="${key}"]`);
          if (label) label.textContent = filterChoice.textContent.trim();
          trigger.setAttribute('aria-label', `${trigger.querySelector('small')?.textContent || key} filter: ${filterChoice.textContent.trim()}`);
        }
        menu?.querySelectorAll('[data-live-filter-option]').forEach((option) => {
          option.setAttribute('aria-checked', String(option === filterChoice));
        });
        closeMenus();
        filterRows();
        return;
      }
      const sortTrigger = event.target.closest('[data-live-sort-trigger]');
      if (sortTrigger && sortOptions) {
        const shouldOpen = sortOptions.hidden;
        closeMenus();
        sortOptions.hidden = !shouldOpen;
        sortTrigger.setAttribute('aria-expanded', String(shouldOpen));
        return;
      }
      const sortChoice = event.target.closest('[data-live-sort]');
      if (sortChoice && sortOptions) {
        liveProductFilters.querySelectorAll('[data-live-sort]').forEach((option) => {
          const active = option === sortChoice;
          option.classList.toggle('is-active', active);
          option.setAttribute('aria-checked', String(active));
        });
        sortOptions.hidden = true;
        liveProductFilters.querySelector('[data-live-sort-trigger]')?.setAttribute('aria-expanded', 'false');
        sortRows();
        return;
      }
      closeMenus();
    });
    const sortRows = () => {
      const mode = liveProductFilters.querySelector('[data-live-sort].is-active')?.dataset.liveSort || 'sold-desc';
      const body = document.querySelector('[data-live-product-rows]');
      if (!body) return;
      const rows = [...body.querySelectorAll('[data-live-product-row]')];
      const compare = mode === 'price-asc' ? (a, b) => Number(a.dataset.price) - Number(b.dataset.price)
        : mode === 'price-desc' ? (a, b) => Number(b.dataset.price) - Number(a.dataset.price)
          : mode === 'name-asc' ? (a, b) => a.dataset.name.localeCompare(b.dataset.name)
            : mode === 'supplier-asc' ? (a, b) => a.dataset.supplier.localeCompare(b.dataset.supplier)
              : (a, b) => Number(b.dataset.sold) - Number(a.dataset.sold);
      rows.sort((a, b) => compare(a, b) || a.dataset.name.localeCompare(b.dataset.name));
      rows.forEach((row) => {
        const detail = row.nextElementSibling;
        body.append(row);
        if (detail?.matches('[data-live-product-detail]')) body.append(detail);
      });
    };
    sortRows();
    filterRows();
    document.querySelector('[data-live-product-rows]')?.addEventListener('click', async (event) => {
      const detailsButton = event.target.closest('[data-live-product-details]');
      if (detailsButton) {
        const detail = document.querySelector(`[data-live-product-detail="${CSS.escape(detailsButton.dataset.liveProductDetails)}"]`);
        if (detail) {
          detail.hidden = !detail.hidden;
          detailsButton.setAttribute('aria-expanded', String(!detail.hidden));
        }
        return;
      }
      const freezeButton = event.target.closest('[data-toggle-live-product]');
      if (!freezeButton) return;
      const products = loadMarketplaceProducts();
      const product = products.find((entry) => entry.id === freezeButton.dataset.toggleLiveProduct);
      if (!product) return;
      freezeButton.disabled = true;
      const frozen = !Boolean(product.frozenByAdmin);
      const { data, error } = await supabase.rpc('set_marketplace_product_frozen', {
        p_product_id: product.id,
        p_is_frozen: frozen,
      });
      if (error) {
        freezeButton.disabled = false;
        toastAdmin(error.message || 'Product status could not be updated. Apply migration 0047 and try again.');
        return;
      }
      if (Array.isArray(data)) cacheSyncedRecords(marketplaceProductsKey, data);
      toastAdmin(frozen ? 'Product frozen. The supplier was notified.' : 'Product is live again. The supplier was notified.');
      render();
    });
    document.querySelector('[data-live-product-rows]')?.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-live-product-extra-details]');
      if (!form) return;
      event.preventDefault();
      const products = loadMarketplaceProducts();
      const product = products.find((entry) => entry.id === form.dataset.liveProductExtraDetails);
      if (!product) return;
      product.suitableBreeds = form.elements.suitableBreeds.value.trim();
      product.issues = form.elements.issues.value.trim();
      product.extraDescription = form.elements.extraDescription.value.trim();
      product.petTypes = form.elements.petTypes.value.trim();
      product.ingredients = form.elements.ingredients.value.trim();
      product.nutrition = form.elements.nutrition.value.trim();
      localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
      render();
      toastAdmin('Product details saved.');
    });
  }
  const returnCasesTarget = document.querySelector('[data-marketplace-return-cases]');
  const loadReturnCases = async () => {
    if (!returnCasesTarget) return;
    const { data, error } = await supabase.rpc('get_marketplace_item_return_review_queue');
    if (error) {
      returnCasesTarget.innerHTML = `<p class="admin-market-empty">Return review is unavailable. Apply migration 0035 to enable this workflow. (${escapeHTML(error.message || 'Supabase function unavailable')})</p>`;
      return;
    }
    const cases = data || [];
    returnCasesTarget.innerHTML = cases.length ? `<div class="admin-market-return-case-list">${cases.map((itemReturn) => `<article class="admin-market-return-case"><header><strong>${escapeHTML(itemReturn.productName || 'Product')} · ${escapeHTML(itemReturn.variantLabel || 'Variant')} × ${Number(itemReturn.quantity) || 1}</strong><span>${escapeHTML(itemReturn.status)}</span></header><p>Order ${escapeHTML(itemReturn.orderReference || itemReturn.orderId)} · Supplier ${escapeHTML(itemReturn.supplierName || '—')}</p><p>Customer: ${escapeHTML(itemReturn.customerName || '—')} · ${escapeHTML(itemReturn.customerPhone || '—')}</p><p>Reason: ${escapeHTML(itemReturn.reason || '—')}</p>${itemReturn.supplierResponse ? `<p>Supplier response: ${escapeHTML(itemReturn.supplierResponse)}</p>` : ''}<b>Refund: MYR ${Number(itemReturn.refundAmount || 0).toFixed(2)} (product ${Number(itemReturn.paidAmount || 0).toFixed(2)} + shipping ${Number(itemReturn.shippingRefund || 0).toFixed(2)})</b>${itemReturn.photoPath ? `<a href="#" data-marketplace-return-photo="${escapeHTML(itemReturn.photoPath)}" target="_blank" rel="noopener noreferrer">View customer photo</a>` : ''}<div class="admin-market-return-actions">${itemReturn.status === 'Admin Review' ? `<button type="button" class="button button-primary" data-admin-return-action="approve" data-return-id="${escapeHTML(itemReturn.returnId)}">Approve Return</button><button type="button" class="button button-light" data-admin-return-action="reject" data-return-id="${escapeHTML(itemReturn.returnId)}">Reject Return</button>` : `<button type="button" class="button button-light" data-admin-return-action="refunded" data-return-id="${escapeHTML(itemReturn.returnId)}">Mark Refund Sent</button><small>Use only after the refund has been sent through the original payment method.</small>`}</div></article>`).join('')}</div>` : '<p class="admin-market-empty">No return cases need Manager or Director review.</p>';
    for (const link of returnCasesTarget.querySelectorAll('[data-marketplace-return-photo]')) {
      const { data: signed } = await supabase.storage.from('marketplace-return-evidence').createSignedUrl(link.dataset.marketplaceReturnPhoto, 300);
      if (signed?.signedUrl) link.href = signed.signedUrl;
      else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
    }
  };
  if (returnCasesTarget) void loadReturnCases();
  returnCasesTarget?.addEventListener('marketplace-return-change', () => { void loadReturnCases(); });
  returnCasesTarget?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-admin-return-action]');
    if (!button) return;
    const action = button.dataset.adminReturnAction;
    const reason = action === 'reject' ? window.prompt('Enter the reason for rejecting this return request.') : '';
    if (action === 'reject' && !reason?.trim()) return;
    if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve this return? The supplier will coordinate the return shipment.' : 'Confirm that the refund has already been sent through the original payment method?')) return;
    button.disabled = true;
    const result = action === 'refunded'
      ? await supabase.rpc('complete_marketplace_item_refund', { p_return_id: button.dataset.returnId })
      : await supabase.rpc('review_marketplace_item_return', { p_return_id: button.dataset.returnId, p_decision: action, p_reason: reason || '' });
    if (result.error) {
      button.disabled = false;
      toastAdmin(result.error.message || 'The return request could not be updated.');
      return;
    }
    toastAdmin(action === 'approve' ? 'Return approved. The supplier can coordinate its return.' : action === 'reject' ? 'Return rejected with the recorded reason.' : 'Refund marked as sent.');
    await loadReturnCases();
  });
  const orderList = document.querySelector('.admin-market-order-list');
  if (orderList) {
    for (const link of orderList.querySelectorAll('[data-marketplace-return-photo]')) {
      void supabase.storage.from('marketplace-return-evidence').createSignedUrl(link.dataset.marketplaceReturnPhoto, 300).then(({ data }) => {
        if (data?.signedUrl) link.href = data.signedUrl;
        else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
      });
    }
    orderList.addEventListener('click', async (event) => {
      const cancellationRefundButton = event.target.closest('[data-marketplace-cancellation-refund]');
      if (cancellationRefundButton) {
        if (!window.confirm('Confirm that the refund has already been sent through the original payment method?')) return;
        cancellationRefundButton.disabled = true;
        const { error } = await supabase.rpc('complete_marketplace_order_cancellation_refund', {
          p_order_id: cancellationRefundButton.dataset.marketplaceCancellationRefund,
        });
        if (error) {
          cancellationRefundButton.disabled = false;
          toastAdmin(error.message || 'The cancellation refund could not be updated.');
          return;
        }
        toastAdmin('Cancellation refund marked as sent.');
        window.setTimeout(() => window.dispatchEvent(new Event('hashchange')), 400);
        return;
      }
      const button = event.target.closest('[data-admin-return-action]');
      if (!button) return;
      const action = button.dataset.adminReturnAction;
      const reason = action === 'reject' ? window.prompt('Enter the reason for rejecting this return request.') : '';
      if (action === 'reject' && !reason?.trim()) return;
      if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve the return request? The supplier will coordinate the return shipment.' : 'Confirm that the refund has already been sent through the original payment method?')) return;
      button.disabled = true;
      const result = action === 'refunded'
        ? await supabase.rpc('complete_marketplace_item_refund', { p_return_id: button.dataset.returnId })
        : await supabase.rpc('review_marketplace_item_return', { p_return_id: button.dataset.returnId, p_decision: action, p_reason: reason || '' });
      if (result.error) {
        button.disabled = false;
        toastAdmin(result.error.message || 'The return request could not be updated.');
        return;
      }
      toastAdmin(action === 'approve' ? 'Return approved. The supplier can coordinate its return.' : action === 'reject' ? 'Return rejected with the recorded reason.' : 'Refund marked as sent.');
      window.setTimeout(() => window.dispatchEvent(new Event('hashchange')), 400);
    });
  }
  // Shipping and Furgo Voucher settings save independently so each can be managed on its own.
  const saveMarketplaceSettings = (settings, feedback, successMessage, actionKey) => {
    try {
      localStorage.setItem(marketplaceOfferSettingsKey, JSON.stringify(settings));
      void recordAdminAction('marketplace_offer_settings_updated', 'marketplace', actionKey);
      feedback.textContent = successMessage;
      feedback.className = 'admin-market-offer-feedback success';
    } catch {
      feedback.textContent = 'Settings could not be saved in this browser.';
      feedback.className = 'admin-market-offer-feedback error';
    }
  };
  const shippingForm = document.querySelector('[data-admin-market-shipping]');
  shippingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!shippingForm.reportValidity()) return;
    const fields = shippingForm.elements;
    const settings = loadMarketplaceOfferSettings();
    settings.freeShippingMinimum = Number(fields.freeShippingMinimum.value);
    settings.deliveryFee = Number(fields.deliveryFee.value);
    saveMarketplaceSettings(settings, shippingForm.querySelector('[data-market-shipping-feedback]'), 'Shipping settings saved and applied to customer checkout.', 'shipping');
  });
  const offerForm = document.querySelector('[data-admin-market-offer]');
  const voucherStatusLabel = offerForm?.querySelector('[data-admin-voucher-status]');
  const voucherList = document.querySelector('[data-admin-furgo-voucher-list]');
  const voucherSubmit = offerForm?.querySelector('[data-admin-voucher-submit]');
  const cancelVoucherEdit = offerForm?.querySelector('[data-cancel-furgo-voucher-edit]');
  const updateAdminVoucherTypeFields = () => {
    if (!offerForm) return;
    const freeShipping = offerForm.elements.discountType.value === 'free_shipping';
    const valueField = offerForm.querySelector('[data-admin-discount-value-field]');
    if (valueField) valueField.hidden = freeShipping;
    offerForm.elements.discountValue.required = !freeShipping;
    offerForm.elements.discountValue.disabled = freeShipping;
  };
  offerForm?.elements.discountType.addEventListener('change', updateAdminVoucherTypeFields);
  updateAdminVoucherTypeFields();
  const updateAdminVoucherStatus = () => {
    if (!voucherStatusLabel || !offerForm) return;
    const active = offerForm.elements.voucherEnabled.checked;
    voucherStatusLabel.textContent = `Status: ${active ? 'Active' : 'Not Active'}`;
    voucherStatusLabel.classList.toggle('is-active', active);
    voucherStatusLabel.classList.toggle('is-inactive', !active);
  };
  offerForm?.elements.voucherEnabled.addEventListener('change', updateAdminVoucherStatus);
  const resetFurgoVoucherForm = (newVoucher = false) => {
    if (!offerForm) return;
    offerForm.reset();
    offerForm.elements.voucherId.value = '';
    if (newVoucher) {
      offerForm.elements.voucherCode.value = '';
      offerForm.elements.discountValue.value = '';
      offerForm.elements.minimumSpend.value = '0';
      offerForm.elements.voucherEnabled.checked = true;
    }
    if (voucherSubmit) voucherSubmit.textContent = newVoucher ? 'Create Voucher' : 'Save Voucher & Offer';
    if (cancelVoucherEdit) cancelVoucherEdit.hidden = true;
    const feedback = offerForm.querySelector('[data-market-offer-feedback]');
    feedback.textContent = '';
    feedback.className = 'admin-market-offer-feedback';
    updateAdminVoucherTypeFields();
    updateAdminVoucherStatus();
  };
  const renderAdminFurgoVouchers = () => {
    if (!voucherList) return;
    const vouchers = loadMarketplaceOfferSettings().furgoVouchers || [];
    voucherList.innerHTML = vouchers.length ? vouchers.map((voucher) => {
      const value = voucher.discountType === 'free_shipping' ? 'Free shipping' : voucher.discountType === 'percent' ? `${Number(voucher.discountValue)}% off` : `MYR ${Number(voucher.discountValue || 0).toFixed(2)} off`;
      const active = Boolean(voucher.enabled);
      return `<article class="admin-furgo-voucher-card"><div class="admin-furgo-voucher-details"><strong>${escapeHTML(voucher.code || 'Voucher')}</strong><span>${value}${Number(voucher.minimumSpend) ? ` · Minimum spend MYR ${Number(voucher.minimumSpend).toFixed(2)}` : ''}</span></div><span class="admin-voucher-status-pill ${active ? 'is-active' : 'is-inactive'}">${active ? 'Active' : 'Not Active'}</span><div class="admin-furgo-voucher-actions"><button type="button" class="button button-light" data-edit-furgo-voucher="${escapeHTML(voucher.id || '')}">Edit</button><button type="button" class="button button-light" data-delete-furgo-voucher="${escapeHTML(voucher.id || '')}">Delete</button></div></article>`;
    }).join('') : '<p class="market-checkout-note">No Furgo vouchers have been saved.</p>';
  };
  document.querySelector('[data-add-furgo-voucher]')?.addEventListener('click', () => {
    resetFurgoVoucherForm(true);
    offerForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    offerForm?.elements.voucherCode.focus();
  });
  cancelVoucherEdit?.addEventListener('click', () => resetFurgoVoucherForm());
  voucherList?.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-furgo-voucher]');
    const deleteButton = event.target.closest('[data-delete-furgo-voucher]');
    if (editButton && offerForm) {
      const voucher = (loadMarketplaceOfferSettings().furgoVouchers || []).find((entry) => String(entry.id) === editButton.dataset.editFurgoVoucher);
      if (!voucher) return;
      offerForm.elements.voucherId.value = voucher.id || '';
      offerForm.elements.voucherCode.value = voucher.code || '';
      offerForm.elements.discountType.value = voucher.discountType || 'percent';
      offerForm.elements.discountValue.value = voucher.discountValue ?? '';
      offerForm.elements.minimumSpend.value = Number(voucher.minimumSpend) || 0;
      offerForm.elements.voucherEnabled.checked = Boolean(voucher.enabled);
      if (voucherSubmit) voucherSubmit.textContent = 'Update Voucher';
      if (cancelVoucherEdit) cancelVoucherEdit.hidden = false;
      offerForm.querySelector('[data-market-offer-feedback]').textContent = '';
      updateAdminVoucherTypeFields();
      updateAdminVoucherStatus();
      offerForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (deleteButton) {
      const settings = loadMarketplaceOfferSettings();
      const voucher = (settings.furgoVouchers || []).find((entry) => String(entry.id) === deleteButton.dataset.deleteFurgoVoucher);
      if (!voucher || !window.confirm(`Delete the ${voucher.code} Furgo voucher?`)) return;
      settings.furgoVouchers = settings.furgoVouchers.filter((entry) => String(entry.id) !== String(voucher.id));
      settings.voucher = settings.furgoVouchers[0] || { ...settings.voucher, enabled: false };
      localStorage.setItem(marketplaceOfferSettingsKey, JSON.stringify(settings));
      void recordAdminAction('marketplace_furgo_voucher_deleted', 'marketplace', voucher.id || voucher.code);
      if (offerForm?.elements.voucherId.value === String(voucher.id || '')) resetFurgoVoucherForm(true);
      renderAdminFurgoVouchers();
    }
  });
  offerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!offerForm.reportValidity()) return;
    const fields = offerForm.elements;
    const discountType = fields.discountType.value;
    const discountValue = fields.discountType.value === 'free_shipping' ? null : Number(fields.discountValue.value);
    const feedback = offerForm.querySelector('[data-market-offer-feedback]');
    if (discountType === 'percent' && discountValue > 100) {
      feedback.textContent = 'Percentage discounts cannot exceed 100%.';
      feedback.className = 'admin-market-offer-feedback error';
      return;
    }
    const voucherCode = fields.voucherCode.value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(voucherCode)) {
      feedback.textContent = 'Use letters, numbers, hyphens, or underscores for the voucher code.';
      feedback.className = 'admin-market-offer-feedback error';
      return;
    }
    const settings = loadMarketplaceOfferSettings();
    const editingId = fields.voucherId.value;
    const vouchers = [...(settings.furgoVouchers || [])];
    const duplicate = vouchers.some((entry) => entry.id !== editingId && String(entry.code || '').toUpperCase() === voucherCode);
    if (duplicate) {
      feedback.textContent = 'That voucher code is already in use. Choose a unique code.';
      feedback.className = 'admin-market-offer-feedback error';
      return;
    }
    const voucher = { id: editingId || (globalThis.crypto?.randomUUID?.() || `furgo-voucher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), code: voucherCode, discountType, discountValue, minimumSpend: Number(fields.minimumSpend.value), enabled: fields.voucherEnabled.checked };
    if (editingId) {
      const index = vouchers.findIndex((entry) => String(entry.id) === editingId);
      if (index < 0) return;
      vouchers[index] = voucher;
    } else vouchers.unshift(voucher);
    settings.furgoVouchers = vouchers;
    settings.offerTitle = fields.offerTitle.value.trim();
    settings.offerDescription = fields.offerDescription.value.trim();
    settings.voucher = vouchers[0] || { ...settings.voucher, enabled: false };
    saveMarketplaceSettings(settings, feedback, editingId ? 'Furgo voucher updated.' : 'Furgo voucher created.', 'furgo-voucher');
    renderAdminFurgoVouchers();
    resetFurgoVoucherForm(true);
    fields.offerTitle.value = settings.offerTitle;
    fields.offerDescription.value = settings.offerDescription;
    feedback.textContent = editingId ? 'Furgo voucher updated.' : 'Furgo voucher created.';
    feedback.className = 'admin-market-offer-feedback success';
  });
  renderAdminFurgoVouchers();

  document.querySelectorAll('[data-copy-supplier-order]').forEach((button) => button.addEventListener('click', async () => {
    const order = loadMarketplaceOrders().find((item) => item.id === button.dataset.copySupplierOrder);
    if (!order) return;
    const products = loadMarketplaceProducts();
    const supplierName = button.dataset.copySupplierName || '';
    const supplierProducts = [];
    order.items.forEach((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const variant = product?.variants.find((entry) => entry.id === item.variantId);
      const itemSupplier = item.supplierId || variant?.supplierId || variant?.supplier || 'Unassigned';
      if (String(itemSupplier).toLowerCase() === supplierName.toLowerCase()) supplierProducts.push(item);
    });
    if (!supplierProducts.length) { toastAdmin('No order products were found for this supplier.'); return; }
    const recipientName = order.address?.name || order.customerName || 'Not provided';
    const recipientPhone = order.deliveryPhone || order.address?.phone || order.customerPhone || 'Not provided';
    const recipientAddress = [order.address?.street, order.address?.postcode, order.address?.city, order.address?.state].filter(Boolean).join(', ') || 'Not provided';
    const orderDate = order.date || (order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-MY') : 'Not provided');
    const text = [
      'FURGO ORDER DETAILS',
      `Supplier : ${supplierName}`,
      `Order No: ${order.reference || order.id || 'Not provided'}`,
      `Date: ${orderDate}`,
      '',
      `Recipient Name: ${recipientName}`,
      `Recipient Phone: ${recipientPhone}`,
      `Recipient Address: ${recipientAddress}`,
      'Products:',
      ...supplierProducts.map((item) => `- ${item.name} — ${item.variantLabel} × ${item.quantity}`),
    ].join('\n');
    try { await navigator.clipboard.writeText(text); toastAdmin('Supplier order details copied.'); }
    catch { const field = document.createElement('textarea'); field.value = text; document.body.append(field); field.select(); document.execCommand('copy'); field.remove(); toastAdmin('Supplier order details copied.'); }
  }));
  document.querySelectorAll('[data-tracking-form]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === form.dataset.trackingForm);
    if (!order) return;
    if (order.paymentStatus !== 'Paid') { toastAdmin('Verify the payment before shipping this order.'); return; }
    order.courier = form.elements.courier.value.trim();
    order.trackingNumber = form.elements.trackingNumber.value.trim();
    order.trackingUrl = form.elements.trackingUrl.value.trim();
    order.status = 'Shipped';
    order.shippedAt = new Date().toISOString();
    localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
    void recordAdminAction('order_status_updated', 'marketplace_order', order.reference || order.id, { status: order.status });
    render();
  }));
  document.querySelectorAll('[data-complete-order]').forEach((button) => button.addEventListener('click', () => {
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === button.dataset.completeOrder);
    if (order) { order.status = 'Delivered'; order.deliveredAt = new Date().toISOString(); localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders)); void recordAdminAction('order_status_updated', 'marketplace_order', order.reference || order.id, { status: order.status }); render(); }
  }));
  document.querySelectorAll('[data-approve-payment], [data-reject-payment]').forEach((button) => button.addEventListener('click', () => {
    const orders = loadMarketplaceOrders();
    const orderId = button.dataset.approvePayment || button.dataset.rejectPayment;
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    if (button.hasAttribute('data-reject-payment')) {
      const reason = window.prompt('Enter a reason for rejecting this transfer:');
      if (!reason?.trim()) return;
      order.paymentStatus = 'Payment Rejected'; order.status = 'Payment Rejected'; order.paymentRejectionReason = reason.trim();
      order.inventoryRestoredAt = new Date().toISOString();
      const products = loadMarketplaceProducts();
      order.items.forEach((item) => { const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId); if (variant) variant.stock = Number(variant.stock) + Number(item.quantity); });
      localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
    } else {
      if (order.inventoryRestoredAt) {
        const products = loadMarketplaceProducts();
        order.items.forEach((item) => { const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId); if (variant) variant.stock = Math.max(0, Number(variant.stock) - Number(item.quantity)); });
        localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
        delete order.inventoryRestoredAt;
      }
      order.paymentStatus = 'Paid'; order.status = 'Paid / Processing';
    }
    localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
    void recordAdminAction(button.hasAttribute('data-reject-payment') ? 'marketplace_payment_rejected' : 'marketplace_payment_approved', 'marketplace_order', order.reference || order.id, { status: order.paymentStatus });
    render();
  }));
  document.querySelectorAll('[data-order-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || file.size > 1.5 * 1024 * 1024) { toastAdmin('Choose a receipt no larger than 1.5 MB.'); return; }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toastAdmin('Upload a receipt image or PDF.'); return; }
    const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(''); reader.readAsDataURL(file); });
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === input.dataset.orderReceipt);
    if (order && data) { order.receipt = { name: file.name, data }; localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders)); void recordAdminAction('receipt_uploaded', 'marketplace_order', order.reference || order.id); render(); }
  }));
  document.querySelector('[data-export-market-csv]')?.addEventListener('click', () => {
    const supplier = document.querySelector('[data-market-export-supplier]').value;
    const products = loadMarketplaceProducts();
    const rows = [['Order Reference', 'Date', 'Status', 'Customer', 'Phone', 'Address', 'Supplier', 'Item', 'Variant', 'Quantity', 'Retail Unit Price', 'Cost Unit Price']];
    loadMarketplaceOrders().forEach((order) => order.items.forEach((item) => {
      const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
      const supplierName = variant?.supplierId || variant?.supplier || item.supplierId || 'Unassigned';
      if (!supplier || supplier === supplierName) rows.push([order.reference, order.date, order.status, order.customerName, order.deliveryPhone || order.address?.phone || order.customerPhone, `${order.address?.street || ''}, ${order.address?.postcode || ''} ${order.address?.city || ''}, ${order.address?.state || ''}`, supplierName, item.name, item.variantLabel, item.quantity, item.unitPrice, variant?.cost ?? item.cost ?? 0]);
    }));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `furgo-marketplace-orders${supplier ? `-${supplier.replace(/[^a-z0-9]+/gi, '-')}` : ''}.csv`; link.click(); URL.revokeObjectURL(url);
  });
  document.querySelector('[data-print-market-slips]')?.addEventListener('click', () => {
    const supplier = document.querySelector('[data-market-export-supplier]').value;
    document.querySelectorAll('.admin-market-order').forEach((card) => {
      const matchingItems = [...card.querySelectorAll('[data-supplier]')].filter((item) => !supplier || item.dataset.supplier === supplier);
      card.classList.toggle('market-print-hidden', Boolean(supplier) && !matchingItems.length);
      card.querySelectorAll('[data-supplier]').forEach((item) => item.classList.toggle('market-print-hidden', Boolean(supplier) && item.dataset.supplier !== supplier));
    });
    window.addEventListener('afterprint', () => document.querySelectorAll('.market-print-hidden').forEach((item) => item.classList.remove('market-print-hidden')), { once: true });
    window.print();
  });
}

// Supplier users can submit products and see only order lines assigned to their supplier.
function setupMarketplaceSupplierPortal() {
  setupPortalNotifications();
  const supplierProfile = (() => { try { return JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { return {}; } })();
  const supplierProfileForm = document.querySelector('[data-supplier-profile-form]');
  if (supplierProfileForm) {
    const photoInput = supplierProfileForm.querySelector('[data-supplier-profile-photo]');
    const photoPreview = supplierProfileForm.querySelector('[data-supplier-profile-preview]');
    const cropDialog = supplierProfileForm.querySelector('[data-supplier-crop-dialog]');
    const cropViewport = supplierProfileForm.querySelector('[data-supplier-crop-viewport]');
    const cropImage = supplierProfileForm.querySelector('[data-supplier-crop-image]');
    const cropZoom = supplierProfileForm.querySelector('[data-supplier-crop-zoom]');
    const feedback = supplierProfileForm.querySelector('[data-supplier-profile-feedback]');
    let cropObjectUrl = '';
    let cropLayout = null;
    let cropSourceImage = null;
    let pendingPhoto = '';
    const setProfileFeedback = (message, isError = false) => {
      feedback.textContent = message;
      feedback.classList.toggle('is-error', isError);
    };
    const clampCropPosition = () => {
      if (!cropLayout) return;
      cropLayout.left = Math.min(0, Math.max(cropLayout.size - cropLayout.width, cropLayout.left));
      cropLayout.top = Math.min(0, Math.max(cropLayout.size - cropLayout.height, cropLayout.top));
      cropImage.style.width = `${cropLayout.width}px`;
      cropImage.style.height = `${cropLayout.height}px`;
      cropImage.style.left = `${cropLayout.left}px`;
      cropImage.style.top = `${cropLayout.top}px`;
    };
    const closeCropper = () => {
      cropSourceImage = null;
      cropImage.removeAttribute('src');
      if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
      cropObjectUrl = '';
      cropLayout = null;
      photoInput.value = '';
    };
    const openCropper = async (file) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
      cropObjectUrl = URL.createObjectURL(file);
      cropImage.src = cropObjectUrl;
      await cropImage.decode();
      cropSourceImage = cropImage;
      cropDialog.showModal();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const size = cropViewport.getBoundingClientRect().width || Math.min(window.innerWidth * 0.72, 300);
      const scale = Math.max(size / cropImage.naturalWidth, size / cropImage.naturalHeight);
      cropLayout = { size, baseWidth: cropImage.naturalWidth * scale, baseHeight: cropImage.naturalHeight * scale };
      cropLayout.width = cropLayout.baseWidth;
      cropLayout.height = cropLayout.baseHeight;
      cropLayout.left = (size - cropLayout.width) / 2;
      cropLayout.top = (size - cropLayout.height) / 2;
      cropZoom.value = '1';
      clampCropPosition();
    };
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      try { await openCropper(file); setProfileFeedback(''); }
      catch (error) { if (cropDialog.open) cropDialog.close(); setProfileFeedback(error.message || 'That photo could not be loaded.', true); }
    });
    cropZoom.addEventListener('input', () => {
      if (!cropLayout) return;
      const centerX = cropLayout.left + cropLayout.width / 2;
      const centerY = cropLayout.top + cropLayout.height / 2;
      const zoom = Number(cropZoom.value);
      cropLayout.width = cropLayout.baseWidth * zoom;
      cropLayout.height = cropLayout.baseHeight * zoom;
      cropLayout.left = centerX - cropLayout.width / 2;
      cropLayout.top = centerY - cropLayout.height / 2;
      clampCropPosition();
    });
    cropViewport.addEventListener('pointerdown', (event) => {
      if (!cropLayout) return;
      cropViewport.setPointerCapture(event.pointerId);
      cropViewport.dataset.dragX = String(event.clientX);
      cropViewport.dataset.dragY = String(event.clientY);
    });
    cropViewport.addEventListener('pointermove', (event) => {
      if (!cropLayout || !cropViewport.hasPointerCapture(event.pointerId)) return;
      cropLayout.left += event.clientX - Number(cropViewport.dataset.dragX);
      cropLayout.top += event.clientY - Number(cropViewport.dataset.dragY);
      cropViewport.dataset.dragX = String(event.clientX);
      cropViewport.dataset.dragY = String(event.clientY);
      clampCropPosition();
    });
    cropViewport.addEventListener('keydown', (event) => {
      if (!cropLayout) return;
      const step = event.shiftKey ? 10 : 2;
      if (event.key === 'ArrowLeft') cropLayout.left -= step;
      else if (event.key === 'ArrowRight') cropLayout.left += step;
      else if (event.key === 'ArrowUp') cropLayout.top -= step;
      else if (event.key === 'ArrowDown') cropLayout.top += step;
      else return;
      event.preventDefault();
      clampCropPosition();
    });
    supplierProfileForm.querySelector('[data-supplier-cancel-crop]').addEventListener('click', () => cropDialog.close());
    supplierProfileForm.querySelector('[data-supplier-use-crop]').addEventListener('click', () => {
      if (!cropSourceImage || !cropLayout) return;
      const scale = cropLayout.width / cropSourceImage.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d').drawImage(cropSourceImage, -cropLayout.left / scale, -cropLayout.top / scale, cropLayout.size / scale, cropLayout.size / scale, 0, 0, 512, 512);
      pendingPhoto = canvas.toDataURL('image/jpeg', 0.88);
      photoPreview.src = pendingPhoto;
      supplierProfileForm.querySelector('.supplier-profile-photo').classList.add('has-photo');
      supplierProfileForm.querySelector('.pet-photo-prompt').textContent = 'Change Photo';
      cropDialog.close();
      setProfileFeedback('Photo ready. Save your profile to apply the change.');
    });
    cropDialog.addEventListener('close', closeCropper);
    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data, error } = await supabase.from('profiles').select('avatar_path,supplier_contact_phone').eq('id', authData.user.id).maybeSingle();
      if (error) { console.warn('Supplier profile details could not load:', error); return; }
      const phoneInput = supplierProfileForm.elements.contactPhone;
      if (phoneInput && data?.supplier_contact_phone) phoneInput.value = data.supplier_contact_phone;
      if (data?.avatar_path) {
        const { data: signed, error: photoError } = await supabase.storage.from('supplier-profile-photos').createSignedUrl(data.avatar_path, 3600);
        if (!photoError && signed?.signedUrl) {
          photoPreview.src = signed.signedUrl;
          supplierProfileForm.querySelector('.supplier-profile-photo').classList.add('has-photo');
          supplierProfileForm.querySelector('.pet-photo-prompt').textContent = 'Change Photo';
        }
      }
    })();
    supplierProfileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supplierProfileForm.reportValidity()) return;
      const saveButton = supplierProfileForm.querySelector('[type="submit"]');
      saveButton.disabled = true;
      setProfileFeedback('Saving profile…');
      let uploadedPath = '';
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('Please sign in again to update your profile.');
        const { data: existing, error: existingError } = await supabase.from('profiles').select('avatar_path').eq('id', authData.user.id).maybeSingle();
        if (existingError) throw existingError;
        if (pendingPhoto) {
          const blob = await (await fetch(pendingPhoto)).blob();
          uploadedPath = `${authData.user.id}/profile-${crypto.randomUUID()}.jpg`;
          const { error: uploadError } = await supabase.storage.from('supplier-profile-photos').upload(uploadedPath, blob, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) throw uploadError;
        }
        const displayName = supplierProfileForm.elements.displayName.value.trim();
        const contactPhone = supplierProfileForm.elements.contactPhone.value.trim();
        const updates = { display_name: displayName, supplier_contact_phone: contactPhone };
        if (uploadedPath) updates.avatar_path = uploadedPath;
        const { error: profileError } = await supabase.from('profiles').update(updates).eq('id', authData.user.id);
        if (profileError) throw profileError;
        const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName } });
        if (metadataError) console.warn('Supplier profile name saved, but Auth metadata could not be refreshed:', metadataError);
        if (uploadedPath && existing?.avatar_path) await supabase.storage.from('supplier-profile-photos').remove([existing.avatar_path]);
        const savedProfile = { ...supplierProfile, name: displayName, supplierContactPhone: contactPhone, ...(uploadedPath ? { avatarPath: uploadedPath } : {}) };
        sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(savedProfile));
        supplierProfile.name = displayName;
        supplierProfile.supplierContactPhone = contactPhone;
        if (uploadedPath) {
          supplierProfile.avatarPath = uploadedPath;
          const { data: signed } = await supabase.storage.from('supplier-profile-photos').createSignedUrl(uploadedPath, 3600);
          if (signed?.signedUrl) photoPreview.src = signed.signedUrl;
        }
        pendingPhoto = '';
        setProfileFeedback('Profile saved.');
      } catch (error) {
        if (uploadedPath) await supabase.storage.from('supplier-profile-photos').remove([uploadedPath]);
        console.error('Supplier profile could not be saved:', error);
        setProfileFeedback(error.message || 'Your profile could not be saved. Please try again.', true);
      } finally { saveButton.disabled = false; }
    });
  }
  const directorNotification = document.querySelector('[data-marketplace-director-notification]');
  if (directorNotification) {
    void supabase.from('marketplace_product_submissions').select('id', { count: 'exact', head: true }).eq('status', 'Pending Review')
      .then(({ count, error }) => {
        if (error) throw error;
        if (!count) { directorNotification.hidden = true; return; }
        directorNotification.hidden = false;
        directorNotification.textContent = String(count);
        directorNotification.setAttribute('aria-label', `${count} supplier product requests need review`);
      }).catch((error) => console.warn('Director Marketplace notification could not load:', error));
  }
  const supplierForm = document.querySelector('[data-marketplace-supplier-product]');
  const supplierEditor = document.querySelector('[data-supplier-editor]');
  const supplierPhotoList = document.querySelector('[data-supplier-photo-list]');
  let supplierEditorImages = [];
  const clearSupplierPhotoPreviews = () => supplierEditorImages.forEach((photo) => {
    if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
  });
  const renderSupplierPhotoList = () => {
    if (!supplierPhotoList) return;
    supplierPhotoList.hidden = supplierEditorImages.length === 0;
    supplierPhotoList.innerHTML = supplierEditorImages.map((photo, index) => {
      const preview = photo.previewUrl?.startsWith('blob:') ? photo.previewUrl : safeMarketplaceImage(photo.url);
      return `<article class="supplier-photo-item"><img src="${escapeHTML(preview || '')}" alt="Product photo ${index + 1}" /><span>${index === 0 ? 'Cover photo' : `Photo ${index + 1}`}</span><label class="supplier-photo-change">Change<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-replace-supplier-photo="${index}" aria-label="Change product photo ${index + 1}" /></label><button type="button" data-remove-supplier-photo="${index}" aria-label="Delete product photo ${index + 1}">Delete</button></article>`;
    }).join('');
  };
  const resetSupplierEditor = () => {
    supplierForm?.reset();
    clearSupplierPhotoPreviews();
    supplierEditorImages = [];
    renderSupplierPhotoList();
    if (supplierForm) {
      supplierForm.elements.productId.value = '';
      supplierForm.elements.variantId.value = '';
      supplierForm.elements.pendingSubmissionId.value = '';
      supplierForm.querySelector('[data-supplier-submit-label]').textContent = 'Submit Product';
      supplierForm.querySelector('[data-supplier-cancel-edit]').textContent = 'Cancel';
    }
    const title = document.querySelector('[data-supplier-form-title]');
    if (title) title.textContent = 'Add a Product';
  };
  document.querySelector('[data-supplier-add-product]')?.addEventListener('click', () => {
    resetSupplierEditor();
    if (supplierEditor) supplierEditor.hidden = false;
    supplierEditor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelectorAll('[data-supplier-tab]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.supplierTab;
    const supplierNavIcons = { home: ['Icon-01.png', 'Icon-02.png'], orders: ['Icon-03.png', 'Icon-04.png'], help: ['Icon-05.png', 'Icon-06.png'], profile: ['Icon-07.png', 'Icon-08.png'] };
    document.querySelectorAll('[data-supplier-section]').forEach((section) => { section.hidden = section.dataset.supplierSection !== target; });
    document.querySelectorAll('[data-supplier-tab]').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      const icons = supplierNavIcons[tab.dataset.supplierTab];
      const image = tab.querySelector('img');
      if (image && icons) image.src = `Image/Icon/${active ? icons[1] : icons[0]}`;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  const supplierVoucherForm = document.querySelector('[data-supplier-voucher-form]');
  const supplierVoucherList = document.querySelector('[data-supplier-voucher-list]');
  const supplierVoucherFeedback = document.querySelector('[data-supplier-voucher-feedback]');
  const setSupplierVoucherFeedback = (message, isError = false) => {
    if (!supplierVoucherFeedback) return;
    supplierVoucherFeedback.textContent = message;
    supplierVoucherFeedback.classList.toggle('is-error', isError);
  };
  const updateSupplierVoucherEnabledLabel = () => {
    if (!supplierVoucherForm) return;
    const label = supplierVoucherForm.querySelector('[data-voucher-enabled-label]');
    if (label) {
      const active = supplierVoucherForm.elements.enabled.checked;
      label.textContent = `Status: ${active ? 'Active' : 'Not Active'}`;
      label.classList.toggle('is-active', active);
      label.classList.toggle('is-inactive', !active);
    }
  };
  const updateSupplierVoucherTypeFields = () => {
    if (!supplierVoucherForm) return;
    const freeShipping = supplierVoucherForm.elements.discountType.value === 'free_shipping';
    const valueField = supplierVoucherForm.querySelector('[data-supplier-discount-value-field]');
    const valueInput = supplierVoucherForm.elements.discountValue;
    if (valueField) valueField.hidden = freeShipping;
    valueInput.required = !freeShipping;
    valueInput.disabled = freeShipping;
  };
  supplierVoucherForm?.elements.discountType.addEventListener('change', updateSupplierVoucherTypeFields);
  updateSupplierVoucherTypeFields();
  supplierVoucherForm?.elements.enabled.addEventListener('change', updateSupplierVoucherEnabledLabel);
  const resetSupplierVoucherForm = () => {
    supplierVoucherForm?.reset();
    if (!supplierVoucherForm) return;
    supplierVoucherForm.elements.voucherId.value = '';
    supplierVoucherForm.elements.minimumSpend.value = '0';
    supplierVoucherForm.elements.enabled.checked = true;
    updateSupplierVoucherEnabledLabel();
    updateSupplierVoucherTypeFields();
    supplierVoucherForm.querySelector('[data-voucher-submit]').textContent = 'Save Voucher';
    supplierVoucherForm.querySelector('[data-voucher-cancel]').hidden = true;
  };
  const loadSupplierVouchers = async () => {
    if (!supplierVoucherList) return [];
    const { data, error } = await supabase.from('marketplace_supplier_vouchers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    supplierVoucherList.innerHTML = data?.length ? data.map((voucher) => {
      const discount = voucher.discount_type === 'free_shipping' ? 'Free shipping' : voucher.discount_type === 'percent' ? `${Number(voucher.discount_value)}% off` : `MYR ${Number(voucher.discount_value).toFixed(2)} off`;
      const expiry = voucher.expires_at ? ` · Expires ${new Date(`${voucher.expires_at}T00:00:00`).toLocaleDateString()}` : '';
      return `<article class="supplier-voucher-card"><div><span class="supplier-voucher-state ${voucher.enabled ? 'is-active' : ''}">${voucher.enabled ? 'Active' : 'Inactive'}</span><h3>${escapeHTML(voucher.code)}</h3><p>${escapeHTML(discount)}${Number(voucher.minimum_spend) ? ` · Minimum spend MYR ${Number(voucher.minimum_spend).toFixed(2)}` : ''}${escapeHTML(expiry)}</p></div><div class="supplier-voucher-actions"><button type="button" data-edit-supplier-voucher="${escapeHTML(voucher.id)}">Edit</button><button type="button" data-delete-supplier-voucher="${escapeHTML(voucher.id)}">Delete</button></div></article>`;
    }).join('') : '<p class="supplier-empty">You have not created any Shop Vouchers yet.</p>';
    supplierVoucherList.dataset.vouchers = JSON.stringify(data || []);
    return data || [];
  };
  supplierVoucherForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = supplierVoucherForm.querySelector('[data-voucher-submit]');
    submit.disabled = true;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error('Sign in to manage your vouchers.');
      const discountType = supplierVoucherForm.elements.discountType.value;
      const discountValue = discountType === 'free_shipping' ? null : Number(supplierVoucherForm.elements.discountValue.value);
      const minimumSpend = Number(supplierVoucherForm.elements.minimumSpend.value || 0);
      if (discountType !== 'free_shipping' && (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percent' && discountValue > 100))) throw new Error('Enter a valid discount (percentage must be 100 or less).');
      if (!Number.isFinite(minimumSpend) || minimumSpend < 0) throw new Error('Minimum spend cannot be negative.');
      const payload = { supplier_user_id: authData.user.id, discount_type: discountType, discount_value: discountValue, minimum_spend: minimumSpend, expires_at: supplierVoucherForm.elements.expiresAt.value || null, enabled: supplierVoucherForm.elements.enabled.checked };
      const voucherId = supplierVoucherForm.elements.voucherId.value;
      const query = voucherId
        ? supabase.from('marketplace_supplier_vouchers').update(payload).eq('id', voucherId)
        : supabase.from('marketplace_supplier_vouchers').insert(payload);
      const { error } = await query;
      if (error) throw error;
      resetSupplierVoucherForm();
      setSupplierVoucherFeedback(voucherId ? 'Voucher updated.' : 'Voucher saved.');
      await loadSupplierVouchers();
    } catch (error) { setSupplierVoucherFeedback(error.message || 'Voucher could not be saved.', true); }
    finally { submit.disabled = false; }
  });
  supplierVoucherForm?.querySelector('[data-voucher-cancel]')?.addEventListener('click', resetSupplierVoucherForm);
  supplierVoucherList?.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-supplier-voucher]');
    const deleteButton = event.target.closest('[data-delete-supplier-voucher]');
    const vouchers = (() => { try { return JSON.parse(supplierVoucherList.dataset.vouchers || '[]'); } catch { return []; } })();
    if (editButton) {
      const voucher = vouchers.find((entry) => entry.id === editButton.dataset.editSupplierVoucher);
      if (!voucher || !supplierVoucherForm) return;
      supplierVoucherForm.elements.voucherId.value = voucher.id;
      supplierVoucherForm.elements.discountType.value = voucher.discount_type;
      updateSupplierVoucherTypeFields();
      supplierVoucherForm.elements.discountValue.value = voucher.discount_value;
      supplierVoucherForm.elements.minimumSpend.value = voucher.minimum_spend;
      supplierVoucherForm.elements.expiresAt.value = voucher.expires_at || '';
      supplierVoucherForm.elements.enabled.checked = voucher.enabled;
      updateSupplierVoucherEnabledLabel();
      supplierVoucherForm.querySelector('[data-voucher-submit]').textContent = 'Update Voucher';
      supplierVoucherForm.querySelector('[data-voucher-cancel]').hidden = false;
      supplierVoucherForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (deleteButton) {
      if (!window.confirm('Delete this Shop Voucher?')) return;
      const { error } = await supabase.from('marketplace_supplier_vouchers').delete().eq('id', deleteButton.dataset.deleteSupplierVoucher);
      if (error) { setSupplierVoucherFeedback(error.message || 'Voucher could not be deleted.', true); return; }
      setSupplierVoucherFeedback('Voucher deleted.');
      try { await loadSupplierVouchers(); } catch (loadError) { setSupplierVoucherFeedback(loadError.message, true); }
    }
  });
  if (supplierVoucherList) void loadSupplierVouchers().catch((error) => { supplierVoucherList.innerHTML = `<p class="supplier-empty">Shop Vouchers could not be loaded: ${escapeHTML(error.message || 'Supabase request failed')}</p>`; });

  let supplierCatalog = [];
  let supplierSubmissions = [];
  let supplierOrderStatusFilter = 'new';
  const applySupplierOrderStatusFilter = () => {
    const ordersTarget = document.querySelector('[data-supplier-orders]');
    if (!ordersTarget) return;
    const cards = [...ordersTarget.querySelectorAll('[data-supplier-order-status]')];
    let visibleCount = 0;
    cards.forEach((card) => {
      const matches = card.dataset.supplierOrderStatus.split(',').includes(supplierOrderStatusFilter);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const empty = ordersTarget.querySelector('[data-supplier-filter-empty]');
    if (cards.length && !visibleCount) {
      const notice = empty || document.createElement('p');
      notice.className = 'supplier-empty';
      notice.dataset.supplierFilterEmpty = '';
      notice.textContent = `No orders in ${({ new: 'New Order', progressing: 'Progressing Order', completed: 'Completed', cancelled: 'Cancelled', returns: 'Return or Refund' })[supplierOrderStatusFilter]}.`;
      if (!empty) ordersTarget.append(notice);
    } else empty?.remove();
    document.querySelectorAll('[data-supplier-order-status-filter]').forEach((button) => {
      const active = button.dataset.supplierOrderStatusFilter === supplierOrderStatusFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  document.querySelector('[data-supplier-order-status-tabs]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-supplier-order-status-filter]');
    if (!button) return;
    supplierOrderStatusFilter = button.dataset.supplierOrderStatusFilter;
    applySupplierOrderStatusFilter();
  });
  const setSupplierFeedback = (message, isError = false) => {
    const feedback = document.querySelector('[data-supplier-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };
  const validateSupplierPhotos = async (files, totalCount = files.length) => {
    if (totalCount > 5) return 'A product can have up to five photos.';
    for (const file of files) {
      if (!file.type.startsWith('image/')) return `${file.name} is not a supported image.`;
      if (file.size > 2 * 1024 * 1024) return `${file.name} is larger than 2 MB.`;
      const imageUrl = URL.createObjectURL(file);
      const dimensions = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve(null);
        image.src = imageUrl;
      });
      URL.revokeObjectURL(imageUrl);
      if (!dimensions) return `${file.name} could not be read as an image.`;
      const { width, height } = dimensions;
      if (width !== height) return `${file.name} must be square (1:1).`;
      if (width < 500 || width > 2000) return `${file.name} must be between 500 × 500 and 2000 × 2000 pixels.`;
    }
    return '';
  };
  supplierForm?.elements.photos.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const files = [...input.files];
    if (!files.length) return;
    const validationError = await validateSupplierPhotos(files, supplierEditorImages.length + files.length);
    input.value = '';
    if (validationError) { setSupplierFeedback(validationError, true); return; }
    supplierEditorImages.push(...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
    renderSupplierPhotoList();
    setSupplierFeedback('Photo added. Save the product to apply photo changes.');
  });
  supplierPhotoList?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-supplier-photo]');
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeSupplierPhoto);
    const [removed] = supplierEditorImages.splice(index, 1);
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    renderSupplierPhotoList();
    setSupplierFeedback('Photo removed. Save the product to apply photo changes.');
  });
  supplierPhotoList?.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-replace-supplier-photo]');
    const file = input?.files?.[0];
    if (!input || !file) return;
    const index = Number(input.dataset.replaceSupplierPhoto);
    const validationError = await validateSupplierPhotos([file], supplierEditorImages.length);
    input.value = '';
    if (validationError) { setSupplierFeedback(validationError, true); return; }
    const previous = supplierEditorImages[index];
    if (previous?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previous.previewUrl);
    supplierEditorImages[index] = { file, previewUrl: URL.createObjectURL(file) };
    renderSupplierPhotoList();
    setSupplierFeedback('Photo changed. Save the product to apply photo changes.');
  });
  const refreshSupplierPortal = async () => {
    const submissionsTarget = document.querySelector('[data-supplier-products]');
    const ordersTarget = document.querySelector('[data-supplier-orders]');
    if (!submissionsTarget && !ordersTarget) return;
    const [submissionsResult, catalogResult, ordersResult] = await Promise.all([
      supabase.from('marketplace_product_submissions').select('*').order('submitted_at', { ascending: false }),
      supabase.rpc('get_marketplace_supplier_catalog'),
      supabase.rpc('get_marketplace_supplier_orders'),
    ]);
    if (submissionsResult.error) throw submissionsResult.error;
    if (catalogResult.error) throw catalogResult.error;
    if (ordersResult.error) throw ordersResult.error;
    supplierSubmissions = submissionsResult.data || [];
    supplierCatalog = catalogResult.data || [];
    const supplierOrders = (ordersResult.data || []).map((row) => row.order_details || row);
    const newOrderCount = supplierOrders.filter((order) => adminOrderStage({ ...order, serviceId: 'marketplace' }) === 'new').length;
    const progressingOrderCount = supplierOrders.filter((order) => adminOrderStage({ ...order, serviceId: 'marketplace' }) === 'progressing').length;
    const newOrderCountTarget = document.querySelector('[data-supplier-new-order-count]');
    const progressingOrderCountTarget = document.querySelector('[data-supplier-progressing-order-count]');
    if (newOrderCountTarget) newOrderCountTarget.textContent = String(newOrderCount);
    if (progressingOrderCountTarget) progressingOrderCountTarget.textContent = String(progressingOrderCount);
    if (submissionsTarget) submissionsTarget.innerHTML = supplierProductRows(supplierCatalog, supplierSubmissions);
    if (ordersTarget) {
      ordersTarget.innerHTML = supplierOrderRows(supplierOrders);
      applySupplierOrderStatusFilter();
      for (const link of ordersTarget.querySelectorAll('[data-marketplace-return-photo]')) {
        const { data } = await supabase.storage.from('marketplace-return-evidence').createSignedUrl(link.dataset.marketplaceReturnPhoto, 300);
        if (data?.signedUrl) link.href = data.signedUrl;
        else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
      }
    }
  };
  const setShipmentFeedback = (message, isError = false) => {
    const feedback = document.querySelector('[data-supplier-shipment-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };
  const setSupplierListFeedback = (message, isError = false) => {
    const feedback = document.querySelector('[data-supplier-list-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };
  supplierForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supplierForm.reportValidity()) return;
    const fields = supplierForm.elements;
    const files = supplierEditorImages.filter((photo) => photo.file).map((photo) => photo.file);
    const photoValidationError = await validateSupplierPhotos(files, supplierEditorImages.length);
    if (photoValidationError) {
      setSupplierFeedback(photoValidationError, true);
      return;
    }
    const submit = supplierForm.querySelector('[type="submit"]');
    submit.disabled = true;
    const editingProductId = fields.productId.value.trim();
    const pendingSubmissionId = fields.pendingSubmissionId.value.trim();
    const action = pendingSubmissionId ? 'pending_edit' : editingProductId ? 'edit' : 'add';
    setSupplierFeedback(action === 'edit' ? 'Saving product details…' : action === 'pending_edit' ? 'Updating pending product request…' : 'Submitting product for Director review…');
    try {
      const submissionId = crypto.randomUUID();
      const existingProduct = supplierCatalog.find((entry) => entry.id === editingProductId);
      const pendingSubmission = supplierSubmissions.find((entry) => entry.id === pendingSubmissionId);
      const pendingProduct = pendingSubmission?.product_data || {};
      const existingVariant = existingProduct?.variants?.find((entry) => entry.id === fields.variantId.value) || existingProduct?.variants?.[0] || pendingProduct.variants?.find((entry) => entry.id === fields.variantId.value) || pendingProduct.variants?.[0];
      const images = [];
      for (const [index, photo] of supplierEditorImages.entries()) {
        if (!photo.file) { images.push(photo.url); continue; }
        const extension = photo.file.type === 'image/jpeg' ? 'jpg' : photo.file.type.split('/')[1];
        const path = `${supplierProfile.id}/${submissionId}/${index + 1}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('marketplace-submissions').upload(path, photo.file, { contentType: photo.file.type, upsert: false });
        if (uploadError) throw uploadError;
        images.push(supabase.storage.from('marketplace-submissions').getPublicUrl(path).data.publicUrl);
      }
      const product = {
        id: editingProductId || pendingProduct.id || `supplier-${submissionId}`,
        name: fields.name.value.trim(),
        category: fields.category.value,
        description: fields.description.value.trim(),
        petTypes: fields.petTypes.value.trim(),
        suitableBreeds: existingProduct?.suitableBreeds || pendingProduct.suitableBreeds || '',
        issues: existingProduct?.issues || pendingProduct.issues || '',
        ingredients: fields.ingredients.value.trim(),
        nutrition: fields.nutrition.value.trim(),
        images,
        hidden: false,
        productCode: existingProduct?.productCode || pendingProduct.productCode || '',
        variants: [{ id: existingVariant?.id || `variant-${submissionId}`, label: fields.variantLabel.value.trim(), price: Number(fields.price.value), stock: Number(fields.stock.value), supplierId: supplierProfile.supplierName, supplier: supplierProfile.supplierName, cost: existingVariant?.cost ?? 0, frozen: Boolean(existingVariant?.frozen) }],
      };
      let feedbackMessage;
      if (action === 'pending_edit') {
        const { error } = await supabase.rpc('update_marketplace_pending_product_request', { p_submission_id: pendingSubmissionId, p_product_data: product });
        if (error) throw error;
        feedbackMessage = 'Product request updated and resubmitted. It is waiting for Director approval.';
      } else if (action === 'edit') {
        const { data, error } = await supabase.rpc('edit_marketplace_supplier_product', { p_product_id: editingProductId, p_product_data: product });
        if (error) throw error;
        feedbackMessage = data?.variant_change_pending
          ? 'Product details saved. Price or variant changes are pending Director approval.'
          : 'Product details saved and are now live in the Marketplace.';
      } else {
        const { error } = await supabase.rpc('submit_marketplace_supplier_product', { p_action: 'add', p_product_id: null, p_product_data: product });
        if (error) throw error;
        feedbackMessage = 'Product submitted. It will appear in the Marketplace after Director approval.';
      }
      supplierForm.reset();
      resetSupplierEditor();
      supplierEditor.hidden = true;
      setSupplierFeedback(feedbackMessage);
      await refreshSupplierPortal();
    } catch (error) {
      console.error('Supplier product submission failed:', error);
      setSupplierFeedback(error.message || 'The product could not be submitted. Please try again.', true);
    } finally { submit.disabled = false; }
  });
  supplierForm?.querySelector('[data-supplier-cancel-edit]')?.addEventListener('click', () => {
    resetSupplierEditor();
    if (supplierEditor) supplierEditor.hidden = true;
  });
  document.querySelector('[data-supplier-products]')?.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-supplier-edit-product]');
    const actionButton = event.target.closest('[data-supplier-product-action]');
    const editRequestButton = event.target.closest('[data-supplier-edit-request]');
    const deleteRequestButton = event.target.closest('[data-supplier-delete-request]');
    if (editRequestButton) {
      const submission = supplierSubmissions.find((entry) => entry.id === editRequestButton.dataset.supplierEditRequest && entry.action === 'add' && ['Pending Review', 'Rejected'].includes(entry.status));
      if (!submission) return;
      const product = submission.product_data || {};
      const variant = product.variants?.[0] || {};
      const fields = supplierForm.elements;
      resetSupplierEditor();
      fields.pendingSubmissionId.value = submission.id;
      fields.name.value = product.name || '';
      fields.category.value = product.category || 'Other';
      fields.description.value = product.description || '';
      fields.petTypes.value = product.petTypes || '';
      fields.ingredients.value = product.ingredients || '';
      fields.nutrition.value = product.nutrition || '';
      fields.price.value = Number(variant.price || 0);
      fields.variantLabel.value = variant.label || '';
      fields.stock.value = Number(variant.stock || 0);
      clearSupplierPhotoPreviews();
      supplierEditorImages = (product.images || []).map((url) => ({ url }));
      renderSupplierPhotoList();
      document.querySelector('[data-supplier-form-title]').textContent = `Edit ${submission.status === 'Rejected' ? 'rejected' : 'pending'} ${product.name || 'product'}`;
      supplierForm.querySelector('[data-supplier-submit-label]').textContent = submission.status === 'Rejected' ? 'Save & Resubmit' : 'Save Request';
      if (supplierEditor) supplierEditor.hidden = false;
      supplierForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (deleteRequestButton) {
      const submission = supplierSubmissions.find((entry) => entry.id === deleteRequestButton.dataset.supplierDeleteRequest && entry.action === 'add' && ['Pending Review', 'Rejected'].includes(entry.status));
      if (!submission) return;
      const productName = submission.product_data?.name || 'this product';
      if (!window.confirm(`Delete the ${submission.status === 'Rejected' ? 'rejected' : 'pending'} request for “${productName}”? This request will be withdrawn.`)) return;
      deleteRequestButton.disabled = true;
      setSupplierListFeedback('Deleting pending product request…');
      const { error } = await supabase.rpc('delete_marketplace_pending_product_request', { p_submission_id: submission.id });
      if (error) {
        deleteRequestButton.disabled = false;
        setSupplierListFeedback(error.message || 'The pending request could not be deleted.', true);
        return;
      }
      setSupplierListFeedback('Pending product request deleted.');
      try { await refreshSupplierPortal(); }
      catch (refreshError) { setSupplierListFeedback(refreshError.message || 'The request was deleted, but the product list could not refresh.', true); }
      return;
    }
    if (editButton) {
      const product = supplierCatalog.find((entry) => entry.id === editButton.dataset.supplierEditProduct);
      const variant = product?.variants?.find((entry) => entry.id === editButton.dataset.supplierVariantId) || product?.variants?.[0];
      if (!product || !variant) return;
      const fields = supplierForm.elements;
      fields.productId.value = product.id;
      fields.variantId.value = variant.id || '';
      fields.name.value = product.name || '';
      fields.category.value = product.category || 'Other';
      fields.description.value = product.description || '';
      fields.petTypes.value = product.petTypes || '';
      fields.ingredients.value = product.ingredients || '';
      fields.nutrition.value = product.nutrition || '';
      fields.price.value = Number(variant.price || 0);
      fields.variantLabel.value = variant.label || '';
      fields.stock.value = Number(variant.stock || 0);
      clearSupplierPhotoPreviews();
      supplierEditorImages = (product.images || []).map((url) => ({ url }));
      renderSupplierPhotoList();
      document.querySelector('[data-supplier-form-title]').textContent = `Edit ${product.name}`;
      supplierForm.querySelector('[data-supplier-submit-label]').textContent = 'Save Product';
      if (supplierEditor) supplierEditor.hidden = false;
      supplierForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!actionButton) return;
    const product = supplierCatalog.find((entry) => entry.id === actionButton.dataset.supplierProductId);
    if (!product) return;
    const isHide = actionButton.dataset.supplierProductAction === 'hide';
    const label = isHide ? (product.hidden ? 'show' : 'hide') : 'permanently delete';
    if (!window.confirm(`${isHide ? `Do you want to ${label}` : 'Permanently delete'} “${product.name}” ${isHide ? 'in the Marketplace' : 'from the Marketplace catalog'}? This takes effect immediately.`)) return;
    actionButton.disabled = true;
    setSupplierFeedback(`${isHide ? 'Updating listing visibility' : 'Deleting product'}…`);
    const { error } = await supabase.rpc('manage_marketplace_supplier_product', { p_action: isHide ? (product.hidden ? 'show' : 'hide') : 'delete', p_product_id: product.id });
    if (error) {
      actionButton.disabled = false;
      setSupplierFeedback(error.message || 'The request could not be sent.', true);
      return;
    }
    setSupplierFeedback(isHide ? `The listing is now ${product.hidden ? 'visible' : 'hidden'} in the Marketplace.` : 'The product has been deleted from the Marketplace catalog.');
    try { await refreshSupplierPortal(); }
    catch (refreshError) { setSupplierFeedback(refreshError.message || 'Request sent, but the product list could not refresh.', true); }
  });
  const ordersTarget = document.querySelector('[data-supplier-orders]');
  ordersTarget?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-supplier-return-action]');
    if (!button) return;
    const action = button.dataset.supplierReturnAction;
    const reason = action === 'reject' ? window.prompt('Why are you rejecting this return? The reason will be sent to a Manager or Director for review.') : '';
    if (action === 'reject' && !reason?.trim()) return;
    if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve this return request? The customer will be asked to send the product back to you.' : 'Confirm that you received the returned product?')) return;
    button.disabled = true;
    setShipmentFeedback(action === 'reject' ? 'Sending the case for Manager / Director review…' : 'Updating return status…');
    const rpc = action === 'received' ? 'mark_marketplace_item_return_received' : 'respond_marketplace_item_return';
    const args = action === 'received'
      ? { p_return_id: button.dataset.returnId }
      : { p_return_id: button.dataset.returnId, p_decision: action, p_reason: reason || '' };
    const { error } = await supabase.rpc(rpc, args);
    if (error) {
      button.disabled = false;
      setShipmentFeedback(error.message || 'The return status could not be updated.', true);
      return;
    }
    setShipmentFeedback(action === 'reject' ? 'The case has been sent to a Manager or Director for review.' : action === 'approve' ? 'Return approved. Coordinate the return shipment with the customer.' : 'The returned product is recorded as received. A Manager or Director can now record the refund after it is sent through the original payment method.');
    try { await refreshSupplierPortal(); }
    catch (refreshError) { setShipmentFeedback(refreshError.message || 'The return was updated, but the order list could not refresh.', true); }
  });
  ordersTarget?.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-copy-supplier-recipient]');
    if (!copyButton) return;
    const card = copyButton.closest('[data-supplier-recipient-card]');
    if (!card) return;
    const recipientName = card.querySelector('[data-recipient-name]')?.textContent.trim() || 'Not provided';
    const recipientPhone = card.querySelector('[data-recipient-phone]')?.textContent.trim() || 'Not provided';
    const recipientAddress = card.querySelector('[data-recipient-address]')?.textContent.trim() || 'Not provided';
    const text = `Recipient Name: ${recipientName}\nRecipient Phone: ${recipientPhone}\nRecipient Address: ${recipientAddress}`;
    const feedback = card.querySelector('[data-copy-recipient-feedback]');
    const showCopied = (message) => { if (feedback) feedback.textContent = message; };
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(text);
      showCopied('Recipient details copied.');
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      showCopied(copied ? 'Recipient details copied.' : 'Could not copy recipient details.');
    }
  });
  ordersTarget?.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-supplier-shipping-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setShipmentFeedback('Saving shipment details…');
    const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
      p_order_id: form.dataset.supplierShippingForm,
      p_action: 'ship',
      p_courier: form.elements.courier.value.trim(),
      p_tracking_number: form.elements.trackingNumber.value.trim(),
      p_tracking_url: form.elements.trackingUrl.value.trim(),
    });
    if (error) {
      submit.disabled = false;
      setShipmentFeedback(error.message || 'Shipment details could not be saved.', true);
      return;
    }
    setShipmentFeedback('Tracking saved. The order has been marked as shipped.');
    try { await refreshSupplierPortal(); }
    catch (refreshError) { setShipmentFeedback(refreshError.message || 'Shipment saved, but the order list could not refresh.', true); }
  });
  ordersTarget?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-supplier-mark-delivered]');
    if (!button || !window.confirm('Mark this supplier shipment as delivered?')) return;
    button.disabled = true;
    setShipmentFeedback('Updating delivery status…');
    const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
      p_order_id: button.dataset.supplierMarkDelivered,
      p_action: 'delivered',
      p_courier: '',
      p_tracking_number: '',
      p_tracking_url: '',
    });
    if (error) {
      button.disabled = false;
      setShipmentFeedback(error.message || 'Delivery status could not be updated.', true);
      return;
    }
    setShipmentFeedback('The shipment has been marked as delivered.');
    try { await refreshSupplierPortal(); }
    catch (refreshError) { setShipmentFeedback(refreshError.message || 'Delivery status saved, but the order list could not refresh.', true); }
  });
  if (supplierForm || document.querySelector('[data-supplier-orders]')) {
    void refreshSupplierPortal().catch((error) => {
      console.error('Supplier portal data could not load:', error);
      setSupplierFeedback('Supplier data could not load. Confirm the supplier portal migration has been applied.', true);
      document.querySelectorAll('[data-supplier-products], [data-supplier-orders]').forEach((node) => { node.innerHTML = '<p>Supplier data is temporarily unavailable.</p>'; });
    });
    if (document.documentElement.dataset.marketplaceSupplierReturnRealtime !== 'true') {
      document.documentElement.dataset.marketplaceSupplierReturnRealtime = 'true';
      supabase.channel('marketplace-supplier-return-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_item_returns' }, () => {
          void refreshSupplierPortal().catch((error) => setShipmentFeedback(error.message || 'Return updates could not be refreshed.', true));
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_notifications' }, () => {
          void refreshSupplierPortal().catch((error) => setSupplierFeedback(error.message || 'Product status could not refresh.', true));
        })
        .subscribe();
    }
  }

  const supplierOverview = document.querySelector('[data-marketplace-supplier-access-list]');
  const loadSupplierOverview = async () => {
    if (!supplierOverview) return;
    const { data, error } = await supabase.rpc('get_marketplace_supplier_accounts');
    if (error) throw error;
    const { data: supplierVoucherRows, error: voucherError } = await supabase.from('marketplace_supplier_vouchers').select('*').order('created_at', { ascending: false });
    if (voucherError) throw voucherError;
    if (!data?.length) { supplierOverview.innerHTML = '<p class="admin-market-empty">No supplier portal users are linked yet.</p>'; return; }
    const products = loadMarketplaceProducts();
    const orders = loadMarketplaceOrders();
    const summaryForSupplier = (supplierName) => {
      const supplierProducts = products.flatMap((product) => (product.variants || []).filter((variant) => String(variant.supplierId || variant.supplier || '').toLowerCase() === supplierName.toLowerCase()).map((variant) => ({ product, variant })));
      const supplierItems = orders.filter((order) => String(order.paymentStatus || '').toLowerCase() === 'paid' && !/cancel|refund/i.test(String(order.status || ''))).flatMap((order) => (order.items || []).filter((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        return String(item.supplierId || variant?.supplierId || variant?.supplier || '').toLowerCase() === supplierName.toLowerCase();
      }).map((item) => ({ ...item, orderId: order.id || order.reference })));
      const uniqueProducts = [...new Map(supplierProducts.map(({ product }) => [product.id, product])).values()];
      return { supplierProducts, supplierItems, uniqueProducts };
    };
    supplierOverview.innerHTML = data.map((entry) => {
      const account = entry;
      const summary = summaryForSupplier(entry.supplier_name);
      const sales = summary.supplierItems.reduce((total, item) => total + (Number(item.unitPrice ?? item.price ?? 0) * (Number(item.quantity) || 0)), 0);
      const phone = String(account.supplier_contact_phone || account.phone_e164 || '').replace(/^\+60/, '0');
      const avatarUrl = account.avatar_path ? supabase.storage.from('supplier-profile-photos').getPublicUrl(account.avatar_path).data.publicUrl : 'Image/Icon/Supplier%20Profile%20Picture.png';
      const linkedDate = entry.created_at ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(entry.created_at)) : '—';
      const productList = summary.uniqueProducts.map((product) => {
        const variants = summary.supplierProducts.filter((item) => item.product.id === product.id);
        const sold = variants.reduce((total, item) => total + (summary.supplierItems.filter((line) => line.productId === product.id && line.variantId === item.variant.id).reduce((subtotal, line) => subtotal + (Number(line.quantity) || 0), 0)), 0);
        return `<li><span>${escapeHTML(product.name)} · ${escapeHTML(product.category || 'Other')}${product.productCode ? ` · ${escapeHTML(product.productCode)}` : ''}</span><small>${variants.map(({ variant }) => `${escapeHTML(variant.label || 'Variant')} · MYR ${Number(variant.price || 0).toFixed(2)}`).join(' / ')}</small><b>${sold} sold</b></li>`;
      }).join('');
      const vouchersForSupplier = (supplierVoucherRows || []).filter((voucher) => voucher.supplier_user_id === entry.supplier_user_id);
      const voucherList = vouchersForSupplier.map((voucher) => `<li><span><strong>${escapeHTML(voucher.code)}</strong> · ${voucher.discount_type === 'free_shipping' ? 'Free shipping' : voucher.discount_type === 'percent' ? `${Number(voucher.discount_value)}% off` : `MYR ${Number(voucher.discount_value).toFixed(2)} off`}${Number(voucher.minimum_spend) ? ` · Minimum MYR ${Number(voucher.minimum_spend).toFixed(2)}` : ''}</span><small>${voucher.enabled ? 'Active' : 'Inactive'}${voucher.expires_at ? ` · Expires ${escapeHTML(voucher.expires_at)}` : ''}</small></li>`).join('');
      return `<details class="admin-supplier-overview-card"><summary><img class="admin-supplier-avatar" src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(entry.supplier_name)} profile photo" /><span class="admin-supplier-company">${escapeHTML(entry.supplier_name)}</span><span class="admin-supplier-email">${escapeHTML(account.email || 'Email unavailable')}</span></summary><div class="admin-supplier-overview-body"><div class="admin-supplier-user-details"><div><small>Name</small><strong>${escapeHTML(account.display_name || 'Name unavailable')}</strong></div><div><small>Email</small><strong>${escapeHTML(account.email || 'Email unavailable')}</strong></div><div><small>Phone</small><strong>${escapeHTML(phone || 'Phone unavailable')}</strong></div><div><small>Linked</small><strong>${escapeHTML(linkedDate)}</strong></div></div><div class="admin-supplier-sales-stats"><div><small>Paid sales</small><strong>MYR ${sales.toFixed(2)}</strong></div><div><small>Units sold</small><strong>${summary.supplierItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}</strong></div><div><small>Paid orders</small><strong>${new Set(summary.supplierItems.map((item) => item.orderId)).size}</strong></div><div><small>Products</small><strong>${summary.uniqueProducts.length}</strong></div></div><div class="admin-supplier-products"><h4>Products and sales</h4><ul>${productList || '<li>No products linked to this supplier company yet.</li>'}</ul></div><div class="admin-supplier-products admin-supplier-vouchers"><h4>Supplier Vouchers &amp; Offers</h4><ul>${voucherList || '<li>No vouchers created yet.</li>'}</ul></div></div></details>`;
    }).join('');
  };
  if (supplierOverview) void loadSupplierOverview().catch((error) => { supplierOverview.innerHTML = `<p class="admin-market-empty">Supplier details could not be loaded: ${escapeHTML(error.message || 'Supabase request failed')}</p>`; });

  const reviewsTarget = document.querySelector('[data-marketplace-product-reviews]');
  const loadProductReviews = async () => {
    if (!reviewsTarget) return;
    const { data, error } = await supabase.from('marketplace_product_submissions').select('*').eq('status', 'Pending Review').order('submitted_at', { ascending: true });
    if (error) throw error;
    const countBadge = document.querySelector('[data-marketplace-review-count]');
    if (countBadge) countBadge.textContent = String(data?.length || 0);
    if (!data?.length) { reviewsTarget.innerHTML = '<p>No product submissions are awaiting review.</p>'; return; }
    reviewsTarget.innerHTML = data.map((submission) => {
      const product = submission.product_data || {};
      const images = (product.images || []).map((url) => `<img src="${escapeHTML(url)}" alt="${escapeHTML(product.name || 'Product')}" />`).join('');
      const variants = (product.variants || []).map((variant) => `<li>${escapeHTML(variant.label || 'Variant')} · MYR ${Number(variant.price || 0).toFixed(2)} · Stock ${Number(variant.stock) || 0}</li>`).join('');
      const action = submission.action || 'add';
      const actionLabel = { add: 'New product', edit: 'Product edit', edit_variant: 'Price / variant change', hide: 'Hide request', delete: 'Delete request' }[action] || 'Product change';
      const approveLabel = { add: 'Approve & Publish', edit: 'Approve Changes', edit_variant: 'Approve Price / Variant', hide: 'Approve Hide', delete: 'Approve Delete' }[action] || 'Approve Request';
      return `<article class="marketplace-product-review-card" data-marketplace-review="${escapeHTML(submission.id)}"><div class="marketplace-review-images">${images}</div><div class="marketplace-review-copy"><span>${escapeHTML(submission.supplier_name)} · ${actionLabel}</span><h3>${escapeHTML(product.name || 'Product')}</h3><p>${escapeHTML(product.description || (action === 'hide' ? 'Supplier requests to hide this active listing.' : action === 'delete' ? 'Supplier requests to delete this active listing.' : ''))}</p><p><strong>${escapeHTML(product.category || 'Other')}</strong> · ${escapeHTML(product.ingredients || '')}</p><ul>${variants}</ul><label>Rejection reason<textarea rows="2" maxlength="1000" data-rejection-reason placeholder="Required when rejecting"></textarea></label><div class="admin-market-form-actions"><button type="button" class="button button-primary" data-review-product="approve">${approveLabel}</button><button type="button" class="button button-light" data-review-product="reject">Reject Request</button></div></div></article>`;
    }).join('');
  };
  reviewsTarget?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-review-product]');
    const card = button?.closest('[data-marketplace-review]');
    if (!button || !card) return;
    const decision = button.dataset.reviewProduct;
    const reason = card.querySelector('[data-rejection-reason]').value.trim();
    if (decision === 'reject' && !reason) { card.querySelector('[data-rejection-reason]').setCustomValidity('Enter a reason so the supplier knows what to change.'); card.querySelector('[data-rejection-reason]').reportValidity(); card.querySelector('[data-rejection-reason]').setCustomValidity(''); return; }
    button.disabled = true;
    const { data, error } = await supabase.rpc('review_marketplace_product_submission', { p_submission_id: card.dataset.marketplaceReview, p_decision: decision, p_reason: reason });
    if (error) { button.disabled = false; window.alert(error.message); return; }
    if (decision === 'approve') {
      const { data: catalog, error: catalogError } = await supabase.from('app_data').select('payload').eq('record_id', 'shared:furgo-demo-marketplace-products:shared').maybeSingle();
      if (!catalogError && Array.isArray(catalog?.payload)) localStorage.setItem(marketplaceProductsKey, JSON.stringify(catalog.payload));
    }
    if (decision === 'approve') void recordAdminAction('marketplace_product_request_approved', 'marketplace_product_submission', card.dataset.marketplaceReview);
    await loadProductReviews();
  });
  if (reviewsTarget) void loadProductReviews().catch((error) => { reviewsTarget.innerHTML = `<p>${escapeHTML(error.message || 'Submissions could not load.')}</p>`; });
}

// Provides short Admin Portal confirmations without external notification services.
function toastAdmin(message) {
  const toast = document.querySelector('.admin-market-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

// Crops and compresses Home promotion artwork to a predictable 2:1 image size.
async function preparePromotionBanner(file, width, height) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    if (sourceWidth / sourceHeight > targetRatio) {
      sourceWidth = sourceHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = sourceWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Saves mobile-first Home promotion banners in a compact, fixed-size format.
function setupAdminPromotionsForm() {
  const form = document.querySelector('[data-admin-promo-form]');
  if (!form) return;
  const bannerInput = form.querySelector('[data-promo-banner]');
  const mobileInput = form.querySelector('[data-promo-mobile-banner]');
  const preview = form.querySelector('[data-promo-preview]');
  const mobilePreview = form.querySelector('[data-promo-mobile-preview]');
  const feedback = form.querySelector('[data-admin-promo-feedback]');
  const previewUrls = new Map();
  const maximumImageSize = 2 * 1024 * 1024;
  const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const setupPreview = (input, image) => input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!supportedImageTypes.has(file.type)) {
      feedback.textContent = 'Choose a PNG, JPG, or WebP banner image.';
      feedback.classList.add('visible');
      input.value = '';
      return;
    }
    if (file.size > maximumImageSize) {
      feedback.textContent = 'Each banner image must be 2 MB or smaller.';
      feedback.classList.add('visible');
      input.value = '';
      return;
    }
    const oldUrl = previewUrls.get(input);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const nextUrl = URL.createObjectURL(file);
    previewUrls.set(input, nextUrl);
    image.src = nextUrl;
    image.hidden = false;
    feedback.textContent = '';
    feedback.classList.remove('visible');
  });
  setupPreview(bannerInput, preview);
  setupPreview(mobileInput, mobilePreview);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const promotions = loadPromotions();
    if (promotions.length >= maximumPromotions) {
      feedback.textContent = `You can set up a maximum of ${maximumPromotions} promotions.`;
      feedback.classList.add('visible');
      return;
    }
    const destination = normalizePromotionDestination(form.elements.destination.value);
    if (!destination) {
      feedback.textContent = 'Enter an app route starting with # or a secure https:// URL.';
      feedback.classList.add('visible');
      return;
    }
    const file = bannerInput.files?.[0];
    const mobileFile = mobileInput.files?.[0];
    if (!file || !supportedImageTypes.has(file.type) || file.size > maximumImageSize || mobileFile && (!supportedImageTypes.has(mobileFile.type) || mobileFile.size > maximumImageSize)) {
      feedback.textContent = 'Choose PNG, JPG, or WebP images no larger than 2 MB each.';
      feedback.classList.add('visible');
      return;
    }

    try {
      const image = await preparePromotionBanner(file, 1200, 600);
      const mobileImage = mobileFile ? await preparePromotionBanner(mobileFile, 900, 450) : '';
      const promotion = {
        id: `promotion-${Date.now()}`,
        title: form.elements.title.value.trim(),
        destination,
        image,
        ...(mobileImage ? { mobileImage } : {}),
      };
      localStorage.setItem(promotionStorageKey, JSON.stringify([...promotions, promotion]));
      void recordAdminAction('promotion_uploaded', 'promotion', promotion.id, { title: promotion.title });
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      render();
    } catch {
      feedback.textContent = 'The banner could not be processed or saved. Try a supported image under 2 MB.';
      feedback.classList.add('visible');
    }
  });

  document.querySelector('[data-admin-promo-list]')?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-promotion]');
    if (!deleteButton) return;
    const removedPromotion = loadPromotions().find((promotion) => promotion.id === deleteButton.dataset.deletePromotion);
    const remaining = loadPromotions().filter((promotion) => promotion.id !== deleteButton.dataset.deletePromotion);
    localStorage.setItem(promotionStorageKey, JSON.stringify(remaining));
    if (removedPromotion) void recordAdminAction('promotion_removed', 'promotion', removedPromotion.id, { title: removedPromotion.title });
    render();
  });
}

// Updates the grooming quote, slot capacity, and payment choices as a customer books.
function setupGroomingBooking() {
  const form = document.querySelector('[data-grooming-booking]');
  if (!form) return;
  const settings = loadGroomingSettings();
  const feedback = form.querySelector('[data-grooming-feedback]');
  const money = (value) => `MYR ${Number(value || 0).toFixed(2)}`;
  let voucherDiscount = 0;
  let appliedVoucher = '';

  const selectedPets = () => {
    const ids = (form.elements.petIds?.value || form.elements.petId?.value || '').split(',').filter(Boolean);
    return ids.map((id) => loadPetProfiles().find((pet) => pet.id === id)).filter(Boolean);
  };
  const currentPet = () => selectedPets()[0];
  const currentPackages = () => selectedPets().map((pet) => {
    const radio = [...form.querySelectorAll('[data-package-pet]:checked')].find((input) => input.dataset.packagePet === pet.id);
    const packageItem = settings.packages.find((item) => item.id === radio?.value);
    return { pet, packageItem, price: Number(packageItem?.[groomingWeightTier(pet.weight, settings)] || 0) };
  });
  const renderQuote = () => {
    const liveSettings = loadGroomingSettings();
    const pets = selectedPets();
    const pet = pets[0];
    const petPackages = currentPackages();
    const tier = groomingWeightTier(pet?.weight, settings);
    const packageItem = petPackages[0]?.packageItem;
    const packagePrice = petPackages.reduce((sum, item) => sum + item.price, 0);
    const daycareOn = form.elements.includeDaycare.checked;
    const daycareTotal = daycareOn ? Number(form.elements.daycareHours.value) * Number(settings.daycareHourlyRate) * pets.length : 0;
    const taxiOn = form.elements.includeTaxi.checked;
    const taxiDistance = Number(form.elements.taxiDistance.value || 0);
    const petTaxiSettings = loadPetTaxiSettings();
    const taxiTotal = taxiOn && taxiDistance > 0 ? (Number(petTaxiSettings.baseFare) + taxiDistance * Number(petTaxiSettings.farePerKm)) * pets.length : 0;
    const customAddOns = [...form.querySelectorAll('[data-grooming-custom-addon]:checked')].map((input) => liveSettings.addOns?.find((item) => item.id === input.value)).filter(Boolean);
    const customAddOnTotal = customAddOns.reduce((sum, item) => sum + Number(item.price || 0), 0) * pets.length;
    const subtotal = packagePrice + daycareTotal + taxiTotal + customAddOnTotal;
    if (appliedVoucher && subtotal < Number(settings.voucher.minimumSpend || 0)) {
      voucherDiscount = 0;
      appliedVoucher = '';
      form.querySelector('[data-grooming-voucher-feedback]').textContent = `Voucher removed because the minimum spend is ${money(settings.voucher.minimumSpend)}.`;
    }
    const total = Math.max(0, subtotal - voucherDiscount);
    form.querySelector('[data-grooming-package-total]').textContent = money(packagePrice);
    form.querySelector('[data-daycare-total]').textContent = money(daycareTotal);
    form.querySelector('[data-daycare-summary]').hidden = !daycareOn;
    form.querySelector('[data-taxi-total]').textContent = money(taxiTotal);
    form.querySelector('[data-taxi-summary]').hidden = !taxiOn;
    form.querySelector('[data-custom-addons-total]').textContent = money(customAddOnTotal);
    form.querySelector('[data-custom-addons-summary]').hidden = customAddOns.length === 0;
    form.querySelector('[data-grooming-discount]').textContent = `− ${money(voucherDiscount)}`;
    form.querySelector('[data-grooming-discount-row]').hidden = voucherDiscount <= 0;
    form.querySelector('[data-grooming-total]').textContent = money(total);
    form.dataset.quotedTotal = String(total);
    return { pet, pets, tier, packageItem, petPackages, packagePrice, daycareTotal, taxiTotal, taxiDistance, customAddOns, customAddOnTotal, total };
  };

  const refreshWeightTier = () => {
    const pet = currentPet();
    if (!pet) return;
    const snapshot = form.querySelector('[data-grooming-pet-snapshot]');
    const chosenIds = new Set(selectedPets().map((item) => item.id));
    form.querySelectorAll('[data-grooming-pet-choice]').forEach((card) => {
      const selected = chosenIds.has(card.dataset.groomingPetChoice);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
      card.querySelector('.grooming-pet-selected-mark')?.remove();
      if (selected) {
        const marker = document.createElement('span');
        marker.className = 'grooming-pet-selected-mark';
        marker.innerHTML = '<img src="Image/Icon/Icon-13.png" alt="Selected" />';
        card.append(marker);
      }
    });
    snapshot.dataset.selectedPet = [...chosenIds].join(',');
    const snapshotList = form.querySelector('[data-pet-snapshot-list]');
    snapshotList.replaceChildren(...selectedPets().map((selected) => {
      const summary = document.createElement('div');
      summary.className = 'grooming-selected-pet-summary';
      const name = document.createElement('strong');
      name.textContent = selected.name || 'Pet profile';
      const details = document.createElement('span');
      details.textContent = `${selected.breed || 'Breed not added'} · ${selected.weight || 'Weight not added'} kg`;
      const vaccine = document.createElement('small');
      vaccine.textContent = (selected.vaccinationCards || []).length ? 'Vaccination record uploaded' : 'No vaccination record on file';
      summary.append(name, details, vaccine);
      return summary;
    }));
    form.querySelector('[data-grooming-tier-summary]').textContent = selectedPets().map((item) => `${item.name}: ${groomingWeightTier(item.weight, settings)} tier · ${item.weight || '—'} kg`).join(' | ');
    form.querySelectorAll('[data-pet-package]').forEach((section) => { section.hidden = !chosenIds.has(section.dataset.petPackage); });
    const profileLink = form.querySelector('[data-grooming-pet-profile]');
    if (profileLink && chosenIds.size === 1) profileLink.href = `#pet-profile?id=${encodeURIComponent([...chosenIds][0])}&from=grooming`;
    form.querySelectorAll('[data-package-price]').forEach((radio) => {
      const packageItem = settings.packages.find((item) => item.id === radio.value);
      const packagePet = loadPetProfiles().find((item) => item.id === radio.dataset.packagePet);
      const price = Number(packageItem?.[groomingWeightTier(packagePet?.weight, settings)] || 0);
      radio.dataset.packagePrice = String(price);
      const output = radio.closest('.grooming-package-option')?.querySelector('b');
      if (output) output.textContent = money(price);
    });
    voucherDiscount = 0;
    appliedVoucher = '';
    form.querySelector('[data-grooming-discount-row]').hidden = true;
    renderQuote();
  };

  const appointmentDate = form.querySelector('[data-grooming-date]');
  const appointmentTime = form.querySelector('[data-grooming-time]');
  const appointmentSummary = form.querySelector('[data-appointment-summary]');
  const calendar = form.querySelector('[data-grooming-calendar]');
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Draws a tap-friendly month grid, disabling dates outside Admin's current booking rules.
  const renderAppointmentCalendar = () => {
    if (!calendar) return;
    const availability = loadGroomingSettings();
    const today = new Date();
    const earliestDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const latestDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(availability.bookingHorizonDays || 60));
    const earliestMonth = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
    const latestMonth = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    if (calendarMonth < earliestMonth) calendarMonth = earliestMonth;
    if (calendarMonth > latestMonth) calendarMonth = latestMonth;
    const monthLabel = calendar.querySelector('[data-calendar-month]');
    const grid = calendar.querySelector('[data-calendar-grid]');
    const previousButton = calendar.querySelector('[data-calendar-nav="previous"]');
    const nextButton = calendar.querySelector('[data-calendar-nav="next"]');
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    monthLabel.textContent = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    previousButton.disabled = calendarMonth <= earliestMonth;
    nextButton.disabled = calendarMonth >= latestMonth;
    const dayHeadings = weekdays.map((day) => `<span class="grooming-calendar-weekday" role="columnheader">${day}</span>`).join('');
    const blankCells = Array.from({ length: firstWeekday }, () => '<span class="grooming-calendar-empty" aria-hidden="true"></span>').join('');
    const dayCells = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(year, month, day);
      const dateUnavailable = dayDate < earliestDate || dayDate > latestDate
        || !availability.availableWeekdays.map(Number).includes(dayDate.getDay())
        || (availability.closedDates || []).includes(date);
      const selected = appointmentDate.value === date;
      const isToday = dayDate.getTime() === earliestDate.getTime();
      return `<button type="button" class="grooming-calendar-day ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" role="gridcell" data-calendar-date="${date}" aria-label="${dayDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}" aria-selected="${selected}" ${dateUnavailable ? 'disabled' : ''}>${day}</button>`;
    }).join('');
    grid.innerHTML = `${dayHeadings}${blankCells}${dayCells}`;
  };

  const refreshSlots = () => {
    const timeContainer = form.querySelector('[data-grooming-time-slots]');
    try {
      const date = appointmentDate.value;
      const outlet = form.elements.outlet.value;
      // Read Admin Portal availability at interaction time so schedule edits are reflected immediately.
      const availability = loadGroomingSettings();
      const slotCapacity = Math.max(1, Number(availability.slotCapacity) || 1);
      const today = new Date();
      const minimumDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const latestBookingDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(availability.bookingHorizonDays || 60));
      appointmentDate.min = minimumDate;
      appointmentDate.max = `${latestBookingDate.getFullYear()}-${String(latestBookingDate.getMonth() + 1).padStart(2, '0')}-${String(latestBookingDate.getDate()).padStart(2, '0')}`;
      renderAppointmentCalendar();
      appointmentTime.value = '';
      appointmentSummary.hidden = true;
      if (!date) {
        timeContainer.innerHTML = '<p>Select a date to view available times.</p>';
        form.querySelector('[data-grooming-slot-note]').textContent = 'Choose a date to begin.';
        form.querySelector('[data-calendar-selection]').textContent = 'Choose an appointment date.';
        return;
      }
      form.querySelector('[data-calendar-selection]').textContent = `Selected date: ${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (date < appointmentDate.min || date > appointmentDate.max || !availability.availableWeekdays.map(Number).includes(weekday) || (availability.closedDates || []).includes(date)) {
        timeContainer.innerHTML = '<p>No grooming appointments are available on this date. Choose another date.</p>';
        form.querySelector('[data-grooming-slot-note]').textContent = 'This date is outside the outlet’s available booking days.';
        return;
      }
      const bookings = loadGroomingBookings();
      const available = availability.timeSlots.filter((slot) => bookings.filter((booking) => booking.date === date && booking.outlet === outlet && booking.time === slot && !['Cancelled', 'Completed'].includes(booking.status)).length < slotCapacity);
      timeContainer.innerHTML = available.length ? available.map((slot) => `<button type="button" class="grooming-time-option" data-grooming-time-option="${escapeHTML(slot)}" aria-pressed="false">${escapeHTML(slot)}</button>`).join('') : '<p>No times are available. Choose another date or outlet.</p>';
      form.querySelector('[data-grooming-slot-note]').textContent = available.length ? `${available.length} time slot${available.length === 1 ? '' : 's'} available for this outlet and date.` : 'All grooming slots are full for this outlet and date. Please choose another date or outlet.';
    } catch (error) {
      appointmentTime.value = '';
      appointmentSummary.hidden = true;
      timeContainer.innerHTML = '<p>Availability could not be loaded. Please choose the date again or contact support.</p>';
      form.querySelector('[data-grooming-slot-note]').textContent = 'There was a problem reading the current outlet schedule.';
      console.error('[Furgo grooming] Failed to load appointment availability.', error);
    }
  };

  // Pet taxi estimate: match the pickup address city and selected outlet to the route table set by Admin.
  const refreshTaxiEstimate = () => {
    const quote = form.querySelector('[data-taxi-quote]');
    const distanceInput = form.querySelector('[data-grooming-taxi-distance]');
    if (!quote || !distanceInput) return;
    const pickupSelect = form.querySelector('[name="pickup"]');
    let address = null;
    if (pickupSelect && pickupSelect.value !== 'new') {
      try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(pickupSelect.value)] || null; } catch { address = null; }
    }
    const locationText = [address?.city, address?.state, address?.postcode, address?.street, form.elements.pickupManual?.value].filter(Boolean).join(' ').toLowerCase();
    const outlet = form.querySelector('[data-taxi-outlet]')?.value || form.elements.outlet.value;
    const latestSettings = loadPetTaxiSettings();
    const route = matchPetTaxiRoute(locationText, outlet, latestSettings);
    const distanceKm = route ? Number(route.distanceKm) : 0;
    distanceInput.value = String(distanceKm);
    const petCount = Math.max(1, selectedPets().length);
    quote.innerHTML = route
      ? `<strong>Estimated taxi fare for ${petCount} pet${petCount === 1 ? '' : 's'}: ${money((Number(latestSettings.baseFare) + distanceKm * Number(latestSettings.farePerKm)) * petCount)}</strong><span>${escapeHTML(route.city)} to ${escapeHTML(outlet)} · ${distanceKm} km · one way</span>`
      : '<strong>Route estimate unavailable</strong><span>Choose an address in a configured city, or ask Admin to add this city and outlet route.</span>';
    renderQuote();
  };

  // Rebuild taxi pickup cards when Admin changes the shared schedule in another browser tab.
  const refreshTaxiSchedules = () => {
    const container = form.querySelector('[data-taxi-schedules]');
    const currentSchedule = form.elements.taxiSchedule.value;
    const slots = loadPetTaxiSettings().scheduleSlots;
    if (!slots.includes(currentSchedule)) form.elements.taxiSchedule.value = '';
    container.innerHTML = slots.map((time) => {
      const [hour, minute] = String(time).split(':').map(Number);
      const label = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
      return `<button type="button" class="grooming-time-option" data-taxi-schedule-option="${escapeHTML(time)}" aria-pressed="${time === currentSchedule}">${escapeHTML(label)}</button>`;
    }).join('') || '<span>No pickup times are available. Contact support.</span>';
    if (currentSchedule && slots.includes(currentSchedule)) [...container.querySelectorAll('[data-taxi-schedule-option]')].find((button) => button.dataset.taxiScheduleOption === currentSchedule)?.classList.add('is-selected');
  };

  const updateOptionalFields = () => {
    const daycareFields = form.querySelector('[data-grooming-daycare-fields]');
    const taxiFields = form.querySelector('[data-grooming-taxi-fields]');
    daycareFields.hidden = !form.elements.includeDaycare.checked;
    taxiFields.hidden = !form.elements.includeTaxi.checked;
    const addressSelect = form.querySelector('[data-pet-taxi-address-select]');
    if (addressSelect) addressSelect.required = form.elements.includeTaxi.checked;
    const transferField = form.querySelector('[data-grooming-transfer]');
    const transferInput = form.elements.transferSlip;
    const needsTransferSlip = form.elements.paymentMethod.value === 'bank-transfer';
    transferField.hidden = !needsTransferSlip;
    transferInput.required = needsTransferSlip;
    refreshTaxiEstimate();
    renderQuote();
  };

  form.querySelector('[data-grooming-pet-carousel]')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-grooming-pet-choice]');
    if (!card) return;
    const chosen = new Set((form.elements.petIds.value || '').split(',').filter(Boolean));
    if (chosen.has(card.dataset.groomingPetChoice)) chosen.delete(card.dataset.groomingPetChoice);
    else chosen.add(card.dataset.groomingPetChoice);
    if (!chosen.size) chosen.add(card.dataset.groomingPetChoice);
    form.elements.petIds.value = [...chosen].join(',');
    form.elements.petId.value = [...chosen][0];
    refreshWeightTier();
  });
  form.querySelector('[data-grooming-package-list]')?.addEventListener('change', renderQuote);
  form.querySelector('[data-grooming-pet-profile]')?.addEventListener('click', (event) => {
    if (selectedPets().length < 2) return;
    event.preventDefault();
    window.alert('Multiple pets are selected. Choose one pet before opening a pet profile.');
  });
  // Adds clear previous/next controls while retaining native touch scrolling for both carousels.
  form.querySelectorAll('[data-grooming-carousel]').forEach((shell) => {
    const track = shell.querySelector('.grooming-choice-carousel, .grooming-addon-carousel');
    const previous = shell.querySelector('[data-carousel-step="previous"]');
    const next = shell.querySelector('[data-carousel-step="next"]');
    if (!track || !previous || !next) return;
    const updateArrows = () => {
      const maximumScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const hasOverflow = maximumScroll >= 2;
      shell.classList.toggle('has-overflow', hasOverflow);
      previous.hidden = !hasOverflow;
      next.hidden = !hasOverflow;
      previous.disabled = track.scrollLeft < 2;
      next.disabled = track.scrollLeft >= maximumScroll - 2;
    };
    shell.addEventListener('click', (event) => {
      const arrow = event.target.closest('[data-carousel-step]');
      if (!arrow || arrow.hidden || arrow.disabled) return;
      const card = track.firstElementChild;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      const cardWidth = card?.getBoundingClientRect().width || track.clientWidth * 0.8;
      track.scrollBy({ left: (cardWidth + gap) * (arrow.dataset.carouselStep === 'next' ? 1 : -1), behavior: 'smooth' });
    });
    track.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();
  });
  form.querySelector('[data-grooming-outlet]')?.addEventListener('change', () => {
    form.elements.taxiOutlet.value = form.elements.outlet.value;
    form.querySelector('[data-taxi-outlet-label]').textContent = form.elements.outlet.value;
    refreshSlots();
    refreshTaxiEstimate();
  });
  // Calendar navigation and date selection immediately load that outlet's current available slots.
  calendar.addEventListener('click', (event) => {
    const navigation = event.target.closest('[data-calendar-nav]');
    if (navigation) {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (navigation.dataset.calendarNav === 'next' ? 1 : -1), 1);
      renderAppointmentCalendar();
      return;
    }
    const day = event.target.closest('[data-calendar-date]');
    if (!day || day.disabled) return;
    appointmentDate.value = day.dataset.calendarDate;
    refreshSlots();
  });
  window.addEventListener('storage', (event) => {
    if ([groomingSettingsKey, groomingBookingsKey].includes(event.key)) refreshSlots();
    if ([groomingSettingsKey, petTaxiSettingsKey].includes(event.key)) {
      refreshTaxiEstimate();
      refreshTaxiSchedules();
    }
  });
  form.querySelector('[data-grooming-time-slots]').addEventListener('click', (event) => {
    const option = event.target.closest('[data-grooming-time-option]');
    if (!option) return;
    appointmentTime.value = option.dataset.groomingTimeOption;
    const dateText = new Date(`${appointmentDate.value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    form.querySelector('[data-appointment-summary-text]').textContent = `${dateText} · ${appointmentTime.value}`;
    appointmentSummary.hidden = false;
    form.querySelectorAll('[data-grooming-time-option]').forEach((button) => {
      const selected = button === option;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  });
  form.querySelector('[data-grooming-daycare]')?.addEventListener('change', updateOptionalFields);
  form.querySelector('[data-grooming-taxi]')?.addEventListener('change', updateOptionalFields);
  form.querySelectorAll('[data-grooming-custom-addon]').forEach((input) => input.addEventListener('change', renderQuote));
  form.querySelectorAll('[data-grooming-daycare-hours]').forEach((input) => input.addEventListener('input', renderQuote));
  setupPetTaxiAddressPicker(form, refreshTaxiEstimate);
  form.querySelector('[name="pickupManual"]')?.addEventListener('input', refreshTaxiEstimate);
  form.querySelector('[data-taxi-outlet]')?.addEventListener('change', refreshTaxiEstimate);
  form.querySelector('[data-taxi-schedules]')?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-taxi-schedule-option]');
    if (!option) return;
    form.elements.taxiSchedule.value = option.dataset.taxiScheduleOption;
    form.querySelectorAll('[data-taxi-schedule-option]').forEach((button) => {
      const selected = button === option;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  });
  form.querySelectorAll('[name="paymentMethod"]').forEach((input) => input.addEventListener('change', updateOptionalFields));
  form.querySelector('[data-apply-grooming-voucher]')?.addEventListener('click', () => {
    const code = form.elements.voucherCode.value.trim().toUpperCase();
    const quote = renderQuote();
    const subtotal = quote.packagePrice + quote.daycareTotal + quote.taxiTotal + quote.customAddOnTotal;
    const voucher = settings.voucher;
    const message = form.querySelector('[data-grooming-voucher-feedback]');
    if (!voucher.enabled || !code || code !== String(voucher.code).toUpperCase()) {
      voucherDiscount = 0;
      appliedVoucher = '';
      message.textContent = 'That promo code is not active or is not valid.';
    } else if (subtotal < Number(voucher.minimumSpend || 0)) {
      voucherDiscount = 0;
      appliedVoucher = '';
      message.textContent = `This code requires a minimum spend of ${money(voucher.minimumSpend)}.`;
    } else {
      voucherDiscount = Math.min(subtotal, voucher.type === 'fixed' ? Number(voucher.value) : subtotal * Number(voucher.value) / 100);
      appliedVoucher = code;
      message.textContent = `${code} applied. Your estimate is updated.`;
    }
    renderQuote();
  });

  // Saves the booking, pet safety snapshot, selected add-ons, and payment state locally.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!appointmentDate.value || !appointmentTime.value) {
      feedback.textContent = 'Choose an appointment date and an available time to continue.';
      feedback.classList.add('visible');
      return;
    }
    const quote = renderQuote();
    if (!quote.pet || quote.petPackages.length !== quote.pets.length || quote.petPackages.some((item) => !item.packageItem)) {
      feedback.textContent = 'Choose at least one pet and a service package for every selected pet.';
      feedback.classList.add('visible');
      return;
    }
    if (form.elements.includeTaxi.checked && (!Number(form.elements.taxiDistance.value) || !form.elements.taxiSchedule.value)) {
      feedback.textContent = 'Choose a pickup address with an available route estimate and select a pet taxi pickup time.';
      feedback.classList.add('visible');
      return;
    }
    const latestSettings = loadGroomingSettings();
    const selectedWeekday = new Date(`${appointmentDate.value}T00:00:00`).getDay();
    const bookingToday = new Date();
    const earliestDate = `${bookingToday.getFullYear()}-${String(bookingToday.getMonth() + 1).padStart(2, '0')}-${String(bookingToday.getDate()).padStart(2, '0')}`;
    const bookingDeadline = new Date(bookingToday.getFullYear(), bookingToday.getMonth(), bookingToday.getDate() + Number(latestSettings.bookingHorizonDays || 60));
    const latestDate = `${bookingDeadline.getFullYear()}-${String(bookingDeadline.getMonth() + 1).padStart(2, '0')}-${String(bookingDeadline.getDate()).padStart(2, '0')}`;
    const currentSlotBookings = loadGroomingBookings().filter((booking) => booking.date === appointmentDate.value && booking.outlet === form.elements.outlet.value && booking.time === appointmentTime.value && !['Cancelled', 'Completed'].includes(booking.status));
    const slotStillOpen = appointmentDate.value >= earliestDate
      && appointmentDate.value <= latestDate
      && latestSettings.outlets.includes(form.elements.outlet.value)
      && latestSettings.timeSlots.includes(appointmentTime.value)
      && latestSettings.availableWeekdays.map(Number).includes(selectedWeekday)
      && !(latestSettings.closedDates || []).includes(appointmentDate.value)
      && currentSlotBookings.length < Math.max(1, Number(latestSettings.slotCapacity) || 1);
    if (!slotStillOpen) {
      feedback.textContent = 'That appointment time is no longer available. Choose another available slot.';
      feedback.classList.add('visible');
      refreshSlots();
      return;
    }
    const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
    const paymentMethod = form.elements.paymentMethod.value;
    let receipt = null;
    if (paymentMethod === 'bank-transfer') {
      const slip = form.elements.transferSlip.files?.[0];
      if (!slip) {
        feedback.textContent = 'Upload your transfer slip to continue.';
        feedback.classList.add('visible');
        return;
      }
      if (slip.size > 1024 * 1024) {
        feedback.textContent = 'The transfer slip must be 1 MB or smaller.';
        feedback.classList.add('visible');
        return;
      }
      receipt = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: slip.name, type: slip.type || 'file', data: reader.result, uploadedAt: new Date().toISOString() });
        reader.onerror = reject;
        reader.readAsDataURL(slip);
      }).catch(() => null);
      if (!receipt) {
        feedback.textContent = 'The transfer slip could not be read. Please choose it again.';
        feedback.classList.add('visible');
        return;
      }
    }
    if (paymentMethod === 'wallet') {
      const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
      if (balance < quote.total) {
        feedback.textContent = 'Your Furgo Credit balance is not enough. Choose another payment method or top up Furgo Credit.';
        feedback.classList.add('visible');
        return;
      }
    }
    const remarks = quote.pets.flatMap((item) => {
      const notes = Array.isArray(item.remarks) ? item.remarks : [item.redFlagRemark].filter(Boolean);
      return notes.map((note) => `${item.name}: ${note}`);
    });
    const pickupSelect = form.querySelector('[name="pickup"]');
    const savedAddresses = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); } catch { return []; } })();
    const selectedPickupAddress = pickupSelect && pickupSelect.value !== 'new' ? savedAddresses[Number(pickupSelect.value)] : null;
    const pickup = selectedPickupAddress ? [selectedPickupAddress.label, selectedPickupAddress.street, selectedPickupAddress.city, selectedPickupAddress.state, selectedPickupAddress.postcode].filter(Boolean).join(', ') : form.elements.pickupManual.value.trim();
    const dropoff = form.querySelector('[data-taxi-outlet]').value;
    const booking = {
      id: `grooming-${Date.now()}`, reference: `GR-${Date.now().toString().slice(-7)}`,
      customerName: profile.name || 'Furgo Customer', customerEmail: profile.email || '', customerPhone: profile.phone || '',
      emergencyName: form.elements.emergencyName.value.trim(), emergencyPhone: form.elements.emergencyPhone.value.trim(),
      petId: quote.pet.id, petIds: quote.pets.map((item) => item.id), petName: quote.pets.map((item) => item.name).join(' | '), petBreed: quote.pets.map((item) => item.breed || 'Not provided').join(' | '), petWeight: quote.pets.map((item) => item.weight || '0').join(' | '), petSex: quote.pets.map((item) => item.gender || item.sex || '').join(' | '),
      pets: quote.pets.map((item) => ({ id: item.id, name: item.name, species: item.species || 'Dog', breed: item.breed || 'Not provided', weight: item.weight || '0', sex: item.gender || item.sex || '', vaccinationOnFile: (item.vaccinationCards || []).length > 0, vaccinationCards: item.vaccinationCards || [], redFlags: (Array.isArray(item.remarks) ? item.remarks : [item.redFlagRemark].filter(Boolean)).join(' · ') })),
      vaccinationOnFile: quote.pets.every((item) => (item.vaccinationCards || []).length > 0), vaccinationCards: quote.pets.flatMap((item) => item.vaccinationCards || []), redFlags: remarks.join(' · '),
      packageId: quote.packageItem.id, packageName: quote.petPackages.map((item) => `${item.pet.name}: ${item.packageItem.name}`).join(' | '), packagePrice: quote.packagePrice, petPackages: quote.petPackages.map((item) => ({ petId: item.pet.id, petName: item.pet.name, packageId: item.packageItem.id, packageName: item.packageItem.name, price: item.price })),
      date: appointmentDate.value, time: appointmentTime.value, outlet: form.elements.outlet.value,
      daycareHours: form.elements.includeDaycare.checked ? Number(form.elements.daycareHours.value) : 0,
      daycareTiming: form.elements.daycareTiming.value, daycareTotal: quote.daycareTotal,
      addOns: quote.customAddOns.map((item) => ({ id: item.id, name: item.name, description: item.description || '', price: Number(item.price || 0), quantity: quote.pets.length, lineTotal: Number(item.price || 0) * quote.pets.length })),
      addOnTotal: quote.customAddOnTotal,
      includeTaxi: form.elements.includeTaxi.checked, pickup, dropoff, taxiDistance: quote.taxiDistance, taxiTotal: quote.taxiTotal, taxiSchedule: form.elements.taxiSchedule.value,
      voucherCode: appliedVoucher, discount: voucherDiscount, total: quote.total,
      paymentMethod, paymentStatus: paymentMethod === 'wallet' ? 'Paid with Furgo Credit' : paymentMethod === 'bank-transfer' ? 'Awaiting verification' : 'Pending Payment',
      paymentDeadlineAt: paymentMethod === 'gateway' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : '',
      status: paymentMethod === 'wallet' ? 'Pending / Confirmed' : 'Pending Payment', paymentProof: receipt, receipt: null,
      createdAt: new Date().toISOString(), statusHistory: [{ status: paymentMethod === 'wallet' ? 'Pending / Confirmed' : 'Pending Payment', changedAt: new Date().toISOString(), changedBy: 'Customer' }],
    };
    const { data: authData } = await supabase.auth.getUser();
    let savedBooking = booking;
    if (authData.user) {
      try {
        savedBooking = await createCloudGroomingBooking(booking, authData.user.id);
      } catch (error) {
        feedback.textContent = error?.code === '23505'
          ? 'That time was just booked by another customer. Please choose another available slot.'
          : `We could not save your booking: ${friendlyAuthError(error)}`;
        feedback.classList.add('visible');
        refreshSlots();
        if (error?.code === '23505' && authData.user) {
          void loadCloudGroomingData(authData.user.id, 'customer').then(refreshSlots).catch((loadError) => console.error('Could not refresh grooming availability:', loadError));
        }
        return;
      }
    }
    localStorage.setItem(groomingBookingsKey, JSON.stringify([...loadGroomingBookings(), savedBooking]));
    if (paymentMethod === 'wallet') {
      const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0);
      localStorage.setItem('furgo-demo-credit-balance', String(balance - quote.total));
      const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
      transactions.push({ id: `grooming-${Date.now()}`, type: 'Grooming booking', amount: -quote.total, timestamp: new Date().toISOString() });
      localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
    }
    window.location.hash = '#grooming-orders';
  });
  refreshWeightTier();
  refreshSlots();
  updateOptionalFields();
}

// Admin tools save grooming packages, outlet capacity, booking statuses, and customer receipts.
function setupAdminGrooming() {
  setupServiceAddOns({ serviceKey: 'grooming', settingsKey: groomingSettingsKey, loadSettings: loadGroomingSettings, cloudSync: true });
  const settingsForm = document.querySelector('[data-admin-grooming-settings]');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!settingsForm.reportValidity()) return;
      const settings = loadGroomingSettings();
      const smallMaxKg = Number(settingsForm.elements.smallMaxKg.value);
      const mediumMaxKg = Number(settingsForm.elements.mediumMaxKg.value);
      if (smallMaxKg >= mediumMaxKg) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Medium tier maximum must be greater than small tier maximum.';
        return;
      }
      const packages = [...settingsForm.querySelectorAll('[data-grooming-package-id]')].map((row) => {
        const prior = settings.packages.find((item) => item.id === row.dataset.groomingPackageId);
        const value = (name) => row.querySelector(`[data-package-field="${name}"]`);
        return { ...prior, name: value('name').value.trim(), description: value('description').value.trim(), small: Number(value('small').value), medium: Number(value('medium').value), large: Number(value('large').value), durationMinutes: Number(value('durationMinutes').value), active: value('active').checked };
      });
      const newName = settingsForm.elements.newPackageName.value.trim();
      if (newName) packages.push({ id: `package-${Date.now()}`, name: newName, description: settingsForm.elements.newPackageDescription.value.trim(), small: Number(settingsForm.elements.newPackageSmall.value), medium: Number(settingsForm.elements.newPackageMedium.value), large: Number(settingsForm.elements.newPackageLarge.value), durationMinutes: Number(settingsForm.elements.newPackageDuration.value), active: true });
      const outlets = settings.outlets;
      const timeSlots = settingsForm.elements.timeSlots.value.split(',').map((value) => value.trim()).filter(Boolean);
      const availableWeekdays = [...settingsForm.querySelectorAll('[name="availableWeekdays"]:checked')].map((input) => Number(input.value));
      const closedDates = [...new Set(settingsForm.elements.closedDates.value.split(',').map((value) => value.trim()).filter(Boolean))];
      const updated = {
        ...settings, outlets, timeSlots,
        bookingHorizonDays: Number(settingsForm.elements.bookingHorizonDays.value), availableWeekdays, closedDates,
        slotCapacity: 1, smallMaxKg, mediumMaxKg,
        daycareHourlyRate: Number(settingsForm.elements.daycareHourlyRate.value), packages,
        voucher: { code: settingsForm.elements.voucherCode.value.trim().toUpperCase(), type: settingsForm.elements.voucherType.value, value: Number(settingsForm.elements.voucherValue.value), minimumSpend: Number(settingsForm.elements.voucherMinimumSpend.value), enabled: settingsForm.elements.voucherEnabled.checked },
      };
      if (!updated.outlets.length || !updated.timeSlots.length || !packages.length) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Add at least one outlet, time slot, and service package.';
        return;
      }
      if (!availableWeekdays.length) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Select at least one open weekday for grooming appointments.';
        return;
      }
      if (timeSlots.some((slot) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(slot))) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Enter time slots in 24-hour format, such as 09:00 or 14:30.';
        return;
      }
      if (closedDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`)))) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Enter closed dates in YYYY-MM-DD format.';
        return;
      }
      const feedback = settingsForm.querySelector('[data-admin-grooming-settings-feedback]');
      const { data: authData } = await supabase.auth.getUser();
      try {
        if (authData.user) await saveCloudGroomingSettings(updated, authData.user.id);
        localStorage.setItem(groomingSettingsKey, JSON.stringify(updated));
        void recordAdminAction('grooming_settings_updated', 'service', 'grooming');
        render();
      } catch (error) {
        feedback.textContent = `Could not save grooming settings: ${friendlyAuthError(error)}`;
      }
    });
    settingsForm.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-delete-grooming-package]');
      if (!button) return;
      const settings = loadGroomingSettings();
      if (settings.packages.length <= 1) {
        window.alert('At least one grooming package must remain available.');
        return;
      }
      if (!window.confirm('Delete this service package? Existing bookings will keep their saved package details.')) return;
      settings.packages = settings.packages.filter((item) => item.id !== button.dataset.deleteGroomingPackage);
      const { data: authData } = await supabase.auth.getUser();
      try {
        if (authData.user) await saveCloudGroomingSettings(settings, authData.user.id);
        localStorage.setItem(groomingSettingsKey, JSON.stringify(settings));
        void recordAdminAction('grooming_package_removed', 'grooming_package', button.dataset.deleteGroomingPackage);
        render();
      } catch (error) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = `Could not delete the package: ${friendlyAuthError(error)}`;
      }
    });
  }

  document.querySelectorAll('[data-grooming-receipt-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const file = form.elements.receipt.files?.[0];
    if (!file || file.size > 1024 * 1024) {
      window.alert('Choose a receipt file no larger than 1 MB.');
      return;
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!data) {
      window.alert('The receipt could not be read. Please choose it again.');
      return;
    }
    const bookings = loadGroomingBookings();
    const booking = bookings.find((item) => item.id === form.dataset.groomingReceiptForm);
    if (!booking) return;
    const previousStatus = booking.receipt?.previousStatus || booking.adminStatus || booking.status || 'New Order';
    const previousPaymentStatus = booking.receipt?.previousPaymentStatus ?? booking.paymentStatus;
    booking.receipt = { type: form.elements.receiptType.value, name: file.name, data, uploadedAt: new Date().toISOString(), previousStatus, previousPaymentStatus };
    booking.paymentStatus = `${booking.receipt.type} receipt uploaded`;
    const taxiTripStarted = Boolean(booking.includeTaxi || booking.taxi?.pickup || booking.taxi?.dropoff)
      && !['Scheduled', 'Assigned'].includes(booking.taxiProgress?.status || 'Scheduled');
    if (!taxiTripStarted && !/checked in|complete|cancel/i.test(previousStatus)) {
      booking.adminStatus = 'Received Order';
      booking.status = 'Received Order';
      booking.statusHistory = [...(booking.statusHistory || []), { status: 'Received Order', previousStatus, changedAt: booking.receipt.uploadedAt, changedBy: 'Admin receipt upload' }];
    }
    try {
      await updateCloudGroomingBooking(booking);
      localStorage.setItem(groomingBookingsKey, JSON.stringify(bookings));
      void recordAdminAction('receipt_uploaded', 'grooming_booking', booking.reference || booking.id);
      render();
    } catch (error) {
      window.alert(`Could not save the receipt: ${friendlyAuthError(error)}`);
    }
  }));

  document.querySelectorAll('[data-delete-grooming-receipt]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Delete the uploaded receipt for this booking?')) return;
    const bookings = loadGroomingBookings();
    const booking = bookings.find((item) => item.id === button.dataset.deleteGroomingReceipt);
    if (!booking?.receipt) return;
    const previousStatus = booking.receipt.previousStatus;
    const previousPaymentStatus = booking.receipt.previousPaymentStatus;
    delete booking.receipt;
    if (previousPaymentStatus !== undefined) booking.paymentStatus = previousPaymentStatus;
    else if (/receipt uploaded/i.test(String(booking.paymentStatus || ''))) delete booking.paymentStatus;
    if (/^received order$/i.test(String(booking.adminStatus || booking.status || '')) && previousStatus) {
      booking.adminStatus = previousStatus;
      booking.status = previousStatus;
      booking.statusHistory = [...(booking.statusHistory || []), { status: previousStatus, previousStatus: 'Received Order', changedAt: new Date().toISOString(), changedBy: 'Admin receipt removal' }];
    }
    try {
      await updateCloudGroomingBooking(booking);
      localStorage.setItem(groomingBookingsKey, JSON.stringify(bookings));
      void recordAdminAction('receipt_removed', 'grooming_booking', booking.reference || booking.id);
      render();
    } catch (error) {
      window.alert(`Could not delete the receipt: ${friendlyAuthError(error)}`);
    }
  }));
}

// Starts camera scanning directly from the Admin footer and applies the scanned order token.
function setupAdminFooterScanner() {
  const trigger = document.querySelector('[data-admin-footer-scan]');
  const dialog = document.querySelector('[data-admin-footer-scan-dialog]');
  const video = document.querySelector('[data-admin-footer-scan-video]');
  const feedback = document.querySelector('[data-admin-footer-scan-feedback]');
  if (!trigger || !dialog || !video || !feedback) return;
  let scanner = null;
  const stopCamera = () => {
    scanner?.stop();
    scanner = null;
    video.pause();
    video.srcObject = null;
    video.hidden = true;
  };
  const closeScanner = () => { if (dialog.open) dialog.close(); else stopCamera(); };
  dialog.addEventListener('close', stopCamera);
  dialog.querySelector('[data-close-admin-scan]')?.addEventListener('click', closeScanner);
  window.addEventListener('hashchange', closeScanner, { once: true });

  trigger.addEventListener('click', async () => {
    if (dialog.open) return;
    dialog.showModal();
    feedback.textContent = 'Starting camera…';
    try {
      try { await refreshCheckInTokens(); }
      catch (error) { feedback.textContent = `Could not refresh shared check-in codes: ${error.message}`; }
      scanner = await startQRScanner({
        video,
        shouldRun: () => dialog.open,
        onStatus: (message) => { feedback.textContent = message; },
        onCode: (scanned) => {
          const manualCode = formatCheckInToken(extractCheckInCode(scanned));
          if (!manualCode) {
            feedback.textContent = 'The QR code did not contain a manual check-in code.';
            return false;
          }
          feedback.textContent = 'QR code scanned. Opening Orders with the manual code filled in.';
          window.setTimeout(() => {
            if (dialog.open) dialog.close();
            window.location.hash = `#admin-orders?view=scan&code=${encodeURIComponent(manualCode)}`;
          }, 300);
          return true;
        },
      });
    } catch (error) {
      stopCamera();
      feedback.textContent = `${error.message} Opening the order page for manual code entry.`;
      window.setTimeout(() => { window.location.hash = '#admin-orders?view=scan'; }, 1400);
    }
  });
}

// Wires shared page actions, pet profiles, forms, profile editing, support, and authentication prototypes.
function setupDedicatedSearchPage() {
  const root = document.querySelector('[data-search-page]');
  const form = root?.querySelector('[data-search-page-form]');
  const input = root?.querySelector('[data-search-page-input]');
  const results = root?.querySelector('[data-search-results]');
  const recentsSection = root?.querySelector('[data-recent-section]');
  const recentList = root?.querySelector('[data-recent-searches]');
  const discoverSection = root?.querySelector('[data-discover-section]');
  if (!root || !form || !input || !results) return;

  const serviceEntries = [
    { title: 'Marketplace', detail: 'Shop food, treats, toys, and pet essentials', href: '#marketplace', keywords: 'marketplace shop shopping food snacks treats products toys supplements', selectedType: 'service', selectedKey: 'marketplace' },
    { title: 'Grooming', detail: 'Book a grooming appointment', href: '#grooming', keywords: 'groom grooming groomer bath wash haircut trim brush', selectedType: 'service', selectedKey: 'grooming' },
    { title: 'Pet Hotel', detail: 'Explore overnight pet stays', href: '#hotel', keywords: 'hotel boarding overnight stay accommodation', selectedType: 'service', selectedKey: 'hotel' },
    { title: 'Pet Daycare', detail: 'Explore daytime pet care', href: '#daycare', keywords: 'daycare day care sitter sitting playgroup', selectedType: 'service', selectedKey: 'daycare' },
  ];
  const productAliases = {
    'furgo-snack-pumpkin': 'pet cookies cookies cookie dog cookies dog treats biscuits biscuit snacks',
    'furgo-treat-chicken': 'dog treats chicken bites snacks training treats',
  };
  let currentMatches = [];
  let currentResultCount = 0;
  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const readRecents = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(recentSearchesKey) || '[]');
      return Array.isArray(stored) ? stored.filter((term) => typeof term === 'string').slice(0, 8) : [];
    } catch { return []; }
  };
  const saveRecent = (value) => {
    const term = String(value || '').trim();
    if (!term) return;
    const recents = [term, ...readRecents().filter((item) => normalize(item) !== normalize(term))].slice(0, 8);
    localStorage.setItem(recentSearchesKey, JSON.stringify(recents));
  };
  const recordSearchEvent = async (value, resultCount, selectedMatch = null) => {
    const term = normalize(value).replace(/\s+/g, ' ');
    if (!term || term.length > 80 || /\S+@\S+\.\S+/.test(term) || /\+?\d[\d ()-]{7,}\d/.test(term)) return;
    const { error } = await supabase.from('search_analytics').insert({
      search_term: term,
      result_count: Math.max(0, Math.min(1000, Number(resultCount) || 0)),
      selected_type: selectedMatch?.selectedType || selectedMatch?.type || null,
      selected_key: selectedMatch?.selectedKey || selectedMatch?.key || null,
    });
    if (error) console.warn('Search analytics could not be saved:', error.message);
  };
  const displayRecents = () => {
    const recents = readRecents();
    recentList.replaceChildren();
    recents.forEach((term) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'search-chip';
      chip.dataset.searchTerm = term;
      chip.textContent = term;
      recentList.append(chip);
    });
    recentsSection.hidden = recents.length === 0;
  };
  const renderResults = (query) => {
    const normalizedQuery = normalize(query);
    results.replaceChildren();
    currentMatches = [];
    if (!normalizedQuery) {
      results.hidden = true;
      recentsSection.hidden = readRecents().length === 0;
      discoverSection.hidden = false;
      input.setAttribute('aria-expanded', 'false');
      currentResultCount = 0;
      return;
    }

    recentsSection.hidden = true;
    discoverSection.hidden = true;
    const products = loadMarketplaceProducts().filter((product) => !product.hidden && !product.frozenByAdmin && product.variants?.some((variant) => !variant.frozen && Number(variant.stock) > 0));
    const productMatches = products.map((product) => {
      const searchable = normalize([
        product.name, product.category, product.description, product.extraDescription,
        product.petTypes, product.suitableBreeds, product.issues, product.ingredients, product.nutrition, productAliases[product.id],
      ].filter(Boolean).join(' '));
      if (!searchable.includes(normalizedQuery)) return null;
      const isCookieSearch = normalize(productAliases[product.id]).includes(normalizedQuery) && /cookie|biscuit/.test(normalizedQuery);
      return {
        title: isCookieSearch ? `${query.trim()[0].toUpperCase()}${query.trim().slice(1)}` : product.name,
        detail: `${product.name} · Marketplace${product.category ? ` · ${product.category}` : ''}`,
        href: `#product?id=${encodeURIComponent(product.id)}`,
        searchText: searchable,
        selectedType: 'product',
        selectedKey: product.id,
      };
    }).filter(Boolean);
    const serviceMatches = serviceEntries.filter((entry) => normalize(`${entry.title} ${entry.detail} ${entry.keywords}`).includes(normalizedQuery)).map((entry) => ({ ...entry, searchText: normalize(`${entry.title} ${entry.detail} ${entry.keywords}`) }));
    const allMatches = [...productMatches, ...serviceMatches].sort((a, b) => {
      const aStarts = a.searchText.startsWith(normalizedQuery) || normalize(a.title).startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = b.searchText.startsWith(normalizedQuery) || normalize(b.title).startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts;
    });
    currentResultCount = allMatches.length;
    currentMatches = allMatches.slice(0, 8);

    if (!currentMatches.length) {
      const empty = document.createElement('p');
      empty.className = 'search-no-results';
      empty.textContent = 'No relevant items found.';
      results.append(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'search-result-list';
      currentMatches.forEach((match) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'search-result-item';
        link.href = match.href;
        const title = document.createElement('strong');
        title.textContent = match.title;
        const detail = document.createElement('span');
        detail.textContent = match.detail;
        link.append(title, detail);
        item.append(link);
        list.append(item);
      });
      results.append(list);
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  displayRecents();
  input.addEventListener('input', () => renderResults(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      renderResults('');
      input.blur();
    } else if (event.key === 'ArrowDown' && currentMatches.length) {
      event.preventDefault();
      results.querySelector('a')?.focus();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim()) saveRecent(input.value);
    if (!currentMatches.length) {
      void recordSearchEvent(input.value, 0);
      renderResults(input.value);
      return;
    }
    void recordSearchEvent(input.value, currentResultCount, currentMatches[0]);
    window.location.hash = currentMatches[0].href;
  });
  results.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (link) {
      saveRecent(input.value);
      const match = currentMatches.find((item) => item.href === link.getAttribute('href'));
      void recordSearchEvent(input.value, currentResultCount, match);
    }
  });
  root.addEventListener('click', (event) => {
    const termButton = event.target.closest('[data-search-term]');
    if (termButton) {
      input.value = termButton.dataset.searchTerm;
      renderResults(input.value);
      input.focus();
    }
    if (event.target.closest('[data-clear-searches]')) {
      localStorage.removeItem(recentSearchesKey);
      displayRecents();
    }
  });
  window.setTimeout(() => input.focus(), 0);
}

async function setupAdminSearchAnalytics() {
  const root = document.querySelector('[data-admin-search-analytics]');
  const content = root?.querySelector('[data-search-analytics-content]');
  const period = root?.querySelector('[data-search-analytics-period]');
  if (!root || !content || !period) return;

  const renderInsights = async () => {
    content.textContent = 'Loading search insights…';
    const { data, error } = await supabase.rpc('get_search_analytics', { p_days: Number(period.value) || 30 });
    if (error) {
      content.textContent = 'Search analytics are not connected yet. Apply supabase/migrations/0006_search_analytics.sql to enable collection and reporting.';
      return;
    }
    const insights = data && typeof data === 'object' ? data : {};
    const topTerms = Array.isArray(insights.top_terms) ? insights.top_terms : [];
    const noResultTerms = Array.isArray(insights.no_result_terms) ? insights.no_result_terms : [];
    const clickedResults = Array.isArray(insights.clicked_results) ? insights.clicked_results : [];
    const names = new Map([
      ...loadMarketplaceProducts().map((product) => [product.id, product.name]),
      ['marketplace', 'Marketplace'], ['grooming', 'Grooming'], ['hotel', 'Pet Hotel'], ['daycare', 'Pet Daycare'],
    ]);
    const tableRows = (rows, nameKey, countKey, secondColumn) => rows.length
      ? rows.map((item) => `<tr><td>${escapeHTML(item[nameKey] || 'Unknown')}</td><td>${Number(item[countKey]) || 0}</td>${secondColumn ? `<td>${secondColumn(item)}</td>` : ''}</tr>`).join('')
      : '<tr><td colspan="3">No searches in this period.</td></tr>';
    const termTable = (title, rows, countKey, thirdHeader = '') => `<div class="admin-search-table-wrap"><h3>${title}</h3><table class="admin-search-table"><thead><tr><th>Search term</th><th>Count</th>${thirdHeader ? `<th>${thirdHeader}</th>` : ''}</tr></thead><tbody>${tableRows(rows, 'search_term', countKey, thirdHeader ? (item) => Number(item.selected_count) || 0 : null)}</tbody></table></div>`;
    content.innerHTML = `<div class="admin-search-total-row"><div class="admin-search-total"><span>Searches</span><strong>${Number(insights.total_searches) || 0}</strong></div><div class="admin-search-total"><span>Searches With No Matches</span><strong>${Number(insights.no_result_searches) || 0}</strong></div></div><div class="admin-search-tables">${termTable('Most Searched', topTerms, 'searches', 'Selected Result')}${termTable('No-Match Searches', noResultTerms, 'searches')}</div><div class="admin-search-table-wrap admin-search-clicked"><h3>Most Selected Results</h3><table class="admin-search-table"><thead><tr><th>Result</th><th>Type</th><th>Selections</th></tr></thead><tbody>${clickedResults.length ? clickedResults.map((item) => `<tr><td>${escapeHTML(names.get(item.selected_key) || item.selected_key || 'Unknown')}</td><td>${escapeHTML(item.selected_type || '')}</td><td>${Number(item.clicks) || 0}</td></tr>`).join('') : '<tr><td colspan="3">No selected results in this period.</td></tr>'}</tbody></table></div>`;
  };
  period.addEventListener('change', () => { void renderInsights(); });
  void renderInsights();
}

async function setupCustomerEnquiryHistory() {
  const root = document.querySelector('[data-customer-enquiries]');
  if (!root) return;
  const { data, error } = await supabase.from('support_enquiries')
    .select('id,topic,message,created_at,reply,replied_at')
    .order('created_at', { ascending: false });
  if (error) {
    root.textContent = 'Your enquiry history is not available right now.';
    return;
  }
  const enquiries = Array.isArray(data) ? data : [];
  root.innerHTML = enquiries.length ? enquiries.map((enquiry) => {
    const received = enquiry.created_at ? new Date(enquiry.created_at) : null;
    const replied = enquiry.replied_at ? new Date(enquiry.replied_at) : null;
    const hasReply = Boolean(enquiry.reply && replied);
    return `<article class="customer-enquiry-entry"><header><strong>${escapeHTML(enquiry.topic || 'General enquiry')}</strong><span class="admin-enquiry-status ${hasReply ? 'is-replied' : 'is-pending'}">${hasReply ? 'Replied' : 'Awaiting reply'}</span></header><time datetime="${escapeHTML(enquiry.created_at || '')}">Sent ${escapeHTML(received && !Number.isNaN(received.getTime()) ? received.toLocaleString('en-MY') : 'date not recorded')}</time><p>${escapeHTML(enquiry.message || '')}</p>${hasReply ? `<section><strong>Furgo replied</strong><time datetime="${escapeHTML(enquiry.replied_at)}">${escapeHTML(!Number.isNaN(replied.getTime()) ? replied.toLocaleString('en-MY') : '')}</time><p>${escapeHTML(enquiry.reply)}</p></section>` : ''}</article>`;
  }).join('') : '<p>No enquiries yet. Use Share Feedback to send a message to Furgo.</p>';
}

function wireForms() {
  if (!groomingQrSyncListenerInstalled) {
    document.addEventListener('furgo-order-status-updated', async (event) => {
      const booking = event.detail;
      if (booking?.orderKey !== groomingBookingsKey) return;
      try { await updateCloudGroomingBooking(booking); }
      catch (error) { console.warn('The grooming QR status could not be saved to Supabase:', error); }
    });
    document.addEventListener('furgo-customer-status-updated', async (event) => {
      const customer = event.detail;
      if (!customer?.authUserId) return;
      const status = customer.status === 'Blacklisted' ? 'blacklisted' : customer.status === 'Restricted' ? 'restricted' : 'active';
      const { error } = await supabase.from('account_controls').update({ status, updated_by: activeSupabaseUserId }).eq('user_id', customer.authUserId);
      if (error) window.alert(`Customer status could not be saved to Supabase: ${friendlyAuthError(error)}`);
    });
    document.addEventListener('furgo-admin-pet-remarks-updated', async (event) => {
      const pet = event.detail;
      if (!pet?.id) return;
      const { error } = await supabase.from('pet_profiles').update({ remarks: pet.remarks || [], updated_at: new Date().toISOString() }).eq('id', pet.id);
      if (error) window.alert(`Pet remarks could not be saved to Supabase: ${friendlyAuthError(error)}`);
    });
    groomingQrSyncListenerInstalled = true;
  }
  setupHomePetProfiles();
  setupPetProfileForm();
  setupAdminPromotionsForm();
  setupMarketplaceInteractions();
  setupAdminMarketplace();
  setupMarketplaceSupplierPortal();
  setupGroomingBooking();
  setupAdminGrooming();
  setupHotelBooking();
  setupAdminHotel();
  setupDaycareBooking();
  setupAdminDaycare();
  setupAdminPetTaxi();
  setupAdminServiceBanners();
  setupServiceBannerCarousel();
  setupAdminOrders();
  setupMyOrders();
  setupCheckInInteractions();
  setupAdminAccess();
  setupAdminAuditPage();
  setupAdminEnquiries();
  setupAdminCustomers();
  setupAdminProductServiceInsights();
  setupAdminLocalFinder(supabase);
  setupAdminPortal();
  void setupCustomerEnquiryHistory();
  setupAdminFooterScanner();
  setupDriverPortal();
  setupDedicatedSearchPage();
  setupLocalFinder(supabase);
  void setupAdminSearchAnalytics();
  const toast = document.querySelector('.home-toast');
  if (toast) {
    document.querySelectorAll('[data-toast]').forEach((item) => item.addEventListener('click', (event) => {
      event.preventDefault();
      toast.textContent = item.dataset.toast;
      toast.classList.add('visible');
      window.setTimeout(() => toast.classList.remove('visible'), 2600);
    }));
    document.querySelectorAll('[data-coming-soon]').forEach((item) => item.addEventListener('click', (event) => {
      event.preventDefault();
      toast.textContent = `${item.querySelector('span')?.textContent || 'This section'} will be available soon.`;
      toast.classList.add('visible');
      window.setTimeout(() => toast.classList.remove('visible'), 2600);
    }));
  }

  // Save the editable username while preserving the read-only phone and email.
  const profileForm = document.querySelector('[data-profile-form]');
  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
    const message = profileForm.querySelector('.form-feedback');
    const updatedName = profileForm.querySelector('[name="name"]').value.trim();
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { error } = await supabase.from('profiles').update({ display_name: updatedName }).eq('id', authData.user.id);
      if (error) {
        message.textContent = `Could not update your name: ${friendlyAuthError(error)}`;
        message.classList.add('visible');
        return;
      }
      const { error: authError } = await supabase.auth.updateUser({ data: { display_name: updatedName } });
      if (authError) console.warn('The profile name was saved, but Auth metadata could not be refreshed:', authError);
    }
    profile.name = updatedName;
    sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(profile));
    saveCustomerRecord(profile);
    message.textContent = 'Your name has been updated.';
    message.classList.add('visible');
    if (window.location.hash.split('?')[0] === '#edit-profile') {
      const returnTo = new URLSearchParams(window.location.hash.split('?')[1] || '').get('from');
      window.setTimeout(() => { window.location.hash = returnTo === 'home' ? '#home' : '#profile'; }, 450);
    }
  });

  // Save feedback in the account's synced app data so it appears in the Admin enquiry inbox.
  const supportForm = document.querySelector('[data-support-form]');
  supportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supportForm.reportValidity()) return;
    const message = supportForm.querySelector('.form-feedback');
    const submitButton = supportForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    message.textContent = 'Sending your enquiry…';
    message.classList.add('visible');
    const { error } = await supabase.rpc('submit_support_enquiry', {
      p_topic: supportForm.elements.topic.value,
      p_message: supportForm.elements.message.value.trim(),
    });
    submitButton.disabled = false;
    if (error) {
      message.textContent = error.message || 'Your enquiry could not be sent. Please try again.';
      return;
    }
    message.textContent = 'Your enquiry has been sent. You can check for Furgo’s reply in the Help Center.';
    supportForm.reset();
  });

  // Saves and removes delivery addresses in browser storage for the customer portal prototype.
  const addressForm = document.querySelector('[data-address-form]');
  addressForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!addressForm.reportValidity()) return;
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    addresses.push(Object.fromEntries(new FormData(addressForm).entries()));
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    render();
  });
  document.querySelectorAll('[data-remove-address]').forEach((button) => button.addEventListener('click', () => {
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    addresses.splice(Number(button.dataset.removeAddress), 1);
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    render();
  }));

  // Stores masked payment method details only; the prototype never processes a payment.
  const paymentForm = document.querySelector('[data-payment-form]');
  paymentForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!paymentForm.reportValidity()) return;
    const methods = JSON.parse(localStorage.getItem('furgo-demo-payment-methods') || '[]');
    const number = paymentForm.elements.number.value.replace(/\D/g, '');
    const method = { type: 'card', brand: number.startsWith('4') ? 'Visa' : number.startsWith('5') ? 'Mastercard' : 'Payment card', lastFour: number.slice(-4), default: paymentForm.elements.default.checked };
    if (method.default) methods.forEach((savedMethod) => { savedMethod.default = false; });
    methods.push(method);
    localStorage.setItem('furgo-demo-payment-methods', JSON.stringify(methods));
    render();
  });
  document.querySelectorAll('[data-remove-payment]').forEach((button) => button.addEventListener('click', () => {
    const methods = JSON.parse(localStorage.getItem('furgo-demo-payment-methods') || '[]');
    methods.splice(Number(button.dataset.removePayment), 1);
    localStorage.setItem('furgo-demo-payment-methods', JSON.stringify(methods));
    render();
  }));

  // Simulates a credit top-up locally so the balance and transaction history can be previewed.
  const creditForm = document.querySelector('[data-credit-form]');
  creditForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = Number(creditForm.elements.amount.value);
    const balance = Number(localStorage.getItem('furgo-demo-credit-balance') || 0) + amount;
    const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
    transactions.unshift({ label: 'Demo Furgo Credit top-up', amount, date: new Date().toLocaleDateString() });
    localStorage.setItem('furgo-demo-credit-balance', String(balance));
    localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
    document.querySelector('[data-credit-balance]').textContent = `MYR ${balance.toFixed(2)}`;
    const row = document.createElement('li');
    const details = document.createElement('span');
    const label = document.createElement('strong');
    const date = document.createElement('small');
    const value = document.createElement('b');
    label.textContent = 'Demo Furgo Credit top-up';
    date.textContent = new Date().toLocaleDateString();
    value.textContent = `+ MYR ${amount.toFixed(2)}`;
    details.append(label, date);
    row.append(details, value);
    document.querySelector('[data-credit-history]').prepend(row);
    creditForm.querySelector('.form-feedback').textContent = 'Demo Furgo Credit added to your balance.';
    creditForm.querySelector('.form-feedback').classList.add('visible');
  });

  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    void supabase.auth.signOut().finally(() => {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-demo-profile-complete');
      sessionStorage.removeItem('furgo-demo-user-role');
      sessionStorage.removeItem('furgo-demo-user-profile');
      window.location.hash = '#login';
    });
  }));

  const form = document.querySelector('[data-auth-form], [data-onboarding-form]');
  if (!form) return;
  const feedback = document.querySelector('.form-feedback');

  // Clear a prior format error as soon as the user edits the shared login identifier.
  const loginIdentifier = form.querySelector('[data-login-identifier]');
  loginIdentifier?.addEventListener('input', () => loginIdentifier.setCustomValidity(''));
  form.querySelectorAll('[data-phone-input]').forEach((input) => {
    input.addEventListener('input', () => input.setCustomValidity(''));
  });

  const showPassword = form.querySelector('.show-password');
  showPassword?.addEventListener('click', () => {
    const input = showPassword.parentElement.querySelector('input');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    showPassword.textContent = visible ? 'Hide' : 'Show';
    showPassword.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = form.dataset.authForm;
    if (mode === 'login' && loginIdentifier) loginIdentifier.setCustomValidity(loginIdentifierError(loginIdentifier.value));
    const directPhoneInput = form.querySelector('[data-phone-input]');
    if ((mode === 'register' || form.hasAttribute('data-onboarding-form')) && directPhoneInput) {
      directPhoneInput.setCustomValidity(malaysianMobileError(directPhoneInput.value));
    }
    if (!form.reportValidity()) return;
    const loginValue = loginIdentifier?.value.trim() || '';
    const isPhoneLogin = mode === 'login' && !loginValue.includes('@');
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    feedback.textContent = 'Connecting securely…';
    feedback.classList.add('visible');
    try {
      let identity;
      if (mode === 'login') {
        const credentials = { password: form.querySelector('[name="password"]').value };
        if (isPhoneLogin) {
          throw new Error('Phone login is temporarily unavailable while phone verification is turned off. Use your email address for development testing.');
        }
        credentials.email = loginValue.toLowerCase();
        const { data, error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        identity = await loadSupabaseIdentity(data.user);
        recordOnboardingEvent('login_completed', identity.authChannel);
      } else if (mode === 'register') {
        const name = form.querySelector('[name="name"]').value.trim();
        const email = form.querySelector('[name="email"]').value.trim().toLowerCase();
        const phone = toMalaysianE164(directPhoneInput.value);
        const password = form.querySelector('[name="password"]').value;
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name, phone_e164: phone } },
        });
        if (signupError) throw signupError;
        if (!signupData.session) {
          feedback.textContent = 'Account created. Check your email for a confirmation link, then log in with your email and password.';
          return;
        }
        const user = signupData.user;
        const { error: profileError } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id);
        if (profileError) throw profileError;
        identity = await loadSupabaseIdentity(user);
        identity.phone = directPhoneInput.value.replace(/[\s-]/g, '');
        sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(identity));
        recordOnboardingEvent('registration_completed', 'phone_password_development');
      } else {
        throw new Error('This authentication form is not supported.');
      }
      if (identity.role === 'customer') {
        const customerRecord = saveCustomerRecord(identity);
        if (customerRecord?.status === 'Blacklisted') {
          await supabase.auth.signOut();
          throw new Error('This account is blacklisted. Please contact Furgo Support for assistance.');
        }
      }
      feedback.textContent = mode === 'register'
        ? 'Account created for development testing. Opening your Furgo home…'
        : identity.role === 'director' ? 'Director sign-in successful. Opening the Admin Portal…'
          : identity.role === 'manager' ? 'Manager sign-in successful. Opening the Admin Portal…'
            : identity.role === 'executive' ? 'Executive sign-in successful. Opening the Admin Portal…'
          : identity.role === 'supplier' ? 'Supplier sign-in successful. Opening the Marketplace Supplier Portal…'
          : identity.role === 'driver' ? 'Driver sign-in successful. Opening the Driver Portal…'
            : 'Sign-in successful. Opening your Furgo home…';
      window.setTimeout(() => { window.location.hash = ['director', 'manager', 'executive'].includes(identity.role) ? '#admin' : identity.role === 'supplier' ? '#supplier' : identity.role === 'driver' ? '#driver' : '#home'; }, 500);
    } catch (error) {
      feedback.textContent = friendlyAuthError(error);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  document.querySelector('[data-forgot]')?.addEventListener('click', (event) => {
    event.preventDefault();
    const email = loginIdentifier?.value.trim() || '';
    if (!email || !email.includes('@')) {
      feedback.textContent = 'Enter your email address above to receive a password reset link.';
      feedback.classList.add('visible');
      return;
    }
    void supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}#login` })
      .then(({ error }) => {
        feedback.textContent = error ? friendlyAuthError(error) : 'If an account uses that email, a password reset link has been sent.';
        feedback.classList.add('visible');
      });
  });
}

// Chooses the screen module for the current route and applies the Supabase authentication gate.
async function render() {
  if (!supabaseAuthReady) return;
  const requestedHash = window.location.hash;
  const requestedPage = requestedHash.slice(1).split('?')[0];
  if (['grooming', 'hotel', 'daycare', 'admin-access', 'admin-grooming', 'admin-hotel', 'admin-daycare'].includes(requestedPage)) {
    await refreshSharedOutlets();
    if (window.location.hash !== requestedHash) return render();
  }
  const [routeName = '', routeQuery = ''] = window.location.hash.slice(1).split('?');
  const page = routeName || 'home';
  const routeParams = new URLSearchParams(routeQuery);
  const hasDemoSession = sessionStorage.getItem('furgo-demo-auth') === 'true';
  if (hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'customer') {
    try {
      const currentCustomer = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      saveCustomerRecord(currentCustomer);
    } catch { /* Keep the current page usable if local demo profile data is malformed. */ }
  }
  const directorPages = ['admin-customers', 'admin-product-insights'];
  const managerPages = ['admin-promotions', 'admin-pet-taxi', 'admin-marketplace-manage', 'admin-marketplace-products', 'admin-local-finder'];
  const serviceAdminPages = ['admin-marketplace', 'admin-grooming', 'admin-hotel', 'admin-daycare'];
  const portalPages = ['admin', 'admin-orders', 'admin-access', 'admin-enquiries', 'admin-audit', ...managerPages, ...serviceAdminPages, ...directorPages];
  const supplierPages = ['supplier'];
  const driverPages = ['driver'];
  const savedRole = sessionStorage.getItem('furgo-demo-user-role');
  const currentRole = savedRole === 'staff' ? 'executive' : savedRole === 'admin' ? 'director' : savedRole;
  if (currentRole !== savedRole && currentRole) {
    sessionStorage.setItem('furgo-demo-user-role', currentRole);
    try {
      const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      profile.role = currentRole;
      sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(profile));
    } catch { /* Keep the portal usable if old session data is malformed. */ }
  }
  if (page === 'admin-local-finder' && !['manager', 'director'].includes(currentRole)) {
    window.location.hash = currentRole === 'executive' ? '#admin' : '#login';
    return;
  }
  if (portalPages.includes(page) && (!hasDemoSession || !['executive', 'manager', 'director'].includes(currentRole))) {
    window.location.hash = '#login';
    return;
  }
  if (directorPages.includes(page) && currentRole !== 'director') {
    window.location.hash = currentRole === 'manager' ? '#admin-access' : currentRole === 'executive' ? '#admin-orders' : '#login';
    return;
  }
  if (managerPages.includes(page) && !['executive', 'manager', 'director'].includes(currentRole)) {
    window.location.hash = '#login';
    return;
  }
  if (serviceAdminPages.includes(page) && routeParams.get('manage') === '1' && !['executive', 'manager', 'director'].includes(currentRole)) {
    window.location.hash = '#admin-access';
    return;
  }
  if (supplierPages.includes(page) && (!hasDemoSession || currentRole !== 'supplier')) {
    window.location.hash = '#login';
    return;
  }
  if (hasDemoSession && currentRole === 'supplier' && page !== 'supplier' && page !== 'login') {
    window.location.hash = '#supplier';
    return;
  }
  if (driverPages.includes(page) && (!hasDemoSession || sessionStorage.getItem('furgo-demo-user-role') !== 'driver')) {
    window.location.hash = '#login';
    return;
  }
  const protectedPages = ['home', 'search', 'services', 'about', 'profile', 'edit-profile', 'help-center', 'feedback', 'pet-profile', 'address', 'payment-method', 'credit', 'marketplace', 'local-finder', 'local-finder-list', 'local-finder-place', 'product', 'seller', 'cart', 'checkout', 'orders', 'check-in', 'favourites', 'grooming', 'grooming-orders', 'hotel', 'daycare'];
  if (hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'driver' && page !== 'driver' && page !== 'login') {
    window.location.hash = '#driver';
    return;
  }
  if (protectedPages.includes(page) && hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'customer') {
    let customerProfile = {};
    try { customerProfile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { customerProfile = {}; }
    if (getCustomerAccountStatus(customerProfile) === 'Blacklisted') {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-demo-profile-complete');
      sessionStorage.removeItem('furgo-demo-user-role');
      window.location.hash = '#login';
      return;
    }
  }
  if (protectedPages.includes(page) && !hasDemoSession) {
    window.location.hash = '#login';
    return;
  }
  if (page === 'onboarding' && !hasDemoSession) {
    window.location.hash = '#login';
    return;
  }
  if (protectedPages.includes(page) && sessionStorage.getItem('furgo-demo-profile-complete') !== 'true') {
    window.location.hash = '#onboarding';
    return;
  }
  if (page === 'onboarding' && sessionStorage.getItem('furgo-demo-profile-complete') === 'true') {
    window.location.hash = '#home';
    return;
  }

  const pageRenderers = {
    home: homePage,
    search: searchPage,
    login: loginPage,
    register: registerPage,
    onboarding: onboardingPage,
    profile: profilePage,
    'edit-profile': () => editProfilePage(routeParams.get('from') || 'profile'),
    'help-center': () => helpCenterPage(routeParams.get('from') || 'profile'),
    feedback: () => feedbackPage(routeParams.get('from') || 'profile', routeParams.get('return') || 'profile'),
    address: () => addressPage(routeParams.get('from') || 'profile'),
    'payment-method': () => paymentMethodPage(routeParams.get('from') || 'profile'),
    credit: () => creditPage(routeParams.get('from') || 'profile'),
    marketplace: () => marketplacePage(routeParams.get('category') || 'All'),
    'local-finder': localFinderPage,
    'local-finder-list': () => localFinderListPage(routeParams),
    'local-finder-place': () => localFinderPlacePage(routeParams),
    'admin-local-finder': () => adminLocalFinderPage(routeParams),
    favourites: marketplaceFavoritesPage,
    product: () => marketplaceProductPage(routeParams.get('id') || ''),
    seller: () => marketplaceSellerPage(routeParams.get('name') || ''),
    cart: marketplaceCartPage,
    checkout: marketplaceCheckoutPage,
    orders: () => myOrdersPage(routeParams),
    'check-in': () => checkInPage(routeParams),
    grooming: () => groomingBookingPage(routeParams.get('pet') || ''),
    'grooming-orders': groomingOrdersPage,
    hotel: petHotelPage,
    daycare: petDaycarePage,
    'pet-profile': () => petProfilePage({ petId: routeParams.get('id') || '', mode: routeParams.get('mode') || '', returnTo: routeParams.get('from') || 'home' }),
    admin: adminPortalPage,
    'admin-orders': () => adminOrdersPage(routeParams),
    'admin-promotions': adminPromotionsPage,
    'admin-marketplace': adminMarketplacePage,
    'admin-marketplace-manage': adminMarketplaceManagePage,
    'admin-marketplace-products': adminMarketplaceProductsPage,
    supplier: marketplaceSupplierPage,
    'admin-grooming': () => adminGroomingPage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-hotel': () => adminHotelPage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-daycare': () => adminDaycarePage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-pet-taxi': adminPetTaxiPage,
    'admin-enquiries': adminEnquiriesPage,
    'admin-customers': () => adminCustomersPage(routeParams),
    'admin-access': adminAccessPage,
    'admin-audit': adminAuditPage,
    'admin-product-insights': adminProductServiceInsightsPage,
    driver: driverPortalPage,
  };
  const titles = {
    home: 'Furgo — Better Care For Every Pet',
    search: 'Search — Furgo',
    login: 'Log in — Furgo',
    register: 'Create an account — Furgo',
    onboarding: 'Complete your profile — Furgo',
    profile: 'My Profile — Furgo',
    'edit-profile': 'Edit Profile — Furgo',
    'help-center': 'Help Center — Furgo',
    feedback: 'Share Feedback — Furgo',
    address: 'Address — Furgo',
    'payment-method': 'Payment Method — Furgo',
    credit: 'My Furgo Credit — Furgo',
    marketplace: 'Marketplace — Furgo',
    'local-finder': 'Local Finder — Furgo',
    'local-finder-list': 'Nearby Places — Furgo',
    'local-finder-place': 'Place Details — Furgo',
    'admin-local-finder': 'Local Finder Management — Furgo Admin',
    favourites: 'My Favourites — Furgo',
    product: 'Product Details — Furgo',
    seller: 'Seller Shop — Furgo',
    cart: 'Shopping Cart — Furgo',
    checkout: 'Checkout — Furgo',
    orders: 'My Orders — Furgo',
    'check-in': 'Check In — Furgo',
    grooming: 'Book Grooming — Furgo',
    'grooming-orders': 'My Grooming Bookings — Furgo',
    hotel: 'Pet Hotel — Furgo',
    daycare: 'Pet Daycare — Furgo',
    'pet-profile': 'Pet Profile — Furgo',
    admin: 'Admin Portal — Furgo',
    'admin-promotions': 'Home Promotions — Furgo Admin',
    'admin-marketplace': 'Marketplace — Furgo Admin',
    'admin-marketplace-manage': 'Manage Marketplace — Furgo Admin',
    'admin-marketplace-products': 'Product And Supplier Mapping — Furgo Admin',
    supplier: 'Marketplace Supplier Portal — Furgo',
    'admin-grooming': 'Grooming — Furgo Admin',
    'admin-hotel': 'Pet Hotel — Furgo Admin',
    'admin-daycare': 'Pet Daycare — Furgo Admin',
    'admin-pet-taxi': 'Manage Pet Taxi — Furgo Admin',
    'admin-enquiries': 'Customer Enquiries — Furgo Admin',
    'admin-customers': 'Customer Profiles — Furgo Admin',
    'admin-access': 'Admin Access — Furgo',
    'admin-audit': 'Activity Log — Furgo',
    'admin-product-insights': 'Product & Service Insights — Furgo Admin',
    driver: 'Driver Portal — Furgo Pet Taxi',
  };
  const renderPage = pageRenderers[page] || homePage;
  document.title = titles[page] || titles.home;
  document.querySelector('#app').innerHTML = renderPage();
  // Keep the Admin Portal navigation consistent across dashboard and management pages.
  if (portalPages.includes(page)) document.querySelector('#app').insertAdjacentHTML('beforeend', adminBottomNavigation(page === 'admin' ? 'admin' : page === 'admin-orders' ? 'orders' : page === 'admin-enquiries' ? 'enquiries' : page === 'admin-access' ? 'admin-access' : '', currentRole));
  if (page === 'login' || page === 'register') recordOnboardingEvent('auth_portal_opened', page);
  if (page === 'register' && sessionStorage.getItem('furgo-demo-registration-started') !== 'true') {
    recordOnboardingEvent('registration_started', 'phone_direct');
    sessionStorage.setItem('furgo-demo-registration-started', 'true');
  }
  wireForms();
  window.scrollTo(0, 0);
  if (page === 'admin-orders' && routeParams.get('view') === 'scan') {
    window.requestAnimationFrame(() => document.querySelector('.admin-checkin-scan-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}

// Shows the Furgo brand splash briefly before the initial route.
let splashTimer;
function showSplash() {
  const logo = `Image/Icon/${encodeURIComponent('Logo 2.png')}`;
  document.title = 'Furgo — Better Care For Every Pet';
  document.querySelector('#app').innerHTML = `<main class="splash-screen" role="status" aria-label="Loading Furgo"><img class="splash-logo" src="${logo}" alt="Furgo — Better Care For Every Pet" /></main>`;
  splashTimer = window.setTimeout(() => {
    if (!window.location.hash || window.location.hash === '#home') render();
  }, 1200);
}

window.addEventListener('hashchange', () => {
  if (splashTimer) window.clearTimeout(splashTimer);
  if (supabaseAuthReady) render();
});

// Keep admin back arrows tied to the admin page that opened the current section.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const currentHash = window.location.hash || '#admin';
  const currentPage = currentHash.slice(1).split('?')[0];
  if (!currentPage.startsWith('admin')) return;

  if (/^Back\b/i.test(link.getAttribute('aria-label') || '')) {
    let returnStack = [];
    try { returnStack = JSON.parse(sessionStorage.getItem('furgo-admin-return-stack') || '[]'); } catch { returnStack = []; }
    const previous = returnStack.pop();
    sessionStorage.setItem('furgo-admin-return-stack', JSON.stringify(returnStack));
    const fallback = link.getAttribute('href') || '#admin';
    const destination = typeof previous === 'string' && previous.startsWith('#admin') ? previous : fallback;
    event.preventDefault();
    if (destination !== currentHash) window.location.hash = destination;
    return;
  }

  const destination = link.getAttribute('href') || '';
  if (link.getAttribute('aria-label') === 'Admin Home') return;
  if (!destination.startsWith('#admin') || destination === currentHash) return;
  let returnStack = [];
  try { returnStack = JSON.parse(sessionStorage.getItem('furgo-admin-return-stack') || '[]'); } catch { returnStack = []; }
  returnStack.push(currentHash);
  sessionStorage.setItem('furgo-admin-return-stack', JSON.stringify(returnStack.slice(-20)));
});

// Refresh customer and admin screens when a related order changes in another tab.
window.addEventListener('storage', (event) => {
  if (/furgo-demo-(grooming-bookings|hotel-bookings|hotel-settings|pet-hotel-bookings|daycare-bookings|daycare-settings|pet-daycare-bookings|daycare-orders|check-in-tokens|driver-locations|customer-records|help-center-details|support-requests|marketplace-orders|marketplace-products|marketplace-offers|promotions|service-banners|marketplace-cart|marketplace-favorites|addresses|payment-methods|credit-balance|credit-transactions|daycare-passes)/.test(event.key || '')) render();
});

void initializeSupabaseSession();
