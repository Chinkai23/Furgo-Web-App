// Main app controller: routes between the individual page files and wires shared interactions.
import { fitPetCardRemarks, homePage, loadPetProfiles, petCarouselMarkup } from './pages/home.js';
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
import { marketplaceFavoritesPage, marketplacePage, marketplaceProductPage } from './pages/marketplace.js';
import { marketplaceCartPage, marketplaceCheckoutPage } from './pages/cart.js';
import { adminMarketplacePage } from './pages/admin-marketplace.js';
import { loadMarketplaceCart, loadMarketplaceFavorites, loadMarketplaceOfferSettings, loadMarketplaceOrders, loadMarketplaceProducts, marketplaceCartKey, marketplaceFavoritesKey, marketplaceLine, marketplaceOfferSettingsKey, marketplaceOrdersKey, marketplaceProductsKey, safeMarketplaceImage } from './pages/marketplace-data.js';
import { petProfilePage } from './pages/pet-profile.js';
import { adminPromotionsPage, loadPromotions, maximumPromotions, normalizePromotionDestination, promotionStorageKey } from './pages/admin-promotions.js';
import { adminPortalPage } from './pages/admin.js';
import { groomingBookingPage, groomingOrdersPage } from './pages/grooming.js';
import { adminGroomingPage } from './pages/admin-grooming.js';
import { petHotelPage, setupHotelBooking } from './pages/hotel.js';
import { adminHotelPage, setupAdminHotel } from './pages/admin-hotel.js';
import { petDaycarePage, setupDaycareBooking } from './pages/daycare.js';
import { adminDaycarePage, setupAdminDaycare } from './pages/admin-daycare.js';
import { defaultGroomingSettings, groomingBookingsKey, groomingSettingsKey, groomingWeightTier, loadGroomingBookings, loadGroomingSettings } from './pages/grooming-data.js';
import { myOrdersPage } from './pages/my-orders.js';
import { adminOrdersPage, setupAdminOrders } from './pages/admin-orders.js';
import { applyCheckInScan, checkInPage } from './pages/check-in.js';
import { adminBottomNavigation } from './shared.js';
import { adminEnquiriesPage, setupAdminEnquiries } from './pages/admin-enquiries.js';
import { adminCustomersPage, assignUnownedPetProfiles, getCustomerAccountStatus, getCustomerRecordId, saveCustomerRecord, setupAdminCustomers } from './pages/admin-customers.js';
import { driverPortalPage, setupDriverPortal } from './pages/driver.js';
import { supabase, toMalaysianE164 } from './supabase.js';
import { loadCloudAppData } from './app-data-sync.js';

// Section: Supabase-backed authentication state
// Function: Prevent protected routes rendering before the persisted Supabase session is read.
let supabaseAuthReady = false;
let groomingQrSyncListenerInstalled = false;
let activeSupabaseUserId = '';

// Section: Supabase pet records
// Function: Convert the current browser pet model to and from the shared pet_profiles table.
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
  const backupKey = `furgo-demo-pet-profiles-backup-${userId}`;
  if (cachedPets.length && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(cachedPets));
  if (!data?.length && cachedPets.length) {
    const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
    const email = String(profile.email || '').toLowerCase();
    const phone = String(profile.phone || '').replace(/[\s-]/g, '');
    const ownedPets = cachedPets.filter((pet) =>
      (email && String(pet.ownerEmail || '').toLowerCase() === email)
      || (phone && String(pet.ownerPhone || '').replace(/[\s-]/g, '') === phone));
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
  localStorage.setItem(petProfilesStorageKey, JSON.stringify(pets));
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

// Loads the full customer/pet directory from the normalized tables for the Admin Portal.
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
      ...petFromDatabase(row, photo, vaccinationCards), ownerId: owner.id,
      ownerEmail: owner.email, ownerPhone: owner.phone,
    };
  }));
  localStorage.setItem('furgo-demo-customer-records', JSON.stringify(customers));
  localStorage.setItem(petProfilesStorageKey, JSON.stringify(pets.filter(Boolean)));
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
  const [{ data: settingRow, error: settingsError }, bookingsResult] = await Promise.all([
    supabase.from('service_settings').select('settings').eq('service_key', 'grooming').maybeSingle(),
    role === 'admin'
      ? supabase.from('grooming_bookings').select('*').order('created_at', { ascending: false })
      : supabase.from('grooming_bookings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  if (settingsError) throw settingsError;
  if (bookingsResult.error) throw bookingsResult.error;
  const savedSettings = settingRow?.settings && Object.keys(settingRow.settings).length ? settingRow.settings : null;
  if (savedSettings) localStorage.setItem(groomingSettingsKey, JSON.stringify(savedSettings));
  else if (role === 'admin') {
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
  localStorage.setItem(groomingBookingsKey, JSON.stringify(bookings));
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
  const [{ data: roleRows, error: roleError }, { data: profile, error: profileError }, { data: account, error: accountError }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('profiles').select('display_name,email,phone_e164').eq('id', user.id).maybeSingle(),
    supabase.from('account_controls').select('status').eq('user_id', user.id).maybeSingle(),
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
  const role = roleRows?.some(({ role: value }) => value === 'admin') ? 'admin'
    : roleRows?.some(({ role: value }) => value === 'driver') ? 'driver' : 'customer';
  const phone = user.phone || profile?.phone_e164 || user.user_metadata?.phone_e164 || '';
  const snapshot = {
    id: user.id,
    name: profile?.display_name || user.user_metadata?.display_name || 'Pet Parent',
    email: profile?.email || user.email || user.user_metadata?.email || '',
    phone: phone.startsWith('+60') ? `0${phone.slice(3)}` : phone,
    role,
    authChannel: user.phone ? 'phone_password' : 'email_password',
  };
  sessionStorage.setItem('furgo-demo-user-profile', JSON.stringify(snapshot));
  sessionStorage.setItem('furgo-demo-auth', 'true');
  sessionStorage.setItem('furgo-demo-profile-complete', 'true');
  sessionStorage.setItem('furgo-demo-user-role', role);
  sessionStorage.setItem('furgo-demo-auth-channel', snapshot.authChannel);
  try {
    await loadCloudAppData(user.id, role);
  } catch (error) {
    // Existing features stay usable if the app-data migration has not been applied yet.
    console.warn('Supabase shared app data is not ready yet; using this browser’s saved data:', error);
  }
  if (role === 'admin') {
    try { await loadCloudAdminCustomers(); }
    catch (error) { console.warn('Could not load customer management records from Supabase:', error); }
  }
  if (role === 'customer') await loadCloudPetProfiles(user.id);
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
  const savePets = (items) => localStorage.setItem('furgo-demo-pet-profiles', JSON.stringify(items));
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
      const savedPets = JSON.parse(localStorage.getItem('furgo-demo-pet-profiles') || '[]');
      const existingPet = savedPets.find((pet) => pet.id === form.dataset.petId);
      return Array.isArray(existingPet?.vaccinationCards) ? existingPet.vaccinationCards : [];
    } catch { return []; }
  })();

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
      const storedPets = JSON.parse(localStorage.getItem('furgo-demo-pet-profiles') || '[]');
      savedPets = Array.isArray(storedPets) ? storedPets : [];
    } catch { savedPets = []; }
    localStorage.setItem('furgo-demo-pet-profiles', JSON.stringify(savedPets.filter((pet) => pet.id !== petId)));
    deleteDialog.close();
    window.location.hash = petReturnTo;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
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
      colour: form.elements.colour.value.trim(),
      photo: uploadedPhoto || existingPet.photo || '',
      photoPath: existingPet.photoPath || '',
      vaccinationCards,
      vaccinationValidUntil: form.elements.vaccinationValidUntil.value,
      remarks,
    };
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      try {
        const savedPet = await saveCloudPet(pet, authData.user.id);
        const updatedPets = existingPet.id ? savedPets.map((item) => item.id === currentId ? savedPet : item) : [...savedPets, savedPet];
        localStorage.setItem(petProfilesStorageKey, JSON.stringify(updatedPets));
      } catch (error) {
        feedback.textContent = `Could not save this pet profile: ${friendlyAuthError(error)}`;
        feedback.classList.add('visible');
        return;
      }
    } else {
      const updatedPets = existingPet.id ? savedPets.map((item) => item.id === currentId ? pet : item) : [...savedPets, pet];
      localStorage.setItem(petProfilesStorageKey, JSON.stringify(updatedPets));
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
    const product = loadMarketplaceProducts().find((item) => item.id === button.dataset.favoriteRepurchase && !item.hidden);
    const variant = product?.variants.find((item) => Number(item.stock) > 0);
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
  const updateVariant = () => {
    if (!variantSelect) return;
    const option = variantSelect.selectedOptions[0];
    document.querySelector('[data-pdp-price]').textContent = `MYR ${Number(option.dataset.price).toFixed(2)}`;
    document.querySelector('[data-pdp-stock]').textContent = `${Number(option.dataset.stock)} in stock`;
    const quantity = document.querySelector('[data-product-quantity]');
    quantity.max = option.dataset.stock;
    quantity.value = '1';
    document.querySelector('[data-add-to-cart]').disabled = Number(option.dataset.stock) < 1;
  };
  variantSelect?.addEventListener('change', updateVariant);
  document.querySelectorAll('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => {
    const image = document.querySelector('[data-pdp-image]');
    if (image && button.dataset.imageSrc) image.src = button.dataset.imageSrc;
    document.querySelectorAll('[data-gallery-image]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  document.querySelector('[data-add-to-cart]')?.addEventListener('click', (event) => {
    const productId = event.currentTarget.dataset.addToCart;
    const variantId = variantSelect.value;
    const quantity = Math.max(1, Number(document.querySelector('[data-product-quantity]').value) || 1);
    const variant = loadMarketplaceProducts().find((product) => product.id === productId)?.variants.find((item) => item.id === variantId);
    if (!variant || variant.stock < quantity) { toast('That quantity is not currently available.'); return; }
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
    const voucherSettings = offerSettings.voucher;
    const freeShippingMinimum = Number(offerSettings.freeShippingMinimum) || 0;
    const shipping = subtotal >= freeShippingMinimum ? 0 : Number(offerSettings.deliveryFee) || 0;
    const discountRow = form.querySelector('[data-checkout-discount]');
    const updateTotals = () => {
      const discount = Number(form.dataset.discount || 0);
      form.querySelector('[data-checkout-shipping]').textContent = shipping ? `MYR ${shipping.toFixed(2)}` : 'Free';
      discountRow.hidden = discount <= 0;
      discountRow.querySelector('b').textContent = `− MYR ${discount.toFixed(2)}`;
      form.querySelector('[data-checkout-total]').textContent = `MYR ${Math.max(0, subtotal + shipping - discount).toFixed(2)}`;
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
    form.querySelector('[data-apply-coupon]')?.addEventListener('click', () => {
      const code = form.querySelector('[data-market-coupon]').value.trim().toUpperCase();
      const message = form.querySelector('[data-coupon-feedback]');
      const voucherCode = String(voucherSettings.code || '').trim().toUpperCase();
      const minimumSpend = Number(voucherSettings.minimumSpend) || 0;
      if (voucherSettings.enabled && code === voucherCode && subtotal >= minimumSpend) {
        const rawDiscount = voucherSettings.discountType === 'percent' ? subtotal * (Number(voucherSettings.discountValue) / 100) : Number(voucherSettings.discountValue);
        const discount = Math.min(subtotal, Math.round(rawDiscount * 100) / 100);
        form.dataset.discount = String(discount);
        message.textContent = `${voucherCode} applied.`;
        message.className = 'market-coupon-feedback success';
      } else {
        form.dataset.discount = '0';
        message.textContent = voucherSettings.enabled && code === voucherCode ? `This voucher requires a MYR ${minimumSpend.toFixed(2)} minimum subtotal.` : 'That voucher code is not valid.';
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
      const total = Math.max(0, subtotal + shipping - discount);
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
      const items = lines.map(({ product, variant, quantity, total: lineTotal }) => ({ productId: product.id, variantId: variant.id, name: product.name, variantLabel: variant.label, sku: variant.sku, supplierId: variant.supplierId || variant.supplier || '', supplierSku: variant.supplierSku || '', cost: Number(variant.cost) || 0, quantity, unitPrice: variant.price, total: lineTotal }));
      const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      const reference = `FG-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const status = payment === 'bank-transfer' ? 'Pending Payment Verification' : 'Paid / Processing';
      const orders = loadMarketplaceOrders();
      if (payment === 'wallet') {
        const transactions = JSON.parse(localStorage.getItem('furgo-demo-credit-transactions') || '[]');
        transactions.unshift({ label: `Marketplace order ${reference}`, amount: -total, date: new Date().toLocaleDateString() });
        localStorage.setItem('furgo-demo-credit-transactions', JSON.stringify(transactions));
      }
      orders.unshift({ id: `order-${Date.now()}`, userId: profile.id || '', reference, date: new Date().toLocaleDateString(), createdAt: new Date().toISOString(), customerEmail: profile.email || '', customerName: profile.name || address.name, customerPhone: profile.phone || address.phone, deliveryPhone: address.phone, address: { name: address.name, phone: address.phone, street: address.street, postcode: address.postcode, city: address.city, state: address.state }, items, subtotal, shipping, discount, total, paymentMethod: payment === 'wallet' ? 'Furgo Credit' : payment === 'gateway' ? 'Online payment' : 'Manual bank transfer', paymentStatus: payment === 'bank-transfer' ? 'Pending Payment Verification' : 'Paid', transferSlip, status, coupon: discount ? String(voucherSettings.code || '').toUpperCase() : '', trackingNumber: '', courier: '', trackingUrl: '' });
      localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
      items.forEach((item) => {
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

// Saves admin product mappings and processes supplier fulfillment and shipment updates.
function setupAdminMarketplace() {
  // Saves the Admin Portal's free-shipping, voucher, and offer settings for customer checkout.
  const offerForm = document.querySelector('[data-admin-market-offer]');
  offerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!offerForm.reportValidity()) return;
    const fields = offerForm.elements;
    const discountType = fields.discountType.value;
    const discountValue = Number(fields.discountValue.value);
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
    const settings = {
      freeShippingMinimum: Number(fields.freeShippingMinimum.value),
      deliveryFee: Number(fields.deliveryFee.value),
      offerTitle: fields.offerTitle.value.trim(),
      offerDescription: fields.offerDescription.value.trim(),
      voucher: { code: voucherCode, discountType, discountValue, minimumSpend: Number(fields.minimumSpend.value), enabled: fields.voucherEnabled.checked },
    };
    try {
      localStorage.setItem(marketplaceOfferSettingsKey, JSON.stringify(settings));
      feedback.textContent = 'Offer settings saved and applied to customer Marketplace checkout.';
      feedback.className = 'admin-market-offer-feedback success';
    } catch {
      feedback.textContent = 'Settings could not be saved in this browser.';
      feedback.className = 'admin-market-offer-feedback error';
    }
  });

  const productForm = document.querySelector('[data-admin-market-product]');
  productForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!productForm.reportValidity()) return;
    const fields = productForm.elements;
    const products = loadMarketplaceProducts();
    const productName = fields.name.value.trim();
    const uploadedFiles = [...fields.productPhotos.files];
    if (uploadedFiles.length > 5 || uploadedFiles.some((file) => file.size > 1.5 * 1024 * 1024 || !file.type.startsWith('image/'))) {
      toastAdmin('Upload up to five image files, each no larger than 1.5 MB.');
      return;
    }
    const uploadedImages = await Promise.all(uploadedFiles.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(safeMarketplaceImage(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    })));
    if (uploadedImages.some((image) => !image)) { toastAdmin('One or more product photos could not be read.'); return; }
    const variant = { id: `variant-${Date.now()}`, label: fields.variantLabel.value.trim(), price: Number(fields.price.value), stock: Number(fields.stock.value), sku: fields.sku.value.trim(), supplierId: fields.supplierId.value.trim(), supplier: fields.supplierId.value.trim(), supplierSku: fields.supplierSku.value.trim(), cost: Number(fields.cost.value) };
    const productFields = { name: productName, category: fields.category.value, emoji: fields.emoji.value.trim() || '🐾', description: fields.description.value.trim(), suitableBreeds: fields.suitableBreeds.value.trim(), issues: fields.issues.value.trim(), ingredients: fields.ingredients.value.trim(), nutrition: fields.nutrition.value.trim() };
    const productId = fields.productId.value;
    const variantId = fields.variantId.value;
    if (productId) {
      const product = products.find((item) => item.id === productId);
      const existingVariant = product?.variants.find((item) => item.id === variantId);
      if (!product || !existingVariant) { toastAdmin('This product or variant is no longer available.'); return; }
      Object.assign(product, productFields);
      Object.assign(existingVariant, variant, { id: variantId });
      if (uploadedImages.length) product.images = uploadedImages;
    } else {
      // Reusing the same product name adds a new size or package option to the existing listing.
      const existingProduct = products.find((product) => product.name.trim().toLowerCase() === productName.toLowerCase());
      if (existingProduct) {
        Object.assign(existingProduct, productFields);
        existingProduct.variants.push(variant);
        if (uploadedImages.length) existingProduct.images = uploadedImages;
      } else {
        products.push({ id: `product-${Date.now()}`, ...productFields, images: uploadedImages, variants: [variant] });
      }
    }
    try { localStorage.setItem(marketplaceProductsKey, JSON.stringify(products)); }
    catch { toastAdmin('The selected photos are too large for this browser prototype. Choose smaller images.'); return; }
    render();
  });
  document.querySelectorAll('[data-edit-market-product]').forEach((button) => button.addEventListener('click', () => {
    const product = loadMarketplaceProducts().find((item) => item.id === button.dataset.editMarketProduct);
    const variant = product?.variants.find((item) => item.id === button.dataset.editMarketVariant);
    const form = document.querySelector('[data-admin-market-product]');
    if (!product || !variant || !form) return;
    const fields = form.elements;
    fields.productId.value = product.id;
    fields.variantId.value = variant.id;
    fields.name.value = product.name;
    fields.category.value = product.category;
    fields.description.value = product.description || '';
    fields.suitableBreeds.value = product.suitableBreeds || '';
    fields.issues.value = product.issues || '';
    fields.ingredients.value = product.ingredients || '';
    fields.nutrition.value = product.nutrition || '';
    fields.price.value = variant.price;
    fields.variantLabel.value = variant.label;
    fields.stock.value = variant.stock;
    fields.sku.value = variant.sku || '';
    fields.supplierId.value = variant.supplierId || variant.supplier || '';
    fields.supplierSku.value = variant.supplierSku || '';
    fields.cost.value = variant.cost ?? 0;
    fields.emoji.value = product.emoji || '';
    fields.productPhotos.value = '';
    document.querySelector('[data-market-image-note]').textContent = `This product currently has ${(product.images || []).length} photo(s). Upload photos to replace them, or leave the field empty to keep them.`;
    document.querySelector('[data-market-editor-summary]').textContent = `Edit ${product.name} · ${variant.label}`;
    document.querySelector('[data-market-product-submit]').textContent = 'Save Product Changes';
    document.querySelector('[data-cancel-market-edit]').hidden = false;
    document.querySelector('[data-market-product-editor]').open = true;
    document.querySelector('[data-market-product-editor]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelector('[data-cancel-market-edit]')?.addEventListener('click', () => {
    const form = document.querySelector('[data-admin-market-product]');
    form?.reset();
    if (!form) return;
    form.elements.productId.value = '';
    form.elements.variantId.value = '';
    document.querySelector('[data-market-image-note]').textContent = 'Upload up to 5 photos (maximum 1.5 MB each). Enter an existing product name to add another variant. Product names, suitable breeds, and issues are searchable by customers.';
    document.querySelector('[data-market-editor-summary]').textContent = 'Add product and supplier mapping';
    document.querySelector('[data-market-product-submit]').textContent = 'Add Product';
    document.querySelector('[data-cancel-market-edit]').hidden = true;
  });
  document.querySelectorAll('[data-toggle-market-product]').forEach((button) => button.addEventListener('click', () => {
    const products = loadMarketplaceProducts();
    const product = products.find((item) => item.id === button.dataset.toggleMarketProduct);
    if (!product) return;
    product.hidden = !product.hidden;
    localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
    if (product.hidden) localStorage.setItem(marketplaceCartKey, JSON.stringify(loadMarketplaceCart().filter((item) => item.productId !== product.id)));
    render();
  }));
  document.querySelectorAll('[data-delete-market-product]').forEach((button) => button.addEventListener('click', () => {
    const products = loadMarketplaceProducts();
    const product = products.find((item) => item.id === button.dataset.deleteMarketProduct);
    if (!product || !window.confirm(`Delete ${product.name} from the marketplace catalog? Existing order records will be kept.`)) return;
    const orders = loadMarketplaceOrders();
    orders.forEach((order) => order.items.forEach((item) => {
      if (item.productId !== product.id) return;
      const variant = product.variants.find((entry) => entry.id === item.variantId);
      if (variant) Object.assign(item, { supplierId: item.supplierId || variant.supplierId || variant.supplier || '', supplierSku: item.supplierSku || variant.supplierSku || '', cost: item.cost ?? variant.cost ?? 0 });
    }));
    const cart = loadMarketplaceCart().filter((item) => item.productId !== product.id);
    localStorage.setItem(marketplaceProductsKey, JSON.stringify(products.filter((item) => item.id !== product.id)));
    localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    render();
  }));
  document.querySelectorAll('[data-copy-supplier-order]').forEach((button) => button.addEventListener('click', async () => {
    const order = loadMarketplaceOrders().find((item) => item.id === button.dataset.copySupplierOrder);
    if (!order) return;
    const products = loadMarketplaceProducts();
    const grouped = new Map();
    order.items.forEach((item) => {
      const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
      const supplier = variant?.supplierId || variant?.supplier || item.supplierId || 'Unassigned';
      if (!grouped.has(supplier)) grouped.set(supplier, []);
      grouped.get(supplier).push({ ...item, supplierSku: variant?.supplierSku || item.supplierSku || '—' });
    });
    const text = [...grouped.entries()].map(([supplier, items]) => [`Supplier: ${supplier}`, ...items.map((item) => `Supplier SKU: ${item.supplierSku}\nItem: ${item.name} ${item.variantLabel} x ${item.quantity}`), `Ship To: ${order.address?.name || order.customerName} | ${order.deliveryPhone || order.address?.phone || order.customerPhone}${order.customerEmail ? ` | ${order.customerEmail}` : ''}`, `Address: ${order.address?.street || ''}, ${order.address?.postcode || ''} ${order.address?.city || ''}, ${order.address?.state || ''}`].join('\n')).join('\n\n');
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
    render();
  }));
  document.querySelectorAll('[data-complete-order]').forEach((button) => button.addEventListener('click', () => {
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === button.dataset.completeOrder);
    if (order) { order.status = 'Delivered'; order.deliveredAt = new Date().toISOString(); localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders)); render(); }
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
      const products = loadMarketplaceProducts();
      order.items.forEach((item) => { const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId); if (variant) variant.stock = Number(variant.stock) + Number(item.quantity); });
      localStorage.setItem(marketplaceProductsKey, JSON.stringify(products));
    } else { order.paymentStatus = 'Paid'; order.status = 'Paid / Processing'; }
    localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders));
    render();
  }));
  document.querySelectorAll('[data-order-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || file.size > 1.5 * 1024 * 1024) { toastAdmin('Choose a receipt no larger than 1.5 MB.'); return; }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toastAdmin('Upload a receipt image or PDF.'); return; }
    const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(''); reader.readAsDataURL(file); });
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === input.dataset.orderReceipt);
    if (order && data) { order.receipt = { name: file.name, data }; localStorage.setItem(marketplaceOrdersKey, JSON.stringify(orders)); render(); }
  }));
  document.querySelector('[data-export-market-csv]')?.addEventListener('click', () => {
    const supplier = document.querySelector('[data-market-export-supplier]').value;
    const products = loadMarketplaceProducts();
    const rows = [['Order Reference', 'Date', 'Status', 'Customer', 'Phone', 'Address', 'Supplier', 'Supplier SKU', 'Item', 'Variant', 'Quantity', 'Retail Unit Price', 'Cost Unit Price']];
    loadMarketplaceOrders().forEach((order) => order.items.forEach((item) => {
      const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
      const supplierName = variant?.supplierId || variant?.supplier || item.supplierId || 'Unassigned';
      if (!supplier || supplier === supplierName) rows.push([order.reference, order.date, order.status, order.customerName, order.deliveryPhone || order.address?.phone || order.customerPhone, `${order.address?.street || ''}, ${order.address?.postcode || ''} ${order.address?.city || ''}, ${order.address?.state || ''}`, supplierName, variant?.supplierSku || item.supplierSku || '', item.name, item.variantLabel, item.quantity, item.unitPrice, variant?.cost ?? item.cost ?? 0]);
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

// Provides short Admin Portal confirmations without external notification services.
function toastAdmin(message) {
  const toast = document.querySelector('.admin-market-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

// Saves admin banner settings in local browser storage for this customer-portal prototype.
function setupAdminPromotionsForm() {
  const form = document.querySelector('[data-admin-promo-form]');
  if (!form) return;
  const bannerInput = form.querySelector('[data-promo-banner]');
  const preview = form.querySelector('[data-promo-preview]');
  const feedback = form.querySelector('[data-admin-promo-feedback]');
  let previewUrl = '';

  bannerInput.addEventListener('change', () => {
    const file = bannerInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      feedback.textContent = 'Choose an image file for the banner.';
      feedback.classList.add('visible');
      bannerInput.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
  });

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
    if (!file || !file.type.startsWith('image/')) {
      feedback.textContent = 'Choose an image file for the banner.';
      feedback.classList.add('visible');
      return;
    }

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const targetRatio = 2;
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
      canvas.width = 1200;
      canvas.height = 600;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 1200, 600);
      const promotion = {
        id: `promotion-${Date.now()}`,
        title: form.elements.title.value.trim(),
        destination,
        image: canvas.toDataURL('image/jpeg', 0.84),
      };
      localStorage.setItem(promotionStorageKey, JSON.stringify([...promotions, promotion]));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      render();
    } catch {
      feedback.textContent = 'The banner could not be processed or saved. Try a smaller image.';
      feedback.classList.add('visible');
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  });

  document.querySelector('[data-admin-promo-list]')?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-promotion]');
    if (!deleteButton) return;
    const remaining = loadPromotions().filter((promotion) => promotion.id !== deleteButton.dataset.deletePromotion);
    localStorage.setItem(promotionStorageKey, JSON.stringify(remaining));
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

  const currentPet = () => loadPetProfiles().find((pet) => pet.id === form.elements.petId?.value);
  const currentPackage = () => settings.packages.find((item) => item.id === form.querySelector('[name="packageId"]:checked')?.value);
  const renderQuote = () => {
    const liveSettings = loadGroomingSettings();
    const pet = currentPet();
    const tier = groomingWeightTier(pet?.weight, settings);
    const packageItem = currentPackage();
    const packagePrice = Number(packageItem?.[tier] || 0);
    const daycareOn = form.elements.includeDaycare.checked;
    const daycareTotal = daycareOn ? Number(form.elements.daycareHours.value) * Number(settings.daycareHourlyRate) : 0;
    const taxiOn = form.elements.includeTaxi.checked;
    const taxiDistance = Number(form.elements.taxiDistance.value || 0);
    const taxiTotal = taxiOn && taxiDistance > 0 ? Number(liveSettings.taxiBaseFare) + taxiDistance * Number(liveSettings.taxiPerKm) : 0;
    const subtotal = packagePrice + daycareTotal + taxiTotal;
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
    form.querySelector('[data-grooming-discount]').textContent = `− ${money(voucherDiscount)}`;
    form.querySelector('[data-grooming-discount-row]').hidden = voucherDiscount <= 0;
    form.querySelector('[data-grooming-total]').textContent = money(total);
    form.dataset.quotedTotal = String(total);
    return { pet, tier, packageItem, packagePrice, daycareTotal, taxiTotal, taxiDistance, total };
  };

  const refreshWeightTier = () => {
    const pet = currentPet();
    if (!pet) return;
    const tier = groomingWeightTier(pet?.weight, settings);
    const label = tier === 'small' ? `Small · up to ${Number(settings.smallMaxKg)} kg` : tier === 'medium' ? `Medium · up to ${Number(settings.mediumMaxKg)} kg` : `Large · over ${Number(settings.mediumMaxKg)} kg`;
    const snapshot = form.querySelector('[data-grooming-pet-snapshot]');
    form.querySelectorAll('[data-grooming-pet-choice]').forEach((card) => {
      const selected = card.dataset.groomingPetChoice === pet.id;
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
    const remarks = Array.isArray(pet?.remarks) ? pet.remarks : [pet?.redFlagRemark].filter(Boolean);
    snapshot.dataset.selectedPet = pet?.id || '';
    form.querySelector('[data-pet-snapshot-name]').textContent = pet?.name || 'Pet profile';
    form.querySelector('[data-pet-snapshot-breed]').textContent = `${pet?.breed || 'Breed not added'} · ${pet?.weight || 'Weight not added'} kg`;
    form.querySelector('[data-pet-snapshot-vaccine]').textContent = (pet?.vaccinationCards || []).length ? 'Vaccination record uploaded' : 'No vaccination record on file';
    form.querySelector('[data-pet-tier]').textContent = label;
    form.querySelector('[data-pet-red-flags]').innerHTML = remarks.length ? `<b>Care notes:</b> ${remarks.map((item) => String(item).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])).join(' · ')}` : 'No red-flag care notes saved.';
    form.querySelector('[data-grooming-tier-summary]').textContent = `Pricing tier: ${label} · Weight ${pet?.weight || '—'} kg`;
    form.querySelectorAll('[data-package-price]').forEach((radio) => {
      const packageItem = settings.packages.find((item) => item.id === radio.value);
      const price = Number(packageItem?.[tier] || 0);
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
    if (pickupSelect && pickupSelect.value !== 'manual') {
      try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(pickupSelect.value)] || null; } catch { address = null; }
    }
    const locationText = [address?.city, address?.state, address?.postcode, address?.street, form.elements.pickupManual?.value].filter(Boolean).join(' ').toLowerCase();
    const outlet = form.querySelector('[data-taxi-outlet]')?.value || form.elements.outlet.value;
    const latestSettings = loadGroomingSettings();
    const route = latestSettings.taxiRouteEstimates.find((item) => item && item.outlet === outlet && item.city && locationText.includes(String(item.city).toLowerCase()));
    const distanceKm = route ? Number(route.distanceKm) : 0;
    distanceInput.value = String(distanceKm);
    quote.innerHTML = route
      ? `<strong>Estimated taxi fare: ${money(Number(latestSettings.taxiBaseFare) + distanceKm * Number(latestSettings.taxiPerKm))}</strong><span>${escapeHTML(route.city)} to ${escapeHTML(outlet)} · ${distanceKm} km · one way</span>`
      : '<strong>Route estimate unavailable</strong><span>Choose an address in a configured city, or ask Admin to add this city and outlet route.</span>';
    renderQuote();
  };

  // Rebuild taxi pickup cards when Admin changes the shared schedule in another browser tab.
  const refreshTaxiSchedules = () => {
    const container = form.querySelector('[data-taxi-schedules]');
    const currentSchedule = form.elements.taxiSchedule.value;
    const slots = loadGroomingSettings().taxiScheduleSlots;
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
    form.querySelectorAll('[data-grooming-address]').forEach((select) => {
      const manual = form.querySelector('[data-pickup-manual]');
      const input = manual.querySelector('input');
      const isManual = select.value === 'manual';
      manual.hidden = !isManual || !form.elements.includeTaxi.checked;
      input.required = isManual && form.elements.includeTaxi.checked;
    });
    const manualPickup = form.querySelector('[data-pickup-manual] input');
    manualPickup.required = form.elements.includeTaxi.checked && (!form.querySelector('[name="pickup"]') || form.querySelector('[name="pickup"]')?.value === 'manual');
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
    form.elements.petId.value = card.dataset.groomingPetChoice;
    refreshWeightTier();
  });
  form.querySelector('[data-grooming-package-list]')?.addEventListener('change', renderQuote);
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
    if (event.key === groomingSettingsKey) {
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
  form.querySelectorAll('[data-grooming-daycare-hours]').forEach((input) => input.addEventListener('input', renderQuote));
  form.querySelectorAll('[data-grooming-address]').forEach((input) => input.addEventListener('change', updateOptionalFields));
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
    const subtotal = quote.packagePrice + quote.daycareTotal + quote.taxiTotal;
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
    if (!quote.pet || !quote.packageItem) {
      feedback.textContent = 'Add a pet profile and choose an available package before booking.';
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
    const remarks = Array.isArray(quote.pet.remarks) ? quote.pet.remarks : [quote.pet.redFlagRemark].filter(Boolean);
    const pickupSelect = form.querySelector('[name="pickup"]');
    const savedAddresses = (() => { try { return JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); } catch { return []; } })();
    const selectedPickupAddress = pickupSelect && pickupSelect.value !== 'manual' ? savedAddresses[Number(pickupSelect.value)] : null;
    const pickup = selectedPickupAddress ? [selectedPickupAddress.label, selectedPickupAddress.street, selectedPickupAddress.city, selectedPickupAddress.state, selectedPickupAddress.postcode].filter(Boolean).join(', ') : form.elements.pickupManual.value.trim();
    const dropoff = form.querySelector('[data-taxi-outlet]').value;
    const booking = {
      id: `grooming-${Date.now()}`, reference: `GR-${Date.now().toString().slice(-7)}`,
      customerName: profile.name || 'Furgo Customer', customerEmail: profile.email || '', customerPhone: profile.phone || '',
      emergencyName: form.elements.emergencyName.value.trim(), emergencyPhone: form.elements.emergencyPhone.value.trim(),
      petId: quote.pet.id, petName: quote.pet.name, petBreed: quote.pet.breed || 'Not provided', petWeight: quote.pet.weight || '0', petSex: quote.pet.gender || quote.pet.sex || '',
      vaccinationOnFile: (quote.pet.vaccinationCards || []).length > 0, vaccinationCards: quote.pet.vaccinationCards || [], redFlags: remarks.join(' · '),
      packageId: quote.packageItem.id, packageName: quote.packageItem.name, packagePrice: quote.packagePrice,
      date: appointmentDate.value, time: appointmentTime.value, outlet: form.elements.outlet.value,
      daycareHours: form.elements.includeDaycare.checked ? Number(form.elements.daycareHours.value) : 0,
      daycareTiming: form.elements.daycareTiming.value, daycareTotal: quote.daycareTotal,
      includeTaxi: form.elements.includeTaxi.checked, pickup, dropoff, taxiDistance: quote.taxiDistance, taxiTotal: quote.taxiTotal, taxiSchedule: form.elements.taxiSchedule.value,
      voucherCode: appliedVoucher, discount: voucherDiscount, total: quote.total,
      paymentMethod, paymentStatus: paymentMethod === 'wallet' ? 'Paid with Furgo Credit' : paymentMethod === 'bank-transfer' ? 'Awaiting verification' : 'Pending online payment',
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
  refreshSlots();
  updateOptionalFields();
}

// Admin tools save grooming packages, outlet capacity, booking statuses, and customer receipts.
function setupAdminGrooming() {
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
      const outlets = settingsForm.elements.outlets.value.split(',').map((value) => value.trim()).filter(Boolean);
      const timeSlots = settingsForm.elements.timeSlots.value.split(',').map((value) => value.trim()).filter(Boolean);
      const availableWeekdays = [...settingsForm.querySelectorAll('[name="availableWeekdays"]:checked')].map((input) => Number(input.value));
      const closedDates = [...new Set(settingsForm.elements.closedDates.value.split(',').map((value) => value.trim()).filter(Boolean))];
      const taxiScheduleSlots = [...new Set(settingsForm.elements.taxiScheduleSlots.value.split(',').map((value) => value.trim()).filter(Boolean))];
      const routeLines = settingsForm.elements.taxiRouteEstimates.value.split('\n').filter((line) => line.trim());
      const taxiRouteEstimates = routeLines.map((line) => {
        const [city, outlet, distance] = line.split('|').map((value) => value.trim());
        return { city, outlet, distanceKm: Number(distance) };
      });
      const updated = {
        ...settings, outlets, timeSlots,
        bookingHorizonDays: Number(settingsForm.elements.bookingHorizonDays.value), availableWeekdays, closedDates,
        slotCapacity: 1, smallMaxKg, mediumMaxKg,
        daycareHourlyRate: Number(settingsForm.elements.daycareHourlyRate.value), taxiBaseFare: Number(settingsForm.elements.taxiBaseFare.value), taxiPerKm: Number(settingsForm.elements.taxiPerKm.value), taxiScheduleSlots, taxiRouteEstimates, packages,
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
      if (!taxiScheduleSlots.length || taxiScheduleSlots.some((slot) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(slot))) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Enter pet taxi pickup times in 24-hour format, such as 09:00, 12:00, and 15:00.';
        return;
      }
      if (taxiRouteEstimates.some((route) => !route.city || !outlets.includes(route.outlet) || !Number.isFinite(route.distanceKm) || route.distanceKm <= 0)) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = 'Check each taxi route line. Use: City | Outlet name | distance in km.';
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
        render();
      } catch (error) {
        settingsForm.querySelector('[data-admin-grooming-settings-feedback]').textContent = `Could not delete the package: ${friendlyAuthError(error)}`;
      }
    });
  }

  document.querySelectorAll('[data-save-grooming-status]').forEach((button) => button.addEventListener('click', async () => {
    const bookings = loadGroomingBookings();
    const booking = bookings.find((item) => item.id === button.dataset.saveGroomingStatus);
    const select = document.querySelector(`[data-grooming-status="${button.dataset.saveGroomingStatus}"]`);
    if (!booking || !select) return;
    const previousStatus = booking.status;
    booking.status = select.value;
    booking.statusHistory = [...(booking.statusHistory || []), { status: select.value, previousStatus, changedAt: new Date().toISOString(), changedBy: 'Admin' }];
    if (select.value === 'Cancelled') booking.paymentStatus = booking.paymentMethod === 'wallet' ? 'Refund review required' : 'Cancelled';
    try {
      await updateCloudGroomingBooking(booking);
      localStorage.setItem(groomingBookingsKey, JSON.stringify(bookings));
      render();
    } catch (error) {
      window.alert(`Could not update the booking status: ${friendlyAuthError(error)}`);
    }
  }));

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
    booking.receipt = { type: form.elements.receiptType.value, name: file.name, data, uploadedAt: new Date().toISOString() };
    booking.paymentStatus = `${booking.receipt.type} receipt uploaded`;
    try {
      await updateCloudGroomingBooking(booking);
      localStorage.setItem(groomingBookingsKey, JSON.stringify(bookings));
      render();
    } catch (error) {
      window.alert(`Could not save the receipt: ${friendlyAuthError(error)}`);
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
  let stream = null;
  let active = false;
  const stopCamera = () => {
    active = false;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
  };
  const closeScanner = () => { if (dialog.open) dialog.close(); else stopCamera(); };
  dialog.addEventListener('close', stopCamera);
  dialog.querySelector('[data-close-admin-scan]')?.addEventListener('click', closeScanner);
  window.addEventListener('hashchange', closeScanner, { once: true });

  trigger.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia || !('BarcodeDetector' in window)) {
      window.location.hash = '#admin-orders?view=scan';
      return;
    }
    if (dialog.open) return;
    dialog.showModal();
    feedback.textContent = 'Starting camera…';
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      feedback.textContent = 'Point the camera at the customer’s order QR code.';
      active = true;
      const scanFrame = async () => {
        if (!active || !video.isConnected || !dialog.open) return;
        try {
          const codes = await detector.detect(video);
          const scanned = codes.find((item) => item.rawValue)?.rawValue;
          if (scanned) {
            const result = applyCheckInScan(scanned);
            stopCamera();
            feedback.textContent = result.ok ? result.message : `${result.message} Close this window and tap Scan again to retry.`;
            if (result.ok) {
              document.dispatchEvent(new CustomEvent('furgo-order-status-updated', { detail: result.order }));
              window.setTimeout(() => {
                if (dialog.open) dialog.close();
                if (window.location.hash.split('?')[0] === '#admin-orders') window.dispatchEvent(new Event('hashchange'));
              }, 1400);
              return;
            }
            return;
          }
        } catch { /* Continue checking the camera stream for a readable QR code. */ }
        if (active) window.setTimeout(scanFrame, 250);
      };
      scanFrame();
    } catch {
      stopCamera();
      feedback.textContent = 'Camera access is blocked or unavailable. Opening the order page for manual code entry.';
      window.setTimeout(() => { window.location.hash = '#admin-orders?view=scan'; }, 900);
    }
  });
}

// Wires shared page actions, pet profiles, forms, profile editing, support, and authentication prototypes.
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
  setupGroomingBooking();
  setupAdminGrooming();
  setupHotelBooking();
  setupAdminHotel();
  setupDaycareBooking();
  setupAdminDaycare();
  setupAdminOrders();
  setupAdminEnquiries();
  setupAdminCustomers();
  setupAdminFooterScanner();
  setupDriverPortal();
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
    document.querySelector('[data-search-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = event.currentTarget.elements.service.value.trim().toLowerCase();
      if (!query) {
        toast.textContent = 'Type a service to search.';
        toast.classList.add('visible');
        window.setTimeout(() => toast.classList.remove('visible'), 2600);
        return;
      }
      const match = ['marketplace', 'grooming', 'hotel', 'daycare'].find((name) => name.includes(query) || query.includes(name));
      if (match === 'marketplace') window.location.hash = '#marketplace';
      else if (match === 'grooming') window.location.hash = '#grooming';
      else if (match === 'hotel') window.location.hash = '#hotel';
      else if (match === 'daycare') window.location.hash = '#daycare';
      else if (match) window.location.hash = '#register';
      else {
        toast.textContent = query ? 'No matching service yet. Try grooming, hotel, daycare, or marketplace.' : 'Type a service to search.';
        toast.classList.add('visible');
        window.setTimeout(() => toast.classList.remove('visible'), 2600);
      }
    });
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
  supportForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!supportForm.reportValidity()) return;
    const requests = JSON.parse(localStorage.getItem('furgo-demo-support-requests') || '[]');
    requests.push({ topic: supportForm.elements.topic.value, message: supportForm.elements.message.value.trim(), timestamp: new Date().toISOString() });
    localStorage.setItem('furgo-demo-support-requests', JSON.stringify(requests));
    const message = supportForm.querySelector('.form-feedback');
    message.textContent = 'This request was saved in the browser prototype only. It was not sent to Furgo Support.';
    message.classList.add('visible');
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
        assignUnownedPetProfiles(identity);
      }
      feedback.textContent = mode === 'register'
        ? 'Account created for development testing. Opening your Furgo home…'
        : identity.role === 'admin' ? 'Admin sign-in successful. Opening the Admin Portal…'
          : identity.role === 'driver' ? 'Driver sign-in successful. Opening the Driver Portal…'
            : 'Sign-in successful. Opening your Furgo home…';
      window.setTimeout(() => { window.location.hash = identity.role === 'admin' ? '#admin' : identity.role === 'driver' ? '#driver' : '#home'; }, 500);
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
function render() {
  if (!supabaseAuthReady) return;
  const [routeName = '', routeQuery = ''] = window.location.hash.slice(1).split('?');
  const page = routeName || 'home';
  const routeParams = new URLSearchParams(routeQuery);
  const hasDemoSession = sessionStorage.getItem('furgo-demo-auth') === 'true';
  if (hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'customer') {
    try {
      const currentCustomer = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      saveCustomerRecord(currentCustomer);
      assignUnownedPetProfiles(currentCustomer);
    } catch { /* Keep the current page usable if local demo profile data is malformed. */ }
  }
  const adminPages = ['admin', 'admin-orders', 'admin-promotions', 'admin-marketplace', 'admin-grooming', 'admin-hotel', 'admin-daycare', 'admin-enquiries', 'admin-customers'];
  const driverPages = ['driver'];
  if (adminPages.includes(page) && (!hasDemoSession || sessionStorage.getItem('furgo-demo-user-role') !== 'admin')) {
    window.location.hash = '#login';
    return;
  }
  if (driverPages.includes(page) && (!hasDemoSession || sessionStorage.getItem('furgo-demo-user-role') !== 'driver')) {
    window.location.hash = '#login';
    return;
  }
  const protectedPages = ['home', 'services', 'about', 'profile', 'edit-profile', 'help-center', 'feedback', 'pet-profile', 'address', 'payment-method', 'credit', 'marketplace', 'product', 'cart', 'checkout', 'orders', 'check-in', 'favourites', 'grooming', 'grooming-orders', 'hotel', 'daycare'];
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
    favourites: marketplaceFavoritesPage,
    product: () => marketplaceProductPage(routeParams.get('id') || ''),
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
    'admin-orders': adminOrdersPage,
    'admin-promotions': adminPromotionsPage,
    'admin-marketplace': adminMarketplacePage,
    'admin-grooming': adminGroomingPage,
    'admin-hotel': adminHotelPage,
    'admin-daycare': adminDaycarePage,
    'admin-enquiries': adminEnquiriesPage,
    'admin-customers': () => adminCustomersPage(routeParams),
    driver: driverPortalPage,
  };
  const titles = {
    home: 'Furgo — Better Care For Every Pet',
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
    favourites: 'My Favourites — Furgo',
    product: 'Product Details — Furgo',
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
    'admin-grooming': 'Grooming — Furgo Admin',
    'admin-hotel': 'Pet Hotel — Furgo Admin',
    'admin-daycare': 'Pet Daycare — Furgo Admin',
    'admin-enquiries': 'Customer Enquiries — Furgo Admin',
    'admin-customers': 'Customer Profiles — Furgo Admin',
    driver: 'Driver Portal — Furgo Pet Taxi',
  };
  const renderPage = pageRenderers[page] || homePage;
  document.title = titles[page] || titles.home;
  document.querySelector('#app').innerHTML = renderPage();
  // Keep the Admin Portal navigation consistent across dashboard and management pages.
  if (adminPages.includes(page)) document.querySelector('#app').insertAdjacentHTML('beforeend', adminBottomNavigation(page === 'admin' ? 'admin' : page === 'admin-orders' ? 'orders' : page === 'admin-enquiries' ? 'enquiries' : page === 'admin-customers' ? 'customers' : ''));
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

// Refresh customer and admin screens when a related order changes in another tab.
window.addEventListener('storage', (event) => {
  if (/furgo-demo-(grooming-bookings|hotel-bookings|hotel-settings|pet-hotel-bookings|daycare-bookings|daycare-settings|pet-daycare-bookings|daycare-orders|check-in-tokens|driver-locations|customer-records|help-center-details|support-requests|marketplace-orders|marketplace-products|marketplace-offers|promotions|marketplace-cart|marketplace-favorites|addresses|payment-methods|credit-balance|credit-transactions|daycare-passes)/.test(event.key || '')) render();
});

void initializeSupabaseSession();
