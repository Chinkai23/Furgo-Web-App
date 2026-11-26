// Main app controller: routes between the individual page files and wires shared interactions.
import { defaultPetAvatarPath, fitPetCardRemarks, freePetAssistantAvatars, freePetCatAvatars, homeAssistantBubbleMessages, homePage, loadPetProfiles, petAvatarUrl, petCustomAvatarLibrary, petProfilePictureUrl, petCarouselMarkup, petProfilesStorageKeyForCurrentUser, savePetAssistantIds, saveSelectedPetAssistantId, selectedHomeAssistantPet, selectedHomeAssistantPets, selectedPetAssistantIds } from './pages/home.js';
import { petAssistantPage, setupPetAssistant } from './pages/pet-assistant.js';
import { aiNutritionistPage, setupAiNutritionist } from './pages/ai-nutritionist.js';
import { adminHomeMvpPage, setupHomeShortcutLiveRefresh } from './pages/home-shortcuts.js';
import { loginPage } from './pages/login.js';
import { registerPage } from './pages/register.js';
import { onboardingPage } from './pages/onboarding.js';
import { profilePage } from './pages/profile.js';
import { notificationSettingsPage } from './pages/notification-settings.js';
import { changePasswordPage, editProfilePage } from './pages/edit-profile.js';
import { helpCenterPage } from './pages/help-center.js';
import { feedbackPage } from './pages/feedback.js';
import { addressPage } from './pages/address.js';
import { paymentMethodPage } from './pages/payment-method.js';
import { creditPage } from './pages/credit.js';
import { coinTopupPage, setupTokensPage, tokensPage } from './pages/tokens.js';
import { marketplaceFavoritesPage, marketplacePage, marketplaceProductPage, marketplaceSellerPage } from './pages/marketplace.js';
import { setupMarketplaceCheckout } from './marketplace-checkout.js';
import { marketplaceCartPage, marketplaceCheckoutPage } from './pages/cart.js';
import { adminMarketplaceManagePage, adminMarketplacePage, adminMarketplaceProductsPage } from './pages/admin-marketplace.js';
import { marketplaceSupplierPage, marketplaceSupplierProductEditPage, matchesSupplierOrderStatus, supplierDefaultCourierStorageKey, supplierOrderRows, supplierTrackingForm, supplierProductRows } from './pages/marketplace-supplier.js';
import { setupPortalNotifications } from './portal-notifications.js';
import { loadMarketplaceCart, loadMarketplaceCartSelection, loadMarketplaceFavorites, loadMarketplaceOfferSettings, loadMarketplaceOrders, loadMarketplaceProducts, loadMarketplaceSubscriptionCart, loadMarketplaceSubscriptions, marketplaceCartKey, marketplaceCartLineKey, marketplaceCartSelectionKey, marketplaceCheckoutSelectionKey, marketplaceFavoritesKey, marketplaceLine, marketplaceOfferSettingsKey, marketplaceProductsKey, marketplaceSubscriptionCartKey, marketplaceSubscriptionsKey, marketplaceSubscriptionLine, safeMarketplaceImage } from './pages/marketplace-data.js';
import { marketplaceSubscriptionsPage } from './pages/marketplace-subscriptions.js';
import { petProfileEditPage } from './pages/pet-profile.js';
import { petAvatarPage, petDataPage, petProfileAddCardPage, petProfileOverviewPage, petRecordPage, petReminderPage, petVaccinationPage, setupPetCarePages } from './pages/pet-care-pages.js';
import { deletePetCareData, loadPetReminders, localPetDate, savePetRecord, savePetReminders } from './pages/pet-care-data.js';
import { adminPromotionsPage, loadAnnouncements, loadBannerRecords, loadPromotions, maximumPromotions, normalizePromotionDestination, promotionStorageKey } from './pages/admin-promotions.js';
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
import { loadPetTaxiSettings, matchPetTaxiRoute, petTaxiRouteFare, petTaxiSettingsKey } from './pages/pet-taxi-data.js';
import { setupPetTaxiAddressPicker } from './pages/pet-taxi-addresses.js';
import { groomingBookingsKey, groomingSettingsKey, groomingWeightTier, loadGroomingBookings, loadGroomingSettings } from './pages/grooming-data.js';
import { myOrdersPage, setupMyOrders } from './pages/my-orders.js';
import { adminOrdersPage, adminCurrentOrderPage, setupAdminOrders } from './pages/admin-orders.js';
import { checkInPage, extractCheckInCode, formatCheckInToken, refreshCheckInTokens, setupCheckInInteractions } from './pages/check-in.js';
import { adminBottomNavigation, bottomNavigation, driverBottomNavigation, escapeHTML } from './shared.js';
import { adminEnquiriesPage, setupAdminEnquiries } from './pages/admin-enquiries.js';
import { adminCustomersPage, getCustomerAccountStatus, getCustomerRecordId, saveCustomerRecord, setupAdminCustomers } from './pages/admin-customers.js';
import { driverPortalPage, setupDriverPortal } from './pages/driver.js';
import { adminAccessPage, adminAuditPage, setupAdminAccess, setupAdminAuditPage } from './pages/admin-access.js';
import { adminSuppliersPage, setupAdminSuppliers } from './pages/admin-suppliers.js';
import { adminCoinExchangePage, setupAdminCoinExchange } from './pages/admin-coin-exchange.js';
import { adminProductServiceInsightsPage, setupAdminProductServiceInsights } from './pages/admin-product-insights.js';
import { recordAdminAction } from './admin-audit.js';
import { recentSearchesKey, searchPage } from './pages/search.js';
import { localFinderFavoritesPage, localFinderListPage, localFinderPage, localFinderPlacePage, localFinderSearchPage, setupLocalFinder } from './pages/local-finder.js';
import { adminLocalFinderPage, setupAdminLocalFinder } from './pages/admin-local-finder.js';
import { supabase, toMalaysianE164 } from './supabase.js';
import { refreshSharedOutlets } from './pages/outlet-directory.js';
import { recoverWarehouseStockRequest, submitWarehouseStockRequest } from './warehouse-stock.js';
import { createTrackingRefreshGuard, stopPortalRecovery, syncFailureMessage, watchPortalData } from './sync-recovery.js';
import { captureCloudSession, reportSyncIssue, cacheSyncedRecords, createSharedAppDataSaver, loadCloudAppData, marketplaceCheckoutOwner, preserveBrowserMarketplaceHistory, refreshMarketplaceCatalogFromDatabase, refreshGroomingBookings, stopCloudAppData, updateMarketplaceOrder } from './app-data-sync.js';
import { refreshFurgoCoinBalance } from './coin-wallet.js';
import { startQRScanner } from './qr-scanner.js';
import { adminSellerManagementPage, adminSellerPayoutFeePage, sellerPortalPage, setupAdminSellerManagement, setupAdminSellerPayoutFee, setupSellerPortal } from './pages/seller-portal.js';
import { adminFeeRulesPage, setupAdminFeeRules } from './pages/admin-fee-rules.js';

// Section: Supabase-backed authentication state
// Function: Prevent protected routes rendering before the persisted Supabase session is read.
let supabaseAuthReady = false;
let groomingQrSyncListenerInstalled = false;
let activeSupabaseUserId = '';
let sessionRestoreAttempt = 0;

// Close any native modal popup when the user clicks outside its visible panel.
document.addEventListener('click', (event) => {
  const dialog = event.target;
  if (!dialog || dialog.tagName !== 'DIALOG' || !dialog.open) return;
  const bounds = dialog.getBoundingClientRect();
  const clickedOutside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (clickedOutside) dialog.close();
});

// Section: Supabase pet records
// Function: Convert the signed-in owner's browser pet model to and from their pet_profiles rows.
const petProfilesStorageKey = 'furgo-demo-pet-profiles';

function petFromDatabase(row, photo = '', vaccinationCards = [], localPet = {}, avatar = '') {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name || '',
    species: row.species || localPet.species || 'Dog',
    breed: row.breed || '',
    sex: row.sex || '',
    birthDate: row.birth_date || '',
    birthDateType: row.birth_date_type || localPet.birthDateType || '',
    neutered: row.neutered === true ? 'yes' : row.neutered === false ? 'no' : '',
    weight: row.weight_kg == null ? '' : String(row.weight_kg),
    colour: row.colour || '',
    remarks: Array.isArray(row.remarks) ? row.remarks : [],
    photo,
    avatar: avatar || localPet.avatar || '',
    avatars: Array.isArray(localPet.avatars) ? localPet.avatars : [],
    activeAvatarIndex: Number.isInteger(localPet.activeAvatarIndex) ? localPet.activeAvatarIndex : null,
    avatarPath: row.avatar_path || localPet.avatarPath || '',
    profilePictureMode: row.profile_picture_mode || localPet.profilePictureMode || (photo ? 'photo' : 'default'),
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

async function listCloudPetAvatars(userId, petId) {
  const folder = `${userId}/${petId}`;
  const { data, error } = await supabase.storage.from('pet-records').list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
  if (error) {
    console.warn('Saved pet avatars could not be listed:', error);
    return [];
  }
  return Promise.all((data || []).filter((file) => file.name?.startsWith('avatar-')).map(async (file) => {
    const path = `${folder}/${file.name}`;
    return { path, url: await signedPetFile(path) };
  }));
}

async function loadCloudPetProfiles(userId) {
  const current = captureCloudSession();
  let { data, error } = await supabase.from('pet_profiles').select('*').eq('user_id', userId).order('created_at');
  if (error) throw error;
  if (!current()) return;
  let cachedPets = [];
  try {
    const legacyPets = JSON.parse(localStorage.getItem(petProfilesStorageKey) || '[]');
    const currentUserPets = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
    const petsById = new Map((Array.isArray(legacyPets) ? legacyPets : []).map((pet) => [String(pet.id), pet]));
    (Array.isArray(currentUserPets) ? currentUserPets : []).forEach((pet) => petsById.set(String(pet.id), pet));
    cachedPets = [...petsById.values()];
  } catch { cachedPets = []; }
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
      if (!current()) return [];
      const id = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(pet.id || '') ? pet.id : crypto.randomUUID();
      await saveCloudPet({ ...pet, id }, userId);
    }
    if (ownedPets.length) {
      const refreshed = await supabase.from('pet_profiles').select('*').eq('user_id', userId).order('created_at');
      if (refreshed.error) throw refreshed.error;
      data = refreshed.data;
    }
  }
  const cachedPetsById = new Map(cachedPets.map((pet) => [String(pet.id), pet]));
  const pets = await Promise.all((data || []).map(async (row) => {
    const photo = await signedPetFile(row.photo_path);
    const avatar = row.avatar_path?.startsWith('builtin:') ? row.avatar_path.slice('builtin:'.length) : await signedPetFile(row.avatar_path);
    const avatars = await listCloudPetAvatars(userId, row.id);
    const vaccinationCards = await Promise.all((Array.isArray(row.vaccination_cards) ? row.vaccination_cards : []).map(async (card) => ({
      name: card.name || 'Vaccination record',
      path: card.path || '',
      data: card.path ? await signedPetFile(card.path) : '',
    })));
    const cachedPet = cachedPetsById.get(String(row.id)) || {};
    const cloudActiveAvatarIndex = row.avatar_path && !row.avatar_path.startsWith('builtin:')
      ? avatars.findIndex((item) => item.path === row.avatar_path)
      : -1;
    return petFromDatabase(row, photo, vaccinationCards, {
      ...cachedPet,
      avatars,
      activeAvatarIndex: avatars.length ? (cloudActiveAvatarIndex >= 0 ? cloudActiveAvatarIndex : null) : null,
    }, avatar);
  }));
  if (!current()) return [];
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
  const previousPhotoPath = pet.photoPath || '';
  const previousAvatarPath = pet.avatarPath || '';
  let photoPath = pet.photoPath || '';
  if (pet.photo?.startsWith('data:')) photoPath = await uploadPetDataUrl(userId, petId, 'profile', pet.photo);
  let avatarPath = pet.avatarPath || '';
  if (pet.avatar?.startsWith('data:')) avatarPath = await uploadPetDataUrl(userId, petId, 'avatar', pet.avatar);
  else if (pet.avatar?.startsWith('Image/')) avatarPath = `builtin:${pet.avatar}`;
  const cards = await Promise.all((pet.vaccinationCards || []).map(async (card) => ({
    name: card.name || 'Vaccination record',
    path: card.path || await uploadPetDataUrl(userId, petId, 'vaccination', card.data),
  })));
  const row = {
    id: petId,
    user_id: userId,
    name: pet.name,
    species: pet.species === 'Cat' ? 'Cat' : 'Dog',
    breed: pet.breed || '',
    sex: pet.sex || '',
    birth_date: pet.birthDate || null,
    birth_date_type: pet.birthDateType === 'adoption' ? 'adoption' : pet.birthDateType === 'birthday' ? 'birthday' : null,
    neutered: pet.neutered === 'yes' ? true : pet.neutered === 'no' ? false : null,
    weight_kg: pet.weight === '' || pet.weight == null ? null : Number(pet.weight),
    colour: pet.colour || '',
    remarks: pet.remarks || [],
    photo_path: photoPath || null,
    avatar_path: avatarPath || null,
    profile_picture_mode: ['photo', 'avatar', 'default'].includes(pet.profilePictureMode)
      ? pet.profilePictureMode
      : (photoPath ? 'photo' : 'default'),
    vaccination_cards: cards,
    vaccination_valid_until: pet.vaccinationValidUntil || null,
  };
  const { data, error } = await supabase.from('pet_profiles').upsert(row).select('*').single();
  if (error) throw error;
  const replacedPaths = [
    previousPhotoPath && photoPath && previousPhotoPath !== photoPath ? previousPhotoPath : '',
  ].filter(Boolean);
  if (replacedPaths.length) {
    const { error: oldFileError } = await supabase.storage.from('pet-records').remove(replacedPaths);
    if (oldFileError) console.warn('Previous pet pictures could not be removed:', oldFileError);
  }
  const photo = await signedPetFile(data.photo_path);
  const avatar = data.avatar_path?.startsWith('builtin:') ? data.avatar_path.slice('builtin:'.length) : await signedPetFile(data.avatar_path);
  const vaccinationCards = await Promise.all(cards.map(async (card) => ({ ...card, data: await signedPetFile(card.path) })));
  return petFromDatabase(data, photo, vaccinationCards, pet, avatar);
}

// Persist only the assistant-avatar selection so avatar choice stays independent
// from optional pet-profile fields such as species.
async function saveCloudPetAssistantAvatar(petId, avatarPath, userId) {
  const { data, error } = await supabase
    .from('pet_profiles')
    .update({ avatar_path: avatarPath || null })
    .eq('id', petId)
    .eq('user_id', userId)
    .select('id, avatar_path')
    .single();
  if (error) throw error;
  return data.avatar_path || '';
}

async function deleteCloudPet(petId, userId) {
  const { data: pet, error: readError } = await supabase.from('pet_profiles').select('photo_path,avatar_path,vaccination_cards').eq('id', petId).eq('user_id', userId).maybeSingle();
  if (readError) throw readError;
  const { error } = await supabase.from('pet_profiles').delete().eq('id', petId).eq('user_id', userId);
  if (error) throw error;
  const savedAvatars = await listCloudPetAvatars(userId, petId);
  const paths = [...new Set([pet?.photo_path, ...(pet?.avatar_path && !pet.avatar_path.startsWith('builtin:') ? [pet.avatar_path] : []), ...savedAvatars.map((avatar) => avatar.path), ...(pet?.vaccination_cards || []).map((card) => card.path)].filter(Boolean))];
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('pet-records').remove(paths);
    if (storageError) console.warn('Pet record files could not be removed:', storageError);
  }
}

// Loads customer account records and their pet profiles for the Admin Portal only.
async function loadCloudAdminCustomers() {
  const current = captureCloudSession();
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
  if (!current()) return;
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

async function loadCloudGroomingSettings() {
  const current = captureCloudSession();
  const { data, error } = await supabase.from('service_settings').select('settings').eq('service_key', 'grooming').maybeSingle();
  if (error) throw error;
  if (!current()) return;
  if (data?.settings) localStorage.setItem(groomingSettingsKey, JSON.stringify(data.settings));
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
  if (marketplaceCheckoutOwner() !== user.id) stopCloudAppData();
  activeSupabaseUserId = user.id;
  const identityCurrent = captureCloudSession();
  const [{ data: roleRows, error: roleError }, { data: profile, error: profileError }, { data: account, error: accountError }, portalAccessResult, supplierAccessResult, sellerAccessResult] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('profiles').select('display_name,email,phone_e164').eq('id', user.id).maybeSingle(),
    supabase.from('account_controls').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.from('portal_access').select('level,outlet_id,admin_outlets(name,shortform)').eq('user_id', user.id).maybeSingle(),
    supabase.from('marketplace_supplier_access').select('supplier_name').eq('supplier_user_id', user.id).maybeSingle(),
    supabase.rpc('seller_portal_has_access'),
  ]);
  if (!identityCurrent() || activeSupabaseUserId !== user.id) throw new Error('The sign-in session changed.');
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
    : legacyPortalRole || (roleRows?.some(({ role: value }) => value === 'driver') ? 'driver' : sellerAccessResult.data === true ? 'seller' : supplierAccessResult.data?.supplier_name ? 'supplier' : 'customer');
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
  if (role === 'supplier' || role === 'seller') {
    await preserveBrowserMarketplaceHistory();
    return snapshot;
  }
  try {
    await loadCloudAppData(user.id, role);
  } catch (error) {
    reportSyncIssue(syncFailureMessage(error));
  }
  if (activeSupabaseUserId !== user.id) return snapshot;
  if (role === 'director') {
    try { await loadCloudAdminCustomers(); }
    catch (error) { console.warn('Could not load customer management records from Supabase:', error); }
  }
  await loadCloudPetProfiles(user.id);
  try {
    await loadCloudGroomingSettings();
  } catch (error) {
    // Keep the already-working sign-in available until the user applies the grooming migration.
    reportSyncIssue(syncFailureMessage(error));
  }
  return snapshot;
}

// Section: Authentication state restoration
// Function: Restore the Supabase session before routing to protected portal pages.
async function initializeSupabaseSession() {
  const attempt = ++sessionRestoreAttempt;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (attempt !== sessionRestoreAttempt) return;
    if (error) throw error;
    if (data.session?.user) await loadSupabaseIdentity(data.session.user);
    else {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-customer-portal-view');
      sessionStorage.removeItem('furgo-demo-profile-complete');
      sessionStorage.removeItem('furgo-demo-user-role');
      sessionStorage.removeItem('furgo-demo-user-profile');
    }
  } catch (error) {
    if (attempt !== sessionRestoreAttempt) return;
    sessionStorage.removeItem('furgo-demo-auth');
    sessionStorage.removeItem('furgo-demo-profile-complete');
    sessionStorage.removeItem('furgo-demo-user-role');
    sessionStorage.removeItem('furgo-demo-user-profile');
    reportSyncIssue(syncFailureMessage(error));
  } finally {
    if (attempt === sessionRestoreAttempt) {
      supabaseAuthReady = true;
      const initialPage = window.location.hash.replace('#', '').split('?')[0];
      if (!initialPage || initialPage === 'home') showSplash();
      else render();
    }
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

// Prepares an uploaded pet photo or the Furgo mascot reference for the avatar-generation Edge Function.
async function petAvatarReferenceDataUrl(source, { maxSide = 1024, format = 'image/jpeg' } = {}) {
  let objectUrl = '';
  try {
    if (String(source).startsWith('data:')) objectUrl = source;
    else {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Could not load the avatar reference image.');
      objectUrl = URL.createObjectURL(await response.blob());
    }
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(format, format === 'image/jpeg' ? 0.88 : undefined);
  } finally {
    if (objectUrl && !String(source).startsWith('data:')) URL.revokeObjectURL(objectUrl);
  }
}

// Connects the Home pet carousel to pet-profile links and assistant selection.
function setupHomePetProfiles() {
  const carousel = document.querySelector('[data-pet-carousel]');
  if (!carousel) return;
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const savePets = (items) => localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(items));
  let assistantMessageIndex = 0;
  const updateAssistantDisplay = (assistantPet, pets, saveSelection = false, showPetSpecificMessage = false) => {
    const assistantLink = document.querySelector('.home-pet-assistant-shortcut');
    const assistantBubble = document.querySelector('.home-pet-assistant-bubble');
    const switchButtons = document.querySelector('[data-assistant-pet-arrows]');
    const messages = homeAssistantBubbleMessages(assistantPet);
    if (saveSelection && assistantPet) saveSelectedPetAssistantId(assistantPet.id);
    if (assistantLink) {
      const assistantImage = assistantLink.querySelector('.home-pet-art');
      if (assistantImage) assistantImage.src = petAvatarUrl(assistantPet);
      assistantLink.href = assistantPet ? `#pet-profile?id=${encodeURIComponent(assistantPet.id)}&section=settings` : '#pet-profile?mode=add';
      assistantLink.setAttribute('aria-label', `Open ${assistantPet ? `${assistantPet.name}'s` : 'a pet'} profile. Double-click to switch Pet Assistant.`);
      assistantLink.dataset.assistantPetIds = JSON.stringify(selectedHomeAssistantPets(pets).map((pet) => String(pet.id)));
    }
    if (switchButtons) {
      const activeAssistants = selectedHomeAssistantPets(pets);
      const hint = activeAssistants.length > 1 ? document.createElement('button') : null;
      if (hint) {
        hint.type = 'button';
        hint.className = 'home-pet-mascot-swipe-hint';
        hint.textContent = 'Change Pet →';
        hint.setAttribute('aria-label', 'Change to the next Home Page Pet Assistant');
      }
      switchButtons.replaceChildren(...(hint ? [hint] : []));
    }
    if (assistantBubble) {
      assistantBubble.href = assistantPet ? `#pet-assistant?pet=${encodeURIComponent(assistantPet.id)}` : '#pet-assistant';
      assistantBubble.setAttribute('aria-label', `Open AI Pet Assistant${assistantPet ? ` for ${assistantPet.name}` : ''}`);
      assistantBubble.dataset.messages = JSON.stringify(messages);
      const name = assistantBubble.querySelector('[data-assistant-pet-name]');
      const text = assistantBubble.querySelector('[data-assistant-bubble-text]');
      if (name) name.textContent = assistantPet?.name || 'Furgo Assistant';
      if (text) {
        assistantMessageIndex = showPetSpecificMessage && messages.length > 1 ? 1 : 0;
        text.classList.remove('is-fading');
        text.textContent = messages[assistantMessageIndex] || 'Hi! Chat with me now';
      }
    }
  };
  const renderPets = () => {
    const pets = loadPetProfiles();
    carousel.innerHTML = petCarouselMarkup(icon, pets);
    updateAssistantDisplay(selectedHomeAssistantPet(pets), pets);
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

  const cycleAssistantPet = (direction = 1) => {
    const pets = loadPetProfiles();
    const assistantPets = selectedHomeAssistantPets(pets);
    if (assistantPets.length < 2) return false;
    const currentId = selectedHomeAssistantPet(pets)?.id;
    const currentIndex = Math.max(0, assistantPets.findIndex((pet) => String(pet.id) === String(currentId)));
    const nextPet = assistantPets[(currentIndex + direction + assistantPets.length) % assistantPets.length];
    updateAssistantDisplay(nextPet, pets, true, true);
    return true;
  };
  const adjacentAssistantPet = (direction = 1) => {
    const pets = loadPetProfiles();
    const assistantPets = selectedHomeAssistantPets(pets);
    if (assistantPets.length < 2) return null;
    const currentId = selectedHomeAssistantPet(pets)?.id;
    const currentIndex = Math.max(0, assistantPets.findIndex((pet) => String(pet.id) === String(currentId)));
    return assistantPets[(currentIndex + direction + assistantPets.length) % assistantPets.length];
  };
  const clearMascotPreview = (preview, image) => {
    if (preview?.isConnected) preview.remove();
    if (image) {
      image.style.transition = '';
      image.style.translate = '';
    }
  };
  renderPets();

  const mascot = document.querySelector('.home-pet-assistant-shortcut');
  const mascotChangeButton = document.querySelector('[data-assistant-pet-arrows]');
  mascotChangeButton?.addEventListener('click', (event) => {
    if (!event.target.closest('.home-pet-mascot-swipe-hint')) return;
    const nextPet = adjacentAssistantPet(1);
    const mascotImage = mascot?.querySelector('.home-pet-art');
    if (!nextPet || !mascot || !mascotImage) return;
    const width = mascot.getBoundingClientRect().width || 1;
    const preview = mascotImage.cloneNode();
    preview.classList.add('home-pet-swipe-preview');
    preview.src = petAvatarUrl(nextPet);
    preview.alt = '';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.pointerEvents = 'none';
    preview.style.transition = 'none';
    preview.style.translate = `${width}px 0`;
    mascot.append(preview);
    void preview.offsetWidth;
    mascotImage.style.transition = 'translate 220ms cubic-bezier(.22,.72,.24,1)';
    mascotImage.style.translate = `${-width}px 0`;
    preview.style.transition = 'translate 220ms cubic-bezier(.22,.72,.24,1)';
    preview.style.translate = '0 0';
    window.setTimeout(() => {
      const currentPets = loadPetProfiles();
      const currentNextPet = currentPets.find((pet) => String(pet.id) === String(nextPet.id));
      if (currentNextPet) updateAssistantDisplay(currentNextPet, currentPets, true, true);
      clearMascotPreview(preview, mascotImage);
    }, 230);
  });
  const mascotBubble = document.querySelector('.home-pet-assistant-bubble');
  const creditRow = document.querySelector('.credit-row');
  if (mascot && mascotBubble && creditRow) {
    window.__furgoMascotBoundaryResizeObserver?.disconnect();
    if (window.__furgoMascotBoundaryResizeHandler) window.removeEventListener('resize', window.__furgoMascotBoundaryResizeHandler);
    const updateMascotSafeBoundary = () => {
      const mascotRect = mascot.getBoundingClientRect();
      const bubbleRect = mascotBubble.getBoundingClientRect();
      const rightInset = Math.max(0, mascotRect.right - bubbleRect.left);
      mascot.style.setProperty('--mascot-safe-right-inset', `${rightInset}px`);
    };
    window.__furgoMascotBoundaryResizeHandler = updateMascotSafeBoundary;
    window.addEventListener('resize', updateMascotSafeBoundary, { passive: true });
    window.__furgoMascotBoundaryResizeObserver = new ResizeObserver(updateMascotSafeBoundary);
    window.__furgoMascotBoundaryResizeObserver.observe(mascot);
    window.__furgoMascotBoundaryResizeObserver.observe(mascotBubble);
    window.__furgoMascotBoundaryResizeObserver.observe(creditRow);
    updateMascotSafeBoundary();
  }

  if (mascot) {
    let pointerStart = null;
    let suppressClickUntil = 0;
    let mascotClickTimer = null;
    const mascotImage = mascot.querySelector('.home-pet-art');
    mascot.style.touchAction = 'pan-y';
    mascot.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || selectedHomeAssistantPets(loadPetProfiles()).length < 2) return;
      pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false, direction: 0, preview: null };
      mascot.setPointerCapture?.(event.pointerId);
    });
    mascot.addEventListener('pointermove', (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      if (Math.abs(dx) > Math.abs(dy) + 4 && Math.abs(dx) > 8) pointerStart.moved = true;
      if (!pointerStart.moved || !mascotImage) return;
      const direction = dx < 0 ? 1 : -1;
      if (pointerStart.direction !== direction) {
        pointerStart.preview?.remove();
        pointerStart.preview = null;
        pointerStart.direction = direction;
        const nextPet = adjacentAssistantPet(direction);
        if (nextPet) {
          const preview = mascotImage.cloneNode();
          preview.classList.add('home-pet-swipe-preview');
          preview.src = petAvatarUrl(nextPet);
          preview.alt = '';
          preview.setAttribute('aria-hidden', 'true');
          preview.style.pointerEvents = 'none';
          preview.style.transition = 'none';
          mascot.append(preview);
          pointerStart.preview = preview;
        }
      }
      const width = mascot.getBoundingClientRect().width || 1;
      const dragX = Math.max(-width, Math.min(width, dx));
      mascotImage.style.transition = 'none';
      mascotImage.style.translate = `${dragX}px 0`;
      if (pointerStart.preview) pointerStart.preview.style.translate = `${(direction > 0 ? width : -width) + dragX}px 0`;
    });
    mascot.addEventListener('pointerup', (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const swipe = pointerStart;
      const committed = swipe.moved && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy);
      pointerStart = null;
      if (!committed) {
        if (swipe.moved) {
          suppressClickUntil = Date.now() + 350;
          mascotImage.style.transition = 'translate 180ms cubic-bezier(.22,.72,.24,1)';
          if (swipe.preview) swipe.preview.style.transition = 'translate 180ms cubic-bezier(.22,.72,.24,1)';
          mascotImage.style.translate = '0 0';
          if (swipe.preview) swipe.preview.style.translate = `${swipe.direction > 0 ? mascot.getBoundingClientRect().width : -mascot.getBoundingClientRect().width}px 0`;
          window.setTimeout(() => clearMascotPreview(swipe.preview, mascotImage), 190);
        } else clearMascotPreview(swipe.preview, mascotImage);
        return;
      }
      suppressClickUntil = Date.now() + 500;
      const nextPet = adjacentAssistantPet(dx < 0 ? 1 : -1);
      if (!nextPet || !mascotImage) { clearMascotPreview(swipe.preview, mascotImage); return; }
      const width = mascot.getBoundingClientRect().width || 1;
      mascotImage.style.transition = 'translate 220ms cubic-bezier(.22,.72,.24,1)';
      mascotImage.style.translate = `${dx < 0 ? -width : width}px 0`;
      if (swipe.preview) {
        swipe.preview.style.transition = 'translate 220ms cubic-bezier(.22,.72,.24,1)';
        swipe.preview.style.translate = '0 0';
      }
      window.setTimeout(() => {
        const pets = loadPetProfiles();
        const updatedPet = pets.find((pet) => String(pet.id) === String(nextPet.id));
        if (updatedPet) updateAssistantDisplay(updatedPet, pets, true, true);
        clearMascotPreview(swipe.preview, mascotImage);
      }, 225);
    });
    mascot.addEventListener('pointercancel', () => {
      const swipe = pointerStart;
      pointerStart = null;
      if (swipe?.preview && mascotImage) {
        mascotImage.style.transition = 'translate 180ms cubic-bezier(.22,.72,.24,1)';
        swipe.preview.style.transition = 'translate 180ms cubic-bezier(.22,.72,.24,1)';
        mascotImage.style.translate = '0 0';
        swipe.preview.style.translate = `${swipe.direction > 0 ? mascot.getBoundingClientRect().width : -mascot.getBoundingClientRect().width}px 0`;
        window.setTimeout(() => clearMascotPreview(swipe.preview, mascotImage), 190);
      } else if (mascotImage) clearMascotPreview(null, mascotImage);
    });
    mascot.addEventListener('click', (event) => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
      const pets = loadPetProfiles();
      const assistantPets = selectedHomeAssistantPets(pets);
      if (assistantPets.length < 2) return;
      event.preventDefault();
      if (event.detail > 1) {
        if (mascotClickTimer) window.clearTimeout(mascotClickTimer);
        mascotClickTimer = null;
        cycleAssistantPet(1);
        return;
      }
      if (mascotClickTimer) {
        window.clearTimeout(mascotClickTimer);
        mascotClickTimer = null;
        cycleAssistantPet(1);
        return;
      }
      mascotClickTimer = window.setTimeout(() => {
        mascotClickTimer = null;
        const latestPets = loadPetProfiles();
        const currentPet = selectedHomeAssistantPet(latestPets);
        if (currentPet) window.location.hash = `#pet-profile?id=${encodeURIComponent(currentPet.id)}&section=settings`;
      }, 260);
    });
  }

  const assistantBubble = document.querySelector('[data-assistant-bubble]');
  const bubbleText = assistantBubble?.querySelector('[data-assistant-bubble-text]');
  if (assistantBubble && bubbleText) {
    const bubbleTimer = window.setInterval(() => {
      if (!assistantBubble.isConnected) { window.clearInterval(bubbleTimer); return; }
      let messages = [];
      try { messages = JSON.parse(assistantBubble.dataset.messages || '[]'); } catch { messages = []; }
      if (messages.length < 2) return;
      bubbleText.classList.add('is-fading');
      window.setTimeout(() => {
        assistantMessageIndex = (assistantMessageIndex + 1) % messages.length;
        bubbleText.textContent = messages[assistantMessageIndex];
        bubbleText.classList.remove('is-fading');
      }, 420);
    }, 3600);
  }

}

// Lets owners update a pet's profile picture or generated mascot from the Pet Profile overview.
function setupPetOverviewMedia() {
  const section = document.querySelector('[data-pet-overview-media]');
  if (!section) return;
  const petId = section.dataset.petId;
  const pictureButton = section.querySelector('[data-open-profile-picture-menu]');
  const pictureDialog = section.querySelector('[data-profile-picture-dialog]');
  const useAvatarButton = section.querySelector('[data-use-created-avatar]');
  const uploadButton = section.querySelector('[data-upload-profile-photo]');
  const deletePictureButton = section.querySelector('[data-delete-profile-picture]');
  const deletePictureConfirmDialog = section.querySelector('[data-delete-profile-picture-confirm]');
  const confirmDeletePictureButton = section.querySelector('[data-confirm-delete-profile-picture]');
  const closeButton = section.querySelector('[data-close-profile-picture-dialog]');
  const photoInput = section.querySelector('[data-pet-overview-photo]');
  const cropDialog = section.querySelector('[data-pet-profile-crop-dialog]');
  const cropViewport = section.querySelector('[data-pet-profile-crop-viewport]');
  const cropImage = section.querySelector('[data-pet-profile-crop-image]');
  const cropZoom = section.querySelector('[data-pet-profile-crop-zoom]');
  const cropFeedback = section.querySelector('[data-pet-profile-crop-feedback]');
  const createButton = section.querySelector('[data-create-pet-avatar]');
  const avatarInput = section.querySelector('[data-pet-avatar-source-photo]');
  const preview = section.querySelector('[data-pet-profile-preview]');
  const prompt = section.querySelector('.pet-photo-prompt');
  const avatarResult = section.querySelector('[data-pet-avatar-result]');
  const avatarPreview = section.querySelector('[data-pet-avatar-preview]');
  const avatarResultLabel = section.querySelector('[data-pet-avatar-result-label]');
  const feedback = section.querySelector('[data-pet-avatar-feedback]');
  let cropObjectUrl = '';
  let cropLayout = null;
  let cropSourceImage = null;
  section.querySelector('[data-open-pet-avatar]')?.addEventListener('click', () => pictureDialog?.showModal());
  const updatePicture = async (changes) => {
    const pets = loadPetProfiles();
    const oldPet = pets.find((pet) => String(pet.id) === String(petId));
    if (!oldPet) throw new Error('This pet profile could not be found.');
    let updatedPet = { ...oldPet, ...changes };
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      updatedPet = await saveCloudPet(updatedPet, authData.user.id);
      if (changes.photo === '' && oldPet.photoPath) {
        const { error } = await supabase.storage.from('pet-records').remove([oldPet.photoPath]);
        if (error) console.warn('Removed pet profile picture could not be deleted from storage:', error);
      }
    }
    localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(pets.map((pet) => String(pet.id) === String(petId) ? updatedPet : pet)));
    return updatedPet;
  };
  const showPicture = (pet, modeLabel = '') => {
    const pictureUrl = petProfilePictureUrl(pet);
    const pictureAlt = `${pet.name || 'Pet'} profile picture`;
    preview.src = pictureUrl;
    preview.alt = pictureAlt;
    // The swipe wrapper now contains only the card; the photo editor sits beside it in the page.
    const cardPicture = section.closest('[data-pet-profile-page]')?.querySelector('.pet-profile-card-avatar');
    if (cardPicture) {
      cardPicture.src = pictureUrl;
      cardPicture.alt = pictureAlt;
    }
    pictureButton.classList.toggle('has-photo', Boolean(pet.photo || pet.profilePictureMode === 'avatar'));
    prompt.textContent = modeLabel || (pet.photo ? 'Change Photo' : pet.profilePictureMode === 'avatar' ? 'Pet Avatar' : 'Add Photo');
    deletePictureButton.hidden = !Boolean(pet.photo || pet.profilePictureMode === 'avatar');
    if (pet.avatar) {
      useAvatarButton.textContent = 'Use Pet Avatar';
      useAvatarButton.disabled = false;
      avatarPreview.src = pet.avatar;
      avatarResult.hidden = false;
      avatarResultLabel.textContent = 'Current pet avatar';
    }
  };

  pictureButton?.addEventListener('click', () => pictureDialog?.showModal());
  closeButton?.addEventListener('click', () => pictureDialog?.close());
  uploadButton?.addEventListener('click', () => { pictureDialog?.close(); photoInput?.click(); });
  deletePictureButton?.addEventListener('click', () => {
    pictureDialog?.close();
    deletePictureConfirmDialog?.showModal();
  });
  section.querySelector('[data-cancel-delete-profile-picture]')?.addEventListener('click', () => {
    deletePictureConfirmDialog?.close();
    pictureDialog?.showModal();
  });
  confirmDeletePictureButton?.addEventListener('click', async () => {
    confirmDeletePictureButton.disabled = true;
    confirmDeletePictureButton.textContent = 'Removing…';
    try {
      const updated = await updatePicture({ photo: '', photoPath: '', profilePictureMode: 'default' });
      showPicture(updated);
      feedback.textContent = 'Profile picture removed.';
      feedback.classList.remove('is-error');
      feedback.classList.add('is-success');
      deletePictureConfirmDialog?.close();
    } catch (error) {
      feedback.textContent = error.message || 'The profile picture could not be removed.';
      feedback.classList.add('is-error');
      deletePictureConfirmDialog?.close();
      pictureDialog?.showModal();
    } finally {
      confirmDeletePictureButton.disabled = false;
      confirmDeletePictureButton.textContent = 'Yes, Delete';
    }
  });
  const updateCropImage = () => {
    if (!cropLayout) return;
    cropLayout.left = Math.min(0, Math.max(cropLayout.size - cropLayout.width, cropLayout.left));
    cropLayout.top = Math.min(0, Math.max(cropLayout.size - cropLayout.height, cropLayout.top));
    cropImage.style.width = `${cropLayout.width}px`;
    cropImage.style.height = `${cropLayout.height}px`;
    cropImage.style.left = `${cropLayout.left}px`;
    cropImage.style.top = `${cropLayout.top}px`;
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
    updateCropImage();
  };
  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      await openCropper(file);
      feedback.textContent = '';
      feedback.classList.remove('is-error', 'is-success');
      cropFeedback.textContent = '';
    } catch (error) {
      if (cropDialog?.open) cropDialog.close();
      feedback.textContent = error.message || 'That photo could not be loaded.';
      feedback.classList.add('is-error');
    }
  });
  cropZoom?.addEventListener('input', () => {
    if (!cropLayout) return;
    const centerX = cropLayout.left + cropLayout.width / 2;
    const centerY = cropLayout.top + cropLayout.height / 2;
    const zoom = Number(cropZoom.value);
    cropLayout.width = cropLayout.baseWidth * zoom;
    cropLayout.height = cropLayout.baseHeight * zoom;
    cropLayout.left = centerX - cropLayout.width / 2;
    cropLayout.top = centerY - cropLayout.height / 2;
    updateCropImage();
  });
  cropViewport?.addEventListener('pointerdown', (event) => {
    if (!cropLayout) return;
    cropViewport.setPointerCapture(event.pointerId);
    cropViewport.dataset.dragX = String(event.clientX);
    cropViewport.dataset.dragY = String(event.clientY);
  });
  cropViewport?.addEventListener('pointermove', (event) => {
    if (!cropLayout || !cropViewport.hasPointerCapture(event.pointerId)) return;
    cropLayout.left += event.clientX - Number(cropViewport.dataset.dragX);
    cropLayout.top += event.clientY - Number(cropViewport.dataset.dragY);
    cropViewport.dataset.dragX = String(event.clientX);
    cropViewport.dataset.dragY = String(event.clientY);
    updateCropImage();
  });
  cropViewport?.addEventListener('keydown', (event) => {
    if (!cropLayout) return;
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') cropLayout.left -= step;
    else if (event.key === 'ArrowRight') cropLayout.left += step;
    else if (event.key === 'ArrowUp') cropLayout.top -= step;
    else if (event.key === 'ArrowDown') cropLayout.top += step;
    else return;
    event.preventDefault();
    updateCropImage();
  });
  section.querySelector('[data-pet-profile-cancel-crop]')?.addEventListener('click', () => cropDialog?.close());
  section.querySelector('[data-pet-profile-use-crop]')?.addEventListener('click', async () => {
    if (!cropSourceImage || !cropLayout) return;
    const scale = cropLayout.width / cropSourceImage.naturalWidth;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    canvas.getContext('2d').drawImage(cropSourceImage, -cropLayout.left / scale, -cropLayout.top / scale, cropLayout.size / scale, cropLayout.size / scale, 0, 0, 512, 512);
    const photo = canvas.toDataURL('image/jpeg', 0.88);
    const useButton = section.querySelector('[data-pet-profile-use-crop]');
    useButton.disabled = true;
    feedback.textContent = 'Saving profile picture…';
    cropFeedback.textContent = 'Saving profile picture…';
    feedback.classList.remove('is-error', 'is-success');
    try {
      const updated = await updatePicture({ photo, profilePictureMode: 'photo' });
      showPicture(updated);
      feedback.textContent = 'Profile picture updated.';
      feedback.classList.add('is-success');
      cropFeedback.textContent = '';
      cropDialog.close();
    } catch (error) {
      feedback.textContent = error.message || 'The profile picture could not be saved.';
      feedback.classList.add('is-error');
      cropFeedback.textContent = error.message || 'The profile picture could not be saved.';
    } finally { useButton.disabled = false; }
  });
  cropDialog?.addEventListener('close', () => {
    cropSourceImage = null;
    cropImage?.removeAttribute('src');
    if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
    cropObjectUrl = '';
    cropLayout = null;
    if (photoInput) photoInput.value = '';
  });
  useAvatarButton?.addEventListener('click', async () => {
    const pet = loadPetProfiles().find((item) => String(item.id) === String(petId));
    if (!pet?.avatar) { pictureDialog?.close(); createButton?.click(); return; }
    try {
      const updated = await updatePicture({ profilePictureMode: 'avatar' });
      showPicture(updated, 'Pet Avatar');
      pictureDialog?.close();
    } catch (error) {
      feedback.textContent = error.message || 'The pet avatar could not be selected.';
      feedback.classList.add('is-error');
    }
  });
  createButton?.addEventListener('click', () => avatarInput?.click());
  avatarInput?.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    createButton.disabled = true;
    createButton.textContent = 'Creating your avatar…';
    feedback.textContent = 'Checking for a dog face, then creating a Furgo-style avatar. This may take a little while.';
    feedback.classList.remove('is-error', 'is-success');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in to create and save your pet avatar.');
      const [photo, styleReference] = await Promise.all([
        petPhotoDataUrl(file),
        petAvatarReferenceDataUrl('Image/Pet%20Assistant%20Library/optimized/Furgo%20Assistant.png', { maxSide: 1024, format: 'image/png' }),
      ]);
      const { data, error } = await supabase.functions.invoke('pet-avatar-create', { body: { photo, style_reference: styleReference } });
      if (error) {
        let detail = data?.error || '';
        try { detail ||= (await error.context?.json())?.error || ''; } catch { /* Use the function's message. */ }
        throw new Error(detail || error.message || 'Avatar creation is not available yet.');
      }
      if (!data?.avatar) throw new Error(data?.error || 'The avatar could not be created. Please try again.');
      const currentPet = loadPetProfiles().find((item) => String(item.id) === String(petId));
      const currentAvatars = Array.isArray(currentPet?.avatars) ? currentPet.avatars : (currentPet?.avatar ? [currentPet.avatar] : []);
      const avatarUrls = currentAvatars.map((item) => typeof item === 'string' ? item : item?.url).filter(Boolean);
      const createdAvatars = [...currentAvatars];
      if (!avatarUrls.includes(data.avatar)) createdAvatars.push(data.avatar);
      const updated = await updatePicture({ avatar: data.avatar, avatars: createdAvatars, activeAvatarIndex: createdAvatars.length - 1 });
      showPicture(updated);
      useAvatarButton.textContent = 'Use Pet Avatar';
      avatarResult.hidden = false;
      avatarResultLabel.textContent = 'Saved pet avatar';
      feedback.textContent = 'Avatar created and saved. It is ready for the AI Pet Assistant mascot.';
      feedback.classList.add('is-success');
    } catch (error) {
      const message = error.message || 'Avatar creation failed. Please try again.';
      feedback.textContent = /dog_not_detected|no dog/i.test(message)
        ? 'No dog detected. Upload a clear photo showing your dog’s face and try again.'
        : message;
      feedback.classList.add('is-error');
      feedback.classList.remove('is-success');
    } finally {
      createButton.disabled = false;
      createButton.textContent = 'Create your pet avatar';
      avatarInput.value = '';
    }
  });
}

// Previews selected avatars and saves the choice for this pet's home assistant.
function setupPetAvatarPage() {
  const page = document.querySelector('[data-pet-avatar-page]');
  if (!page) return;
  const preview = page.querySelector('[data-pet-avatar-current-preview]');
  const feedback = page.querySelector('[data-pet-avatar-feedback]');
  page.querySelectorAll('.pet-avatar-carousel-wrap').forEach((wrap) => {
    const carousel = wrap.querySelector('.pet-avatar-carousel');
    const controls = [...wrap.querySelectorAll('[data-avatar-scroll]')];
    if (!carousel || !controls.length) return;
    const syncControls = () => {
      const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
      controls.forEach((control) => {
        const atStart = carousel.scrollLeft <= 2;
        const atEnd = carousel.scrollLeft >= maxScroll - 2;
        control.disabled = maxScroll <= 2 || (control.dataset.avatarScroll === 'prev' ? atStart : atEnd);
      });
    };
    controls.forEach((control) => control.addEventListener('click', () => {
      const card = carousel.querySelector('.pet-avatar-choice');
      const distance = Math.max(120, (card?.getBoundingClientRect().width || 142) * 2 + 12);
      carousel.scrollBy({ left: control.dataset.avatarScroll === 'next' ? distance : -distance, behavior: 'smooth' });
    }));
    carousel.addEventListener('scroll', syncControls, { passive: true });
    window.addEventListener('resize', syncControls, { passive: true });
    requestAnimationFrame(syncControls);
  });
  page.querySelectorAll('input[name="pet-avatar-choice"]').forEach((input) => input.addEventListener('change', () => {
    if (!input.checked || !preview) return;
    const card = input.closest('.pet-avatar-choice');
    const image = card?.querySelector('img');
    const label = card?.querySelector('span')?.textContent?.trim() || 'Pet Assistant';
    if (image) preview.src = image.src;
    preview.alt = `${label} avatar preview`;
    if (feedback) feedback.textContent = 'Preview updated. Save this avatar to apply it.';
  }));
  const button = page.querySelector('[data-save-pet-avatar]');
  button?.addEventListener('click', async () => {
    const choice = page.querySelector('input[name="pet-avatar-choice"]:checked')?.value || 'default';
    const pets = loadPetProfiles();
    const oldPet = pets.find((pet) => String(pet.id) === String(page.dataset.petId));
    if (!oldPet) return;
    const avatarList = petCustomAvatarLibrary(pets);
    let avatar = '';
    let avatarPath = '';
    let activeAvatarIndex = null;
    if (choice.startsWith('custom:')) {
      activeAvatarIndex = Number(choice.slice('custom:'.length));
      const selectedAvatar = avatarList[activeAvatarIndex];
      avatar = selectedAvatar?.url || '';
      avatarPath = selectedAvatar?.path || (avatar === oldPet.avatar ? oldPet.avatarPath || '' : '');
    } else if (choice === 'free:furgo') avatar = defaultPetAvatarPath;
    else if (choice.startsWith('free:')) avatar = [...freePetAssistantAvatars, ...freePetCatAvatars].find((item) => item.id === choice.slice('free:'.length))?.url || defaultPetAvatarPath;
    if (choice.startsWith('free:')) avatarPath = `builtin:${avatar}`;
    const changes = { avatar, avatarPath, activeAvatarIndex };
    button.disabled = true;
    if (feedback) feedback.textContent = 'Saving your avatar…';
    try {
      let updatedPet = { ...oldPet, ...changes };
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        updatedPet.avatarPath = await saveCloudPetAssistantAvatar(oldPet.id, avatarPath, authData.user.id);
      }
      localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(pets.map((pet) => String(pet.id) === String(oldPet.id) ? updatedPet : pet)));
      const selected = selectedPetAssistantIds() || (selectedHomeAssistantPet(pets) ? [selectedHomeAssistantPet(pets).id] : []);
      savePetAssistantIds([...selected, String(oldPet.id)]);
      saveSelectedPetAssistantId(oldPet.id);
      if (feedback) feedback.textContent = `${oldPet.name}’s avatar is saved and active on the home page.`;
    } catch (error) {
      console.error('Pet assistant avatar could not be saved:', error);
      if (feedback) feedback.textContent = error.message || 'The avatar could not be saved. Please try again.';
    } finally { button.disabled = false; }
  });
}

// Lets customers swipe across the current Pet Profile to visit the previous or next pet.
function setupPetProfileDelete() {
  const page = document.querySelector('[data-pet-profile-page]');
  const trigger = page?.querySelector('[data-open-pet-profile-delete]');
  const dialog = page?.querySelector('[data-pet-profile-delete-dialog]');
  if (!page || !trigger || !dialog) return;
  const feedback = page.querySelector('[data-pet-profile-delete-feedback]');
  trigger.addEventListener('click', () => dialog.showModal());
  page.querySelector('[data-cancel-pet-profile-delete]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  page.querySelector('[data-confirm-pet-profile-delete]')?.addEventListener('click', async (event) => {
    const confirmButton = event.currentTarget;
    const petId = trigger.dataset.deletePetId;
    confirmButton.disabled = true;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) await deleteCloudPet(petId, authData.user.id);
      const storedPets = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
      const currentPets = Array.isArray(storedPets) ? storedPets : [];
      const remainingPets = currentPets.filter((pet) => String(pet.id) !== String(petId));
      const selectedAssistantId = String(selectedHomeAssistantPet(currentPets)?.id || '');
      localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(remainingPets));
      deletePetCareData(petId);
      const enabledIds = (selectedPetAssistantIds() || []).filter((id) => String(id) !== String(petId));
      savePetAssistantIds(enabledIds);
      if (selectedAssistantId === String(petId)) {
        saveSelectedPetAssistantId(enabledIds[0] || '');
      }
      dialog.close();
      window.location.hash = '#home';
    } catch (error) {
      if (feedback) feedback.textContent = `Could not delete this pet profile: ${friendlyAuthError(error)}`;
      confirmButton.disabled = false;
    }
  });
}

function setupPetProfileSwipe() {
  const page = document.querySelector('[data-pet-profile-page]');
  if (!page) return;
  const placeSwapArrows = () => {
    if (!page.isConnected) {
      window.removeEventListener('scroll', placeSwapArrows);
      window.removeEventListener('resize', placeSwapArrows);
      return;
    }
    const viewport = page.querySelector('[data-pet-profile-swipe-viewport]');
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    page.querySelectorAll('.pet-profile-swap-arrow').forEach((arrow) => {
      if (arrow.classList.contains('is-previous')) {
        arrow.style.left = `${Math.max(8, bounds.left + 10)}px`;
        arrow.style.right = 'auto';
      } else {
        arrow.style.right = `${Math.max(8, window.innerWidth - bounds.right + 10)}px`;
        arrow.style.left = 'auto';
      }
    });
  };
  placeSwapArrows();
  window.addEventListener('scroll', placeSwapArrows, { passive: true });
  window.addEventListener('resize', placeSwapArrows);
  let startPoint = null;
  let activeSwipe = null;
  let isChangingPet = false;
  const getTarget = (direction) => {
    const pets = loadPetProfiles();
    const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (routeParams.get('mode') === 'add-card') {
      const previousPet = direction < 0 ? pets[pets.length - 1] : null;
      return previousPet ? { destination: `#pet-profile?id=${encodeURIComponent(previousPet.id)}`, nextPet: previousPet } : null;
    }
    const currentId = routeParams.get('id');
    const currentIndex = pets.findIndex((pet) => String(pet.id) === String(currentId));
    if (currentIndex < 0) return null;
    let destination = '';
    let nextPet = null;
    if (direction > 0) {
      nextPet = pets[currentIndex + 1] || null;
      destination = nextPet
        ? `#pet-profile?id=${encodeURIComponent(nextPet.id)}`
        : '#pet-profile?mode=add-card';
    } else if (currentIndex > 0) {
      nextPet = pets[currentIndex - 1];
      destination = `#pet-profile?id=${encodeURIComponent(nextPet.id)}`;
    }
    return destination ? { destination, nextPet } : null;
  };
  const prepareSwipe = (direction) => {
    const target = getTarget(direction);
    if (!target) return null;
    const viewport = page.querySelector('[data-pet-profile-swipe-viewport]');
    const track = viewport?.querySelector('[data-pet-profile-swipe-track]');
    const currentPanel = page.querySelector('[data-pet-profile-transition-content]');
    if (!viewport || !track || !currentPanel) return null;

    let nextPanel;
    if (target.nextPet) {
      const template = document.createElement('template');
      template.innerHTML = petProfileOverviewPage(target.nextPet.id);
      nextPanel = template.content.querySelector('[data-pet-profile-transition-content]');
      if (!nextPanel) return null;
    } else {
      const template = document.createElement('template');
      template.innerHTML = petProfileAddCardPage();
      nextPanel = template.content.querySelector('[data-pet-profile-transition-content]');
      if (!nextPanel) return null;
    }
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 16;
    const width = viewport.getBoundingClientRect().width || page.clientWidth;
    const travel = width + gap;
    track.style.width = `calc(200% + ${gap}px)`;
    track.style.gap = `${gap}px`;
    currentPanel.style.flex = `0 0 calc(50% - ${gap / 2}px)`;
    currentPanel.style.minWidth = '0';
    nextPanel.style.flex = `0 0 calc(50% - ${gap / 2}px)`;
    nextPanel.style.minWidth = '0';
    if (direction > 0) track.append(nextPanel);
    else track.prepend(nextPanel);
    nextPanel.querySelectorAll('.pet-profile-swap-arrow').forEach((arrow) => { arrow.style.visibility = 'hidden'; });
    const startX = direction > 0 ? 0 : -travel;
    track.style.transition = 'none';
    track.style.transform = `translateX(${startX}px)`;
    track.getBoundingClientRect();
    return { direction, destination: target.destination, viewport, track, currentPanel, nextPanel, width, travel, startX, deltaX: 0 };
  };
  const resetSwipe = (swipe) => {
    if (!swipe) return;
    swipe.nextPanel.remove();
    swipe.track.style.width = '';
    swipe.track.style.gap = '';
    swipe.track.style.transform = '';
    swipe.track.style.transition = '';
    swipe.currentPanel.style.flex = '';
    swipe.currentPanel.style.minWidth = '';
    swipe.viewport.style.pointerEvents = '';
  };
  const animateTrack = (swipe, endX, onFinish) => {
    const endTransform = `translateX(${endX}px)`;
    if (typeof swipe.track.animate === 'function') {
      const animation = swipe.track.animate(
        [{ transform: swipe.track.style.transform }, { transform: endTransform }],
        { duration: 220, easing: 'cubic-bezier(.22,.72,.24,1)', fill: 'forwards' },
      );
      animation.onfinish = onFinish;
    } else {
      swipe.track.style.transition = 'transform 220ms cubic-bezier(.22,.72,.24,1)';
      swipe.track.style.transform = endTransform;
      window.setTimeout(onFinish, 240);
    }
  };
  const movePet = (direction) => {
    if (isChangingPet) return;
    const swipe = prepareSwipe(direction);
    if (!swipe) return;
    isChangingPet = true;
    swipe.viewport.style.pointerEvents = 'none';
    const endX = direction > 0 ? -swipe.travel : 0;
    const finish = () => { window.location.hash = swipe.destination; };
    animateTrack(swipe, endX, finish);
  };
  const finishFingerSwipe = (commit) => {
    const swipe = activeSwipe;
    activeSwipe = null;
    if (!swipe) return;
    const endX = commit ? (swipe.direction > 0 ? -swipe.travel : 0) : swipe.startX;
    if (commit) {
      isChangingPet = true;
      swipe.viewport.style.pointerEvents = 'none';
      animateTrack(swipe, endX, () => { window.location.hash = swipe.destination; });
    } else {
      animateTrack(swipe, endX, () => resetSwipe(swipe));
    }
  };
  page.addEventListener('click', (event) => {
    const nextButton = event.target.closest('[data-pet-profile-next]');
    const previousButton = event.target.closest('[data-pet-profile-previous]');
    if (!nextButton && !previousButton) return;
    event.preventDefault();
    movePet(nextButton ? 1 : -1);
  });
  page.addEventListener('touchstart', (event) => {
    if (isChangingPet || event.target.closest('.bottom-nav, dialog, input, textarea, select')) { startPoint = null; return; }
    const touch = event.changedTouches[0];
    startPoint = touch ? { x: touch.clientX, y: touch.clientY, time: performance.now() } : null;
  }, { passive: true });
  page.addEventListener('touchmove', (event) => {
    if (!startPoint || isChangingPet) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startPoint.x;
    const deltaY = touch.clientY - startPoint.y;
    if (!activeSwipe) {
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      activeSwipe = prepareSwipe(deltaX < 0 ? 1 : -1);
      if (!activeSwipe) return;
    }
    event.preventDefault();
    activeSwipe.deltaX = deltaX;
    const boundedDelta = activeSwipe.direction > 0
      ? Math.max(-activeSwipe.travel, Math.min(0, deltaX))
      : Math.max(0, Math.min(activeSwipe.travel, deltaX));
    activeSwipe.track.style.transform = `translateX(${activeSwipe.startX + boundedDelta}px)`;
  }, { passive: false });
  page.addEventListener('touchend', (event) => {
    if (!startPoint) return;
    const touch = event.changedTouches[0];
    const deltaX = touch ? touch.clientX - startPoint.x : 0;
    const elapsed = performance.now() - startPoint.time;
    startPoint = null;
    if (!activeSwipe) return;
    if (event.cancelable) event.preventDefault();
    const passedDistance = Math.abs(deltaX) >= activeSwipe.width * 0.22;
    const quickFlick = elapsed < 220 && Math.abs(deltaX) >= 48;
    finishFingerSwipe(passedDistance || quickFlick);
  }, { passive: false });
  page.addEventListener('touchcancel', () => {
    startPoint = null;
    if (activeSwipe) finishFingerSwipe(false);
  }, { passive: true });
}

// Saves a new or edited Pet Profile and its removable remark chips in browser storage.
function setupPetProfileForm() {
  const form = document.querySelector('[data-pet-profile-form]');
  if (!form) return;
  const remarksList = form.querySelector('[data-remarks-list]');
  const remarkInput = form.querySelector('[data-remark-draft]');
  const breedInput = form.querySelector('[data-breed-input]');
  const breedListbox = form.querySelector('[data-breed-listbox]');
  const speciesInput = form.querySelector('[data-pet-species]');
  const feedback = form.querySelector('.form-feedback');
  const petReturnContext = new URLSearchParams(window.location.hash.split('?')[1] || '').get('from') || 'home';
  const petReturnTo = petReturnContext === 'pet-profile' && form.dataset.petId ? `#pet-profile?id=${encodeURIComponent(form.dataset.petId)}` : petReturnContext === 'profile' ? '#profile' : petReturnContext === 'grooming' ? '#grooming' : petReturnContext === 'hotel' ? '#hotel' : '#home';
  const initialRemarks = [...remarksList.querySelectorAll('[data-remark-value]')].map((chip) => chip.dataset.remarkValue);
  let remarks = initialRemarks;
  let profilePictureMode = form.dataset.profilePictureMode || 'default';
  const birthMonth = form.querySelector('[data-birth-month]');
  const birthDay = form.querySelector('[data-birth-day]');
  const birthYear = form.querySelector('[data-birth-year]');
  const birthDateValue = form.querySelector('[data-birth-date-value]');
  const birthDateTypeChoice = form.querySelector('[data-birth-date-type]');
  const birthDatePicker = form.querySelector('[data-birth-date-picker]');
  birthDateTypeChoice?.addEventListener('change', () => {
    const hasOccasion = Boolean(birthDateTypeChoice.value);
    birthDateTypeChoice.dataset.selected = String(hasOccasion);
    if (birthDatePicker) {
      birthDatePicker.classList.toggle('is-disabled', !hasOccasion);
      birthDatePicker.setAttribute('aria-disabled', String(!hasOccasion));
      birthDatePicker.querySelectorAll('select').forEach((field) => { field.disabled = !hasOccasion; });
    }
    if (!hasOccasion) {
      birthMonth.value = '';
      birthDay.value = '';
      birthYear.value = '';
      birthDateValue.value = '';
    }
  });
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
    const species = speciesInput.value || 'Dog';
    let matches = 0;
    breedListbox.querySelectorAll('[data-breed-option]').forEach((option) => {
      option.hidden = option.dataset.breedSpecies !== species || !option.dataset.breedOption.toLocaleLowerCase().includes(query);
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
  speciesInput.addEventListener('change', () => {
    breedInput.value = '';
    closeBreedOptions();
    breedListbox.querySelectorAll('[data-breed-option]').forEach((option) => {
      option.hidden = option.dataset.breedSpecies !== speciesInput.value;
    });
  });
  form.querySelectorAll('[data-pet-species-choice]').forEach((choice) => choice.addEventListener('change', () => {
    if (!choice.checked) return;
    speciesInput.value = choice.value === 'Cat' ? 'Cat' : 'Dog';
    form.querySelectorAll('[data-species-choice-card]').forEach((card) => {
      card.dataset.selected = String(card.querySelector('[data-pet-species-choice]')?.checked === true);
    });
    speciesInput.dispatchEvent(new Event('change', { bubbles: true }));
  }));
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
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const birthParts = [birthMonth.value, birthDay.value, birthYear.value];
    const selectedBirthDateType = form.elements.birthDateType.value;
    if (birthParts.some(Boolean) && !birthParts.every(Boolean)) {
      feedback.textContent = 'Choose the month, day, and year, or leave the occasion date blank.';
      feedback.classList.add('visible');
      [birthMonth, birthDay, birthYear].find((field) => !field.value)?.focus();
      return;
    }
    if (birthParts.some(Boolean) && !selectedBirthDateType) {
      feedback.textContent = 'Choose Birthday or Adoption Day before entering the date.';
      feedback.classList.add('visible');
      birthDateTypeChoice?.focus();
      return;
    }
    const savedPets = loadPetProfiles();
    const currentId = form.dataset.petId;
    const existingPet = savedPets.find((pet) => pet.id === currentId) || {};
    const { data: authData } = await supabase.auth.getUser();
    const currentIdIsUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(currentId || '');
    const petId = currentId && (!authData.user || currentIdIsUuid) ? currentId : crypto.randomUUID();
    const pet = {
      ...existingPet,
      id: petId,
      ownerId: existingPet.ownerId || getCustomerRecordId(JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}')),
      ownerEmail: existingPet.ownerEmail || JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').email || '',
      ownerPhone: existingPet.ownerPhone || JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}').phone || '',
      name: form.elements.name.value.trim(),
      species: speciesInput.value === 'Cat' ? 'Cat' : 'Dog',
      breed: form.elements.breed.value.trim(),
      sex: form.elements.sex.value,
      birthDate: form.elements.birthDate.value,
      birthDateType: selectedBirthDateType === 'adoption' ? 'adoption' : selectedBirthDateType === 'birthday' ? 'birthday' : '',
      neutered: form.elements.neutered.value,
      weight: form.elements.weight.value,
      colour: existingPet.colour || '',
      photo: existingPet.photo || '',
      avatar: existingPet.avatar || '',
      avatarPath: existingPet.avatarPath || '',
      profilePictureMode,
      photoPath: existingPet.photoPath || '',
      vaccinationCards: existingPet.vaccinationCards || [],
      vaccinationValidUntil: existingPet.vaccinationValidUntil || '',
      remarks,
    };
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
    const nextWeight = Number(pet.weight);
    const previousWeight = Number(existingPet.weight);
    if (Number.isFinite(nextWeight) && nextWeight > 0 && (!Number.isFinite(previousWeight) || nextWeight !== previousWeight)) {
      savePetRecord(petId, { date: localPetDate(), weightKg: String(nextWeight) });
    }
    window.location.hash = petReturnContext === 'pet-profile' ? `#pet-profile?id=${encodeURIComponent(petId)}` : petReturnTo;
  });
}

// Saves a pet's vaccination date and uploaded cards from its dedicated Vaccination page.
function setupPetVaccinationPage() {
  const form = document.querySelector('[data-pet-vaccination-form]');
  if (!form) return;
  const petId = form.dataset.petId;
  const input = form.querySelector('[data-vaccination-upload]');
  const dateInput = form.elements.vaccinationValidUntil;
  const list = form.querySelector('[data-vaccination-list]');
  const feedback = form.querySelector('.form-feedback');
  const pet = loadPetProfiles().find((item) => String(item.id) === String(petId));
  let cards = Array.isArray(pet?.vaccinationCards) ? [...pet.vaccinationCards] : [];
  let knownCardPaths = new Set(cards.map((card) => card.path).filter(Boolean));
  let cardRevision = 0;
  let saveQueue = Promise.resolve();
  const showFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('visible', Boolean(message));
    feedback.classList.toggle('is-error', isError);
  };
  const saveVaccinationDetails = () => {
    if (!pet) { showFeedback('Pet profile not found.', true); return; }
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const cardsToSave = [...cards];
      const savedCardRevision = cardRevision;
      const vaccinationValidUntil = dateInput.value;
      showFeedback('Saving changes…');
      try {
        const { data: authData } = await supabase.auth.getUser();
        let savedCards = cardsToSave;
        if (authData.user) {
          const uploadedPaths = [];
          try {
            const storedCards = await Promise.all(cardsToSave.map(async (card) => {
              const path = card.path || await uploadPetDataUrl(authData.user.id, petId, 'vaccination', card.data);
              if (!card.path && path) uploadedPaths.push(path);
              return { name: card.name || 'Vaccination record', path };
            }));
            const { data, error } = await supabase.from('pet_profiles')
              .update({ vaccination_cards: storedCards, vaccination_valid_until: vaccinationValidUntil || null })
              .eq('id', petId)
              .eq('user_id', authData.user.id)
              .select('vaccination_cards,vaccination_valid_until')
              .single();
            if (error) throw error;
            const persistedCards = Array.isArray(data.vaccination_cards) ? data.vaccination_cards : [];
            savedCards = await Promise.all(persistedCards.map(async (card) => ({
              name: card.name || 'Vaccination record',
              path: card.path || '',
              data: card.path ? await signedPetFile(card.path) : '',
            })));
            const retainedPaths = new Set(persistedCards.map((card) => card.path).filter(Boolean));
            const removedPaths = [...knownCardPaths].filter((path) => !retainedPaths.has(path));
            knownCardPaths = retainedPaths;
            if (removedPaths.length) {
              const { error: removalError } = await supabase.storage.from('pet-records').remove(removedPaths);
              if (removalError) console.warn('Removed vaccination files could not be deleted:', removalError);
            }
          } catch (error) {
            if (uploadedPaths.length) await supabase.storage.from('pet-records').remove(uploadedPaths);
            throw error;
          }
        } else {
          savedCards = cardsToSave;
        }
        const savedPets = loadPetProfiles();
        const currentPet = savedPets.find((item) => String(item.id) === String(petId)) || pet;
        const updatedPet = { ...currentPet, vaccinationCards: savedCards, vaccinationValidUntil };
        localStorage.setItem(petProfilesStorageKeyForCurrentUser(), JSON.stringify(savedPets.map((item) => String(item.id) === String(petId) ? updatedPet : item)));
        savePetReminders(petId, { ...loadPetReminders(petId), vaccinationDate: vaccinationValidUntil });
        if (cardRevision === savedCardRevision) {
          cards = savedCards;
          renderCards();
        }
        showFeedback('Changes saved automatically.');
      } catch (error) {
        showFeedback(`Could not save vaccination details: ${friendlyAuthError(error)}`, true);
      }
    });
  };
  const renderCards = () => {
    list.replaceChildren();
    if (!cards.length) {
      const empty = document.createElement('li');
      empty.className = 'pet-vaccination-empty';
      empty.textContent = 'No vaccination cards uploaded.';
      list.append(empty);
      return;
    }
    cards.forEach((card, index) => {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = card.data || '#';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = card.name || `Vaccination card ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removeVaccinationCard = String(index);
      remove.setAttribute('aria-label', `Remove ${card.name || 'vaccination card'}`);
      remove.textContent = '×';
      row.append(link, remove);
      list.append(row);
    });
  };
  renderCards();
  list.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-vaccination-card]');
    if (!remove) return;
    cards.splice(Number(remove.dataset.removeVaccinationCard), 1);
    cardRevision += 1;
    renderCards();
    saveVaccinationDetails();
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  dateInput.addEventListener('change', saveVaccinationDetails);
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    const existingBytes = cards.reduce((total, card) => total + (card.data?.startsWith('data:') ? Math.ceil(card.data.length * 0.75) : 0), 0);
    if (cards.length + files.length > 3) {
      showFeedback('You can add up to 3 vaccination card files.', true);
      input.value = '';
      return;
    }
    if (existingBytes + files.reduce((total, file) => total + file.size, 0) > 2.5 * 1024 * 1024) {
      showFeedback('Vaccination card uploads have a combined 2.5 MB limit. Remove a file or choose smaller files.', true);
      input.value = '';
      return;
    }
    try {
      const addedCards = [];
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
        addedCards.push({ name: file.name, type: isImage ? 'image/jpeg' : 'application/pdf', data });
      }
      cards.push(...addedCards);
      cardRevision += 1;
      renderCards();
      saveVaccinationDetails();
    } catch (error) {
      showFeedback(error.message || 'That file could not be uploaded.', true);
    } finally {
      input.value = '';
    }
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
    const previousScrollY = window.scrollY;
    const restoreScrollPosition = () => {
      if (Math.abs(window.scrollY - previousScrollY) > 1) window.scrollTo({ left: 0, top: previousScrollY, behavior: 'instant' });
    };
    const productId = button.dataset.toggleFavorite;
    const favoriteIds = loadMarketplaceFavorites();
    const isSaved = favoriteIds.includes(productId);
    const updatedFavorites = isSaved ? favoriteIds.filter((id) => id !== productId) : [...favoriteIds, productId];
    localStorage.setItem(marketplaceFavoritesKey, JSON.stringify(updatedFavorites));
    if (window.location.hash.split('?')[0] === '#favourites') {
      const removedCard = button.closest('.favorite-product-card');
      const favoritesGrid = document.querySelector('.favorite-products-section .market-product-grid');
      removedCard?.remove();
      if (favoritesGrid && !favoritesGrid.querySelector('.favorite-product-card')) {
        favoritesGrid.innerHTML = '<div class="market-empty favorite-empty"><h2>No Favourites Saved Yet</h2><p>Tap the heart on a product to keep it here for next time.</p><a class="button button-primary" href="#marketplace">Browse Marketplace</a></div>';
      }
      toast('Removed from your favourites.');
      window.requestAnimationFrame(() => window.requestAnimationFrame(restoreScrollPosition));
      return;
    }
    document.querySelectorAll('[data-toggle-favorite]').forEach((toggle) => {
      if (toggle.dataset.toggleFavorite !== productId) return;
      const saved = !isSaved;
      const productName = loadMarketplaceProducts().find((product) => product.id === productId)?.name || 'product';
      toggle.setAttribute('aria-pressed', String(saved));
      toggle.setAttribute('aria-label', `${saved ? 'Remove' : 'Add'} ${productName} ${saved ? 'from' : 'to'} favourites`);
      const image = toggle.querySelector('img');
      if (image) image.src = `Image/Icon/${saved ? 'Icon-16.png' : 'Icon-15.png'}`;
      const label = toggle.querySelector('span');
      if (label && (toggle.classList.contains('market-favorite-action') || toggle.classList.contains('market-pdp-inline-favorite'))) label.textContent = saved ? 'Saved to Favourites' : 'Save as Favourite';
    });
    toast(isSaved ? 'Removed from your favourites.' : 'Saved to your favourites.');
    window.requestAnimationFrame(() => window.requestAnimationFrame(restoreScrollPosition));
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
    image.alt = `${name || 'Store'} profile photo`;
    image.src = supplier?.avatar_path
      ? supabase.storage.from('supplier-profile-photos').getPublicUrl(supplier.avatar_path).data.publicUrl
      : 'Image/Other%20Image/Supplier%20Profile%20Picture.png';
  };
  if (supplierCard) {
    updateSupplierCard(supplierCard.dataset.marketplaceSupplierProfile);
    void supabase.rpc('get_marketplace_supplier_profiles').then(({ data, error }) => {
      if (error) throw error;
      supplierProfilesByName = new Map((data || []).map((supplier) => [String(supplier.supplier_name || '').toLocaleLowerCase(), supplier]));
      updateSupplierCard(supplierCard.dataset.marketplaceSupplierProfile);
    }).catch((error) => console.warn('Marketplace store profiles could not load:', error));
  }
  const updateVariant = () => {
    if (!variantSelect) return;
    const option = variantSelect.selectedOptions[0];
    if (!option) return;
    document.querySelector('[data-pdp-price]').textContent = `MYR ${Number(option.dataset.price).toFixed(2)}`;
    document.querySelector('[data-pdp-stock]').textContent = `${Number(option.dataset.stock)} in stock`;
    const quantity = document.querySelector('[data-product-quantity]');
    if (quantity) {
      quantity.max = option.dataset.stock;
      quantity.value = '1';
    }
    document.querySelector('[data-add-to-cart]').disabled = Number(option.dataset.stock) < 1;
    const buyNowButton = document.querySelector('[data-buy-now]');
    if (buyNowButton) buyNowButton.disabled = Number(option.dataset.stock) < 1;
    const subscribeButton = document.querySelector('[data-add-to-subscription]');
    if (subscribeButton) subscribeButton.disabled = Number(option.dataset.stock) < 1;
    document.querySelectorAll('[data-pdp-option], [data-sheet-variant]').forEach((button) => {
      const selected = button.dataset.pdpOption === option.value || button.dataset.sheetVariant === option.value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    updateSupplierCard(option.dataset.supplier);
    const optionImage = option.dataset.image;
    const productImage = document.querySelector('[data-pdp-image]');
    if (productImage && optionImage) {
      productImage.src = optionImage;
      const matchingGalleryImage = [...document.querySelectorAll('[data-gallery-image]')].find((button) => button.dataset.imageSrc === optionImage);
      if (matchingGalleryImage) document.querySelectorAll('[data-gallery-image]').forEach((button) => button.classList.toggle('selected', button === matchingGalleryImage));
    }
  };
  variantSelect?.addEventListener('change', updateVariant);
  document.querySelectorAll('[data-pdp-option], [data-sheet-variant]').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled || !variantSelect) return;
    variantSelect.value = button.dataset.pdpOption || button.dataset.sheetVariant;
    variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  if (variantSelect) {
    const initialOption = variantSelect.selectedOptions[0];
    document.querySelectorAll('[data-pdp-option], [data-sheet-variant]').forEach((button) => {
      const selected = button.dataset.pdpOption === variantSelect.value || button.dataset.sheetVariant === variantSelect.value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('[data-product-quantity]')?.setAttribute('max', initialOption?.dataset.stock || '1');
  }
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
  const optionSheet = document.querySelector('[data-option-sheet]');
  let purchaseMode = 'add';
  const openOptionSheet = (mode) => {
    if (!optionSheet) return;
    purchaseMode = mode;
    const confirm = optionSheet.querySelector('[data-option-sheet-confirm]');
    if (confirm) confirm.textContent = mode === 'buy' ? 'Buy Now' : 'Add to Cart';
    optionSheet.hidden = false;
    document.body.classList.add('market-option-sheet-open');
  };
  const closeOptionSheet = () => {
    if (!optionSheet) return;
    optionSheet.hidden = true;
    document.body.classList.remove('market-option-sheet-open');
  };
  document.querySelector('[data-add-to-cart]')?.addEventListener('click', () => openOptionSheet('add'));
  document.querySelector('[data-buy-now]')?.addEventListener('click', () => openOptionSheet('buy'));
  optionSheet?.querySelectorAll('[data-option-sheet-close]').forEach((button) => button.addEventListener('click', closeOptionSheet));
  optionSheet?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && optionSheet && !optionSheet.hidden) closeOptionSheet();
  });
  optionSheet?.querySelector('[data-option-sheet-confirm]')?.addEventListener('click', () => {
    const productId = document.querySelector('[data-add-to-cart]')?.dataset.addToCart;
    const variantId = variantSelect?.value;
    const quantity = Math.max(1, Number(document.querySelector('[data-product-quantity]')?.value) || 1);
    const variant = loadMarketplaceProducts().find((product) => product.id === productId)?.variants.find((item) => item.id === variantId);
    if (!variant || variant.frozen || variant.stock < quantity) { toast('That quantity is not currently available.'); return; }
    const cart = loadMarketplaceCart();
    const existing = cart.find((item) => item.productId === productId && item.variantId === variantId);
    if (existing) existing.quantity = Math.min(variant.stock, Number(existing.quantity) + quantity);
    else cart.push({ productId, variantId, quantity });
    localStorage.setItem(marketplaceCartKey, JSON.stringify(cart));
    localStorage.removeItem(marketplaceCheckoutSelectionKey);
    closeOptionSheet();
    window.location.hash = purchaseMode === 'buy' ? '#checkout' : '#cart';
  });
  document.querySelector('[data-add-to-subscription]')?.addEventListener('click', (event) => {
    const productId = event.currentTarget.dataset.addToSubscription;
    const variantId = variantSelect?.value;
    const quantity = Math.max(1, Number(document.querySelector('[data-product-quantity]')?.value) || 1);
    const product = loadMarketplaceProducts().find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    if (!variant || variant.frozen || Number(variant.stock) < quantity) { toast('That quantity is not currently available for subscription.'); return; }
    const subscriptions = loadMarketplaceSubscriptionCart();
    const existing = subscriptions.find((item) => item.productId === productId && item.variantId === variantId);
    if (existing) existing.quantity = Math.min(Number(variant.stock), Number(existing.quantity || 0) + quantity);
    else subscriptions.push({ productId, variantId, quantity, interval: 'day', intervalCount: 1 });
    localStorage.setItem(marketplaceSubscriptionCartKey, JSON.stringify(subscriptions));
    window.location.hash = '#subscriptions';
  });
  const subscriptionAddress = (group, index) => {
    const card = document.querySelector(`[data-subscription-address="${group}:${index}"]`)?.closest('.market-subscription-item');
    const select = card?.querySelector(`[data-subscription-address="${group}:${index}"]`);
    if (!card || !select) return { error: 'Choose or enter a delivery address for this subscription.' };
    let address;
    if (select.value !== 'manual') {
      try { address = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]')[Number(select.value)]; } catch { address = null; }
    } else {
      const value = (name) => card.querySelector(`[data-subscription-address-fields="${group}:${index}"] [name="${name}"]`)?.value.trim() || '';
      address = { name: value('recipient'), phone: value('phone'), street: value('street'), postcode: value('postcode'), city: value('city'), state: value('state') };
      if (Object.values(address).some((value) => !value)) return { error: 'Complete all delivery address fields before continuing.' };
    }
    if (!address || !address.street) return { error: 'Choose or enter a valid delivery address.' };
    return { address, saveToProfile: select.value === 'manual' && Boolean(card.querySelector('[name="saveAddress"]')?.checked) };
  };
  const persistSubscriptionAddress = ({ address, saveToProfile }) => {
    if (saveToProfile) {
      const addresses = (() => { try { const result = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } })();
      const existing = addresses.find((entry) => ['name', 'phone', 'street', 'postcode', 'city', 'state'].every((key) => String(entry[key] || '').trim().toLowerCase() === String(address[key] || '').trim().toLowerCase()));
      if (!existing) addresses.push({ label: 'Delivery', ...address });
      localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    }
  };
  document.querySelectorAll('[data-subscription-address]').forEach((select) => select.addEventListener('change', () => {
    const groupIndex = select.dataset.subscriptionAddress;
    const fields = select.closest('.market-subscription-item')?.querySelector(`[data-subscription-address-fields="${groupIndex}"]`);
    if (!fields) return;
    const useSaved = select.value !== 'manual';
    fields.hidden = useSaved;
    fields.querySelectorAll('input:not([type="checkbox"])').forEach((input) => { input.disabled = useSaved; });
  }));
  document.querySelectorAll('[data-subscription-confirm]').forEach((button) => button.addEventListener('click', () => {
    const cart = loadMarketplaceSubscriptionCart();
    const item = cart[Number(button.dataset.subscriptionConfirm)];
    const line = item && marketplaceSubscriptionLine(item);
    if (!item || !line || line.variant.frozen || Number(line.variant.stock) < Number(item.quantity)) { toast('This product is no longer available in the selected quantity.'); return; }
    const resolvedAddress = subscriptionAddress('subscription-cart', Number(button.dataset.subscriptionConfirm));
    if (resolvedAddress.error) { toast(resolvedAddress.error); return; }
    item.deliveryAddress = resolvedAddress.address;
    const frequencyText = item.interval === 'day' ? `every ${item.intervalCount || 1} day${Number(item.intervalCount || 1) === 1 ? '' : 's'}` : `every ${item.intervalCount || 1} month${Number(item.intervalCount || 1) === 1 ? '' : 's'}`;
    if (!window.confirm(`Subscribe to ${line.product.name} (${line.variant.label || 'Standard'}) ${frequencyText}? This is a schedule preview; automatic orders and payments are not active yet.`)) return;
    persistSubscriptionAddress(resolvedAddress);
    const active = loadMarketplaceSubscriptions();
    const existing = active.find((entry) => entry.productId === item.productId && entry.variantId === item.variantId);
    if (existing) existing.quantity = Math.min(Number(line.variant.stock), Number(existing.quantity || 0) + Number(item.quantity || 1));
    else active.push({ ...item, startedAt: new Date().toISOString() });
    cart.splice(Number(button.dataset.subscriptionConfirm), 1);
    localStorage.setItem(marketplaceSubscriptionCartKey, JSON.stringify(cart));
    localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(active));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-edit]').forEach((button) => button.addEventListener('click', () => {
    const subscriptions = loadMarketplaceSubscriptions();
    const item = subscriptions[Number(button.dataset.subscriptionEdit)];
    if (!item) return;
    item.draftInterval = item.interval || 'month';
    item.draftIntervalCount = Number(item.intervalCount) || 1;
    item.draftQuantity = Number(item.quantity) || 1;
    item.editing = true;
    localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-save]').forEach((button) => button.addEventListener('click', () => {
    const subscriptions = loadMarketplaceSubscriptions();
    const item = subscriptions[Number(button.dataset.subscriptionSave)];
    const line = item && marketplaceSubscriptionLine(item);
    if (!item || !line) return;
    const quantity = Math.max(1, Math.min(Number(line.variant.stock), Number(item.draftQuantity) || 1));
    const frequency = Number(item.draftIntervalCount) || 1;
    const resolvedAddress = subscriptionAddress('active-subscription', Number(button.dataset.subscriptionSave));
    if (resolvedAddress.error) { toast(resolvedAddress.error); return; }
    const unit = item.draftInterval || 'month';
    const frequencyText = unit === 'day' ? `every ${frequency} day${frequency === 1 ? '' : 's'}` : `every ${frequency} month${frequency === 1 ? '' : 's'}`;
    if (!window.confirm(`Save this subscription as ${frequencyText}, quantity ${quantity}?`)) return;
    persistSubscriptionAddress(resolvedAddress);
    item.interval = item.draftInterval || 'month';
    item.intervalCount = frequency;
    item.quantity = quantity;
    item.deliveryAddress = resolvedAddress.address;
    delete item.draftInterval;
    delete item.draftIntervalCount;
    delete item.draftQuantity;
    delete item.editing;
    localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-cancel-edit]').forEach((button) => button.addEventListener('click', () => {
    const subscriptions = loadMarketplaceSubscriptions();
    const item = subscriptions[Number(button.dataset.subscriptionCancelEdit)];
    if (!item) return;
    delete item.draftInterval;
    delete item.draftIntervalCount;
    delete item.draftQuantity;
    delete item.editing;
    localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-remove]').forEach((button) => button.addEventListener('click', () => {
    const [group, rawIndex] = button.dataset.subscriptionRemove.split(':');
    const isActive = group === 'active-subscription';
    const subscriptions = isActive ? loadMarketplaceSubscriptions() : loadMarketplaceSubscriptionCart();
    subscriptions.splice(Number(rawIndex), 1);
    localStorage.setItem(isActive ? marketplaceSubscriptionsKey : marketplaceSubscriptionCartKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-interval]').forEach((select) => select.addEventListener('change', () => {
    const [group, rawIndex] = select.dataset.subscriptionInterval.split(':');
    const isActive = group === 'active-subscription';
    const subscriptions = isActive ? loadMarketplaceSubscriptions() : loadMarketplaceSubscriptionCart();
    const item = subscriptions[Number(rawIndex)];
    if (!item) return;
    const [unit, count] = select.value.split(':');
    if (isActive && item.editing) {
      item.draftInterval = unit;
      item.draftIntervalCount = Number(count);
      localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(subscriptions));
      return;
    }
    item.interval = unit;
    item.intervalCount = Number(count);
    localStorage.setItem(isActive ? marketplaceSubscriptionsKey : marketplaceSubscriptionCartKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
  document.querySelectorAll('[data-subscription-quantity]').forEach((input) => input.addEventListener('change', () => {
    const [group, rawIndex] = input.dataset.subscriptionQuantity.split(':');
    const isActive = group === 'active-subscription';
    const subscriptions = isActive ? loadMarketplaceSubscriptions() : loadMarketplaceSubscriptionCart();
    const item = subscriptions[Number(rawIndex)];
    const line = item && marketplaceSubscriptionLine(item);
    if (!item || !line) return;
    const quantity = Math.max(1, Math.min(Number(line.variant.stock), Number(input.value) || 1));
    if (isActive && item.editing) {
      item.draftQuantity = quantity;
      localStorage.setItem(marketplaceSubscriptionsKey, JSON.stringify(subscriptions));
      return;
    }
    item.quantity = quantity;
    localStorage.setItem(isActive ? marketplaceSubscriptionsKey : marketplaceSubscriptionCartKey, JSON.stringify(subscriptions));
    render({ preserveScroll: true });
  }));
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

  const cartSelectionControls = document.querySelectorAll('[data-cart-select], [data-cart-select-all]');
  if (cartSelectionControls.length) {
    const cart = loadMarketplaceCart();
    const allKeys = cart.filter((item) => marketplaceLine(item)).map(marketplaceCartLineKey);
    const getSelectedKeys = () => loadMarketplaceCartSelection() ?? allKeys;
    document.querySelectorAll('[data-cart-select]').forEach((checkbox) => checkbox.addEventListener('change', () => {
      const item = cart[Number(checkbox.dataset.cartSelect)];
      if (!item) return;
      const key = marketplaceCartLineKey(item);
      const selected = new Set(getSelectedKeys());
      checkbox.checked ? selected.add(key) : selected.delete(key);
      localStorage.setItem(marketplaceCartSelectionKey, JSON.stringify([...selected]));
      render({ preserveScroll: true });
    }));
    document.querySelector('[data-cart-select-all]')?.addEventListener('change', (event) => {
      localStorage.setItem(marketplaceCartSelectionKey, JSON.stringify(event.currentTarget.checked ? allKeys : []));
      render({ preserveScroll: true });
    });
    document.querySelector('[data-selected-checkout]')?.addEventListener('click', () => {
      const selectedKeys = getSelectedKeys().filter((key) => allKeys.includes(key));
      if (!selectedKeys.length) return;
      localStorage.setItem(marketplaceCheckoutSelectionKey, JSON.stringify(selectedKeys));
      window.location.hash = '#checkout';
    });
  }

  setupMarketplaceCheckout();
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
    const livePhotoStates = new WeakMap();
    const liveProductBaselines = new WeakMap();
    const liveProductSnapshot = loadMarketplaceProducts();
    const livePhotoState = (form) => {
      if (!livePhotoStates.has(form)) {
        const product = liveProductSnapshot.find((entry) => entry.id === form.dataset.liveProductExtraDetails);
        livePhotoStates.set(form, (product?.images || []).map((url) => ({ url, previewUrl: safeMarketplaceImage(url) })));
      }
      return livePhotoStates.get(form);
    };
    const renderLiveProductPhotos = (form) => {
      const list = form.querySelector('[data-admin-live-product-photo-list]');
      if (!list) return;
      const photos = livePhotoState(form);
      list.hidden = photos.length === 0;
      list.innerHTML = photos.map((photo, index) => `<article class="supplier-photo-item"><img src="${escapeHTML(photo.previewUrl || safeMarketplaceImage(photo.url) || '')}" alt="Product photo ${index + 1}" /><span>${index === 0 ? 'Cover photo' : `Photo ${index + 1}`}</span><label class="supplier-photo-change">Change<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-replace-admin-product-photo="${index}" aria-label="Change product photo ${index + 1}" /></label><button type="button" data-remove-admin-product-photo="${index}" aria-label="Delete product photo ${index + 1}">Delete</button></article>`).join('');
    };
    const validateAdminProductPhotos = async (files, totalCount) => {
      if (totalCount > 5) return 'A product can have up to five photos.';
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return `${file.name} is not a supported image.`;
        if (file.size > 2 * 1024 * 1024) return `${file.name} is larger than 2 MB.`;
        const previewUrl = URL.createObjectURL(file);
        const dimensions = await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve(null);
          image.src = previewUrl;
        });
        URL.revokeObjectURL(previewUrl);
        if (!dimensions) return `${file.name} could not be read as an image.`;
        if (dimensions.width !== dimensions.height) return `${file.name} must be square (1:1).`;
        if (dimensions.width < 500 || dimensions.width > 2000) return `${file.name} must be between 500 × 500 and 2000 × 2000 pixels.`;
      }
      return '';
    };
    const liveProductRows = document.querySelector('[data-live-product-rows]');
    liveProductRows?.querySelectorAll('[data-live-product-extra-details]').forEach((form) => {
      const product = liveProductSnapshot.find((entry) => entry.id === form.dataset.liveProductExtraDetails);
      const variant = form.dataset.variantId
        ? product?.variants?.find((entry) => String(entry.id) === form.dataset.variantId)
        : product?.variants?.[Number(form.dataset.variantIndex)];
      if (product && variant) liveProductBaselines.set(form, { product, variant, fields: new FormData(form) });
      renderLiveProductPhotos(form);
    });
    liveProductRows?.addEventListener('change', async (event) => {
      const form = event.target.closest('[data-live-product-extra-details]');
      if (!form) return;
      const photos = livePhotoState(form);
      const addInput = event.target.closest('input[name="photos"]');
      const replaceInput = event.target.closest('[data-replace-admin-product-photo]');
      const files = addInput ? [...addInput.files] : replaceInput?.files?.[0] ? [replaceInput.files[0]] : [];
      if (!files.length) return;
      const totalCount = addInput ? photos.length + files.length : photos.length;
      const validationError = await validateAdminProductPhotos(files, totalCount);
      if (addInput) addInput.value = '';
      if (replaceInput) replaceInput.value = '';
      const feedback = form.querySelector('.admin-live-product-save-feedback');
      if (validationError) { feedback.textContent = validationError; return; }
      if (addInput) photos.push(...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
      else {
        const index = Number(replaceInput.dataset.replaceAdminProductPhoto);
        if (photos[index]?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photos[index].previewUrl);
        photos[index] = { file: files[0], previewUrl: URL.createObjectURL(files[0]) };
      }
      renderLiveProductPhotos(form);
      feedback.textContent = 'Photo changes will apply when you save the product.';
    });
    liveProductRows?.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-admin-product-photo]');
      if (!removeButton) return;
      const form = removeButton.closest('[data-live-product-extra-details]');
      const photos = livePhotoState(form);
      const [removed] = photos.splice(Number(removeButton.dataset.removeAdminProductPhoto), 1);
      if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
      renderLiveProductPhotos(form);
      form.querySelector('.admin-live-product-save-feedback').textContent = 'Photo removed. Save the product to apply the change.';
    });
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
      toastAdmin(frozen ? 'Product hidden from the Marketplace. The store was notified.' : 'Product is visible in the Marketplace again. The store was notified.');
      render();
    });
    document.querySelector('[data-live-product-rows]')?.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-live-product-extra-details]');
      if (!form) return;
      event.preventDefault();
      const baseline = liveProductBaselines.get(form);
      if (!baseline) return;
      const fields = new FormData(form);
      const changed = (key) => fields.has(key) && fields.get(key) !== baseline.fields.get(key);
      const fieldValue = (key) => String(fields.get(key) || '').trim();
      const productFields = Object.fromEntries(
        ['name', 'category', 'description', 'petTypes', 'suitableBreeds', 'issues', 'extraDescription', 'ingredients', 'nutrition']
          .filter(changed).map((key) => [key, fieldValue(key)]));
      const variantFields = {};
      for (const [input, key] of [['variantLabel', 'label'], ['supplierName', 'supplierId'], ['supplierName', 'supplier'], ['sku', 'sku'], ['supplierSku', 'supplierSku']]) {
        if (changed(input)) variantFields[key] = fieldValue(input);
      }
      for (const key of ['price', 'cost', 'stock']) {
        if (changed(key)) variantFields[key] = Number(fields.get(key));
      }
      const feedback = form.querySelector('.admin-live-product-save-feedback');
      const photos = livePhotoState(form);
      const photoValidationError = await validateAdminProductPhotos(photos.filter((photo) => photo.file).map((photo) => photo.file), photos.length);
      if (photoValidationError) {
        feedback.textContent = photoValidationError;
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      feedback.textContent = 'Saving product details…';
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError || new Error('Sign in to manage product photos.');
        const images = [];
        const uploadBatch = crypto.randomUUID();
        for (const [index, photo] of photos.entries()) {
          if (!photo.file) { images.push(photo.url); continue; }
          const extension = photo.file.type === 'image/jpeg' ? 'jpg' : photo.file.type.split('/')[1];
          const path = `${authData.user.id}/admin/${uploadBatch}/${index + 1}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('marketplace-submissions').upload(path, photo.file, { contentType: photo.file.type, upsert: false });
          if (uploadError) throw uploadError;
          images.push(supabase.storage.from('marketplace-submissions').getPublicUrl(path).data.publicUrl);
        }
        if (JSON.stringify(images) !== JSON.stringify(baseline.product.images || [])) productFields.images = images;
        const { data, error: updateError } = await supabase.rpc('admin_update_marketplace_product_fields', {
          p_product_id: baseline.product.id,
          p_variant_id: baseline.variant.id ? 'id:' + baseline.variant.id : 'label:' + (baseline.variant.label || 'Standard'),
          p_expected_product: baseline.product,
          p_product_fields: productFields,
          p_variant_fields: variantFields,
        });
        if (updateError) throw updateError;
        cacheSyncedRecords(marketplaceProductsKey, data, { notify: false });
        photos.forEach((photo) => { if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl); });
        render();
        toastAdmin('All product details saved.');
      } catch (error) {
        submit.disabled = false;
        feedback.textContent = error.message || 'Product details could not be saved.';
      }
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
    returnCasesTarget.innerHTML = cases.length ? `<div class="admin-market-return-case-list">${cases.map((itemReturn) => `<article class="admin-market-return-case"><header><strong>${escapeHTML(itemReturn.productName || 'Product')} · ${escapeHTML(itemReturn.variantLabel || 'Variant')} × ${Number(itemReturn.quantity) || 1}</strong><span>${escapeHTML(itemReturn.status)}</span></header><p>Order ${escapeHTML(itemReturn.orderReference || itemReturn.orderId)} · Store ${escapeHTML(itemReturn.supplierName || '—')}</p><p>Customer: ${escapeHTML(itemReturn.customerName || '—')} · ${escapeHTML(itemReturn.customerPhone || '—')}</p><p>Reason: ${escapeHTML(itemReturn.reason || '—')}</p>${itemReturn.supplierResponse ? `<p>Store response: ${escapeHTML(itemReturn.supplierResponse)}</p>` : ''}<b>Refund: MYR ${Number(itemReturn.refundAmount || 0).toFixed(2)} (product ${Number(itemReturn.paidAmount || 0).toFixed(2)} + shipping ${Number(itemReturn.shippingRefund || 0).toFixed(2)})</b>${itemReturn.photoPath ? `<a href="#" data-marketplace-return-photo="${escapeHTML(itemReturn.photoPath)}" target="_blank" rel="noopener noreferrer">View customer photo</a>` : ''}<div class="admin-market-return-actions">${itemReturn.status === 'Admin Review' ? `<button type="button" class="button button-primary" data-admin-return-action="approve" data-return-id="${escapeHTML(itemReturn.returnId)}">Approve Return</button><button type="button" class="button button-light" data-admin-return-action="reject" data-return-id="${escapeHTML(itemReturn.returnId)}">Reject Return</button>` : `<button type="button" class="button button-light" data-admin-return-action="refunded" data-return-id="${escapeHTML(itemReturn.returnId)}" data-demo-payment="${Boolean(itemReturn.demoPayment)}">${itemReturn.demoPayment ? 'Record Demo Refund' : 'Mark Refund Sent'}</button><small>${itemReturn.demoPayment ? 'Records the simulated refund.' : 'Use only after the refund has been sent through the original payment method.'}</small>`}</div></article>`).join('')}</div>` : '<p class="admin-market-empty">No return cases need Manager or Director review.</p>';
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
    const demoPayment = button.dataset.demoPayment === 'true';
    const reason = action === 'reject' ? window.prompt('Enter the reason for rejecting this return request.') : '';
    if (action === 'reject' && !reason?.trim()) return;
    if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve this return? The store will coordinate the return shipment.' : demoPayment ? 'Record the demo refund?' : 'Confirm that the refund has already been sent through the original payment method?')) return;
    button.disabled = true;
    const result = action === 'refunded'
      ? await supabase.rpc('complete_marketplace_item_refund', { p_return_id: button.dataset.returnId, p_demo: demoPayment })
      : await supabase.rpc('review_marketplace_item_return', { p_return_id: button.dataset.returnId, p_decision: action, p_reason: reason || '' });
    if (result.error) {
      button.disabled = false;
      toastAdmin(result.error.message || 'The return request could not be updated.');
      return;
    }
    toastAdmin(action === 'approve' ? 'Return approved. The store can coordinate its return.' : action === 'reject' ? 'Return rejected with the recorded reason.' : demoPayment ? 'Demo refund recorded.' : 'Refund marked as sent.');
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
        const demoPayment = cancellationRefundButton.dataset.demoPayment === 'true';
        if (!window.confirm(demoPayment ? 'Record the demo refund?' : 'Confirm that the refund has already been sent through the original payment method?')) return;
        cancellationRefundButton.disabled = true;
        const { error } = await supabase.rpc('complete_marketplace_order_cancellation_refund', {
          p_order_id: cancellationRefundButton.dataset.marketplaceCancellationRefund, p_demo: demoPayment,
        });
        if (error) {
          cancellationRefundButton.disabled = false;
          toastAdmin(error.message || 'The cancellation refund could not be updated.');
          return;
        }
        toastAdmin(demoPayment ? 'Demo refund recorded.' : 'Cancellation refund marked as sent.');
        window.setTimeout(() => window.dispatchEvent(new Event('hashchange')), 400);
        return;
      }
      const button = event.target.closest('[data-admin-return-action]');
      if (!button) return;
      const action = button.dataset.adminReturnAction;
      const demoPayment = button.dataset.demoPayment === 'true';
      const reason = action === 'reject' ? window.prompt('Enter the reason for rejecting this return request.') : '';
      if (action === 'reject' && !reason?.trim()) return;
      if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve the return request? The store will coordinate the return shipment.' : demoPayment ? 'Record the demo refund?' : 'Confirm that the refund has already been sent through the original payment method?')) return;
      button.disabled = true;
      const result = action === 'refunded'
        ? await supabase.rpc('complete_marketplace_item_refund', { p_return_id: button.dataset.returnId, p_demo: demoPayment })
        : await supabase.rpc('review_marketplace_item_return', { p_return_id: button.dataset.returnId, p_decision: action, p_reason: reason || '' });
      if (result.error) {
        button.disabled = false;
        toastAdmin(result.error.message || 'The return request could not be updated.');
        return;
      }
      toastAdmin(action === 'approve' ? 'Return approved. The store can coordinate its return.' : action === 'reject' ? 'Return rejected with the recorded reason.' : demoPayment ? 'Demo refund recorded.' : 'Refund marked as sent.');
      window.setTimeout(() => window.dispatchEvent(new Event('hashchange')), 400);
    });
  }
  // Shipping and Furgo Voucher settings save independently so each can be managed on its own.
  const saveOfferSettings = createSharedAppDataSaver(marketplaceOfferSettingsKey);
  const saveMarketplaceSettings = async (settings, feedback, successMessage, actionKey) => {
    try {
      await saveOfferSettings(settings);
      void recordAdminAction('marketplace_offer_settings_updated', 'marketplace', actionKey);
      feedback.textContent = successMessage;
      feedback.className = 'admin-market-offer-feedback success';
      return true;
    } catch (error) {
      feedback.textContent = error.message || 'Settings could not be saved online.';
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
    void saveMarketplaceSettings(settings, shippingForm.querySelector('[data-market-shipping-feedback]'), 'Shipping settings saved and applied to customer checkout.', 'shipping');
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
  voucherList?.addEventListener('click', async (event) => {
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
      const feedback = offerForm.querySelector('[data-market-offer-feedback]');
      if (!await saveMarketplaceSettings(settings, feedback, 'Furgo voucher deleted.', 'furgo-voucher')) return;
      void recordAdminAction('marketplace_furgo_voucher_deleted', 'marketplace', voucher.id || voucher.code);
      if (offerForm?.elements.voucherId.value === String(voucher.id || '')) resetFurgoVoucherForm(true);
      renderAdminFurgoVouchers();
    }
  });
  offerForm?.addEventListener('submit', async (event) => {
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
    if (!await saveMarketplaceSettings(settings, feedback, editingId ? 'Furgo voucher updated.' : 'Furgo voucher created.', 'furgo-voucher')) return;
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
    if (!supplierProducts.length) { toastAdmin('No order products were found for this store.'); return; }
    const recipientName = order.address?.name || order.customerName || 'Not provided';
    const recipientPhone = order.deliveryPhone || order.address?.phone || order.customerPhone || 'Not provided';
    const recipientAddress = [order.address?.street, order.address?.postcode, order.address?.city, order.address?.state].filter(Boolean).join(', ') || 'Not provided';
    const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-MY') : order.date || 'Not provided';
    const text = [
      'FURGO ORDER DETAILS',
      `Store : ${supplierName}`,
      `Order No: ${order.reference || order.id || 'Not provided'}`,
      `Date: ${orderDate}`,
      '',
      `Recipient Name: ${recipientName}`,
      `Recipient Phone: ${recipientPhone}`,
      `Recipient Address: ${recipientAddress}`,
      'Products:',
      ...supplierProducts.map((item) => `- ${item.name} — ${item.variantLabel} × ${item.quantity}`),
    ].join('\n');
    try { await navigator.clipboard.writeText(text); toastAdmin('Store order details copied.'); }
    catch { const field = document.createElement('textarea'); field.value = text; document.body.append(field); field.select(); document.execCommand('copy'); field.remove(); toastAdmin('Store order details copied.'); }
  }));
  document.querySelectorAll('[data-tracking-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === form.dataset.trackingForm);
    if (!order) return;
    if (order.paymentStatus !== 'Paid') { toastAdmin('Verify the payment before shipping this order.'); return; }
    try {
      await updateMarketplaceOrder(order.id, form.closest('[data-order-version]')?.dataset.orderVersion, 'ship', {
        courier: form.elements.courier.value.trim(),
        trackingNumber: form.elements.trackingNumber.value.trim(),
        trackingUrl: form.elements.trackingUrl.value.trim(),
      });
    } catch (error) { toastAdmin(`Shipment could not be saved online: ${error.message || 'Please try again.'}`); return; }
    void recordAdminAction('order_status_updated', 'marketplace_order', order.reference || order.id, { status: 'Shipped' });
    render();
  }));
  document.querySelectorAll('[data-complete-order]').forEach((button) => button.addEventListener('click', async () => {
    const orders = loadMarketplaceOrders();
    const order = orders.find((item) => item.id === button.dataset.completeOrder);
    if (!order) return;
    button.disabled = true;
    try { await updateMarketplaceOrder(order.id, button.closest('[data-order-version]')?.dataset.orderVersion, 'deliver'); }
    catch (error) { button.disabled = false; toastAdmin(`Delivery could not be saved online: ${error.message || 'Please try again.'}`); return; }
    void recordAdminAction('order_status_updated', 'marketplace_order', order.reference || order.id, { status: 'Delivered' });
    render();
  }));
  document.querySelectorAll('[data-approve-payment], [data-reject-payment]').forEach((button) => button.addEventListener('click', async () => {
    const orders = loadMarketplaceOrders();
    const orderId = button.dataset.approvePayment || button.dataset.rejectPayment;
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const reject = button.hasAttribute('data-reject-payment');
    const reason = reject ? window.prompt('Enter a reason for rejecting this transfer:')?.trim() : '';
    if (reject && !reason) return;
    button.disabled = true;
    try {
      await updateMarketplaceOrder(order.id, button.closest('[data-order-version]')?.dataset.orderVersion,
        reject ? 'reject_payment' : 'approve_payment', reject ? { reason } : {});
    } catch (error) { button.disabled = false; toastAdmin(`Payment decision could not be saved online: ${error.message || 'Please try again.'}`); return; }
    try { await refreshMarketplaceCatalogFromDatabase(); } catch (refreshError) { console.warn('Marketplace stock cache refresh deferred:', refreshError); }
    void recordAdminAction(reject ? 'marketplace_payment_rejected' : 'marketplace_payment_approved', 'marketplace_order', order.reference || order.id, { status: reject ? 'Payment Rejected' : 'Paid' });
    render();
  }));
  document.querySelectorAll('[data-order-receipt]').forEach((input) => input.addEventListener('change', async () => {
    const version = input.closest('[data-order-version]')?.dataset.orderVersion;
    const file = input.files?.[0];
    if (!file || file.size > 1.5 * 1024 * 1024) { toastAdmin('Choose a receipt no larger than 1.5 MB.'); return; }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toastAdmin('Upload a receipt image or PDF.'); return; }
    const order = loadMarketplaceOrders().find((item) => item.id === input.dataset.orderReceipt);
    if (!order) return;
    const receiptFile = file.type.startsWith('image/') || file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
    input.disabled = true;
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The receipt file could not be read.'));
        reader.readAsDataURL(receiptFile);
      });
      await updateMarketplaceOrder(order.id, version, 'save_receipt', { name: file.name, data });
      void recordAdminAction('receipt_uploaded', 'marketplace_order', order.reference || order.id);
      render();
    } catch (error) {
      toastAdmin(`Receipt could not be saved online: ${error.message || 'Please try again.'}`);
    } finally {
      input.value = '';
      input.disabled = false;
    }
  }));
  document.querySelector('[data-export-market-csv]')?.addEventListener('click', () => {
    const supplier = document.querySelector('[data-market-export-supplier]').value;
    const products = loadMarketplaceProducts();
    const rows = [['Order Reference', 'Date', 'Status', 'Customer', 'Phone', 'Address', 'Store', 'Item', 'Variant', 'Quantity', 'Retail Unit Price', 'Cost Unit Price']];
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

// Store users can submit products and see only order lines assigned to their supplier.
let recoverWarehouseStockOnReconnect;

function setupMarketplaceSupplierPortal() {
  setupPortalNotifications();
  const storeRoot = document.querySelector('.supplier-portal-page');
  const sessionCurrent = captureCloudSession();
  const storeCurrent = () => sessionCurrent() && Boolean(storeRoot?.isConnected);
  const supplierProfile = (() => {
    let profile = {};
    let context = null;
    try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
    try { context = JSON.parse(sessionStorage.getItem('furgo-director-store-context') || 'null'); } catch { context = null; }
    if (profile.role === 'director' && context?.storeName) return { ...profile, role: 'supplier', supplierName: context.storeName, supplierOwnerIds: context.ownerIds || [], directorStoreView: true };
    return profile;
  })();
  const directorStoreReturnLink = document.querySelector('[data-leave-director-store]');
  directorStoreReturnLink?.addEventListener('click', () => sessionStorage.removeItem('furgo-director-store-context'));
  const warehouseOwnerIds = () => supplierProfile.directorStoreView
    ? ((supplierProfile.supplierOwnerIds || []).filter(Boolean).length ? (supplierProfile.supplierOwnerIds || []).filter(Boolean) : [supplierProfile.id].filter(Boolean))
    : [supplierProfile.id].filter(Boolean);
  const warehouseInsertOwnerId = () => warehouseOwnerIds()[0] || supplierProfile.id;
  const warehouseProductCodePrefix = (category) => ({
    food: 'FD',
    snacks: 'SN',
    supplements: 'ST',
    toys: 'TY',
    grooming: 'GR',
    other: 'OT',
  })[String(category || '').trim().toLowerCase()] || 'OT';
  const generateWarehouseProductCode = (category) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const suffix = Array.from(bytes, (byte) => alphabet[byte & 31]).join('');
    return `${warehouseProductCodePrefix(category)}-${suffix}`;
  };
  const buildWarehouseMarketplaceListing = (warehouseProductId, product = {}) => {
    const images = Array.isArray(product.images) ? product.images : [];
    const variants = Array.isArray(product.variants) ? product.variants : [];
    return {
      ...product,
      id: product.id || `supplier-${crypto.randomUUID()}`,
      warehouseProductId,
      name: String(product.name || '').trim(),
      images,
      hidden: false,
      variants: variants.map((variant, index) => ({
        ...variant,
        id: variant.id || `warehouse-option-${crypto.randomUUID()}-${index + 1}`,
        label: String(variant.label || [variant.option, variant.variant].filter(Boolean).join(' · ') || 'Standard'),
        price: Number(variant.price) || 0,
        stock: Number.isInteger(Number(variant.stock)) && Number(variant.stock) >= 0 ? Number(variant.stock) : 0,
        imageUrl: variant.imageUrl || images[0] || '',
        supplierId: supplierProfile.supplierName || '',
        supplier: supplierProfile.supplierName || '',
        warehouseProductId,
        warehouseVariantId: variant.id || '',
      })),
    };
  };
  const submitWarehouseMarketplaceListing = async (warehouseProductId, product) => {
    const listing = buildWarehouseMarketplaceListing(warehouseProductId, product);
    const { data, error } = await supabase.rpc('submit_marketplace_supplier_product', {
      p_action: 'add', p_product_id: null, p_product_data: listing,
    });
    if (error) throw error;
    return data;
  };
  let refreshWarehouseInventory = null;
  const trackingRefresh = createTrackingRefreshGuard();
  let renderPackagingOrders = () => {};
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
      if (error) { console.warn('Store profile details could not load:', error); return; }
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
        if (metadataError) console.warn('Store profile name saved, but Auth metadata could not be refreshed:', metadataError);
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
        console.error('Store profile could not be saved:', error);
        setProfileFeedback(error.message || 'Your profile could not be saved. Please try again.', true);
      } finally { saveButton.disabled = false; }
    });
  }
  const supplierEditor = document.querySelector('[data-supplier-editor]');
  const supplierForm = document.querySelector('[data-marketplace-supplier-product]');
  const supplierPhotoList = document.querySelector('[data-supplier-photo-list]');
  const supplierVariantRows = supplierForm?.querySelector('[data-supplier-variant-rows]');
  const warehouseProductCodeInput = supplierForm?.elements.warehouseProductCode;
  supplierForm?.elements.category?.addEventListener('change', () => {
    if (warehouseProductCodeInput?.dataset.autoGeneratedCode === 'true') {
      warehouseProductCodeInput.value = generateWarehouseProductCode(supplierForm.elements.category.value);
    }
  });
  let supplierEditorImages = [];
  const composeSupplierVariantLabel = (option, variant) => [String(option || '').trim(), String(variant || '').trim()].filter(Boolean).join(' · ') || 'Standard';
  const readSupplierVariantRows = () => [...(supplierVariantRows?.querySelectorAll('[data-supplier-variant-row]') || [])].map((row) => ({
    id: row.querySelector('[name="variantRowId"]')?.value || '',
    option: row.querySelector('[name="variantOption"]')?.value || '',
    variant: row.querySelector('[name="variantLabel"]')?.value || '',
    label: row.querySelector('[name="variantLabel"]')?.value || '',
    price: row.querySelector('[name="price"]')?.value ?? '',
    stock: row.querySelector('[name="stock"]')?.value ?? '',
    imageIndex: row.querySelector('[name="variantImageIndex"]')?.value || '0',
  }));
  const renderSupplierVariantRows = (variants = [{}]) => {
    if (!supplierVariantRows) return;
    const rows = variants.length ? variants : [{}];
    const warehouseCreate = supplierForm?.elements.warehouseProductCreate?.value === 'true';
    const warehouseEdit = Boolean(supplierForm?.elements.warehouseProductId?.value);
    const photoOptions = supplierEditorImages.length
      ? supplierEditorImages.map((photo, index) => `<option value="${index}">${index === 0 ? 'Product cover photo' : `Product photo ${index + 1}`}</option>`).join('')
      : '<option value="0">Product cover photo (add below)</option>';
    supplierVariantRows.innerHTML = rows.map((variant) => {
      const imageIndex = variant.imageIndex != null ? String(variant.imageIndex) : String(Math.max(0, supplierEditorImages.findIndex((photo) => photo.url && photo.url === variant.imageUrl)));
      const stockValue = variant.stock == null ? 0 : Number(variant.stock);
      const optionValue = variant.option || '';
      const variantValue = variant.variant || variant.label || '';
      const stockField = warehouseCreate
        ? ''
        : warehouseEdit
          ? `<label class="supplier-variant-stock-readonly">Stock on hand<output>${stockValue.toLocaleString()} units</output><input type="hidden" name="stock" value="${stockValue}" /></label>`
          : `<label>Stock<input name="stock" type="number" min="0" step="1" required value="${variant.stock == null ? '' : stockValue}" /></label>`;
      const rowMode = warehouseCreate ? ' is-warehouse-create' : warehouseEdit ? ' is-warehouse-edit' : '';
      return `<div class="supplier-variant-row${rowMode}" data-supplier-variant-row><input type="hidden" name="variantRowId" value="${escapeHTML(variant.id || '')}" /><label>Option<input name="variantOption" maxlength="100" placeholder="e.g. Chicken Flavour (optional)" value="${escapeHTML(optionValue)}" /></label><label>Variant<input name="variantLabel" required maxlength="100" placeholder="e.g. 100 g" value="${escapeHTML(variantValue)}" /></label><label>Price (MYR)<input name="price" type="number" min="0" step="0.01" required value="${variant.price == null ? '' : Number(variant.price)}" /></label>${stockField}<label class="supplier-variant-image-field">Option photo<select name="variantImageIndex" aria-label="Photo for ${escapeHTML(composeSupplierVariantLabel(optionValue, variantValue))}">${photoOptions}</select></label><button type="button" class="supplier-variant-remove" data-remove-variant aria-label="Remove ${escapeHTML(composeSupplierVariantLabel(optionValue, variantValue))}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" /></svg></button></div>`;
    }).join('');
    [...supplierVariantRows.querySelectorAll('[data-supplier-variant-row]')].forEach((row, index) => {
      const select = row.querySelector('[name="variantImageIndex"]');
      if (select) select.value = String(Math.min(Number(rows[index]?.imageIndex ?? select.value ?? 0), Math.max(0, supplierEditorImages.length - 1)));
    });
    const removeButtons = [...supplierVariantRows.querySelectorAll('[data-remove-variant]')];
    removeButtons.forEach((button) => { button.disabled = removeButtons.length === 1; });
  };
  renderSupplierVariantRows([{}]);
  const clearSupplierPhotoPreviews = () => supplierEditorImages.forEach((photo) => {
    if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
  });
  const renderSupplierPhotoList = () => {
    if (!supplierPhotoList) return;
    supplierPhotoList.hidden = supplierEditorImages.length === 0;
    supplierPhotoList.innerHTML = supplierEditorImages.map((photo, index) => {
      const preview = photo.previewUrl?.startsWith('blob:') ? photo.previewUrl : safeMarketplaceImage(photo.url);
      return `<article class="supplier-photo-item" draggable="true" data-supplier-photo-index="${index}" aria-label="Product photo ${index + 1}; drag to reorder"><span class="supplier-photo-drag-handle" aria-hidden="true">⠿</span><img src="${escapeHTML(preview || '')}" alt="Product photo ${index + 1}" draggable="false" /><span>${index === 0 ? 'Product cover photo' : `Product photo ${index + 1}`}</span><label class="supplier-photo-change">Change<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-replace-supplier-photo="${index}" aria-label="Change product photo ${index + 1}" /></label><button type="button" data-remove-supplier-photo="${index}" aria-label="Delete product photo ${index + 1}">Delete</button></article>`;
    }).join('');
  };
  let supplierProductBaseline = null;
  const resetSupplierEditor = () => {
    supplierProductBaseline = null;
    if (supplierForm) delete supplierForm.dataset.createRequestId;
    supplierForm?.reset();
    clearSupplierPhotoPreviews();
    supplierEditorImages = [];
    renderSupplierPhotoList();
    if (supplierForm) {
      supplierForm.elements.productId.value = '';
      supplierForm.elements.variantId.value = '';
      supplierForm.elements.pendingSubmissionId.value = '';
      if (supplierForm.elements.warehouseProductId) supplierForm.elements.warehouseProductId.value = '';
      if (supplierForm.elements.warehouseProductCreate) supplierForm.elements.warehouseProductCreate.value = '';
      if (supplierForm.elements.warehouseProductCode) supplierForm.elements.warehouseProductCode.value = '';
      if (supplierForm.elements.warehouseProductCode) delete supplierForm.elements.warehouseProductCode.dataset.autoGeneratedCode;
      const warehouseCodeField = supplierForm.querySelector('[data-warehouse-product-code-field]');
      if (warehouseCodeField) warehouseCodeField.hidden = true;
      const formKicker = supplierEditor?.querySelector('[data-supplier-form-kicker]');
      if (formKicker) formKicker.textContent = 'Product listing';
      renderSupplierVariantRows([{}]);
      supplierForm.querySelector('[data-supplier-submit-label]').textContent = 'Submit Product';
      supplierForm.querySelector('[data-supplier-cancel-edit]').textContent = 'Cancel';
    }
    const title = supplierEditor?.querySelector('[data-supplier-form-title]');
    if (title) title.textContent = 'Add a Product';
    const variantHeading = supplierForm?.querySelector('#supplier-variants-heading');
    const variantHelp = supplierForm?.querySelector('.supplier-variant-editor-heading p');
    if (variantHeading) variantHeading.textContent = 'Options & Variants';
    if (variantHelp) variantHelp.textContent = 'Enter an option title and variant when needed. Leave the option title blank to use the variant as the customer-facing option.';
    const formNote = supplierForm?.querySelector('.supplier-form-note');
    if (formNote) formNote.textContent = 'Choose a suggested pet type or type your own. Separate multiple pet types with commas. Add up to 5 product photos; the first photo is the product cover photo. Each photo must be square (1:1), between 500 × 500 and 2000 × 2000 pixels, and no larger than 2 MB.';
    const dangerZone = supplierForm?.querySelector('[data-product-details-danger-zone]');
    if (dangerZone) { dangerZone.hidden = true; dangerZone.open = false; }
  };
  const navigateToSupplierProductEditor = (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
    const queryString = query.toString();
    window.location.hash = `#supplier-product-edit${queryString ? `?${queryString}` : ''}`;
  };
  const openSupplierProductEditor = (productId, variantId = '') => {
    const product = supplierCatalog.find((entry) => entry.id === productId);
    const variant = product?.variants?.find((entry) => entry.id === variantId) || product?.variants?.[0];
    if (!product || !variant) return false;
    supplierProductBaseline = structuredClone(product);
    const fields = supplierForm.elements;
    if (warehouseSupplierFields) warehouseSupplierFields.hidden = true;
    fields.productId.value = product.id;
    fields.variantId.value = variant.id || '';
    fields.pendingSubmissionId.value = '';
    fields.name.value = product.name || '';
    fields.category.value = product.category || 'Other';
    fields.description.value = product.description || '';
    fields.petTypes.value = product.petTypes || '';
    fields.ingredients.value = product.ingredients || '';
    fields.nutrition.value = product.nutrition || '';
    if (supplierForm.querySelector('[data-product-details-danger-zone]')) supplierForm.querySelector('[data-product-details-danger-zone]').hidden = true;
    clearSupplierPhotoPreviews();
    supplierEditorImages = (product.images || []).map((url) => ({ url }));
    renderSupplierVariantRows(product.variants || [variant]);
    renderSupplierPhotoList();
    document.querySelector('[data-supplier-form-title]').textContent = `Edit ${product.name}`;
    supplierForm.querySelector('[data-supplier-submit-label]').textContent = 'Save Product';
    return true;
  };
  const openWarehouseProductEditor = (row, { stockTotal = 0, stockByVariant = {} } = {}) => {
    if (!row || !supplierForm) return false;
    const fields = supplierForm.elements;
    const data = row.product_data && typeof row.product_data === 'object' ? row.product_data : {};
    supplierProductBaseline = structuredClone({ ...data, name: row.name });
    fields.productId.value = '';
    fields.variantId.value = '';
    fields.pendingSubmissionId.value = '';
    fields.warehouseProductCreate.value = '';
    fields.warehouseProductId.value = row.id;
    fields.name.value = row.name || '';
    fields.category.value = data.category || 'Other';
    fields.description.value = data.description || '';
    fields.petTypes.value = data.petTypes || '';
    fields.ingredients.value = data.ingredients || '';
    fields.nutrition.value = data.nutrition || '';
    fields.warehouseProductCode.value = data.productCode || generateWarehouseProductCode(fields.category.value);
    fields.warehouseProductCode.dataset.autoGeneratedCode = data.productCode ? 'false' : 'true';
    const codeField = supplierForm.querySelector('[data-warehouse-product-code-field]');
    if (codeField) codeField.hidden = false;
    const formKicker = supplierEditor?.querySelector('[data-supplier-form-kicker]');
    if (formKicker) formKicker.textContent = 'Warehouse Operations';
    const variantHeading = supplierForm.querySelector('#supplier-variants-heading');
    if (variantHeading) variantHeading.textContent = 'Options / Variants';
    const variantHelp = supplierForm.querySelector('.supplier-variant-editor-heading p');
    if (variantHelp) variantHelp.textContent = 'Add each size, flavour, or other option with its price and photo. Stock quantities are added separately from the product list.';
    const formNote = supplierForm.querySelector('.supplier-form-note');
    if (formNote) formNote.textContent = 'Add up to 5 product photos; the first photo is the product cover photo. Each photo must be square (1:1), between 500 × 500 and 2000 × 2000 pixels, and no larger than 2 MB.';
    clearSupplierPhotoPreviews();
    supplierEditorImages = (Array.isArray(data.images) ? data.images : data.imageUrl ? [data.imageUrl] : []).map((url) => ({ url }));
    const variants = Array.isArray(data.variants) && data.variants.length ? data.variants : [{ label: 'Standard', price: 0, sku: data.productCode || '' }];
    renderSupplierVariantRows(variants.map((variant) => ({
      ...variant,
      stock: Number(stockByVariant[String(variant.label || 'Standard')]) || 0,
      imageIndex: Math.max(0, supplierEditorImages.findIndex((photo) => photo.url && photo.url === variant.imageUrl)),
    })));
    renderSupplierPhotoList();
    const formTitle = supplierEditor?.querySelector('[data-supplier-form-title]');
    if (formTitle) formTitle.textContent = `Edit ${row.name}`;
    const submitLabel = supplierForm.querySelector('[data-supplier-submit-label]');
    if (submitLabel) submitLabel.textContent = 'Save Product Details';
    const dangerZone = supplierForm.querySelector('[data-product-details-danger-zone]');
    const deleteButton = supplierForm.querySelector('[data-product-details-delete]');
    const restriction = supplierForm.querySelector('[data-product-details-delete-restriction]');
    if (dangerZone) { dangerZone.hidden = false; dangerZone.open = false; }
    if (deleteButton && restriction) {
      const hasStock = Number(stockTotal) > 0;
      deleteButton.disabled = hasStock;
      restriction.textContent = hasStock
        ? `This product has ${Number(stockTotal).toLocaleString()} units in stock. Reduce every stock batch to zero before deleting it.`
        : row.marketplace_product_id
          ? 'This product is listed in Marketplace. Deleting it will also remove its listing. Deletion is available only when stock is zero.'
          : 'Deletion is available only when stock is zero.';
    }
    return true;
  };
  const openWarehouseProductCreateEditor = () => {
    if (!supplierForm) return;
    resetSupplierEditor();
    supplierForm.elements.warehouseProductCreate.value = 'true';
    const codeField = supplierForm.querySelector('[data-warehouse-product-code-field]');
    if (codeField) codeField.hidden = false;
    supplierForm.elements.warehouseProductCode.value = generateWarehouseProductCode(supplierForm.elements.category.value);
    supplierForm.elements.warehouseProductCode.dataset.autoGeneratedCode = 'true';
    const formKicker = supplierEditor?.querySelector('[data-supplier-form-kicker]');
    if (formKicker) formKicker.textContent = 'Warehouse Operations';
    const variantHeading = supplierForm.querySelector('#supplier-variants-heading');
    if (variantHeading) variantHeading.textContent = 'Options / Variants';
    const variantHelp = supplierForm.querySelector('.supplier-variant-editor-heading p');
    if (variantHelp) variantHelp.textContent = 'Add each size, flavour, or other option with its price and photo. Stock quantities are added separately from the product list.';
    const formNote = supplierForm.querySelector('.supplier-form-note');
    if (formNote) formNote.textContent = 'Add up to 5 product photos; the first photo is the product cover photo. Each photo must be square (1:1), between 500 × 500 and 2000 × 2000 pixels, and no larger than 2 MB.';
    const formTitle = supplierEditor?.querySelector('[data-supplier-form-title]');
    if (formTitle) formTitle.textContent = 'Add Warehouse Product';
    const submitLabel = supplierForm.querySelector('[data-supplier-submit-label]');
    if (submitLabel) submitLabel.textContent = 'Save Warehouse Product';
    const dangerZone = supplierForm.querySelector('[data-product-details-danger-zone]');
    if (dangerZone) { dangerZone.hidden = true; dangerZone.open = false; }
    renderSupplierVariantRows([{}]);
  };
  supplierForm?.querySelector('[data-product-details-delete]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const productId = supplierForm.elements.warehouseProductId?.value;
    if (!productId || button.disabled) return;
    button.disabled = true;
    try {
      const { data: product, error: productError } = await supabase.from('warehouse_products').select('id,name,marketplace_product_id').eq('id', productId).maybeSingle();
      if (productError) throw productError;
      const { data: lots, error: lotError } = await supabase.from('warehouse_inventory_lots').select('quantity').eq('warehouse_product_id', productId);
      if (lotError) throw lotError;
      if (!product) throw new Error('This warehouse product could not be found. Refresh the Inventory page and try again.');
      const stockTotal = (lots || []).reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
      if (stockTotal > 0) {
        setSupplierFeedback(`This product has ${stockTotal.toLocaleString()} units in stock. Reduce every stock batch to zero before deleting it.`, true);
        return;
      }
      if (!window.confirm(`Delete “${product.name}” from Warehouse Stock and remove its Marketplace listing? This cannot be undone.`)) return;
      const { error } = await supabase.rpc('delete_store_warehouse_product', { p_warehouse_product_id: productId });
      if (error) throw error;
      window.location.hash = '#supplier?tab=inventory';
    } catch (error) {
      setSupplierFeedback(error.message || 'The warehouse product could not be deleted.', true);
    } finally { button.disabled = false; }
  });
  document.querySelector('[data-supplier-add-variant]')?.addEventListener('click', () => {
    const current = readSupplierVariantRows();
    if (current.length >= 30) { setSupplierFeedback('A product can have up to 30 options.', true); return; }
    current.push({});
    renderSupplierVariantRows(current);
  });
  supplierVariantRows?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-variant]');
    if (!removeButton || removeButton.disabled) return;
    removeButton.closest('[data-supplier-variant-row]')?.remove();
    const removeButtons = [...supplierVariantRows.querySelectorAll('[data-remove-variant]')];
    removeButtons.forEach((button) => { button.disabled = removeButtons.length === 1; });
  });
  document.querySelectorAll('[data-supplier-tab]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.supplierTab;
    const supplierNavIcons = { home: ['Icon-01.png', 'Icon-02.png'], packaging: ['Icon-23.png', 'Icon-24.png'], inventory: ['Icon-25.png', 'Icon-26.png'], profile: ['Icon-07.png', 'Icon-08.png'] };
    document.querySelectorAll('[data-supplier-section]').forEach((section) => { section.hidden = section.dataset.supplierSection !== target; });
    document.querySelectorAll('[data-supplier-tab]').forEach((tab) => {
      const active = tab.dataset.supplierTab === target;
      tab.classList.toggle('active', active);
      const icons = supplierNavIcons[tab.dataset.supplierTab];
      const image = tab.querySelector('img');
      if (image && icons) image.src = `Image/Icon/${active ? icons[1] : icons[0]}`;
    });
    window.history.replaceState(null, '', `#supplier?tab=${encodeURIComponent(target)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (target === 'inventory') void refreshWarehouseInventory?.().catch((error) => console.error('Warehouse inventory load failed:', error));
  }));
  const inventorySection = document.querySelector('[data-supplier-section="inventory"]');
  if (inventorySection) {
    const receivePanel = inventorySection.querySelector('.supplier-inventory-receive');
    const receiveDialog = document.createElement('dialog');
    receiveDialog.className = 'supplier-inventory-receive-dialog';
    if (receivePanel) {
      receivePanel.parentNode.insertBefore(receiveDialog, receivePanel);
      receiveDialog.append(receivePanel);
    }
    const inventoryList = inventorySection.querySelector('[data-warehouse-inventory-list]');
    let inventoryRouteFocusHandled = false;
    const inventoryForm = inventorySection.querySelector('[data-warehouse-inventory-form]');
    const editDialog = inventorySection.querySelector('[data-inventory-edit-dialog]');
    const editForm = inventorySection.querySelector('[data-inventory-edit-form]');
    const productDialog = inventorySection.querySelector('[data-warehouse-product-dialog]');
    const productForm = inventorySection.querySelector('[data-warehouse-product-form]');
    productForm?.elements.category?.addEventListener('change', () => {
      if (!productForm.elements.id.value) productForm.elements.productCode.value = generateWarehouseProductCode(productForm.elements.category.value);
    });
    const inventoryFeedback = inventorySection.querySelector('[data-inventory-feedback]');
    const stockDialog = document.createElement('dialog');
    stockDialog.className = 'supplier-inventory-edit-dialog supplier-stock-details-dialog';
    stockDialog.innerHTML = '<div class="supplier-stock-details-content" data-stock-details-content></div><div class="supplier-inventory-form-actions"><button type="button" class="button button-light" data-stock-details-close>Close</button></div>';
    inventorySection.append(stockDialog);
    const lowStockDialog = document.createElement('dialog');
    lowStockDialog.className = 'supplier-inventory-edit-dialog supplier-low-stock-dialog';
    lowStockDialog.innerHTML = '<form class="supplier-low-stock-form" data-low-stock-form><h2>Low Stock Alert</h2><p data-low-stock-option></p><label class="supplier-low-stock-toggle"><input type="checkbox" name="enabled" checked /><span>Enable low stock alert for this option</span></label><label>Alert when stock reaches or falls below<input name="threshold" type="number" min="0" step="1" value="5" required /></label><p class="supplier-portal-feedback" data-low-stock-feedback role="status" aria-live="polite"></p><div class="supplier-inventory-form-actions"><button type="button" class="button button-light" data-low-stock-cancel>Cancel</button><button type="submit" class="button button-primary">Save Low Stock Setting</button></div></form>';
    inventorySection.append(lowStockDialog);
    const stockAdjustmentDialog = document.createElement('dialog');
    stockAdjustmentDialog.className = 'supplier-inventory-edit-dialog supplier-stock-adjust-dialog';
    stockAdjustmentDialog.innerHTML = '<form class="supplier-stock-adjust-form" data-stock-adjust-form><input type="hidden" name="lotId" /><h2>Adjust Batch Stock</h2><p data-stock-adjust-summary></p><label>Quantity to deduct<span class="supplier-stock-adjust-quantity"><input name="quantity" type="number" min="1" step="1" required /><button type="button" data-stock-adjust-all>All</button></span></label><label>Deduction reason<select name="reason" required><option value="">Choose a reason</option><option>Return to supplier</option><option>Clear expired stock</option><option>Damaged / lost stock</option><option>Stock correction</option><option>Other</option></select></label><label class="supplier-stock-adjust-notes">Details<textarea name="notes" maxlength="500" placeholder="Add context for this stock change" rows="3"></textarea></label><p class="supplier-portal-feedback" data-stock-adjust-feedback role="status" aria-live="polite"></p><div class="supplier-inventory-form-actions"><button type="button" class="button button-light" data-stock-adjust-cancel>Cancel</button><button type="submit" class="button button-primary">Save Adjustment</button></div></form>';
    inventorySection.append(stockAdjustmentDialog);
    const stockAdjustmentForm = stockAdjustmentDialog.querySelector('[data-stock-adjust-form]');
    const stockHistoryDialog = document.createElement('dialog');
    stockHistoryDialog.className = 'supplier-inventory-edit-dialog supplier-stock-history-dialog';
    stockHistoryDialog.innerHTML = '<div class="supplier-stock-history-content" data-stock-history-content></div><div class="supplier-inventory-form-actions"><button type="button" class="button button-primary" data-stock-history-close>Back to Stock Details</button></div>';
    inventorySection.append(stockHistoryDialog);
    const stockHistoryExportDialog = document.createElement('dialog');
    stockHistoryExportDialog.className = 'supplier-inventory-edit-dialog supplier-stock-history-export-dialog';
    stockHistoryExportDialog.innerHTML = '<form data-stock-history-export-form><h2>Choose Batches for PDF</h2><p class="supplier-stock-details-total">Filter by stock received date, then choose which batches to include.</p><label class="supplier-stock-export-date-filter">Received date range<select data-stock-export-date-filter><option value="all">All received dates</option><option value="month">Past month</option><option value="year">Past 12 months</option><option value="custom">Custom date range</option></select></label><div class="supplier-stock-export-custom-range" data-stock-export-custom-range hidden><label>From<input type="date" data-stock-export-from /></label><label>To<input type="date" data-stock-export-to /></label></div><p class="supplier-stock-export-selection-count" data-stock-export-selection-count></p><label class="supplier-stock-export-select-all"><input type="checkbox" data-stock-export-select-all checked /><span>Select all batches</span></label><div class="supplier-stock-export-batches" data-stock-export-batches></div><p class="supplier-portal-feedback" data-stock-export-feedback role="status" aria-live="polite"></p><div class="supplier-inventory-form-actions"><button type="button" class="button button-light" data-stock-export-back>Back to History</button><button type="button" class="button button-primary" data-stock-export-download>Download Stock Statement</button></div></form>';
    inventorySection.append(stockHistoryExportDialog);
    let stockHistoryExportData = null;
    const supplierDetailsDialog = document.createElement('dialog');
    supplierDetailsDialog.className = 'supplier-inventory-edit-dialog supplier-inventory-supplier-dialog';
    supplierDetailsDialog.innerHTML = '<form class="supplier-stock-details-content supplier-details-form" data-supplier-details-form><h2>Seller Details</h2><p class="supplier-stock-details-total" data-supplier-details-product></p><div class="supplier-inventory-form"><label>Business name<input name="sellerName" readonly /></label><label>Contact name<input name="sellerContact" readonly /></label><label>Contact email<input name="sellerEmail" type="email" readonly /></label><label>Contact phone<input name="sellerPhone" readonly /></label><label class="supplier-inventory-notes">Business address<input name="sellerAddress" readonly /></label></div><div class="supplier-inventory-form-actions"><button type="button" class="button button-light" data-supplier-details-close>Close</button></div></form>';
    inventorySection.append(supplierDetailsDialog);
    stockDialog.addEventListener('cancel', () => { stockDetailContext = null; });
    let lotEditBaseline = null;
    let warehouseProductBaseline = null;
    let lowStockBaseline = null;
    let inventoryRows = [];
    let warehouseProducts = [];
    let inventoryLoaded = false;
    let productsLoaded = false;
    let stockDetailContext = null;
    const productData = (row) => row?.product_data && typeof row.product_data === 'object' ? row.product_data : {};
    const productVariants = (row) => {
      const variants = Array.isArray(productData(row).variants) ? productData(row).variants : [];
      return variants.length ? variants : [{ id: 'standard', label: 'Standard', price: 0, sku: productData(row).productCode || '' }];
    };
    const supplierInfoFor = (product, variant = {}) => {
      const data = productData(product);
      const seller = data.sellerDetails && typeof data.sellerDetails === 'object' ? data.sellerDetails : {};
      const supplierValue = data.supplierDetails || data.supplierName || data.supplier || variant.supplierDetails || variant.supplier || variant.supplierId || variant.supplierName || '';
      const supplierObject = supplierValue && typeof supplierValue === 'object' ? supplierValue : {};
      const name = String(seller.businessName || supplierObject.name || supplierObject.companyName || variant.supplierName || data.supplierName || (typeof supplierValue === 'string' ? supplierValue : '') || 'Not provided').trim();
      const contact = String(seller.contactName || variant.supplierContact || variant.supplierPhone || supplierObject.contact || supplierObject.phone || data.supplierContact || data.supplierPhone || '').trim();
      const email = String(seller.contactEmail || variant.supplierEmail || supplierObject.email || data.supplierEmail || '').trim();
      const rawAddress = seller.businessAddress || variant.supplierAddress || supplierObject.address || data.supplierAddress || data.address || '';
      const address = typeof rawAddress === 'string'
        ? rawAddress.trim()
        : [rawAddress?.line1 || rawAddress?.street, rawAddress?.line2, rawAddress?.postcode, rawAddress?.city, rawAddress?.state, rawAddress?.country].filter(Boolean).join(', ');
      return { name, contact, email, address };
    };
    const showSupplierDetails = (product) => {
      const form = supplierDetailsDialog.querySelector('[data-supplier-details-form]');
      const data = productData(product);
      const seller = data.sellerDetails && typeof data.sellerDetails === 'object' ? data.sellerDetails : {};
      const info = supplierInfoFor(product);
      form.elements.sellerName.value = seller.businessName || info.name || '';
      form.elements.sellerContact.value = seller.contactName || info.contact || '';
      form.elements.sellerEmail.value = seller.contactEmail || info.email || '';
      form.elements.sellerPhone.value = seller.contactPhone || '';
      form.elements.sellerAddress.value = seller.businessAddress || info.address || '';
      form.querySelector('[data-supplier-details-product]').textContent = product?.name || 'Warehouse product';
      supplierDetailsDialog.showModal();
    };
    const setInventoryFeedback = (message, isError = false) => {
      inventoryFeedback.textContent = message;
      inventoryFeedback.classList.toggle('is-error', isError);
    };
    const setProductFeedback = (message, isError = false) => {
      const node = productForm?.querySelector('[data-warehouse-product-feedback]');
      if (!node) return;
      node.textContent = message;
      node.classList.toggle('is-error', isError);
    };
    const inventoryDateLabel = (date) => {
      if (!date) return 'No expiry date';
      const parsed = new Date(`${date}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
    };
    const batchNumberFromDate = (date) => {
      const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return '';
      const [, year, month, day] = match;
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return `${day}${monthNames[Number(month) - 1] || ''}${year.slice(-2)}`;
    };
    const syncBatchNumber = (form) => {
      if (form?.elements.batch_number) form.elements.batch_number.value = batchNumberFromDate(form.elements.received_on?.value);
    };
    [inventoryForm, editForm].forEach((form) => {
      form?.elements.received_on?.addEventListener('input', () => syncBatchNumber(form));
      form?.elements.received_on?.addEventListener('change', () => syncBatchNumber(form));
    });
    const inventoryExpiryState = (row) => {
      if (!row.expires_on) return '';
      const today = localPetDate();
      if (row.expires_on < today) return 'expired';
      const soonDate = new Date(`${today}T00:00:00`);
      soonDate.setDate(soonDate.getDate() + 30);
      const soonDateKey = `${soonDate.getFullYear()}-${String(soonDate.getMonth() + 1).padStart(2, '0')}-${String(soonDate.getDate()).padStart(2, '0')}`;
      return row.expires_on <= soonDateKey ? 'soon' : '';
    };
    const warehouseProductForRow = (row) => warehouseProducts.find((product) => product.id === row?.warehouse_product_id)
      || warehouseProducts.find((product) => product.name.trim().toLocaleLowerCase() === String(row?.product_name || '').trim().toLocaleLowerCase());
    const optionMarkup = (selected = '') => `<option value="">Choose a warehouse product</option>${warehouseProducts.map((row) => `<option value="${escapeHTML(row.id)}"${row.id === selected ? ' selected' : ''}>${escapeHTML(row.name)}</option>`).join('')}`;
    const fillVariantSelect = (select, productId, selected = '') => {
      if (!select) return;
      const product = warehouseProducts.find((entry) => entry.id === productId);
      const variants = product ? productVariants(product) : [];
      select.innerHTML = `<option value="">${variants.length ? 'Choose an option' : 'Choose a warehouse product first'}</option>${variants.map((variant) => `<option value="${escapeHTML(variant.id || variant.label)}"${String(variant.id || variant.label) === String(selected) ? ' selected' : ''}>${escapeHTML(variant.label || 'Standard')}</option>`).join('')}`;
      select.disabled = !variants.length;
    };
    let warehouseProductsRead = 0;
    const refreshWarehouseProducts = async (force = false) => {
      if (productsLoaded && !force) return warehouseProducts;
      const read = ++warehouseProductsRead;
      const owners = warehouseOwnerIds();
      let productQuery = supabase.from('warehouse_products').select('id,name,product_data,marketplace_product_id').order('name');
      if (supplierProfile.directorStoreView) productQuery = owners.length ? productQuery.in('created_by', owners) : null;
      const { data, error } = productQuery ? await productQuery : { data: [], error: null };
      if (error) throw error;
      if (!storeCurrent() || read !== warehouseProductsRead) return warehouseProducts;
      warehouseProducts = data || [];
      productsLoaded = true;
      const categoryFilter = inventorySection.querySelector('[data-inventory-category-filter]');
      if (categoryFilter) {
        const selectedCategory = categoryFilter.value || 'all';
        const categories = [...new Set(warehouseProducts.map((row) => String(productData(row).category || 'Other').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        categoryFilter.innerHTML = `<option value="all">All categories</option>${categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('')}`;
        categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : 'all';
      }
      const supplierFilter = inventorySection.querySelector('[data-inventory-supplier-filter]');
      if (supplierFilter) {
        const selectedSupplier = supplierFilter.value || 'all';
        const suppliers = [...new Set(warehouseProducts.flatMap((product) => productVariants(product).map((variant) => supplierInfoFor(product, variant).name)).map((name) => String(name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        supplierFilter.innerHTML = `<option value="all">All suppliers</option>${suppliers.map((supplier) => `<option value="${escapeHTML(supplier)}">${escapeHTML(supplier)}</option>`).join('')}`;
        supplierFilter.value = suppliers.includes(selectedSupplier) ? selectedSupplier : 'all';
      }
      for (const select of inventorySection.querySelectorAll('[data-inventory-product-select], select[data-inventory-edit-product]')) {
        const selected = select.value;
        select.innerHTML = optionMarkup(selected);
      }
      return warehouseProducts;
    };
    const setProductForSelect = (productSelect, variantSelect, productId, variantId = '') => {
      if (productSelect) productSelect.value = productId || '';
      const product = warehouseProducts.find((entry) => entry.id === productId);
      const match = product ? productVariants(product).find((entry) => String(entry.id || '') === String(variantId) || String(entry.label || '') === String(variantId)) : null;
      fillVariantSelect(variantSelect, productId, match?.id || match?.label || '');
    };
    const renderWarehouseVariantEditor = (variants = [{}]) => {
      const target = productForm?.querySelector('[data-warehouse-product-variants]');
      if (!target) return;
      const rows = variants.length ? variants : [{}];
      target.innerHTML = rows.map((variant) => `<div class="supplier-variant-row" data-warehouse-product-variant><input type="hidden" name="warehouseVariantId" value="${escapeHTML(variant.id || '')}" /><label>Option<input name="variantOption" maxlength="100" placeholder="e.g. Chicken Flavour (optional)" value="${escapeHTML(variant.option || '')}" /></label><label>Variant<input name="variantLabel" required maxlength="100" placeholder="e.g. 100 g" value="${escapeHTML(variant.variant || variant.label || '')}" /></label><label>Retail price (MYR)<input name="price" type="number" min="0" step="0.01" required value="${variant.price == null ? '' : Number(variant.price)}" /></label><label>Option SKU<input name="variantSku" maxlength="80" value="${escapeHTML(variant.sku || '')}" /></label><label>Option photo URL<input name="variantImageUrl" type="url" placeholder="Optional image URL" value="${escapeHTML(variant.imageUrl || '')}" /></label><button type="button" class="supplier-variant-remove" data-remove-warehouse-variant aria-label="Remove option" ${rows.length === 1 ? 'disabled' : ''}>×</button></div>`).join('');
    };
    const openWarehouseProductForm = (row = null) => {
      warehouseProductBaseline = row ? structuredClone(row) : null;
      delete productForm.dataset.createRequestId;
      productForm.reset();
      productForm.elements.id.value = row?.id || '';
      const data = productData(row);
      for (const key of ['name', 'category', 'petTypes', 'productCode', 'description', 'ingredients', 'nutrition']) {
        if (productForm.elements[key]) productForm.elements[key].value = key === 'name' ? (row?.name || '') : (data[key] || '');
      }
      productForm.elements.productCode.readOnly = true;
      if (!data.productCode) productForm.elements.productCode.value = generateWarehouseProductCode(productForm.elements.category.value);
      productForm.elements.imageUrl.value = data.images?.[0] || data.imageUrl || '';
      productForm.elements.coverPhoto.value = '';
      renderWarehouseVariantEditor(row ? productVariants(row) : [{}]);
      productForm.querySelector('[data-warehouse-product-title]').textContent = row ? `Edit ${row.name}` : 'Add Warehouse Product';
      productForm.querySelector('[type="submit"]').textContent = row ? 'Save Product' : 'Save Warehouse Product';
      const dangerZone = productForm.querySelector('[data-warehouse-danger-zone]');
      const deleteButton = productForm.querySelector('[data-warehouse-delete-product]');
      const deleteRestriction = productForm.querySelector('[data-product-delete-restriction]');
      if (dangerZone) {
        dangerZone.hidden = !row;
        dangerZone.open = false;
      }
      if (row && deleteButton && deleteRestriction) {
        const stockTotal = inventoryRows
          .filter((lot) => warehouseProductForRow(lot)?.id === row.id)
          .reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
        const hasStock = stockTotal > 0;
        deleteButton.disabled = hasStock;
        deleteRestriction.textContent = hasStock
          ? `This product has ${stockTotal.toLocaleString()} units in stock. Reduce every stock batch to zero before deleting it.`
          : row.marketplace_product_id
            ? 'This product is listed in Marketplace. Deleting it will also remove its listing. Deletion is available only when stock is zero.'
            : 'Deletion is available only when stock is zero.';
      }
      setProductFeedback('');
      productDialog.showModal();
    };
    const stockLotsFor = (productId, productName, variantLabel) => inventoryRows.filter((lot) => {
      const matchedProduct = warehouseProductForRow(lot);
      const matchesProduct = productId ? matchedProduct?.id === productId : String(lot.product_name || '') === productName;
      return matchesProduct && String(lot.variant || 'Standard') === String(variantLabel || 'Standard');
    }).sort((a, b) => (Number(a.pick_order) || Number.MAX_SAFE_INTEGER) - (Number(b.pick_order) || Number.MAX_SAFE_INTEGER)
      || String(a.expires_on || '9999-12-31').localeCompare(String(b.expires_on || '9999-12-31'))
      || String(a.received_on || '').localeCompare(String(b.received_on || ''))
      || String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id).localeCompare(String(b.id)));
    renderPackagingOrders = () => {
      if (trackingRefresh.active()) return;
      if (!packagingTarget) return;
      const paidOrders = supplierOrders.filter((order) => String(order.paymentStatus || '').toLowerCase() === 'paid');
      const readyOrders = paidOrders.filter((order) => matchesSupplierOrderStatus(order, 'received'))
        .sort((a, b) => (new Date(a.createdAt || a.date || 0).getTime() || 0) - (new Date(b.createdAt || b.date || 0).getTime() || 0));
      const ordersByStatus = {
        ready: readyOrders,
        packed: paidOrders.filter((order) => matchesSupplierOrderStatus(order, 'packed')),
        awaiting_pickup: paidOrders.filter((order) => matchesSupplierOrderStatus(order, 'awaiting_pickup')),
        completed: paidOrders.filter((order) => matchesSupplierOrderStatus(order, 'shipped')),
      };
      const ordersToPack = ordersByStatus[packagingStatusFilter] || readyOrders;
      const visiblePickupOrderIds = new Set(ordersByStatus.awaiting_pickup.map((order) => String(order.id)));
      for (const orderId of packagingPickupSelection) if (!visiblePickupOrderIds.has(orderId)) packagingPickupSelection.delete(orderId);
      const visibleOrderIds = new Set(readyOrders.map((order) => String(order.id)));
      for (const orderId of packagingSelection.keys()) if (!visibleOrderIds.has(orderId)) packagingSelection.delete(orderId);
      for (const orderId of packagingPendingSelection.keys()) if (!visibleOrderIds.has(orderId)) packagingPendingSelection.delete(orderId);
      if (!ordersToPack.length) {
        const emptyMessages = { ready: 'No paid orders are waiting to be packed.', packed: 'No orders are ready to ship yet.', awaiting_pickup: 'No parcels are awaiting courier pickup.', completed: 'No shipped orders yet.' };
        if (packagingPickupToolbarTarget) packagingPickupToolbarTarget.innerHTML = '';
        packagingTarget.innerHTML = `<p class="supplier-empty">${emptyMessages[packagingStatusFilter] || emptyMessages.ready}</p>`;
        return;
      }
      const pickupToolbar = packagingStatusFilter === 'awaiting_pickup'
        ? `<div class="supplier-pickup-toolbar"><button class="button button-primary supplier-mark-selected-shipped" type="button" data-supplier-mark-selected-shipped ${packagingPickupSelection.size ? '' : 'disabled'}>Picked Up / Dropped Off${packagingPickupSelection.size > 1 ? ` (${packagingPickupSelection.size})` : ''}</button><div class="supplier-delivery-confirmation" data-supplier-shipped-confirmation hidden><span data-pickup-confirmation-label>Confirm the selected parcel was collected or accepted by the courier?</span><div><button class="button button-primary" type="button" data-supplier-confirm-shipped>Confirm Handover</button><button class="button button-light" type="button" data-supplier-cancel-shipped>Cancel</button></div></div></div>`
        : '';
      if (packagingPickupToolbarTarget) packagingPickupToolbarTarget.innerHTML = pickupToolbar;
      packagingTarget.innerHTML = ordersToPack.map((order) => {
        const orderId = String(order.id);
        if (packagingStatusFilter !== 'ready') {
          const completed = packagingStatusFilter === 'completed';
          const awaitingPickup = packagingStatusFilter === 'awaiting_pickup';
          const supplierShipmentKey = String(supplierProfile?.supplierName || '').trim().toLowerCase();
          const shipment = {
            ...(order.supplierShipments?.[supplierShipmentKey] || {}),
            ...(order.supplier_shipments?.[supplierShipmentKey] || {}),
            ...(order.supplierShipment || {}),
          };
          const items = (order.products || []).map((item) => {
            const image = safeMarketplaceImage(item.images?.[0] || item.imageUrl || item.optionImage || item.variantImage || '');
            const details = `<span class="supplier-packaging-thumb">${image ? `<img src="${escapeHTML(image)}" alt="" />` : '<span aria-hidden="true">—</span>'}</span><span><strong>${escapeHTML(item.name || 'Product')}</strong><small>${escapeHTML(item.variantLabel || 'Variant')} × ${Number(item.quantity) || 1}</small></span>`;
            return `<li>${details}</li>`;
          }).join('');
          const date = order.createdAt ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(order.createdAt)) : '';
          const editParcel = awaitingPickup
            ? `<button type="button" class="supplier-packaging-edit-parcel" data-return-to-ship="${escapeHTML(order.id)}">Return To Ship</button>`
            : !completed ? `<button type="button" class="supplier-packaging-edit-parcel" data-edit-packed-parcel="${escapeHTML(order.id)}">Return To Pack</button>` : '';
          const recipientDetails = !completed && !awaitingPickup ? `<section class="supplier-packaging-recipient"><h3>Recipient Details</h3><div><strong>Name</strong><span>${escapeHTML(order.recipientName || 'Not provided')}</span><button type="button" data-copy-recipient-field="${escapeHTML(order.recipientName || 'Not provided')}" aria-label="Copy recipient name" title="Copy name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 20.5v-11A1.5 1.5 0 0 1 5.5 8Z" /></svg></button></div><div><strong>Phone</strong><span>${escapeHTML(order.recipientPhone || 'Not provided')}</span><button type="button" data-copy-recipient-field="${escapeHTML(order.recipientPhone || 'Not provided')}" aria-label="Copy recipient phone" title="Copy phone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 20.5v-11A1.5 1.5 0 0 1 5.5 8Z" /></svg></button></div><div><strong>Address</strong><span>${escapeHTML(order.recipientAddress || 'Not provided')}</span><button type="button" data-copy-recipient-field="${escapeHTML(order.recipientAddress || 'Not provided')}" aria-label="Copy recipient address" title="Copy address"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 20.5v-11A1.5 1.5 0 0 1 5.5 8Z" /></svg></button></div><span data-packaging-copy-feedback role="status" aria-live="polite"></span></section>` : '';
          const courierName = shipment.courier || order.courier || '';
          const trackingNumber = shipment.trackingNumber || order.trackingNumber || '';
          const trackingUrl = (() => { try { const url = new URL(String(shipment.trackingUrl || order.trackingUrl || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } })();
          const isDelivered = String(shipment.status || '').toLowerCase() === 'delivered';
          const recipientSummary = `<div class="supplier-pickup-recipient-details"><strong>Recipient</strong><span>${escapeHTML(order.recipientName || 'Name not provided')} · ${escapeHTML(order.recipientPhone || 'Phone not provided')}</span><span>${escapeHTML(order.recipientAddress || 'Address not provided')}</span></div>`;
          const shipmentPanel = completed
            ? `<section class="supplier-packaging-shipment supplier-pickup-tracking"><div class="supplier-shipment-summary"><span>Courier: ${escapeHTML(courierName || 'Not provided')}</span><span class="supplier-pickup-tracking-number">Tracking Number: ${escapeHTML(trackingNumber || 'Not provided')}${trackingUrl ? ` · <a href="${escapeHTML(trackingUrl)}" target="_blank" rel="noopener noreferrer">Tracking link</a>` : ''}</span></div>${recipientSummary}<div class="supplier-completed-shipment-actions"><strong>${isDelivered ? 'Delivered' : 'Shipped'}</strong><button class="button button-light supplier-return-pickup-button" type="button" data-supplier-return-pickup>Return Parcel</button><div class="supplier-delivery-confirmation" data-supplier-return-pickup-confirmation hidden><span>Return this parcel to Awaiting Pickup? It will be available to verify and hand over again.</span><div><button class="button button-primary" type="button" data-supplier-confirm-return-pickup="${escapeHTML(order.id)}">Confirm Return</button><button class="button button-light" type="button" data-supplier-cancel-return-pickup>Cancel</button></div></div>${isDelivered
              ? `<button class="button button-light supplier-delivered-button" type="button" data-supplier-undo-delivered>Undo Delivered</button><div class="supplier-delivery-confirmation" data-supplier-undo-delivery-confirmation hidden><span>Change this shipment back to Shipped?</span><div><button class="button button-primary" type="button" data-supplier-confirm-undo-delivered="${escapeHTML(order.id)}">Confirm Revert</button><button class="button button-light" type="button" data-supplier-cancel-undo-delivery>Cancel</button></div></div>`
              : `<button class="button button-primary supplier-delivered-button" type="button" data-supplier-mark-delivered="${escapeHTML(order.id)}">Mark Delivered</button><div class="supplier-delivery-confirmation" data-supplier-delivery-confirmation hidden><span>Confirm this shipment has been delivered?</span><div><button class="button button-primary" type="button" data-supplier-confirm-delivered="${escapeHTML(order.id)}">Confirm Delivery</button><button class="button button-light" type="button" data-supplier-cancel-delivery>Cancel</button></div></div>`}</div></section>`
            : awaitingPickup
              ? `<section class="supplier-packaging-shipment supplier-pickup-tracking"><div class="supplier-shipment-summary"><span>Courier: ${escapeHTML(courierName || 'Not provided')}</span><span class="supplier-pickup-tracking-number">Tracking Number: ${escapeHTML(trackingNumber || 'Not provided')}${trackingUrl ? ` · <a href="${escapeHTML(trackingUrl)}" target="_blank" rel="noopener noreferrer">Tracking link</a>` : ''}</span><button class="button button-light supplier-edit-tracking-button" type="button" data-supplier-edit-tracking>Edit Tracking Details</button></div>${recipientSummary}${supplierTrackingForm(order, shipment, 'edit_tracking')}</section>`
              : String(shipment.status || '').toLowerCase() === 'ready to ship'
                ? `<section class="supplier-packaging-shipment"><h3>Shipment Details</h3><div class="supplier-shipment-summary"><strong>Ready to Ship</strong><span>${escapeHTML(shipment.courier || 'Courier')} · ${escapeHTML(shipment.trackingNumber || 'Tracking number not provided')}</span>${trackingUrl ? `<a href="${escapeHTML(trackingUrl)}" target="_blank" rel="noopener noreferrer">Track shipment</a>` : ''}</div></section>`
                : `<section class="supplier-packaging-shipment"><h3>Shipment Details</h3>${supplierTrackingForm(order, shipment)}</section>`;
          const packedActions = `<div class="supplier-packaging-packed-actions">${shipmentPanel}</div>`;
          const statusHeader = `<div class="supplier-packaging-status-actions">${editParcel}<b>${completed ? (isDelivered ? 'Delivered' : 'Shipped') : awaitingPickup ? 'Awaiting Pickup' : 'Ready to Ship'}</b></div>`;
          if (awaitingPickup) {
            const selected = packagingPickupSelection.has(orderId);
            return `<article class="supplier-packaging-order supplier-packaging-status-card supplier-pickup-order"><header><label class="supplier-pickup-order-select"><input type="checkbox" data-pickup-order="${escapeHTML(orderId)}" ${selected ? 'checked' : ''} aria-label="Select order ${escapeHTML(order.reference || order.id)} for courier pickup"><span></span></label><div><span>Order No: ${escapeHTML(order.reference || order.id)}</span><time>${escapeHTML(date)}</time></div><b>Awaiting Pickup</b></header>${packedActions}<details class="supplier-pickup-order-details"><summary>View Products</summary><ul>${items || '<li>Order items unavailable</li>'}</ul></details></article>`;
          }
          if (completed) {
            return `<article class="supplier-packaging-order supplier-packaging-status-card supplier-pickup-order supplier-completed-order"><header><div><span>Order No: ${escapeHTML(order.reference || order.id)}</span><time>${escapeHTML(date)}</time></div><b>${isDelivered ? 'Delivered' : 'Shipped'}</b></header>${packedActions}<details class="supplier-pickup-order-details"><summary>View Products</summary><ul>${items || '<li>Order items unavailable</li>'}</ul></details></article>`;
          }
          return `<article class="supplier-packaging-order supplier-packaging-status-card"><header><div><span>Order No: ${escapeHTML(order.reference || order.id)}</span><time>${escapeHTML(date)}</time></div>${statusHeader}</header><ul>${items || '<li>Order items unavailable</li>'}</ul>${recipientDetails}${packedActions}</article>`;
        }
        const packedCounts = packagingSelection.get(orderId) || new Map();
        const pendingItems = packagingPendingSelection.get(orderId) || new Set();
        if (!packagingSelection.has(orderId) && order.supplierShipment?.editingParcel) {
          (order.products || []).forEach((item, index) => {
            packedCounts.set(index, Math.max(1, Number(item.quantity) || 1));
          });
        }
        packagingSelection.set(orderId, packedCounts);
        packagingPendingSelection.set(orderId, pendingItems);
        const rows = (order.products || []).map((item, index) => {
          const allocations = Array.isArray(item.warehouseStockAllocations) ? item.warehouseStockAllocations : [];
          const product = warehouseProducts.find((entry) => String(entry.marketplace_product_id || '') === String(item.productId || ''))
            || warehouseProducts.find((entry) => String(entry.id) === String(item.warehouseProductId || allocations[0]?.warehouse_product_id || ''));
          const requested = Math.max(1, Number(item.quantity) || 1);
          const itemVariant = String(item.variantLabel || item.variant || 'Standard');
          const productData = product?.product_data || {};
          const variants = Array.isArray(productData.variants) ? productData.variants : [];
          const matchingVariant = variants.find((variant) => item.variantId && String(variant.id || '') === String(item.variantId))
            || variants.find((variant) => String(variant.label || [variant.option, variant.variant].filter(Boolean).join(' · ') || 'Standard') === itemVariant);
          let remaining = requested;
          let hasMissingLocation = false;
          for (const allocation of allocations) {
            if (remaining <= 0) break;
            const picked = Math.min(remaining, Number(allocation.quantity) || 0);
            if (picked > 0) {
              hasMissingLocation ||= !String(allocation.location || '').trim();
              const batch = allocation.batch_number ? ` · Batch ${escapeHTML(allocation.batch_number)}` : '';
            }
            remaining -= picked;
          }
          // Packing consumes the order snapshot only; marketplace checkout has
          // already deducted stock. Missing live warehouse allocation data is
          // a location warning for staff, not a reason to prevent packing.
          const allocationUnavailable = !product || !allocations.length || remaining > 0 || hasMissingLocation;
          const rackMarkupFor = (quantity, offset = 0) => {
            if (allocationUnavailable) return '<span class="supplier-packaging-racks is-warning">Saved rack or batch allocation is unavailable. Verify the product location before packing.</span>';
            let position = 0;
            const rangeEnd = Math.min(requested, offset + quantity);
            const locations = [];
            for (const allocation of allocations) {
              const allocationQuantity = Math.max(0, Number(allocation.quantity) || 0);
              const overlapStart = Math.max(position, offset);
              const overlapEnd = Math.min(position + allocationQuantity, rangeEnd);
              if (overlapEnd > overlapStart) {
                const batch = allocation.batch_number ? ` · Batch ${escapeHTML(allocation.batch_number)}` : '';
                locations.push(`${escapeHTML(allocation.location || 'Location not set')}${batch}`);
              }
              position += allocationQuantity;
              if (position >= rangeEnd) break;
            }
            return `<span class="supplier-packaging-racks">${locations.join(' → ')}</span>`;
          };
          const image = safeMarketplaceImage(matchingVariant?.imageUrl || item.imageUrl || item.optionImage || item.variantImage || productData.imageUrl || productData.images?.[0] || item.images?.[0] || '');
          const cardFor = (quantity, offset = 0) => `<span class="supplier-packaging-thumb">${image ? `<img src="${escapeHTML(image)}" alt="" />` : '<span aria-hidden="true">—</span>'}</span><span class="supplier-packaging-item-copy"><strong>${escapeHTML(item.name || product?.name || 'Product')}</strong><span>${escapeHTML(itemVariant)}</span>${rackMarkupFor(quantity, offset)}</span><span class="supplier-packaging-quantity"><strong>${quantity}</strong><small>Unit:</small></span>`;
          return { index, allocationUnavailable, requested, cardFor };
        });
        const pickItems = rows.filter((row) => row.requested - (packedCounts.get(row.index) || 0) > 0)
          .map((row) => {
            const isSelected = pendingItems.has(row.index);
            const remaining = row.requested - (packedCounts.get(row.index) || 0);
            const addAction = isSelected ? `<button type="button" class="supplier-packaging-add-to-parcel" data-package-add="${row.index}" data-package-requested="${row.requested}">Add to Parcel</button>` : '';
            return `<div class="supplier-packaging-pick-entry${isSelected ? ' is-selected' : ''}"><div class="supplier-packaging-pick-card"><button type="button" class="supplier-packaging-item supplier-packaging-pick-item" data-package-select="${row.index}" aria-pressed="${isSelected}">${row.cardFor(remaining, packedCounts.get(row.index) || 0)}</button></div>${addAction}</div>`;
          }).join('');
        const packedItems = rows.filter((row) => (packedCounts.get(row.index) || 0) > 0)
          .map((row) => `<div class="supplier-packaging-packed-entry"><div class="supplier-packaging-item is-packed-item">${row.cardFor(packedCounts.get(row.index))}</div><button type="button" class="supplier-packaging-remove" data-package-remove="${row.index}" aria-label="Remove one packed unit">Remove</button></div>`).join('');
        const overpackedRows = rows.filter((row) => (packedCounts.get(row.index) || 0) > row.requested);
        const allPacked = (order.products || []).length > 0 && !overpackedRows.length
          && rows.every((row) => (packedCounts.get(row.index) || 0) === row.requested);
        const overpackWarning = overpackedRows.length
          ? `<p class="supplier-packaging-overpack-warning">Packed quantity is above the order requirement. Remove ${overpackedRows.length === 1 ? 'a unit' : 'units'} until it matches the requested quantity.</p>`
          : '';
        const pickTotalItems = rows.reduce((sum, row) => sum + Math.max(0, row.requested - (packedCounts.get(row.index) || 0)), 0);
        const parcelTotalItems = Array.from(packedCounts.values()).reduce((sum, quantity) => sum + quantity, 0);
        return `<article class="supplier-packaging-order" data-packaging-order="${escapeHTML(order.id)}"><header><div><span>Order No: ${escapeHTML(order.reference || order.id)}</span><time>${escapeHTML(order.createdAt ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(order.createdAt)) : '')}</time></div><b>Ready to pack</b></header><div class="supplier-packaging-workspace"><section class="supplier-packaging-pick-list"><div class="supplier-packaging-section-heading"><h3>Pick from Warehouse</h3><span class="supplier-packaging-total-items">Total Items <b>${pickTotalItems}</b></span></div><div class="supplier-packaging-items">${pickItems}${!pickItems.length ? '<p class="supplier-empty">All items are in the parcel.</p>' : ''}</div></section><section class="supplier-packaging-parcel"><div class="supplier-packaging-section-heading"><h3>Parcel Box</h3><span class="supplier-packaging-total-items">Total Items <b>${parcelTotalItems}</b></span></div><div class="supplier-packaging-parcel-interior">${packedItems || '<p class="supplier-packaging-parcel-empty">Tap items on the left to place them here.</p>'}</div></section></div>${overpackWarning}<button class="button button-primary supplier-mark-packed" type="button" data-mark-packed="${escapeHTML(order.id)}" ${allPacked ? '' : 'disabled'}>Done Packed</button><p class="supplier-packaging-card-feedback" role="status" aria-live="polite"></p></article>`;
      }).join('');
    };
    const renderStockDetails = (productId, productName, variantLabel, variantId = '') => {
      const product = warehouseProducts.find((entry) => entry.id === productId) || warehouseProducts.find((entry) => entry.name === productName);
      const selectedVariant = productVariants(product).find((entry) => variantId
        ? String(entry.id || entry.label || 'Standard') === String(variantId)
        : String(entry.label || 'Standard') === String(variantLabel || 'Standard'));
      const lots = stockLotsFor(productId, productName, variantLabel);
      const activeLots = lots.filter((lot) => (Number(lot.quantity) || 0) > 0);
      const total = lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
      const lowStockThreshold = Math.max(0, Number(selectedVariant?.lowStockThreshold ?? selectedVariant?.low_stock_threshold ?? 5) || 0);
      const lowStockEnabled = selectedVariant?.lowStockAlertEnabled ?? selectedVariant?.low_stock_alert_enabled ?? true;
      const lowStockNotice = lowStockEnabled && total <= lowStockThreshold
        ? `<p class="supplier-stock-low-stock-notice" role="status">Low stock · ${total.toLocaleString()} units remaining (alert at ${lowStockThreshold.toLocaleString()})</p>`
        : '';
      stockDetailContext = { productId, productName, variantLabel, variantId: selectedVariant?.id || selectedVariant?.label || variantId || 'Standard' };
      const activeBatchCards = activeLots.map((lot) => `<article class="supplier-stock-batch" data-stock-batch data-stock-batch-id="${escapeHTML(lot.id)}"><button type="button" class="supplier-stock-batch-drag-handle" data-stock-batch-drag aria-label="Rearrange ${escapeHTML(lot.batch_number || 'stock batch')}" title="Drag to rearrange"><span aria-hidden="true">⋮</span></button><div class="supplier-stock-batch-main"><div class="supplier-stock-batch-heading"><strong>${escapeHTML(lot.batch_number || 'No batch number')}</strong><span>${Number(lot.quantity) || 0} units</span></div><p>Received: ${lot.received_on ? inventoryDateLabel(lot.received_on) : '—'} · Expiry: ${lot.expires_on ? inventoryDateLabel(lot.expires_on) : 'No expiry date'}</p><p>Location: ${escapeHTML(lot.location || '—')}${lot.notes ? ` · ${escapeHTML(lot.notes)}` : ''}</p><div class="supplier-stock-batch-actions"><button type="button" class="supplier-stock-edit-button" data-stock-batch-edit="${escapeHTML(lot.id)}">Edit Batch Details</button><button type="button" data-stock-batch-adjust="${escapeHTML(lot.id)}">Adjust Stock</button></div></div></article>`).join('');
      stockDialog.querySelector('[data-stock-details-content]').innerHTML = `<div class="supplier-stock-details-heading"><h2>${escapeHTML(productName)} · ${escapeHTML(variantLabel || 'Standard')} Stock</h2><div class="supplier-stock-details-heading-actions"><button type="button" class="supplier-stock-low-stock-button" data-stock-low-stock-open ${product?.id ? '' : 'disabled'}>Low Stock</button><button type="button" class="supplier-stock-history-button" data-stock-history-open>History</button></div></div><p class="supplier-stock-details-total">${total.toLocaleString()} units on hand across ${activeLots.length} active batch${activeLots.length === 1 ? '' : 'es'}.</p>${lowStockNotice}<p class="supplier-stock-details-hint">Batches are picked from top to bottom. New stock is arranged by closest expiry; drag the handle to set a manual order.</p><section class="supplier-stock-batch-section"><h3>Active Batches <span>${activeLots.length}</span></h3>${activeLots.length ? `<div class="supplier-stock-batches">${activeBatchCards}</div>` : '<p class="supplier-stock-empty">No active stock batches for this option.</p>'}</section><div class="supplier-stock-details-actions"><button type="button" class="button supplier-inventory-receive-action supplier-stock-receive-button" data-stock-details-receive="${escapeHTML(product?.id || productId || '')}" data-stock-details-variant="${escapeHTML(variantLabel || 'Standard')}">Add Stock</button></div>`;
    };
    const openLowStockSettings = () => {
      if (!stockDetailContext?.productId) return;
      const product = warehouseProducts.find((entry) => String(entry.id) === String(stockDetailContext.productId));
      if (!product) return;
      const variant = productVariants(product).find((entry) =>
        String(entry.id || entry.label || 'Standard') === String(stockDetailContext.variantId || ''));
      if (!variant) return;
      lowStockBaseline = structuredClone(variant);
      const form = lowStockDialog.querySelector('[data-low-stock-form]');
      form.elements.enabled.checked = variant.lowStockAlertEnabled ?? variant.low_stock_alert_enabled ?? true;
      form.elements.threshold.value = String(Math.max(0, Number(variant.lowStockThreshold ?? variant.low_stock_threshold ?? 5) || 0));
      lowStockDialog.querySelector('[data-low-stock-option]').textContent = `${product.name} · ${stockDetailContext.variantLabel || 'Standard'}`;
      lowStockDialog.querySelector('[data-low-stock-feedback]').textContent = '';
      stockDialog.close();
      lowStockDialog.showModal();
    };
    const lowStockForm = lowStockDialog.querySelector('[data-low-stock-form]');
    lowStockDialog.querySelector('[data-low-stock-cancel]')?.addEventListener('click', () => {
      lowStockDialog.close();
      if (stockDetailContext) {
        renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel, stockDetailContext.variantId);
        stockDialog.showModal();
      }
    });
    lowStockForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!stockDetailContext?.productId || !lowStockForm.reportValidity()) return;
      const context = { ...stockDetailContext };
      const product = warehouseProducts.find((entry) => String(entry.id) === String(context.productId));
      if (!product) return;
      if (!lowStockBaseline) return;
      const formFields = lowStockForm.elements;
      const variant = {
        ...lowStockBaseline,
        lowStockThreshold: Math.max(0, Math.floor(Number(formFields.threshold.value) || 0)),
        lowStockAlertEnabled: Boolean(formFields.enabled.checked),
      };
      const submit = lowStockForm.querySelector('[type="submit"]');
      const feedback = lowStockDialog.querySelector('[data-low-stock-feedback]');
      submit.disabled = true;
      feedback.textContent = 'Saving low stock setting…';
      feedback.classList.remove('is-error');
      try {
        const { data: saved, error } = await supabase.rpc('update_warehouse_product', {
          p_product_id: product.id, p_expected: { variants: [lowStockBaseline] },
          p_desired: { variants: [variant] },
        });
        if (error) throw error;
        warehouseProducts = warehouseProducts.map((entry) => entry.id === saved.id ? saved : entry);
        lowStockDialog.close();
        renderInventory();
        renderStockDetails(context.productId, context.productName, context.variantLabel, context.variantId);
        stockDialog.showModal();
      } catch (error) {
        feedback.textContent = error.message || 'The low stock setting could not be saved.';
        feedback.classList.add('is-error');
      } finally {
        submit.disabled = false;
      }
    });
    const setStockHistoryContent = (html) => { stockHistoryDialog.querySelector('[data-stock-history-content]').innerHTML = html; };
    const makeStockHistoryPdf = (report) => {
      const pages = [];
      let commands = [];
      let y = 0;
      const ascii = (value) => String(value ?? '').replace(/[–—]/g, '-').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const drawText = (value, x, baseline, size = 9, bold = false, color = '0.16 0.15 0.14 rg') => {
        commands.push(color, `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${baseline} Td (${ascii(value)}) Tj ET`);
      };
      const drawLine = (x1, y1, x2, y2, color = '0.91 0.85 0.80 RG') => commands.push(color, `${x1} ${y1} m ${x2} ${y2} l S`);
      const drawRect = (x, bottom, width, height, color) => commands.push(color, `${x} ${bottom} ${width} ${height} re f`);
      const wrapText = (value, maxChars) => {
        const words = String(value || '—').replace(/\s+/g, ' ').trim().split(' ');
        const lines = [];
        let line = '';
        words.forEach((word) => {
          while (word.length > maxChars) {
            if (line) { lines.push(line); line = ''; }
            lines.push(word.slice(0, maxChars));
            word = word.slice(maxChars);
          }
          if (!word) return;
          if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; }
          else line = line ? `${line} ${word}` : word;
        });
        if (line) lines.push(line);
        return lines.length ? lines : ['—'];
      };
      const startPage = () => {
        if (commands.length) pages.push(commands.join('\n'));
        commands = [];
        commands.push('0.996 0.471 0.004 rg', '0 547 842 48 re f');
        drawText('WAREHOUSE STOCK HISTORY', 36, 570, 17, true, '1 1 1 rg');
        drawText(`${report.productName} - ${report.variantLabel || 'Standard'}`, 36, 530, 12, true);
        drawText(`Generated ${new Date().toLocaleString('en-MY')}`, 36, 514, 8, false, '0.42 0.38 0.35 rg');
        y = 492;
      };
      const ensureSpace = (height) => { if (y - height < 40) startPage(); };
      const drawTableHeader = () => {
        const xs = [36, 136, 231, 481, 591, 656];
        const labels = ['DATE / TIME', 'BATCH NO.', 'MOVEMENT / REASON', 'ORDER NO.', 'CHANGE', 'BALANCE'];
        drawRect(36, y - 5, 770, 21, '0.996 0.95 0.91 rg');
        labels.forEach((label, index) => drawText(label, xs[index] + 5, y + 2, 7, true, '0.38 0.30 0.25 rg'));
        y -= 21;
      };
      const drawMovementRows = (batch) => {
        const xs = [36, 136, 231, 481, 591, 656];
        drawTableHeader();
        batch.movements.forEach((movement, index) => {
          const dateLines = wrapText(movement.date, 18);
          const batchLines = wrapText(batch.batchNumber, 16);
          const movementLines = [
            ...wrapText(`${movement.change > 0 ? 'Stock added' : 'Stock deducted'} - ${movement.reason || 'Reason not recorded'}`, 42),
            ...(movement.notes ? wrapText(`Details: ${movement.notes}`, 42) : []),
          ];
          const orderLines = wrapText(movement.orderNumber || '—', 18);
          const lineCount = Math.max(dateLines.length, batchLines.length, movementLines.length, orderLines.length, 1);
          const rowHeight = Math.max(25, lineCount * 10 + 8);
          if (y - rowHeight < 42) {
            startPage();
            drawText(`${batch.batchNumber} - continued`, 36, y, 9, true, '0.67 0.29 0.03 rg');
            y -= 17;
            drawTableHeader();
          }
          if (index % 2 === 1) drawRect(36, y - rowHeight + 4, 770, rowHeight, '0.985 0.974 0.961 rg');
          const baseline = y - 9;
          dateLines.forEach((line, lineIndex) => drawText(line, xs[0] + 5, baseline - lineIndex * 10, 7.5));
          batchLines.forEach((line, lineIndex) => drawText(line, xs[1] + 5, baseline - lineIndex * 10, 7.5));
          movementLines.forEach((line, lineIndex) => drawText(line, xs[2] + 5, baseline - lineIndex * 10, 7.5));
          orderLines.forEach((line, lineIndex) => drawText(line, xs[3] + 5, baseline - lineIndex * 10, 7.5));
          drawText(`${movement.change > 0 ? '+' : ''}${movement.change}`, xs[4] + 5, baseline, 8, true, movement.change > 0 ? '0.15 0.52 0.32 rg' : '0.72 0.25 0.20 rg');
          drawText(`${movement.before} -> ${movement.after}`, xs[5] + 5, baseline, 7.5);
          y -= rowHeight;
          drawLine(36, y + 3, 806, y + 3);
        });
      };
      startPage();
      report.batches.forEach((batch) => {
        const infoLines = [
          `Status: ${batch.depleted ? 'Depleted' : 'Active'}    Current stock: ${batch.quantity} units`,
          `Received: ${batch.received || '—'}    Expiry: ${batch.expiry || 'No expiry date'}`,
          `Location: ${batch.location || '—'}${batch.notes ? `    Notes: ${batch.notes}` : ''}`,
        ].flatMap((line) => wrapText(line, 112));
        ensureSpace(44 + infoLines.length * 11);
        drawRect(36, y - 19, 770, 23, '0.996 0.95 0.91 rg');
        drawText(batch.batchNumber || 'Unlabelled batch', 44, y - 11, 10, true, '0.67 0.29 0.03 rg');
        y -= 30;
        infoLines.forEach((line) => { drawText(line, 44, y, 8); y -= 11; });
        y -= 5;
        if (batch.movements.length) drawMovementRows(batch);
        else drawText('No movements recorded for this batch.', 44, y, 8, false, '0.42 0.38 0.35 rg');
        y -= 24;
      });
      if (commands.length) pages.push(commands.join('\n'));
      const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
      const pageRefs = [];
      pages.forEach((stream, index) => {
        const pageObject = objects.length + 1;
        const contentObject = pageObject + 1;
        pageRefs.push(`${pageObject} 0 R`);
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      });
      objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;
      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
      const xrefOffset = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      return pdf;
    };
    const stockExportDateBounds = () => {
      const mode = stockHistoryExportDialog.querySelector('[data-stock-export-date-filter]')?.value || 'all';
      if (mode === 'all') return { from: '', to: '', invalid: false };
      if (mode === 'custom') {
        const from = stockHistoryExportDialog.querySelector('[data-stock-export-from]')?.value || '';
        const to = stockHistoryExportDialog.querySelector('[data-stock-export-to]')?.value || '';
        return { from, to, invalid: !from || !to || from > to };
      }
      const today = localPetDate();
      const [year, month, day] = today.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      if (mode === 'month') start.setMonth(start.getMonth() - 1);
      else start.setFullYear(start.getFullYear() - 1);
      const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      return { from, to: today, invalid: false };
    };
    const renderStockHistoryExportChooser = ({ checkVisibleByDefault = true } = {}) => {
      const list = stockHistoryExportDialog.querySelector('[data-stock-export-batches]');
      if (!list || !stockHistoryExportData) return;
      const mode = stockHistoryExportDialog.querySelector('[data-stock-export-date-filter]')?.value || 'all';
      const customRange = stockHistoryExportDialog.querySelector('[data-stock-export-custom-range]');
      if (customRange) customRange.hidden = mode !== 'custom';
      const { from, to, invalid } = stockExportDateBounds();
      const filteredBatches = stockHistoryExportData.batches.filter((batch) => {
        if (mode === 'all') return true;
        return !invalid && Boolean(batch.receivedDate) && batch.receivedDate >= from && batch.receivedDate <= to;
      });
      list.innerHTML = filteredBatches.length
        ? filteredBatches.map((batch) => `<label class="supplier-stock-export-batch"><input type="checkbox" data-stock-export-batch value="${escapeHTML(batch.id)}" ${checkVisibleByDefault ? 'checked' : ''} /><span><strong>${escapeHTML(batch.batchNumber)}</strong><small>${batch.depleted ? 'Depleted' : 'Active'} · ${batch.quantity} units · Received: ${escapeHTML(batch.received)} · Expiry: ${escapeHTML(batch.expiry)}</small></span></label>`).join('')
        : `<p class="supplier-stock-export-empty">${invalid ? 'Choose a valid start and end date to list batches.' : 'No batches were received within this date range.'}</p>`;
      const count = stockHistoryExportDialog.querySelector('[data-stock-export-selection-count]');
      if (count) count.textContent = `${filteredBatches.length} batch${filteredBatches.length === 1 ? '' : 'es'} in this date range`;
      const selectAll = stockHistoryExportDialog.querySelector('[data-stock-export-select-all]');
      if (selectAll) { selectAll.checked = checkVisibleByDefault && filteredBatches.length > 0; selectAll.indeterminate = false; }
      syncStockExportSelectAll();
      const feedback = stockHistoryExportDialog.querySelector('[data-stock-export-feedback]');
      if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
    };
    const syncStockExportSelectAll = () => {
      const boxes = [...stockHistoryExportDialog.querySelectorAll('[data-stock-export-batch]')];
      const selectAll = stockHistoryExportDialog.querySelector('[data-stock-export-select-all]');
      if (!selectAll) return;
      const selectedCount = boxes.filter((box) => box.checked).length;
      selectAll.checked = boxes.length > 0 && selectedCount === boxes.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < boxes.length;
      const count = stockHistoryExportDialog.querySelector('[data-stock-export-selection-count]');
      if (count) count.textContent = `${selectedCount} of ${boxes.length} batch${boxes.length === 1 ? '' : 'es'} selected`;
    };
    const loadStockHistory = async (openBatchId = null) => {
      if (!stockDetailContext) return;
      const { productId, productName, variantLabel } = stockDetailContext;
      stockHistoryExportData = null;
      setStockHistoryContent(`<h2>${escapeHTML(productName)} · ${escapeHTML(variantLabel || 'Standard')} History</h2><p class="supplier-stock-details-total">Loading stock movements…</p>`);
      stockHistoryDialog.showModal();
      try {
        const { data, error } = await supabase.from('warehouse_inventory_stock_history')
          .select('id, lot_id, batch_number, product_name, sku, variant, quantity_delta, quantity_before, quantity_after, reason, order_number, notes, created_at')
          .eq('warehouse_product_id', productId)
          .eq('variant', variantLabel || 'Standard')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const entries = Array.isArray(data) ? data : [];
        const currentLots = stockLotsFor(productId, productName, variantLabel);
        const lotsById = new Map(currentLots.map((lot) => [String(lot.id), lot]));
        const lotsByBatch = new Map(currentLots.filter((lot) => lot.batch_number).map((lot) => [String(lot.batch_number), lot]));
        const groups = new Map();
        entries.forEach((entry) => {
          const key = entry.lot_id ? `lot:${entry.lot_id}` : `batch:${entry.batch_number || 'unlabelled'}`;
          if (!groups.has(key)) groups.set(key, { batchNumber: entry.batch_number || 'Unlabelled batch', lot: lotsById.get(String(entry.lot_id || '')) || lotsByBatch.get(String(entry.batch_number || '')) || null, entries: [] });
          groups.get(key).entries.push(entry);
        });
        if (openBatchId && ![...groups.values()].some((group) => String(group.lot?.id || '') === String(openBatchId))) {
          const lot = lotsById.get(String(openBatchId));
          if (lot) groups.set(`lot:${openBatchId}`, { batchNumber: lot.batch_number || 'Unlabelled batch', lot, entries: [] });
        }
        const dateLabel = (value) => value ? new Date(value).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
        const renderedGroups = [...groups.entries()].map(([key, group]) => {
          const lot = group.lot;
          const depleted = !lot || (Number(lot.quantity) || 0) <= 0;
          const batchInfo = lot
            ? `<div class="supplier-stock-history-batch-meta"><span>Current stock: ${Number(lot.quantity) || 0} units</span><span>Received: ${lot.received_on ? escapeHTML(inventoryDateLabel(lot.received_on)) : '—'}</span><span>Expiry: ${lot.expires_on ? escapeHTML(inventoryDateLabel(lot.expires_on)) : 'No expiry date'}</span><span>Location: ${escapeHTML(lot.location || '—')}${lot.notes ? ` · ${escapeHTML(lot.notes)}` : ''}</span></div>`
            : `<div class="supplier-stock-history-batch-meta"><span>Current stock: 0 units</span><span>Batch inventory record is no longer active.</span></div>`;
          const movements = group.entries.map((entry) => {
            const delta = Number(entry.quantity_delta) || 0;
            return `<article class="supplier-stock-history-entry ${delta < 0 ? 'is-out' : 'is-in'}"><strong>${delta > 0 ? '+' : ''}${delta} Stock ${delta < 0 ? 'From' : 'To'} Batch ${escapeHTML(group.batchNumber)}</strong><p>Date: ${escapeHTML(dateLabel(entry.created_at))}</p><p>Reason: ${escapeHTML(entry.reason || '—')}</p>${entry.order_number ? `<p>Order number: ${escapeHTML(entry.order_number)}</p>` : ''}${entry.notes ? `<p>Details: ${escapeHTML(entry.notes)}</p>` : ''}<small>Balance: ${Number(entry.quantity_before) || 0} → ${Number(entry.quantity_after) || 0}</small></article>`;
          }).join('');
          const shouldOpen = openBatchId && (String(lot?.id || '') === String(openBatchId) || key === `lot:${openBatchId}`) ? ' open' : '';
          const html = `<details class="supplier-stock-history-batch"${shouldOpen}><summary><span class="supplier-stock-history-batch-summary-heading"><strong>${escapeHTML(group.batchNumber)}</strong><span>${group.entries.length} movement${group.entries.length === 1 ? '' : 's'}</span></span>${batchInfo}</summary><div class="supplier-stock-history-movements">${movements || '<p class="supplier-stock-empty">No stock movements have been recorded for this batch yet.</p>'}</div></details>`;
          return { depleted, lotId: lot?.id ? String(lot.id) : '', html };
        });
        const activeGroups = renderedGroups.filter((group) => !group.depleted);
        const depletedGroups = renderedGroups.filter((group) => group.depleted);
        const initialTab = openBatchId && renderedGroups.some((group) => group.depleted && group.lotId === String(openBatchId)) ? 'depleted' : 'active';
        stockHistoryExportData = {
          productName,
          variantLabel: variantLabel || 'Standard',
          batches: [...groups.entries()].map(([id, group]) => {
            const lot = group.lot;
            return {
              id,
              batchNumber: group.batchNumber,
              depleted: !lot || (Number(lot.quantity) || 0) <= 0,
              quantity: Number(lot?.quantity) || 0,
              receivedDate: lot?.received_on || '',
              received: lot?.received_on ? inventoryDateLabel(lot.received_on) : '—',
              expiry: lot?.expires_on ? inventoryDateLabel(lot.expires_on) : 'No expiry date',
              location: lot?.location || '—',
              notes: lot?.notes || '',
              movements: group.entries.map((entry) => ({
                date: dateLabel(entry.created_at),
                change: Number(entry.quantity_delta) || 0,
                before: Number(entry.quantity_before) || 0,
                after: Number(entry.quantity_after) || 0,
                reason: entry.reason || '—',
                orderNumber: entry.order_number || '',
                notes: entry.notes || '',
              })),
            };
          }),
        };
        const panel = (name, groups) => `<div class="supplier-stock-history-panel" role="tabpanel" data-stock-history-panel="${name}"${initialTab === name ? '' : ' hidden'}>${groups.length ? groups.map((group) => group.html).join('') : `<p class="supplier-stock-empty">No ${name} batches with stock history.</p>`}</div>`;
        setStockHistoryContent(`<div class="supplier-stock-history-title-row"><h2>${escapeHTML(productName)} · ${escapeHTML(variantLabel || 'Standard')} History</h2><button type="button" data-stock-history-download ${stockHistoryExportData.batches.length ? '' : 'disabled'}>Download Statement</button></div><div class="supplier-stock-history-tabs" role="tablist" aria-label="Batch history"><button type="button" role="tab" aria-selected="${initialTab === 'active'}" data-stock-history-tab="active" class="${initialTab === 'active' ? 'is-active' : ''}">Active Batches (${activeGroups.length})</button><button type="button" role="tab" aria-selected="${initialTab === 'depleted'}" data-stock-history-tab="depleted" class="${initialTab === 'depleted' ? 'is-active' : ''}">Depleted Batches (${depletedGroups.length})</button></div><div class="supplier-stock-history-list">${panel('active', activeGroups)}${panel('depleted', depletedGroups)}</div>`);
      } catch (error) {
        setStockHistoryContent(`<h2>Stock History</h2><p class="supplier-portal-feedback">${escapeHTML(error.message || 'Stock history could not be loaded. Apply the stock history database migration, then try again.')}</p>`);
      }
    };
    stockHistoryDialog.addEventListener('click', (event) => {
      const downloadButton = event.target.closest('[data-stock-history-download]');
      const tab = event.target.closest('[data-stock-history-tab]');
      if (downloadButton && stockHistoryExportData) {
        stockHistoryExportDialog.querySelector('[data-stock-export-date-filter]').value = 'all';
        stockHistoryExportDialog.querySelector('[data-stock-export-from]').value = '';
        stockHistoryExportDialog.querySelector('[data-stock-export-to]').value = '';
        renderStockHistoryExportChooser();
        stockHistoryDialog.close();
        stockHistoryExportDialog.showModal();
      } else if (tab) {
        const name = tab.dataset.stockHistoryTab;
        stockHistoryDialog.querySelectorAll('[data-stock-history-tab]').forEach((button) => {
          const selected = button === tab;
          button.classList.toggle('is-active', selected);
          button.setAttribute('aria-selected', String(selected));
        });
        stockHistoryDialog.querySelectorAll('[data-stock-history-panel]').forEach((content) => {
          content.hidden = content.dataset.stockHistoryPanel !== name;
        });
      } else if (event.target.closest('[data-stock-history-close]')) {
        stockHistoryDialog.close();
        if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
      }
    });
    stockHistoryExportDialog.addEventListener('change', (event) => {
      const selectAll = event.target.closest('[data-stock-export-select-all]');
      if (selectAll) {
        stockHistoryExportDialog.querySelectorAll('[data-stock-export-batch]').forEach((checkbox) => { checkbox.checked = selectAll.checked; });
        syncStockExportSelectAll();
      } else if (event.target.closest('[data-stock-export-date-filter], [data-stock-export-from], [data-stock-export-to]')) renderStockHistoryExportChooser();
      else if (event.target.closest('[data-stock-export-batch]')) syncStockExportSelectAll();
    });
    stockHistoryExportDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      stockHistoryExportDialog.close();
      stockHistoryDialog.showModal();
    });
    stockHistoryExportDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-stock-export-back]')) {
        stockHistoryExportDialog.close();
        stockHistoryDialog.showModal();
        return;
      }
      if (!event.target.closest('[data-stock-export-download]') || !stockHistoryExportData) return;
      const selectedIds = new Set([...stockHistoryExportDialog.querySelectorAll('[data-stock-export-batch]:checked')].map((checkbox) => checkbox.value));
      const selectedBatches = stockHistoryExportData.batches.filter((batch) => selectedIds.has(String(batch.id)));
      const feedback = stockHistoryExportDialog.querySelector('[data-stock-export-feedback]');
      if (!selectedBatches.length) {
        feedback.textContent = 'Choose at least one batch to include.';
        feedback.classList.add('is-error');
        return;
      }
      const report = { ...stockHistoryExportData, batches: selectedBatches };
      const pdf = makeStockHistoryPdf(report);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-history-${[report.productName, report.variantLabel].join('-').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'furgo'}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      stockHistoryExportDialog.close();
      stockHistoryDialog.showModal();
    });
    const renderInventory = () => {
      const inventoryRouteParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const routeProductId = inventoryRouteParams.get('productId') || '';
      const routeMarketplaceProductId = inventoryRouteParams.get('marketplaceProductId') || '';
      const routeProductName = inventoryRouteParams.get('productName') || '';
      const routeProduct = !inventoryRouteFocusHandled && (routeProductId || routeMarketplaceProductId || routeProductName)
        ? warehouseProducts.find((product) => (routeProductId && String(product.id) === routeProductId)
          || (routeMarketplaceProductId && String(product.marketplace_product_id || '') === routeMarketplaceProductId)
          || (routeProductName && String(product.name || '').toLocaleLowerCase() === routeProductName.toLocaleLowerCase()))
        : null;
      if (routeProduct) {
        const searchInput = inventorySection.querySelector('[data-inventory-search]');
        if (searchInput) searchInput.value = routeProduct.name || '';
        ['[data-inventory-expiry-filter]', '[data-inventory-category-filter]', '[data-inventory-supplier-filter]', '[data-inventory-status-filter]'].forEach((selector) => {
          const filter = inventorySection.querySelector(selector);
          if (filter) filter.value = 'all';
        });
      }
      const inventorySearchInput = inventorySection.querySelector('[data-inventory-search]');
      const search = (inventorySearchInput?.value || '').trim().toLocaleLowerCase();
      inventorySearchInput?.classList.toggle('is-filtered', Boolean(search));
      const expiryFilter = inventorySection.querySelector('[data-inventory-expiry-filter]')?.value || 'all';
      const categoryFilter = inventorySection.querySelector('[data-inventory-category-filter]')?.value || 'all';
      const supplierFilter = inventorySection.querySelector('[data-inventory-supplier-filter]')?.value || 'all';
      const statusFilter = inventorySection.querySelector('[data-inventory-status-filter]')?.value || 'all';
      const total = inventoryRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
      inventorySection.querySelector('[data-inventory-total]').textContent = total.toLocaleString();
      inventorySection.querySelector('[data-inventory-lots]').textContent = inventoryRows.length.toLocaleString();
      const expiryAttentionCount = inventoryRows.filter((row) => ['soon', 'expired'].includes(inventoryExpiryState(row))).length;
      inventorySection.querySelector('[data-inventory-expiring]').textContent = expiryAttentionCount.toLocaleString();
      const dashboardExpiryCount = document.querySelector('[data-supplier-expiring-count]');
      if (dashboardExpiryCount) dashboardExpiryCount.textContent = expiryAttentionCount.toLocaleString();
      const groups = [];
      const marketplaceStateFor = (product) => {
        const listing = product?.marketplace_product_id
          ? supplierCatalog.find((entry) => String(entry.id) === String(product.marketplace_product_id))
          : null;
        const pendingListing = product?.id ? supplierSubmissions.find((entry) => entry.action === 'add' && entry.status === 'Pending Review'
          && (String(entry.product_data?.warehouseProductId || '') === String(product.id)
            || String(entry.product_id || '') === String(product.marketplace_product_id || ''))) : null;
        const listingFrozen = Boolean(listing?.frozenByAdmin || listing?.variants?.some((entry) => entry.frozen));
        return pendingListing ? 'pending' : listingFrozen ? 'frozen' : listing && !listing.hidden ? 'live' : 'hidden';
      };
      for (const product of warehouseProducts) {
        for (const variant of productVariants(product)) {
          const label = variant.label || 'Standard';
          const lots = stockLotsFor(product.id, product.name, label);
          groups.push({ product, productId: product.id, productName: product.name, variantId: variant.id || label, variantLabel: label, sku: variant.sku || productData(product).productCode || '', supplierName: supplierInfoFor(product, variant).name, lots, total: lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0) });
        }
      }
      const unlinkedLots = inventoryRows.filter((lot) => !warehouseProductForRow(lot));
      for (const lot of unlinkedLots) {
        groups.push({ product: null, productId: '', productName: lot.product_name || 'Unknown product', variantId: lot.variant || 'Standard', variantLabel: lot.variant || 'Standard', sku: lot.sku || '', supplierName: 'Not provided', lots: stockLotsFor('', lot.product_name, lot.variant), total: Number(lot.quantity) || 0 });
      }
      const lowStockOptionCount = groups.filter((group) => {
        const variant = group.product
          ? productVariants(group.product).find((entry) => String(entry.id || entry.label || 'Standard') === String(group.variantId || '')
            || String(entry.label || 'Standard') === String(group.variantLabel || 'Standard'))
          : null;
        const enabled = variant?.lowStockAlertEnabled ?? variant?.low_stock_alert_enabled ?? true;
        const threshold = Math.max(0, Number(variant?.lowStockThreshold ?? variant?.low_stock_threshold ?? 5) || 0);
        return enabled && group.total <= threshold;
      }).length;
      inventorySection.querySelector('[data-inventory-low]').textContent = lowStockOptionCount.toLocaleString();
      const filtered = groups.filter((group) => {
        const lotSearch = group.lots.flatMap((lot) => [lot.batch_number, lot.location, lot.notes]).join(' ');
        const supplierName = group.supplierName || supplierInfoFor(group.product).name;
        const listingState = marketplaceStateFor(group.product);
        const statusLabel = { live: 'Live', hidden: 'Hidden', pending: 'Pending', frozen: 'Frozen' }[listingState];
        const values = [group.productName, group.sku, group.variantLabel, productData(group.product).category, productData(group.product).petTypes, supplierName, listingState, statusLabel, lotSearch].join(' ').toLocaleLowerCase();
        const category = String(productData(group.product).category || 'Other');
        const expiryMatch = expiryFilter === 'all'
          || (expiryFilter === 'attention' && group.lots.some((lot) => ['soon', 'expired'].includes(inventoryExpiryState(lot))))
          || (expiryFilter === 'none' && (!group.lots.length || group.lots.some((lot) => !lot.expires_on)))
          || (expiryFilter === 'soon' && group.lots.some((lot) => inventoryExpiryState(lot) === 'soon'))
          || (expiryFilter === 'expired' && group.lots.some((lot) => inventoryExpiryState(lot) === 'expired'));
        return (!search || values.includes(search))
          && (supplierFilter === 'all' || supplierName.toLocaleLowerCase() === supplierFilter.toLocaleLowerCase())
          && (statusFilter === 'all' || listingState === statusFilter)
          && (categoryFilter === 'all' || category === categoryFilter)
          && expiryMatch;
      });
      if (!filtered.length) {
        inventoryList.innerHTML = `<p class="supplier-empty">${warehouseProducts.length ? 'No warehouse products or stock lots match those filters.' : 'No warehouse products yet. Use Add Product to create the catalogue, then receive stock.'}</p>`;
        return;
      }
      const productGroups = [];
      const productGroupByKey = new Map();
      filtered.forEach((group) => {
        const key = group.productId ? `product:${group.productId}` : `unlinked:${group.productName}`;
        let productGroup = productGroupByKey.get(key);
        if (!productGroup) {
          productGroup = { key, product: group.product, productId: group.productId, productName: group.productName, category: productData(group.product).category || 'Other', sku: productData(group.product).productCode || group.sku || '', rows: [] };
          productGroupByKey.set(key, productGroup);
          productGroups.push(productGroup);
        }
        productGroup.rows.push(group);
      });
      inventoryList.innerHTML = `<div class="supplier-inventory-table-wrap"><table class="supplier-inventory-table"><thead><tr><th>Product</th><th>Option</th><th>Stock</th><th>Seller</th><th>Closest expiry</th><th>Actions</th><th>Status</th></tr></thead><tbody>${productGroups.map((productGroup) => {
        const product = productGroup.product;
        const hasMultipleOptions = productVariants(product).length > 1;
        const coverImage = safeMarketplaceImage(productData(product).images?.[0] || '');
        const productImage = coverImage ? `<img class="supplier-inventory-product-image" src="${escapeHTML(coverImage)}" alt="${escapeHTML(productGroup.productName)}" loading="lazy" />` : '<span class="supplier-inventory-product-image is-placeholder" aria-hidden="true">🐾</span>';
        const listing = product?.marketplace_product_id
          ? supplierCatalog.find((entry) => String(entry.id) === String(product.marketplace_product_id))
          : null;
        const pendingListing = productGroup.productId ? supplierSubmissions.find((entry) => entry.action === 'add' && entry.status === 'Pending Review'
          && (String(entry.product_data?.warehouseProductId || '') === String(productGroup.productId)
            || String(entry.product_id || '') === String(product?.marketplace_product_id || ''))) : null;
        const listingFrozen = Boolean(listing?.frozenByAdmin || listing?.variants?.some((entry) => entry.frozen));
        const listingState = pendingListing ? 'pending' : listingFrozen ? 'frozen' : listing && !listing.hidden ? 'live' : 'hidden';
        const listingLabel = { pending: 'Pending', frozen: 'Frozen', live: 'Live', hidden: 'Hidden' }[listingState];
        const statusButton = `<button type="button" class="supplier-inventory-listing-state is-${listingState}" data-inventory-marketplace-toggle="${escapeHTML(productGroup.productId)}" ${!productGroup.productId || pendingListing || listingFrozen ? 'disabled' : ''}>${listingLabel}</button>`;
        const productActions = `<div class="supplier-inventory-product-actions"><button type="button" class="is-primary" data-inventory-edit-product="${escapeHTML(productGroup.productId)}" ${productGroup.productId ? '' : 'disabled'}>Product Details</button><button type="button" data-inventory-supplier-details="${escapeHTML(productGroup.productId)}" ${productGroup.productId ? '' : 'disabled'}>Seller Details</button></div>`;
        const productCell = `<td rowspan="${productGroup.rows.length + (hasMultipleOptions ? 1 : 0)}" class="supplier-inventory-product-group-cell"><div class="supplier-inventory-product-cell">${productImage}<span><strong>${escapeHTML(productGroup.productName)}</strong><small>${escapeHTML(productGroup.category)} · SKU: ${escapeHTML(productGroup.sku || '—')}</small></span></div></td>`;
        const productActionsRow = hasMultipleOptions
          ? `<tr class="supplier-inventory-product-actions-row"${productGroup.productId ? ` data-warehouse-product-row="${escapeHTML(productGroup.productId)}"` : ''}>${productCell}<td class="supplier-inventory-option-cell supplier-inventory-product-action-spacer" colspan="4"></td><td><div class="supplier-inventory-actions-wrap"><div class="supplier-inventory-actions">${productActions}</div></div></td><td rowspan="${productGroup.rows.length + 1}" class="supplier-inventory-status-cell">${statusButton}</td></tr>`
          : '';
        const optionRows = productGroup.rows.map((group, rowIndex) => {
          const stockActions = `<div class="supplier-inventory-stock-actions"><button type="button" data-inventory-view-stock-product="${escapeHTML(group.productId)}" data-inventory-view-stock-name="${escapeHTML(group.productName)}" data-inventory-view-stock-variant="${escapeHTML(group.variantLabel)}" data-inventory-view-stock-variant-id="${escapeHTML(group.variantId || group.variantLabel)}">Stock Details</button></div>`;
          const supplier = supplierInfoFor(group.product, productVariants(group.product).find((variant) => String(variant.label || 'Standard') === String(group.variantLabel || 'Standard')) || {});
          const actions = !hasMultipleOptions
            ? `<div class="supplier-inventory-actions">${productActions}${stockActions}</div>`
            : `<div class="supplier-inventory-actions">${stockActions}</div>`;
          const today = localPetDate();
          const closestExpiryLot = group.lots.filter((lot) => lot.expires_on).sort((a, b) => {
            const aUpcoming = a.expires_on >= today;
            const bUpcoming = b.expires_on >= today;
            if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
            return aUpcoming ? String(a.expires_on).localeCompare(String(b.expires_on)) : String(b.expires_on).localeCompare(String(a.expires_on));
          })[0];
          const expiryState = closestExpiryLot ? inventoryExpiryState(closestExpiryLot) : '';
          const expiryClass = expiryState === 'expired' ? 'is-expired' : expiryState === 'soon' ? 'is-expiring' : '';
          return `<tr class="${hasMultipleOptions ? 'supplier-inventory-option-row' : ''} ${rowIndex > 0 ? 'supplier-inventory-option-continuation' : ''}"${rowIndex === 0 && productGroup.productId ? ` data-warehouse-product-row="${escapeHTML(productGroup.productId)}"` : ''}>${!hasMultipleOptions ? productCell : ''}<td class="supplier-inventory-option-cell">${escapeHTML(group.variantLabel)}</td><td><strong>${group.total.toLocaleString()}</strong><small>units</small></td><td class="supplier-inventory-supplier-cell">${escapeHTML(supplier.name)}</td><td><span class="supplier-inventory-expiry ${expiryClass}">${closestExpiryLot ? inventoryDateLabel(closestExpiryLot.expires_on) : '—'}</span></td><td><div class="supplier-inventory-actions-wrap">${actions}</div></td>${!hasMultipleOptions ? `<td class="supplier-inventory-status-cell">${statusButton}</td>` : ''}</tr>`;
        }).join('');
        return `${productActionsRow}${optionRows}`;
      }).join('')}</tbody></table></div>`;
      if (routeProduct) {
        inventoryRouteFocusHandled = true;
        requestAnimationFrame(() => [...inventoryList.querySelectorAll('[data-warehouse-product-row]')]
          .find((row) => row.dataset.warehouseProductRow === String(routeProduct.id))
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    };
    let inventoryRead = 0;
    refreshWarehouseInventory = async (force = false) => {
      if (!storeCurrent() || !inventorySection || (inventoryLoaded && !force)) return;
      const read = ++inventoryRead;
      if (!inventoryLoaded) inventoryList.innerHTML = '<p class="supplier-empty">Loading warehouse inventory…</p>';
      try {
        // Store Portal data is fetched once during page initialization. Re-fetching
        // the full catalog, submissions, and orders here made Inventory wait on
        // the same network calls a second time before it could load its stock.
        await refreshWarehouseProducts(true);
      } catch (error) {
        const detail = error.message || 'Unknown data-loading error.';
        inventoryList.innerHTML = `<p class="supplier-empty">Warehouse products could not load: ${escapeHTML(detail)}</p>`;
        setInventoryFeedback(detail, true);
        throw error;
      }
      let data;
      try {
        const owners = warehouseOwnerIds();
        let lotQuery = supabase.from('warehouse_inventory_lots')
          .select('id,product_name,sku,variant,batch_number,quantity,received_on,expires_on,location,notes,warehouse_product_id,pick_order,created_at')
          .order('pick_order', { ascending: true })
          .order('expires_on', { ascending: true, nullsFirst: false })
          .order('received_on', { ascending: true });
        if (supplierProfile.directorStoreView) lotQuery = owners.length ? lotQuery.in('created_by', owners) : null;
        const result = lotQuery ? await lotQuery : { data: [], error: null };
        if (result.error) throw result.error;
        data = result.data;
      } catch (error) {
        const detail = error.message || 'Unknown data-loading error.';
        inventoryList.innerHTML = `<p class="supplier-empty">Inventory could not load: ${escapeHTML(detail)}</p>`;
        setInventoryFeedback(detail, true);
        throw error;
      }
      if (!storeCurrent() || read !== inventoryRead) return;
      inventoryRows = data || [];
      if (!inventoryLoaded) {
        inventoryForm.elements.received_on.value = localPetDate();
        syncBatchNumber(inventoryForm);
      }
      inventoryLoaded = true;
      renderInventory();
      renderPackagingOrders();
    };
    inventorySection.querySelector('[data-inventory-search]')?.addEventListener('input', renderInventory);
    inventorySection.querySelector('[data-inventory-expiry-filter]')?.addEventListener('change', renderInventory);
    inventorySection.querySelector('[data-inventory-category-filter]')?.addEventListener('change', renderInventory);
    inventorySection.querySelector('[data-inventory-supplier-filter]')?.addEventListener('change', renderInventory);
    inventorySection.querySelector('[data-inventory-status-filter]')?.addEventListener('change', renderInventory);
    inventoryList?.addEventListener('click', async (event) => {
      const supplierDetailsButton = event.target.closest('[data-inventory-supplier-details]');
      if (supplierDetailsButton) {
        const product = warehouseProducts.find((entry) => String(entry.id) === String(supplierDetailsButton.dataset.inventorySupplierDetails));
        if (product) showSupplierDetails(product);
        return;
      }
      const button = event.target.closest('[data-inventory-marketplace-toggle]');
      if (!button || button.disabled) return;
      const product = warehouseProducts.find((entry) => String(entry.id) === String(button.dataset.inventoryMarketplaceToggle));
      if (!product) return;
      const listing = product.marketplace_product_id
        ? supplierCatalog.find((entry) => String(entry.id) === String(product.marketplace_product_id))
        : null;
      const pending = supplierSubmissions.find((entry) => entry.action === 'add' && entry.status === 'Pending Review'
        && (String(entry.product_data?.warehouseProductId || '') === String(product.id)
          || String(entry.product_id || '') === String(product.marketplace_product_id || '')));
      if (pending) return;
      const shouldPublish = !listing || Boolean(listing.hidden);
      if (!window.confirm(`${shouldPublish ? 'Make' : 'Hide'} “${product.name}” ${shouldPublish ? 'live in' : 'from'} the Marketplace?`)) return;
      button.disabled = true;
      setInventoryFeedback(shouldPublish ? 'Publishing product…' : 'Hiding product…');
      try {
        let result = null;
        if (listing) {
          const { error } = await supabase.rpc('manage_marketplace_supplier_product', {
            p_action: shouldPublish ? 'show' : 'hide',
            p_product_id: listing.id,
          });
          if (error) throw error;
        } else {
          const variants = productVariants(product).map((variant) => ({
            ...variant,
            stock: stockLotsFor(product.id, product.name, variant.label || 'Standard').reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0),
          }));
          result = await submitWarehouseMarketplaceListing(product.id, {
            ...productData(product),
            id: product.id,
            name: product.name,
            warehouseProductId: product.id,
            variants,
          });
        }
        setInventoryFeedback(result?.status === 'Pending Review'
          ? `“${product.name}” was submitted and is waiting for approval before it goes live.`
          : `“${product.name}” is now ${shouldPublish ? 'live' : 'hidden'} in the Marketplace.`);
        productsLoaded = false;
        inventoryLoaded = false;
        await refreshWarehouseInventory();
      } catch (error) {
        button.disabled = false;
        setInventoryFeedback(error.message || 'The Marketplace listing could not be updated.', true);
      }
    });
    inventorySection.querySelector('[data-warehouse-add-product]')?.addEventListener('click', () => navigateToSupplierProductEditor({ warehouseAdd: '1', from: 'inventory' }));
    inventorySection.querySelector('[data-warehouse-product-cancel]')?.addEventListener('click', () => productDialog.close());
    productForm?.querySelector('[data-warehouse-delete-product]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const id = productForm.elements.id.value;
      const product = warehouseProducts.find((row) => row.id === id);
      if (!product || button.disabled) return;
      const stockTotal = inventoryRows
        .filter((lot) => warehouseProductForRow(lot)?.id === product.id)
        .reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
      if (stockTotal > 0) {
        setProductFeedback(`This product has ${stockTotal.toLocaleString()} units in stock. Reduce every stock batch to zero before deleting it.`, true);
        return;
      }
      if (!window.confirm(`Delete “${product.name}” from Warehouse Stock and remove its Marketplace listing? This cannot be undone.`)) return;
      button.disabled = true;
      try {
        const { error } = await supabase.rpc('delete_store_warehouse_product', { p_warehouse_product_id: id });
        if (error) throw error;
        productDialog.close();
        productsLoaded = false;
        inventoryLoaded = false;
        await refreshWarehouseProducts(true);
        await refreshWarehouseInventory();
        setInventoryFeedback('Warehouse product deleted.');
      } catch (error) {
        setProductFeedback(error.message || 'The warehouse product could not be deleted.', true);
        button.disabled = false;
      }
    });
    productForm?.querySelector('[data-warehouse-add-variant]')?.addEventListener('click', () => {
      const variants = [...productForm.querySelectorAll('[data-warehouse-product-variant]')].map((row) => ({
        id: row.querySelector('[name="warehouseVariantId"]').value,
        option: row.querySelector('[name="variantOption"]').value.trim(),
        variant: row.querySelector('[name="variantLabel"]').value.trim(),
        label: row.querySelector('[name="variantLabel"]').value,
        price: row.querySelector('[name="price"]').value,
        sku: row.querySelector('[name="variantSku"]').value,
        imageUrl: row.querySelector('[name="variantImageUrl"]').value,
      }));
      variants.push({});
      renderWarehouseVariantEditor(variants);
    });
    productForm?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-warehouse-variant]');
      if (!remove || remove.disabled) return;
      remove.closest('[data-warehouse-product-variant]')?.remove();
      const rows = [...productForm.querySelectorAll('[data-warehouse-product-variant]')];
      rows.forEach((row) => { row.querySelector('[data-remove-warehouse-variant]').disabled = rows.length === 1; });
    });
    productForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = productForm.querySelector('[type="submit"]');
      if (submit.disabled || !productForm.reportValidity()) return;
      const fields = productForm.elements;
      const id = fields.id.value;
      const previousRow = warehouseProductBaseline?.id === id ? warehouseProductBaseline : null;
      if (id && !previousRow) return;
      const previousData = productData(previousRow);
      const previousVariants = previousData.variants || [];
      const variantRows = [...productForm.querySelectorAll('[data-warehouse-product-variant]')].map((row, index) => {
        const id = row.querySelector('[name="warehouseVariantId"]').value;
        const option = row.querySelector('[name="variantOption"]').value.trim();
        const variant = row.querySelector('[name="variantLabel"]').value.trim();
        const label = composeSupplierVariantLabel(option, variant);
        const previous = previousVariants.find((entry) => id ? String(entry.id) === id : !entry.id && entry.label === label);
        return {
          ...previous,
          id: id || (previous ? undefined : 'warehouse-option-' + crypto.randomUUID() + '-' + (index + 1)),
          option, variant, label,
          price: Number(row.querySelector('[name="price"]').value),
          sku: row.querySelector('[name="variantSku"]').value.trim(),
          imageUrl: row.querySelector('[name="variantImageUrl"]').value.trim(),
        };
      });
      if (new Set(variantRows.map((variant) => variant.label.toLocaleLowerCase())).size !== variantRows.length) { setProductFeedback('Each option and variant combination needs a different name.', true); return; }
      submit.disabled = true;
      const imageUrl = fields.imageUrl.value.trim();
      const coverFile = fields.coverPhoto.files?.[0] || null;
      let uploadedCoverPath = '';
      let coverImageUrl = imageUrl || previousData.images?.[0] || '';
      try {
        const coverValidationError = coverFile ? await validateSupplierPhotos([coverFile], 1) : '';
        if (coverValidationError) { setProductFeedback(coverValidationError, true); submit.disabled = false; return; }
        if (coverFile) {
          const extension = coverFile.type === 'image/jpeg' ? 'jpg' : coverFile.type.split('/')[1];
        uploadedCoverPath = `${warehouseInsertOwnerId()}/warehouse/${id || crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('marketplace-submissions').upload(uploadedCoverPath, coverFile, { contentType: coverFile.type, upsert: false });
          if (uploadError) throw uploadError;
          coverImageUrl = supabase.storage.from('marketplace-submissions').getPublicUrl(uploadedCoverPath).data.publicUrl;
        }
      } catch (error) {
        setProductFeedback(error.message || 'The cover photo could not be uploaded.', true);
        submit.disabled = false;
        return;
      }
      const product = {
        ...previousData,
        name: fields.name.value.trim(),
        category: fields.category.value,
        petTypes: fields.petTypes.value.trim(),
        productCode: fields.productCode.value.trim(),
        description: fields.description.value.trim(),
        ingredients: fields.ingredients.value.trim(),
        nutrition: fields.nutrition.value.trim(),
        images: coverImageUrl ? [coverImageUrl, ...(previousData.images || []).slice(1)] : (previousData.images || []),
        variants: variantRows,
      };
      setProductFeedback(id ? 'Saving warehouse product…' : 'Adding warehouse product…');
      let warehouseProductSaved = false;
      try {
        let savedProductId = id;
        if (id) {
          const { error } = await supabase.rpc('update_warehouse_product', {
            p_product_id: id, p_expected: { ...previousData, name: previousRow.name }, p_desired: product,
          });
          if (error) throw error;
        } else {
          productForm.dataset.createRequestId ||= crypto.randomUUID();
          const { data: savedProduct, error } = await supabase.rpc('create_warehouse_product', {
            p_name: product.name, p_product_data: product, p_owner: warehouseInsertOwnerId(),
            p_product_id: productForm.dataset.createRequestId,
          });
          if (error) throw error;
          savedProductId = savedProduct.id;
          fields.id.value = savedProductId;
          warehouseProductSaved = true;
        }
        warehouseProductSaved = true;
        productDialog.close();
        productsLoaded = false;
        inventoryLoaded = false;
        await refreshWarehouseProducts(true);
        await refreshWarehouseInventory();
        await refreshSupplierPortal();
        setInventoryFeedback(id ? 'Warehouse product updated.' : 'Warehouse product added. Use Live in Warehouse Stock when it is ready to publish.');
      } catch (error) {
        if (uploadedCoverPath && !warehouseProductSaved && /^(PT(403|409|422)|22[A-Z0-9]{3}|23[A-Z0-9]{3})$/.test(error.code || '')) {
          await supabase.storage.from('marketplace-submissions').remove([uploadedCoverPath]);
        }
        if (warehouseProductSaved) {
          productsLoaded = false;
          await refreshWarehouseProducts(true).catch(() => {});
          setProductFeedback(`The warehouse product was saved, but its Marketplace listing could not be completed. Save again to retry. ${error.message || ''}`.trim(), true);
        } else setProductFeedback(error.message || 'The warehouse product could not be saved.', true);
      }
      finally { submit.disabled = false; }
    });
    const syncInventoryVariant = (form, productSelector, variantSelector) => {
      const productId = productSelector.value;
      fillVariantSelect(variantSelector, productId);
      const product = warehouseProducts.find((entry) => entry.id === productId);
      const variant = product ? productVariants(product)[0] : null;
      if (variant && variantSelector) variantSelector.value = variant.id || variant.label;
      if (form.elements.sku && product) form.elements.sku.value = variant?.sku || productData(product).productCode || '';
      if (form.elements.product_name && product) form.elements.product_name.value = product.name;
    };
    const lockInventoryEditFields = () => {
      const productField = editForm?.elements.warehouse_product_id;
      const variantField = editForm?.elements.variant;
      const quantityField = editForm?.elements.quantity;
      const batchField = editForm?.elements.batch_number;
      if (productField) { productField.disabled = true; productField.setAttribute('aria-readonly', 'true'); }
      if (variantField) { variantField.disabled = true; variantField.setAttribute('aria-readonly', 'true'); }
      if (quantityField) quantityField.readOnly = true;
      if (batchField) batchField.readOnly = true;
    };
    const inventoryProductSelect = inventoryForm?.querySelector('[data-inventory-product-select]');
    const inventoryVariantSelect = inventoryForm?.querySelector('[data-inventory-variant-select]');
    const openReceiveStockDialog = (productId = '', variantId = '') => {
      inventoryForm.reset();
      inventoryForm.elements.received_on.value = localPetDate();
      syncBatchNumber(inventoryForm);
      fillVariantSelect(inventoryVariantSelect, '');
      setProductForSelect(inventoryProductSelect, inventoryVariantSelect, productId, variantId);
      setInventoryFeedback('');
      if (stockDialog.open) stockDialog.close();
      receiveDialog.showModal();
      inventoryForm.elements.quantity.focus({ preventScroll: true });
    };
    receiveDialog.querySelector('[data-inventory-receive-cancel]')?.addEventListener('click', () => {
      receiveDialog.close();
      if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
    });
    let stockBatchDrag = null;
    const saveStockBatchOrder = async (orderedIds, expectedIds) => {
      if (!stockDetailContext || !orderedIds.length) return;
      try {
        const { error } = await supabase.rpc('reorder_active_warehouse_inventory_lots', {
          p_lot_ids: orderedIds, p_expected_ids: expectedIds,
        });
        if (error) throw error;
        inventoryRows = inventoryRows.map((lot) => {
          const nextIndex = orderedIds.indexOf(lot.id);
          return nextIndex < 0 ? lot : { ...lot, pick_order: nextIndex + 1 };
        });
        renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel);
      } catch (error) {
        setInventoryFeedback(error.message || 'Batch pick order could not be changed.', true);
        renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel);
      }
    };
    stockDialog.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-stock-batch-drag]');
      const batch = handle?.closest('[data-stock-batch]');
      if (!handle || !batch || !stockDetailContext || event.button !== 0) return;
      event.preventDefault();
      stockBatchDrag = { pointerId: event.pointerId, handle, batch, startOrder: [...stockDialog.querySelectorAll('[data-stock-batch]')].map((node) => node.dataset.stockBatchId) };
      handle.classList.add('is-dragging');
      batch.classList.add('is-dragging');
      handle.setPointerCapture?.(event.pointerId);
    });
    stockDialog.addEventListener('pointermove', (event) => {
      if (!stockBatchDrag || stockBatchDrag.pointerId !== event.pointerId) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-stock-batch]');
      const list = stockDialog.querySelector('.supplier-stock-batches');
      if (!target || !list || target === stockBatchDrag.batch || target.parentElement !== list) return;
      const rect = target.getBoundingClientRect();
      list.insertBefore(stockBatchDrag.batch, event.clientY < rect.top + rect.height / 2 ? target : target.nextElementSibling);
    });
    const finishStockBatchDrag = (event, shouldSave = true) => {
      if (!stockBatchDrag || stockBatchDrag.pointerId !== event.pointerId) return;
      const drag = stockBatchDrag;
      stockBatchDrag = null;
      drag.handle.classList.remove('is-dragging');
      drag.batch.classList.remove('is-dragging');
      const orderedIds = [...stockDialog.querySelectorAll('[data-stock-batch]')].map((node) => node.dataset.stockBatchId);
      if (!shouldSave) {
        renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel);
      } else if (orderedIds.length && orderedIds.some((id, index) => id !== drag.startOrder[index])) {
        void saveStockBatchOrder(orderedIds, drag.startOrder);
      }
    };
    stockDialog.addEventListener('pointerup', (event) => finishStockBatchDrag(event));
    stockDialog.addEventListener('pointercancel', (event) => finishStockBatchDrag(event, false));
    stockDialog.addEventListener('click', async (event) => {
      const closeButton = event.target.closest('[data-stock-details-close]');
      const editButton = event.target.closest('[data-stock-batch-edit]');
      const adjustButton = event.target.closest('[data-stock-batch-adjust]');
      const lowStockButton = event.target.closest('[data-stock-low-stock-open]');
      const historyButton = event.target.closest('[data-stock-history-open]');
      const receiveButton = event.target.closest('[data-stock-details-receive]');
      if (closeButton) {
        stockDialog.close();
        stockDetailContext = null;
      } else if (editButton) {
        const lot = inventoryRows.find((row) => row.id === editButton.dataset.stockBatchEdit);
        if (!lot) return;
        lotEditBaseline = lot;
        Object.entries(lot).forEach(([key, value]) => { if (editForm.elements[key]) editForm.elements[key].value = value ?? ''; });
        setProductForSelect(editForm.querySelector('[data-inventory-edit-product]'), editForm.querySelector('[data-inventory-edit-variant]'), lot.warehouse_product_id, lot.variant);
        syncBatchNumber(editForm);
        lockInventoryEditFields();
        stockDialog.close();
        editDialog.showModal();
      } else if (adjustButton) {
        const lot = inventoryRows.find((row) => row.id === adjustButton.dataset.stockBatchAdjust);
        if (!lot) return;
        stockAdjustmentForm.reset();
        delete stockAdjustmentForm.dataset.requestId;
        stockAdjustmentForm.elements.lotId.value = lot.id;
        stockAdjustmentForm.elements.quantity.max = String(Number(lot.quantity) || 0);
        stockAdjustmentForm.querySelector('[data-stock-adjust-all]').disabled = Number(lot.quantity) < 1;
        stockAdjustmentForm.querySelector('[data-stock-adjust-summary]').textContent = `${lot.batch_number || 'Unlabelled batch'} · ${lot.product_name} · ${lot.variant || 'Standard'} · ${Number(lot.quantity) || 0} units available`;
        stockAdjustmentForm.querySelector('[data-stock-adjust-feedback]').textContent = '';
        stockAdjustmentForm.querySelector('[type="submit"]').disabled = Number(lot.quantity) < 1;
        stockDialog.close();
        stockAdjustmentDialog.showModal();
      } else if (lowStockButton) {
        openLowStockSettings();
      } else if (historyButton) {
        stockDialog.close();
        await loadStockHistory();
      } else if (receiveButton) {
        const productId = receiveButton.dataset.stockDetailsReceive;
        const product = warehouseProducts.find((entry) => entry.id === productId);
        const variant = product ? productVariants(product).find((entry) => entry.label === receiveButton.dataset.stockDetailsVariant) : null;
        openReceiveStockDialog(productId, variant?.id || variant?.label || '');
      }
    });
    stockAdjustmentDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-stock-adjust-all]')) {
        const quantityField = stockAdjustmentForm.elements.quantity;
        quantityField.value = quantityField.max || '0';
        quantityField.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (event.target.closest('[data-stock-adjust-cancel]')) {
        stockAdjustmentDialog.close();
        if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
      }
    });
    stockAdjustmentForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!stockAdjustmentForm.reportValidity()) return;
      const fields = stockAdjustmentForm.elements;
      const quantity = Number(fields.quantity.value);
      const submit = stockAdjustmentForm.querySelector('[type="submit"]');
      const feedback = stockAdjustmentForm.querySelector('[data-stock-adjust-feedback]');
      if (submit.disabled) return;
      submit.disabled = true;
      feedback.textContent = 'Saving stock adjustment…';
      try {
        stockAdjustmentForm.dataset.requestId ||= crypto.randomUUID();
        await submitWarehouseStockRequest(supabase, supplierProfile.id, 'adjust', {
          p_lot_id: fields.lotId.value,
          p_quantity: quantity,
          p_reason: fields.reason.value,
          p_notes: fields.notes.value.trim() || null,
        }, stockAdjustmentForm.dataset.requestId);
        delete stockAdjustmentForm.dataset.requestId;
        stockAdjustmentDialog.close();
        inventoryLoaded = false;
        await refreshWarehouseInventory();
        try { await refreshMarketplaceCatalogFromDatabase(); } catch (refreshError) { console.warn('Marketplace stock cache refresh deferred:', refreshError); }
        setInventoryFeedback('Stock adjusted and saved in stock history.');
        if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
      } catch (error) {
        feedback.textContent = error.message || 'Stock could not be adjusted.';
      } finally { submit.disabled = false; }
    });
    supplierDetailsDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-supplier-details-close]')) supplierDetailsDialog.close();
    });
    editDialog?.querySelector('[data-inventory-edit-cancel]')?.addEventListener('click', () => {
      editDialog.close();
      if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
    });
    inventoryProductSelect?.addEventListener('change', () => syncInventoryVariant(inventoryForm, inventoryProductSelect, inventoryVariantSelect));
    inventoryVariantSelect?.addEventListener('change', () => {
      const product = warehouseProducts.find((entry) => entry.id === inventoryProductSelect.value);
      const variant = productVariants(product || {}).find((entry) => String(entry.id || entry.label) === inventoryVariantSelect.value);
      if (inventoryForm.elements.sku) inventoryForm.elements.sku.value = variant?.sku || productData(product).productCode || '';
    });
    inventoryForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = inventoryForm.elements;
      const product = warehouseProducts.find((entry) => entry.id === fields.warehouse_product_id.value);
      const variant = product ? productVariants(product).find((entry) => String(entry.id || entry.label) === fields.variant.value) : null;
      if (!product || !variant) { setInventoryFeedback('Choose a warehouse product and option first.', true); return; }
      const payload = {
        ...Object.fromEntries(['received_on', 'expires_on', 'location', 'notes']
          .map((key) => [key, String(fields[key].value || '').trim() || null])),
        warehouse_product_id: product.id,
        variant: variant.id ? null : variant.label || 'Standard',
        quantity: Number(fields.quantity.value),
      };
      if (!Number.isInteger(payload.quantity) || payload.quantity < 1) { setInventoryFeedback('Enter a whole number of units received.', true); return; }
      payload.created_by = warehouseInsertOwnerId();
      payload.variant_id = variant.id || null;
      const submitButton = inventoryForm.querySelector('[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;
      try {
        inventoryForm.dataset.requestId ||= crypto.randomUUID();
        await submitWarehouseStockRequest(supabase, supplierProfile.id, 'receive', payload, inventoryForm.dataset.requestId);
        delete inventoryForm.dataset.requestId;
        inventoryForm.reset();
        fields.received_on.value = localPetDate();
        syncBatchNumber(inventoryForm);
        fillVariantSelect(inventoryVariantSelect, '');
        receiveDialog.close();
        inventoryLoaded = false;
        await refreshWarehouseInventory();
        try { await refreshMarketplaceCatalogFromDatabase(); } catch (refreshError) { console.warn('Marketplace stock cache refresh deferred:', refreshError); }
        setInventoryFeedback('Received stock saved to the selected warehouse product and option.');
        if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
      } catch (error) { setInventoryFeedback(error.message || 'The inventory lot could not be saved.', true); }
      finally { submitButton.disabled = false; }
    });
    inventoryList?.addEventListener('click', async (event) => {
      const productButton = event.target.closest('[data-inventory-edit-product]');
      const viewStockButton = event.target.closest('[data-inventory-view-stock-product]');
      const editButton = event.target.closest('[data-inventory-edit]');
      const deleteButton = event.target.closest('[data-inventory-delete]');
      if (viewStockButton) {
        renderStockDetails(viewStockButton.dataset.inventoryViewStockProduct, viewStockButton.dataset.inventoryViewStockName, viewStockButton.dataset.inventoryViewStockVariant, viewStockButton.dataset.inventoryViewStockVariantId);
        stockDialog.showModal();
      } else if (productButton) {
        const row = warehouseProducts.find((entry) => entry.id === productButton.dataset.inventoryEditProduct);
        if (row) navigateToSupplierProductEditor({ warehouseProductId: row.id, from: 'inventory' });
      } else if (editButton) {
        const row = inventoryRows.find((entry) => entry.id === editButton.dataset.inventoryEdit);
        if (!row) return;
        lotEditBaseline = row;
        Object.entries(row).forEach(([key, value]) => { if (editForm.elements[key]) editForm.elements[key].value = value ?? ''; });
        const productSelect = editForm.querySelector('[data-inventory-edit-product]');
        const variantSelect = editForm.querySelector('[data-inventory-edit-variant]');
        setProductForSelect(productSelect, variantSelect, row.warehouse_product_id, row.variant);
        syncBatchNumber(editForm);
        lockInventoryEditFields();
        editDialog.showModal();
      } else if (deleteButton) {
        if (!window.confirm('Remove this inventory lot? This cannot be undone.')) return;
        deleteButton.disabled = true;
        try {
          const { error } = await supabase.rpc('delete_warehouse_inventory_lot', { p_lot_id: deleteButton.dataset.inventoryDelete });
          if (error) throw error;
          inventoryLoaded = false;
          await refreshWarehouseInventory();
          try { await refreshMarketplaceCatalogFromDatabase(); } catch (refreshError) { console.warn('Marketplace stock cache refresh deferred:', refreshError); }
          setInventoryFeedback('Inventory lot removed.');
        } catch (error) { setInventoryFeedback(error.message || 'The lot could not be removed.', true); deleteButton.disabled = false; }
      }
    });
    const editProductSelect = editForm?.querySelector('[data-inventory-edit-product]');
    const editVariantSelect = editForm?.querySelector('[data-inventory-edit-variant]');
    editProductSelect?.addEventListener('change', () => syncInventoryVariant(editForm, editProductSelect, editVariantSelect));
    editForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = editForm.elements;
      const id = fields.id.value;
      if (!lotEditBaseline || lotEditBaseline.id !== id) return;
      const metadata = Object.fromEntries(['received_on', 'expires_on', 'location', 'notes']
        .map((key) => [key, String(fields[key].value || '').trim() || null]));
      const submitButton = editForm.querySelector('[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;
      try {
        const { error } = await supabase.rpc('update_warehouse_inventory_lot', {
          p_lot_id: id, p_expected: lotEditBaseline, p_fields: metadata,
        });
        if (error) throw error;
        editDialog.close();
        inventoryLoaded = false;
        await refreshWarehouseInventory();
        try { await refreshMarketplaceCatalogFromDatabase(); } catch (refreshError) { console.warn('Marketplace stock cache refresh deferred:', refreshError); }
        setInventoryFeedback('Inventory lot updated.');
        if (stockDetailContext) { renderStockDetails(stockDetailContext.productId, stockDetailContext.productName, stockDetailContext.variantLabel); stockDialog.showModal(); }
      } catch (error) { setInventoryFeedback(error.message || 'The inventory lot could not be updated.', true); }
      finally { submitButton.disabled = false; }
    });
    const recoverStockMovement = async () => {
      try {
        const operation = await recoverWarehouseStockRequest(supabase, supplierProfile.id);
        if (!operation || !inventorySection.isConnected) return;
        if (operation === 'receive' && inventoryForm.dataset.requestId) {
          receiveDialog.close();
          inventoryForm.reset();
          delete inventoryForm.dataset.requestId;
        }
        if (operation === 'adjust' && stockAdjustmentForm.dataset.requestId) {
          stockAdjustmentDialog.close();
          stockAdjustmentForm.reset();
          delete stockAdjustmentForm.dataset.requestId;
        }
        inventoryLoaded = false;
        await refreshWarehouseInventory();
        try { await refreshMarketplaceCatalogFromDatabase(); }
        catch (error) { console.warn('Marketplace stock cache refresh deferred:', error); }
        setInventoryFeedback(operation === 'receive' ? 'Received stock confirmed.' : 'Stock adjustment confirmed.');
      } catch (error) {
        if (inventorySection.isConnected) setInventoryFeedback(error.message || 'Stock confirmation is pending.', true);
      }
    };
    window.removeEventListener('online', recoverWarehouseStockOnReconnect);
    recoverWarehouseStockOnReconnect = () => { if (inventorySection.isConnected) void recoverStockMovement(); };
    window.addEventListener('online', recoverWarehouseStockOnReconnect);
    void recoverStockMovement();
  }
  document.querySelectorAll('[data-supplier-order-filter-open]').forEach((card) => {
    const openOrders = () => {
      const status = card.dataset.supplierOrderFilterOpen;
      window.location.hash = '#supplier?tab=packaging&packagingStatus=ready';
    };
    card.addEventListener('click', (event) => { event.stopPropagation(); openOrders(); });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      openOrders();
    });
  });
  document.querySelectorAll('[data-supplier-dashboard-packaging], [data-supplier-dashboard-orders]').forEach((card) => {
    const openDashboardQueue = () => {
      if (card.hasAttribute('data-supplier-dashboard-packaging')) {
        window.location.hash = '#supplier?tab=packaging&packagingStatus=ready';
      } else {
        window.location.hash = '#supplier?tab=packaging&packagingStatus=packed';
      }
    };
    card.addEventListener('click', openDashboardQueue);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDashboardQueue();
    });
  });
  const openInventoryExpiry = () => { window.location.hash = '#supplier?tab=inventory&expiry=attention'; };
  document.querySelector('[data-supplier-inventory-expiry-open]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    openInventoryExpiry();
  });
  document.querySelector('[data-supplier-inventory-expiry-open]')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    openInventoryExpiry();
  });
  const supplierRouteParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  let supplierCatalog = [];
  let supplierSubmissions = [];
  let supplierOrders = [];
  let packagingStatusFilter = ['ready', 'packed', 'awaiting_pickup', 'completed'].includes(supplierRouteParams.get('packagingStatus')) ? supplierRouteParams.get('packagingStatus') : 'ready';
  const packagingSelection = new Map();
  const packagingPendingSelection = new Map();
  const packagingPickupSelection = new Set();
  const packagingTarget = document.querySelector('[data-packaging-orders]');
  const packagingPanelTarget = document.querySelector('.supplier-packaging-panel');
  const packagingPickupToolbarTarget = document.querySelector('[data-packaging-pickup-toolbar]');
  const supplierProductListTarget = document.querySelector('[data-supplier-products]');
  const renderSupplierProductList = (restoreSearchFocus = false, caretPosition = 0, restoreControl = '') => {
    if (!supplierProductListTarget) return;
    supplierProductListTarget.innerHTML = supplierProductRows(supplierCatalog, supplierSubmissions, supplierOrders, {
      search: supplierProductListTarget.dataset.search || '',
      category: supplierProductListTarget.dataset.category || 'all',
    });
    if (restoreSearchFocus) {
      const searchInput = supplierProductListTarget.querySelector('[data-supplier-product-search]');
      searchInput?.focus();
      searchInput?.setSelectionRange(caretPosition, caretPosition);
    } else if (restoreControl) supplierProductListTarget.querySelector(restoreControl)?.focus();
  };
  supplierProductListTarget?.addEventListener('input', (event) => {
    const input = event.target.closest('[data-supplier-product-search]');
    if (!input) return;
    supplierProductListTarget.dataset.search = input.value;
    renderSupplierProductList(true, input.selectionStart ?? input.value.length);
  });
  supplierProductListTarget?.addEventListener('change', (event) => {
    const category = event.target.closest('[data-supplier-product-category]');
    if (!category) return;
    if (category) supplierProductListTarget.dataset.category = category.value;
    renderSupplierProductList(false, 0, '[data-supplier-product-category]');
  });
  const requestedSupplierOrderFilter = supplierRouteParams.get('status');
  let supplierOrderStatusFilter = requestedSupplierOrderFilter === 'progressing' ? 'shipped' : ['new', 'received', 'packed', 'shipped', 'delivered', 'cancelled', 'returns'].includes(requestedSupplierOrderFilter) ? requestedSupplierOrderFilter : 'new';
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
      notice.textContent = `No orders in ${({ new: 'New Order', received: 'Received Order', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', returns: 'Return or Refund' })[supplierOrderStatusFilter]}.`;
      if (!empty) ordersTarget.append(notice);
    } else empty?.remove();
    document.querySelectorAll('[data-supplier-order-status-filter]').forEach((button) => {
      const active = button.dataset.supplierOrderStatusFilter === supplierOrderStatusFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  applySupplierOrderStatusFilter();
  document.querySelector('[data-supplier-order-status-tabs]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-supplier-order-status-filter]');
    if (!button) return;
    supplierOrderStatusFilter = button.dataset.supplierOrderStatusFilter;
    applySupplierOrderStatusFilter();
  });
  const applyPackagingStatusFilter = () => {
    const labels = {
      ready: 'Ready to pack',
      packed: 'Ready to Ship',
      awaiting_pickup: 'Awaiting Pickup',
      completed: 'Completed',
    };
    const label = document.querySelector('[data-packaging-heading-label]');
    if (label) label.textContent = labels[packagingStatusFilter] || labels.ready;
    document.querySelectorAll('[data-packaging-status-filter]').forEach((button) => {
      const active = button.dataset.packagingStatusFilter === packagingStatusFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderPackagingOrders();
  };
  applyPackagingStatusFilter();
  document.querySelector('[data-packaging-status-tabs]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-packaging-status-filter]');
    if (!button) return;
    packagingStatusFilter = button.dataset.packagingStatusFilter;
    applyPackagingStatusFilter();
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
    renderSupplierVariantRows(readSupplierVariantRows());
    setSupplierFeedback('Photo added. Save the product to apply photo changes.');
  });
  supplierPhotoList?.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-supplier-photo]');
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeSupplierPhoto);
    const [removed] = supplierEditorImages.splice(index, 1);
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    renderSupplierPhotoList();
    renderSupplierVariantRows(readSupplierVariantRows().map((variant) => ({ ...variant, imageIndex: Number(variant.imageIndex) === index ? '0' : String(Number(variant.imageIndex) > index ? Number(variant.imageIndex) - 1 : Number(variant.imageIndex)) })));
    setSupplierFeedback('Photo removed. Save the product to apply photo changes.');
  });
  const reorderSupplierPhoto = (from, to) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0
      || from >= supplierEditorImages.length || to >= supplierEditorImages.length) return;
    const variants = readSupplierVariantRows();
    const [photo] = supplierEditorImages.splice(from, 1);
    supplierEditorImages.splice(to, 0, photo);
    const remapIndex = (value) => {
      const index = Number(value) || 0;
      if (index === from) return to;
      if (from < to && index > from && index <= to) return index - 1;
      if (to < from && index >= to && index < from) return index + 1;
      return index;
    };
    renderSupplierPhotoList();
    renderSupplierVariantRows(variants.map((variant) => ({ ...variant, imageIndex: String(remapIndex(variant.imageIndex)) })));
    setSupplierFeedback('Photo order updated. The first photo is the product cover. Save the product to apply the new order.');
  };
  let draggedPhotoIndex = null;
  supplierPhotoList?.addEventListener('dragstart', (event) => {
    const photo = event.target.closest('[data-supplier-photo-index]');
    if (!photo || event.target.closest('button, label')) { event.preventDefault(); return; }
    draggedPhotoIndex = Number(photo.dataset.supplierPhotoIndex);
    event.dataTransfer?.setData('text/plain', String(draggedPhotoIndex));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  supplierPhotoList?.addEventListener('dragover', (event) => {
    if (!event.target.closest('[data-supplier-photo-index]')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  supplierPhotoList?.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-supplier-photo-index]');
    if (!target || draggedPhotoIndex == null) return;
    event.preventDefault();
    reorderSupplierPhoto(draggedPhotoIndex, Number(target.dataset.supplierPhotoIndex));
    draggedPhotoIndex = null;
  });
  supplierPhotoList?.addEventListener('dragend', () => { draggedPhotoIndex = null; });
  let touchPhotoStart = null;
  supplierPhotoList?.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const photo = event.target.closest('[data-supplier-photo-index]');
    if (!photo || event.target.closest('button, label')) return;
    touchPhotoStart = { index: Number(photo.dataset.supplierPhotoIndex), x: event.clientX, y: event.clientY };
  }, { passive: true });
  supplierPhotoList?.addEventListener('pointerup', (event) => {
    if (!touchPhotoStart || event.pointerType !== 'touch') return;
    const start = touchPhotoStart;
    touchPhotoStart = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-supplier-photo-index]');
    if (target && supplierPhotoList.contains(target)) {
      reorderSupplierPhoto(start.index, Number(target.dataset.supplierPhotoIndex));
    }
  }, { passive: true });
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
    renderSupplierVariantRows(readSupplierVariantRows());
    setSupplierFeedback('Photo changed. Save the product to apply photo changes.');
  });
  let supplierPortalRead = 0;
  const refreshSupplierPortal = async () => {
    const read = ++supplierPortalRead;
    const canApplyOrders = trackingRefresh.capture();
    const submissionsTarget = document.querySelector('[data-supplier-products]');
    const ordersTarget = document.querySelector('[data-supplier-orders]');
    const editPageTarget = document.querySelector('[data-marketplace-supplier-product]');
    if (!submissionsTarget && !ordersTarget && !packagingTarget && !editPageTarget) return;
    if (editPageTarget && !editPageTarget.dataset.supplierRouteInitialized) {
      const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      if (routeParams.get('warehouseAdd') === '1') {
        editPageTarget.dataset.supplierRouteInitialized = 'true';
        editPageTarget.closest('.supplier-product-edit-page')?.classList.add('is-warehouse-create');
        openWarehouseProductCreateEditor();
        return;
      }
      const warehouseProductId = routeParams.get('warehouseProductId');
      if (warehouseProductId) {
        editPageTarget.dataset.supplierRouteInitialized = 'true';
        try {
          const { data: warehouseProduct, error } = await supabase.from('warehouse_products')
            .select('id,name,product_data,marketplace_product_id')
            .eq('id', warehouseProductId)
            .maybeSingle();
          if (error) throw error;
          const { data: productLots, error: lotError } = await supabase.from('warehouse_inventory_lots')
            .select('variant,quantity')
            .eq('warehouse_product_id', warehouseProductId);
          if (lotError) throw lotError;
          if (!storeCurrent()) return;
          const stockByVariant = (productLots || []).reduce((totals, lot) => {
            const key = String(lot.variant || 'Standard');
            totals[key] = (totals[key] || 0) + (Number(lot.quantity) || 0);
            return totals;
          }, {});
          if (!openWarehouseProductEditor(warehouseProduct, { stockTotal: (productLots || []).reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0), stockByVariant })) {
            setSupplierFeedback('This warehouse product could not be found.', true);
          }
        } catch (error) {
          setSupplierFeedback(error.message || 'Warehouse product details could not load.', true);
        }
        return;
      }
    }
    const [catalogResult, ordersResult] = await Promise.all([
      supplierProfile.directorStoreView
        ? supabase.rpc('get_marketplace_store_catalog', { p_supplier_name: supplierProfile.supplierName })
        : supabase.rpc('get_marketplace_supplier_catalog'),
      (ordersTarget || packagingTarget) && !supplierProfile.directorStoreView
        ? supabase.rpc('get_marketplace_supplier_orders')
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!storeCurrent() || read !== supplierPortalRead) return;
    if (catalogResult.error) throw catalogResult.error;
    if (ordersResult.error) throw ordersResult.error;
    supplierSubmissions = [];
    supplierCatalog = catalogResult.data || [];
    if (editPageTarget && !editPageTarget.dataset.supplierRouteInitialized) {
      editPageTarget.dataset.supplierRouteInitialized = 'true';
      const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const requestId = routeParams.get('requestId');
      const productId = routeParams.get('productId');
      const warehouseProductId = routeParams.get('warehouseProductId');
      const warehouseAdd = routeParams.get('warehouseAdd') === '1';
      const variantId = routeParams.get('variantId') || '';
      if (warehouseAdd) {
        openWarehouseProductCreateEditor();
      } else if (requestId) {
        const request = supplierSubmissions.find((entry) => entry.id === requestId && entry.action === 'add' && ['Pending Review', 'Rejected'].includes(entry.status));
        if (request) {
          const product = request.product_data || {};
          const variant = product.variants?.[0] || {};
          const fields = supplierForm.elements;
          fields.pendingSubmissionId.value = request.id;
          fields.name.value = product.name || '';
          fields.category.value = product.category || 'Other';
          fields.description.value = product.description || '';
          fields.petTypes.value = product.petTypes || '';
          fields.ingredients.value = product.ingredients || '';
          fields.nutrition.value = product.nutrition || '';
          supplierEditorImages = (product.images || []).map((url) => ({ url }));
          renderSupplierVariantRows(product.variants || [variant]);
          renderSupplierPhotoList();
          document.querySelector('[data-supplier-form-title]').textContent = `Edit ${request.status === 'Rejected' ? 'rejected' : 'pending'} ${product.name || 'product'}`;
          supplierForm.querySelector('[data-supplier-submit-label]').textContent = request.status === 'Rejected' ? 'Save & Resubmit' : 'Save Request';
        } else {
          setSupplierFeedback('This product request is no longer available to edit.', true);
        }
      } else if (productId) {
        if (!openSupplierProductEditor(productId, variantId)) setSupplierFeedback('This product or variant could not be found.', true);
      } else if (warehouseProductId) {
        const { data: warehouseProduct, error } = await supabase.from('warehouse_products')
          .select('id,name,product_data,marketplace_product_id')
          .eq('id', warehouseProductId)
          .maybeSingle();
        if (error) throw error;
        const { data: productLots, error: lotError } = await supabase.from('warehouse_inventory_lots')
          .select('variant,quantity')
          .eq('warehouse_product_id', warehouseProductId);
        if (lotError) throw lotError;
        const stockByVariant = (productLots || []).reduce((totals, lot) => {
          const key = String(lot.variant || 'Standard');
          totals[key] = (totals[key] || 0) + (Number(lot.quantity) || 0);
          return totals;
        }, {});
        if (!openWarehouseProductEditor(warehouseProduct, { stockTotal: (productLots || []).reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0), stockByVariant })) setSupplierFeedback('This warehouse product could not be found.', true);
      }
    }
    if (!canApplyOrders()) {
      if (submissionsTarget) renderSupplierProductList();
      return;
    }
    supplierOrders = (ordersResult.data || []).map((row) => row.order_details || row);
    const paidMarketplaceOrders = supplierOrders.filter((order) => String(order.paymentStatus || '').toLowerCase() === 'paid');
    const toPackCount = paidMarketplaceOrders.filter((order) => matchesSupplierOrderStatus(order, 'received')).length;
    const toShipCount = paidMarketplaceOrders.filter((order) => matchesSupplierOrderStatus(order, 'packed')).length;
    const newOrderCount = supplierOrders.filter((order) => matchesSupplierOrderStatus(order, 'new')).length;
    const shippedOrderCount = supplierOrders.filter((order) => matchesSupplierOrderStatus(order, 'shipped')).length;
    const toPackCountTarget = document.querySelector('[data-supplier-to-pack-count]');
    const toShipCountTarget = document.querySelector('[data-supplier-to-ship-count]');
    const newOrderCountTarget = document.querySelector('[data-supplier-new-order-count]');
    const shippedOrderCountTarget = document.querySelector('[data-supplier-shipped-order-count]');
    if (toPackCountTarget) toPackCountTarget.textContent = String(toPackCount);
    if (toShipCountTarget) toShipCountTarget.textContent = String(toShipCount);
    if (newOrderCountTarget) newOrderCountTarget.textContent = String(newOrderCount);
    if (shippedOrderCountTarget) shippedOrderCountTarget.textContent = String(shippedOrderCount);
    if (submissionsTarget) renderSupplierProductList();
    renderPackagingOrders();
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
  const setPackagingFeedback = (message, isError = false) => {
    const feedback = document.querySelector('[data-packaging-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };
  packagingTarget?.addEventListener('click', async (event) => {
    const editPackedParcel = event.target.closest('[data-edit-packed-parcel]');
    if (editPackedParcel) {
      const orderId = editPackedParcel.dataset.editPackedParcel;
      if (!window.confirm('Return this parcel to packing? Saved tracking details will be cleared, and the packed items will stay in the Parcel Box for editing.')) return;
      editPackedParcel.disabled = true;
      setPackagingFeedback('Reopening parcel…');
      const { error } = await supabase.rpc('reopen_marketplace_supplier_order_packing', { p_order_id: orderId });
      if (error) {
        editPackedParcel.disabled = false;
        setPackagingFeedback(error.message || 'This parcel could not be reopened.', true);
        return;
      }
      const packedOrder = supplierOrders.find((order) => String(order.id) === String(orderId));
      const packedCounts = new Map();
      (packedOrder?.products || []).forEach((item, index) => {
        packedCounts.set(index, Math.max(1, Number(item.quantity) || 1));
      });
      packagingSelection.set(String(orderId), packedCounts);
      packagingPendingSelection.set(String(orderId), new Set());
      packagingStatusFilter = 'ready';
      applyPackagingStatusFilter();
      try {
        await refreshSupplierPortal();
        applyPackagingStatusFilter();
        setPackagingFeedback('Parcel reopened. Its items are still in the Parcel Box. Remove any units that need to go back to the warehouse list.');
      } catch (refreshError) {
        setPackagingFeedback(refreshError.message || 'Parcel reopened, but the order list could not refresh.', true);
      }
      return;
    }
    const packagingCard = event.target.closest('[data-packaging-order]');
    const selectItem = event.target.closest('[data-package-select]');
    const addItem = event.target.closest('[data-package-add]');
    const removeItem = event.target.closest('[data-package-remove]');
    if (packagingCard && (selectItem || addItem || removeItem)) {
      const orderId = String(packagingCard.dataset.packagingOrder || '');
      const packedCounts = packagingSelection.get(orderId) || new Map();
      const pending = packagingPendingSelection.get(orderId) || new Set();
      const itemIndex = Number(selectItem?.dataset.packageSelect ?? addItem?.dataset.packageAdd ?? removeItem?.dataset.packageRemove);
      if (Number.isInteger(itemIndex)) {
        if (selectItem) {
          if (pending.has(itemIndex)) {
            pending.delete(itemIndex);
          } else pending.add(itemIndex);
          packagingPendingSelection.set(orderId, pending);
        } else if (addItem) {
          const nextPackedCount = (packedCounts.get(itemIndex) || 0) + 1;
          packedCounts.set(itemIndex, nextPackedCount);
          if (nextPackedCount >= Number(addItem.dataset.packageRequested || 0)) pending.delete(itemIndex);
          else pending.add(itemIndex);
          packagingPendingSelection.set(orderId, pending);
        } else {
          const count = packedCounts.get(itemIndex) || 0;
          if (count <= 1) packedCounts.delete(itemIndex);
          else packedCounts.set(itemIndex, count - 1);
          pending.delete(itemIndex);
          packagingPendingSelection.set(orderId, pending);
        }
        packagingSelection.set(orderId, packedCounts);
        renderPackagingOrders();
      }
      return;
    }
    const button = event.target.closest('[data-mark-packed]');
    if (!button || button.disabled) return;
    button.disabled = true;
    setPackagingFeedback('Saving packed status…');
    const { error } = await supabase.rpc('mark_marketplace_supplier_order_packed', { p_order_id: button.dataset.markPacked });
    if (error) {
      button.disabled = false;
      setPackagingFeedback(error.message || 'The order could not be marked as packed.', true);
      return;
    }
    setPackagingFeedback('Order marked as packed.');
    try { await refreshSupplierPortal(); }
    catch (refreshError) { setPackagingFeedback(refreshError.message || 'Packed status saved, but orders could not refresh.', true); }
  });
  const setShipmentFeedback = (message, isError = false) => {
    const feedback = document.querySelector('[data-supplier-shipment-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  };
  packagingTarget?.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-copy-recipient-field]');
    if (!copyButton) return;
    const section = copyButton.closest('.supplier-packaging-recipient');
    const feedback = section?.querySelector('[data-packaging-copy-feedback]');
    const value = copyButton.dataset.copyRecipientField || '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(value);
      if (feedback) feedback.textContent = 'Copied.';
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (feedback) feedback.textContent = copied ? 'Copied.' : 'Could not copy. Please select and copy the details.';
    }
  });
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
    const warehouseProductId = fields.warehouseProductId?.value.trim() || '';
    const warehouseProductCreate = fields.warehouseProductCreate?.value === 'true';
    const action = warehouseProductCreate ? 'warehouse_add' : warehouseProductId ? 'warehouse_edit' : pendingSubmissionId ? 'pending_edit' : editingProductId ? 'edit' : 'add';
    setSupplierFeedback(action === 'warehouse_add' ? 'Adding warehouse product…' : action === 'warehouse_edit' || action === 'edit' ? 'Saving product details…' : action === 'pending_edit' ? 'Updating pending product request…' : 'Submitting product for Furgo approval…');
    try {
      const submissionId = crypto.randomUUID();
      const existingProduct = editingProductId ? supplierProductBaseline : null;
      const pendingSubmission = supplierSubmissions.find((entry) => entry.id === pendingSubmissionId);
      const pendingProduct = pendingSubmission?.product_data || {};
      const priorWarehouseProduct = warehouseProductId ? supplierProductBaseline : null;
      const existingVariants = (existingProduct || priorWarehouseProduct || pendingProduct).variants || [];
      const variantRows = [...supplierForm.querySelectorAll('[data-supplier-variant-row]')].map((row) => ({
        id: row.querySelector('[name="variantRowId"]')?.value || '',
        option: row.querySelector('[name="variantOption"]')?.value.trim() || '',
        variant: row.querySelector('[name="variantLabel"]')?.value.trim() || '',
        label: composeSupplierVariantLabel(row.querySelector('[name="variantOption"]')?.value, row.querySelector('[name="variantLabel"]')?.value),
        price: Number(row.querySelector('[name="price"]')?.value),
        stock: Number(row.querySelector('[name="stock"]')?.value),
        imageIndex: row.querySelector('[name="variantImageIndex"]')?.value || '0',
      }));
      if (!variantRows.length || variantRows.length > 30) { setSupplierFeedback('Add between 1 and 30 product options.', true); submit.disabled = false; return; }
      const optionLabels = variantRows.map((entry) => entry.label.toLocaleLowerCase());
      if (new Set(optionLabels).size !== optionLabels.length) { setSupplierFeedback('Each option and variant combination needs a different name.', true); submit.disabled = false; return; }
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
        productCode: warehouseProductCreate || warehouseProductId
          ? fields.warehouseProductCode.value.trim()
          : existingProduct?.productCode || pendingProduct.productCode || '',
        variants: variantRows.map((row, index) => {
          const previous = existingVariants.find((entry) => row.id ? String(entry.id) === row.id : !entry.id && entry.label === row.label) || {};
          return { ...previous, id: row.id || (previous.label ? undefined : 'variant-' + submissionId + '-' + (index + 1)), option: row.option, variant: row.variant, label: row.label, price: row.price, stock: row.stock, imageUrl: images[Number(row.imageIndex)] || images[0] || '', supplierId: supplierProfile.supplierName, supplier: supplierProfile.supplierName, cost: previous.cost ?? 0, frozen: Boolean(previous.frozen) };
        }),
      };
      let feedbackMessage;
      if (action === 'warehouse_add') {
        const warehouseData = {
          category: fields.category.value,
          description: fields.description.value.trim(),
          petTypes: fields.petTypes.value.trim(),
          ingredients: fields.ingredients.value.trim(),
          nutrition: fields.nutrition.value.trim(),
          images,
          productCode: fields.warehouseProductCode.value.trim(),
          variants: product.variants.map((variant, index) => ({
            id: variant.id,
            option: variant.option,
            variant: variant.variant,
            label: variant.label,
            price: variant.price,
            stock: 0,
            sku: fields.warehouseProductCode.value.trim(),
            imageUrl: images[Number(variantRows[index]?.imageIndex)] || images[0] || '',
          })),
        };
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        supplierForm.dataset.createRequestId ||= crypto.randomUUID();
        const { data: warehouseRow, error } = await supabase.rpc('create_warehouse_product', {
          p_name: fields.name.value.trim(), p_product_data: warehouseData,
          p_owner: warehouseInsertOwnerId() || authData?.user?.id,
          p_product_id: supplierForm.dataset.createRequestId,
        });
        if (error) throw error;
        fields.warehouseProductCreate.value = '';
        fields.warehouseProductId.value = warehouseRow.id;
        feedbackMessage = 'Warehouse product added. Use Live in Warehouse Stock when it is ready to publish.';
      } else if (action === 'warehouse_edit') {
        const priorData = priorWarehouseProduct || {};
        const warehouseVariants = variantRows.map((row) => {
          const previous = existingVariants.find((entry) => row.id ? String(entry.id) === row.id : !entry.id && entry.label === row.label) || {};
          return {
            ...previous,
            id: row.id || (previous.label ? undefined : 'warehouse-option-' + submissionId + '-' + (variantRows.indexOf(row) + 1)),
            option: row.option,
            variant: row.variant,
            label: row.label,
            price: row.price,
            stock: previous.stock ?? 0,
            sku: previous.sku || '',
            imageUrl: product.variants[variantRows.indexOf(row)]?.imageUrl || images[0] || '',
          };
        });
        const warehouseData = {
          ...priorData,
          category: fields.category.value,
          description: fields.description.value.trim(),
          petTypes: fields.petTypes.value.trim(),
          ingredients: fields.ingredients.value.trim(),
          nutrition: fields.nutrition.value.trim(),
          images,
          productCode: fields.warehouseProductCode.value.trim(),
          variants: warehouseVariants,
        };
        const { error } = await supabase.rpc('update_warehouse_product', {
          p_product_id: warehouseProductId, p_expected: priorWarehouseProduct,
          p_desired: { ...warehouseData, name: fields.name.value.trim() },
        });
        if (error) throw error;
        feedbackMessage = 'Warehouse product details saved.';
      } else if (action === 'pending_edit') {
        const { data, error } = await supabase.rpc('update_marketplace_pending_product_request', { p_submission_id: pendingSubmissionId, p_product_data: product });
        if (error) throw error;
        feedbackMessage = data?.status === 'Approved'
          ? 'Product published and is now live in the Marketplace.'
          : 'Product request updated and resubmitted. It is waiting for Furgo approval.';
      } else if (action === 'edit') {
        const { data, error } = await supabase.rpc('patch_marketplace_supplier_product', {
          p_product_id: editingProductId, p_expected: existingProduct, p_desired: product,
        });
        if (error) throw error;
        feedbackMessage = data?.variant_change_pending
          ? 'Product details saved. Price or variant changes are pending Furgo approval.'
          : 'Product details saved and are now live in the Marketplace.';
      } else {
        const { data, error } = await supabase.rpc('submit_marketplace_supplier_product', { p_action: 'add', p_product_id: null, p_product_data: product });
        if (error) throw error;
        feedbackMessage = data?.status === 'Approved'
          ? 'Product published and is now live in the Marketplace.'
          : 'Product submitted. It will appear in the Marketplace after Furgo approval.';
      }
      const returnToInventory = warehouseProductCreate || Boolean(warehouseProductId);
      supplierForm.reset();
      resetSupplierEditor();
      setSupplierFeedback(feedbackMessage);
      if (window.location.hash.startsWith('#supplier-product-edit')) {
        window.location.hash = returnToInventory ? '#supplier?tab=inventory' : '#supplier';
        return;
      }
      await refreshSupplierPortal();
    } catch (error) {
      console.error('Store product submission failed:', error);
      setSupplierFeedback(error.message || 'The product could not be submitted. Please try again.', true);
    } finally { submit.disabled = false; }
  });
  supplierForm?.querySelector('[data-supplier-cancel-edit]')?.addEventListener('click', () => {
    const warehouseMode = supplierForm.elements.warehouseProductId?.value.trim() || supplierForm.elements.warehouseProductCreate?.value === 'true';
    window.location.hash = warehouseMode ? '#supplier?tab=inventory' : '#supplier';
  });
  const ordersTarget = document.querySelector('[data-supplier-orders]');
  packagingTarget?.addEventListener('click', (event) => {
    const saveDefaultButton = event.target.closest('[data-save-default-courier]');
    if (!saveDefaultButton) return;
    const form = saveDefaultButton.closest('[data-supplier-shipping-form]');
    const courier = form?.elements.courier?.value.trim();
    if (!courier) {
      setShipmentFeedback('Enter or choose a courier before saving it as the default.', true);
      form?.elements.courier?.focus();
      return;
    }
    try {
      localStorage.setItem(supplierDefaultCourierStorageKey(), courier);
      packagingTarget.querySelectorAll('[data-supplier-shipping-form] input[name="courier"]').forEach((input) => {
        if (!input.value.trim()) input.value = courier;
      });
      setShipmentFeedback(`${courier} saved as your default courier in this browser.`);
    } catch {
      setShipmentFeedback('The default courier could not be saved in this browser.', true);
    }
  });
  ordersTarget?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-supplier-return-action]');
    if (!button) return;
    const action = button.dataset.supplierReturnAction;
    const reason = action === 'reject' ? window.prompt('Why are you rejecting this return? Furgo will review the case.') : '';
    if (action === 'reject' && !reason?.trim()) return;
    if (action !== 'reject' && !window.confirm(action === 'approve' ? 'Approve this return request? The customer will be asked to send the product back to you.' : 'Confirm that you received the returned product?')) return;
    button.disabled = true;
    setShipmentFeedback(action === 'reject' ? 'Sending the case to Furgo for review…' : 'Updating return status…');
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
      setShipmentFeedback(action === 'reject' ? 'The case has been sent to Furgo for review.' : action === 'approve' ? 'Return approved. Coordinate the return shipment with the customer.' : 'The returned product is recorded as received. Furgo can now record the refund after it is sent through the original payment method.');
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
  packagingTarget?.addEventListener('input', (event) => {
    const form = event.target.closest('[data-supplier-shipping-form]');
    if (form) trackingRefresh.open(form);
  });
  packagingTarget?.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-supplier-shipping-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    trackingRefresh.open(form);
    submit.disabled = true;
    setShipmentFeedback('Saving shipment details…');
    const shipmentAction = form.dataset.shipmentAction || 'ship';
    const wasReadyToShip = shipmentAction === 'edit_tracking'
      && supplierOrders.some((order) => String(order.id) === String(form.dataset.supplierShippingForm)
        && String(order.supplierShipment?.status || '').toLowerCase() === 'ready to ship');
    let error;
    try {
      ({ error } = await supabase.rpc('update_marketplace_supplier_shipment', {
        p_order_id: form.dataset.supplierShippingForm,
        p_action: shipmentAction,
        p_courier: form.elements.courier.value.trim(),
        p_tracking_number: form.elements.trackingNumber.value.trim(),
        p_tracking_url: form.elements.trackingUrl.value.trim(),
      }));
    } catch (failure) { error = failure; }
    if (!storeCurrent()) return;
    if (error) {
      submit.disabled = false;
      setShipmentFeedback(error.message || 'Shipment details could not be saved.', true);
      return;
    }
    trackingRefresh.close(form);
    submit.disabled = false;
    if (shipmentAction === 'edit_tracking') {
      form.hidden = true;
      const editButton = form.closest('.supplier-packaging-order')?.querySelector('[data-supplier-edit-tracking]');
      if (editButton) editButton.hidden = false;
    }
    setShipmentFeedback(shipmentAction === 'edit_tracking' ? 'Corrected tracking details saved.' : 'Tracking saved. The parcel is awaiting courier pickup.');
    try {
      await refreshSupplierPortal();
      if (shipmentAction === 'save_tracking' || wasReadyToShip) {
        packagingStatusFilter = 'awaiting_pickup';
        applyPackagingStatusFilter();
      }
    } catch (refreshError) { setShipmentFeedback(refreshError.message || 'Shipment saved, but the order list could not refresh.', true); }
  });
  packagingPanelTarget?.addEventListener('change', (event) => {
    if (!event.target.matches('[data-pickup-order]')) return;
    const orderId = String(event.target.dataset.pickupOrder || '');
    if (event.target.checked) packagingPickupSelection.add(orderId);
    else packagingPickupSelection.delete(orderId);
    const markButton = packagingPickupToolbarTarget?.querySelector('[data-supplier-mark-selected-shipped]');
    const confirmation = packagingPickupToolbarTarget?.querySelector('[data-supplier-shipped-confirmation]');
    if (confirmation) confirmation.hidden = true;
    if (markButton) markButton.hidden = false;
    const selectedCount = packagingPickupSelection.size;
    if (markButton) {
      markButton.disabled = selectedCount === 0;
      markButton.textContent = selectedCount > 1 ? `Picked Up / Dropped Off (${selectedCount})` : 'Picked Up / Dropped Off';
    }
  });
  packagingPanelTarget?.addEventListener('click', async (event) => {
    const returnToShipButton = event.target.closest('[data-return-to-ship]');
    if (returnToShipButton) {
      returnToShipButton.disabled = true;
      setShipmentFeedback('Returning the order to Ready to Ship…');
      const order = supplierOrders.find((entry) => String(entry.id) === String(returnToShipButton.dataset.returnToShip));
      const shipment = order?.supplierShipment || {};
      const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
        p_order_id: returnToShipButton.dataset.returnToShip,
        p_action: 'return_to_ship',
        p_courier: shipment.courier || '',
        p_tracking_number: shipment.trackingNumber || '',
        p_tracking_url: shipment.trackingUrl || '',
      });
      if (error) {
        returnToShipButton.disabled = false;
        setShipmentFeedback(error.message || 'The order could not be returned to Ready to Ship.', true);
        return;
      }
      setShipmentFeedback('The order is back in Ready to Ship. Tracking details can now be edited.');
      try {
        await refreshSupplierPortal();
        packagingStatusFilter = 'packed';
        applyPackagingStatusFilter();
      } catch (refreshError) { setShipmentFeedback(refreshError.message || 'Status saved, but the order list could not refresh.', true); }
      return;
    }
    const cancelShipped = event.target.closest('[data-supplier-cancel-shipped]');
    if (cancelShipped) {
      const toolbar = cancelShipped.closest('.supplier-pickup-toolbar');
      const confirmation = cancelShipped.closest('[data-supplier-shipped-confirmation]');
      const markButton = toolbar?.querySelector('[data-supplier-mark-selected-shipped]');
      if (confirmation) confirmation.hidden = true;
      if (markButton) markButton.hidden = false;
      setShipmentFeedback('');
      return;
    }
    const markSelectedShippedButton = event.target.closest('[data-supplier-mark-selected-shipped]');
    if (markSelectedShippedButton) {
      if (!packagingPickupSelection.size) return;
      const toolbar = markSelectedShippedButton.closest('.supplier-pickup-toolbar');
      const confirmation = toolbar?.querySelector('[data-supplier-shipped-confirmation]');
      if (confirmation) {
        const label = confirmation.querySelector('[data-pickup-confirmation-label]');
        if (label) label.textContent = packagingPickupSelection.size === 1
          ? 'Confirm this parcel was collected or accepted by the courier?'
          : `Confirm these ${packagingPickupSelection.size} parcels were collected or accepted by the courier?`;
        markSelectedShippedButton.hidden = true;
        confirmation.hidden = false;
      }
      return;
    }
    const confirmShippedButton = event.target.closest('[data-supplier-confirm-shipped]');
    if (confirmShippedButton) {
      const confirmation = confirmShippedButton.closest('[data-supplier-shipped-confirmation]');
      const cancelButton = confirmation?.querySelector('[data-supplier-cancel-shipped]');
      const selectedOrderIds = [...packagingPickupSelection];
      confirmShippedButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      let shipmentError = null;
      let shippedCount = 0;
      for (const orderId of selectedOrderIds) {
        const order = supplierOrders.find((entry) => String(entry.id) === orderId);
        const shipment = order?.supplierShipment || {};
        const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
          p_order_id: orderId,
          p_action: 'ship',
          p_courier: shipment.courier || '',
          p_tracking_number: shipment.trackingNumber || '',
          p_tracking_url: shipment.trackingUrl || '',
        });
        if (error) { shipmentError = error; break; }
        shippedCount += 1;
      }
      if (shipmentError) {
        confirmShippedButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        setShipmentFeedback(shippedCount
          ? `${shippedCount} parcel${shippedCount === 1 ? '' : 's'} updated, but the rest could not be marked shipped: ${shipmentError.message || 'Please try again.'}`
          : shipmentError.message || 'The parcel could not be marked as shipped.', true);
        if (shippedCount) {
          try { await refreshSupplierPortal(); applyPackagingStatusFilter(); }
          catch (refreshError) { setShipmentFeedback(refreshError.message || 'Some parcels were updated, but the list could not refresh.', true); }
        }
        return;
      }
      packagingPickupSelection.clear();
      setShipmentFeedback(`${shippedCount === 1 ? 'The parcel has' : `${shippedCount} parcels have`} been marked as shipped.`);
      try {
        await refreshSupplierPortal();
        packagingStatusFilter = 'completed';
        applyPackagingStatusFilter();
      } catch (refreshError) { setShipmentFeedback(refreshError.message || 'Shipment status saved, but the order list could not refresh.', true); }
      return;
    }
    const cancelUndoDelivery = event.target.closest('[data-supplier-cancel-undo-delivery]');
    if (cancelUndoDelivery) {
      const actions = cancelUndoDelivery.closest('.supplier-completed-shipment-actions');
      const confirmation = cancelUndoDelivery.closest('[data-supplier-undo-delivery-confirmation]');
      const undoButton = actions?.querySelector('[data-supplier-undo-delivered]');
      if (confirmation) confirmation.hidden = true;
      if (undoButton) undoButton.hidden = false;
      setShipmentFeedback('');
      return;
    }
    const undoDeliveredButton = event.target.closest('[data-supplier-undo-delivered]');
    if (undoDeliveredButton) {
      const actions = undoDeliveredButton.closest('.supplier-completed-shipment-actions');
      const confirmation = actions?.querySelector('[data-supplier-undo-delivery-confirmation]');
      if (confirmation) {
        undoDeliveredButton.hidden = true;
        confirmation.hidden = false;
      }
      return;
    }
    const cancelReturnPickup = event.target.closest('[data-supplier-cancel-return-pickup]');
    if (cancelReturnPickup) {
      const confirmation = cancelReturnPickup.closest('[data-supplier-return-pickup-confirmation]');
      const returnButton = cancelReturnPickup.closest('.supplier-completed-shipment-actions')?.querySelector('[data-supplier-return-pickup]');
      if (confirmation) confirmation.hidden = true;
      if (returnButton) returnButton.hidden = false;
      return;
    }
    const returnPickupButton = event.target.closest('[data-supplier-return-pickup]');
    if (returnPickupButton) {
      const actions = returnPickupButton.closest('.supplier-completed-shipment-actions');
      const confirmation = actions?.querySelector('[data-supplier-return-pickup-confirmation]');
      if (confirmation) {
        returnPickupButton.hidden = true;
        confirmation.hidden = false;
      }
      return;
    }
    const confirmReturnPickupButton = event.target.closest('[data-supplier-confirm-return-pickup]');
    if (confirmReturnPickupButton) {
      const confirmation = confirmReturnPickupButton.closest('[data-supplier-return-pickup-confirmation]');
      const cancelButton = confirmation?.querySelector('[data-supplier-cancel-return-pickup]');
      confirmReturnPickupButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      setShipmentFeedback('Returning the parcel to Awaiting Pickup…');
      const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
        p_order_id: confirmReturnPickupButton.dataset.supplierConfirmReturnPickup,
        p_action: 'return_to_pickup',
        p_courier: '',
        p_tracking_number: '',
        p_tracking_url: '',
      });
      if (error) {
        confirmReturnPickupButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        setShipmentFeedback(error.message || 'The parcel could not be returned to Awaiting Pickup.', true);
        return;
      }
      setShipmentFeedback('The parcel is back in Awaiting Pickup.');
      try {
        await refreshSupplierPortal();
        packagingStatusFilter = 'awaiting_pickup';
        applyPackagingStatusFilter();
      } catch (refreshError) { setShipmentFeedback(refreshError.message || 'Status saved, but the order list could not refresh.', true); }
      return;
    }
    const confirmUndoButton = event.target.closest('[data-supplier-confirm-undo-delivered]');
    if (confirmUndoButton) {
      const confirmation = confirmUndoButton.closest('[data-supplier-undo-delivery-confirmation]');
      const cancelButton = confirmation?.querySelector('[data-supplier-cancel-undo-delivery]');
      confirmUndoButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      setShipmentFeedback('Reverting delivery status…');
      const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
        p_order_id: confirmUndoButton.dataset.supplierConfirmUndoDelivered,
        p_action: 'undo_delivered',
        p_courier: '',
        p_tracking_number: '',
        p_tracking_url: '',
      });
      if (error) {
        confirmUndoButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        setShipmentFeedback(error.message || 'Delivery status could not be reverted.', true);
        return;
      }
      setShipmentFeedback('The shipment status has been changed back to Shipped.');
      try { await refreshSupplierPortal(); }
      catch (refreshError) { setShipmentFeedback(refreshError.message || 'Shipment status saved, but the order list could not refresh.', true); }
      return;
    }
    const cancelDelivery = event.target.closest('[data-supplier-cancel-delivery]');
    if (cancelDelivery) {
      const confirmation = cancelDelivery.closest('[data-supplier-delivery-confirmation]');
      const markDeliveredButton = cancelDelivery.closest('.supplier-completed-shipment-actions')?.querySelector('[data-supplier-mark-delivered]');
      if (confirmation) confirmation.hidden = true;
      if (markDeliveredButton) markDeliveredButton.hidden = false;
      setShipmentFeedback('');
      return;
    }
    const markDeliveredButton = event.target.closest('[data-supplier-mark-delivered]');
    if (markDeliveredButton) {
      const actions = markDeliveredButton.closest('.supplier-completed-shipment-actions');
      const confirmation = actions?.querySelector('[data-supplier-delivery-confirmation]');
      if (confirmation) {
        markDeliveredButton.hidden = true;
        confirmation.hidden = false;
      }
      return;
    }
    const confirmDeliveryButton = event.target.closest('[data-supplier-confirm-delivered]');
    if (confirmDeliveryButton) {
      const confirmation = confirmDeliveryButton.closest('[data-supplier-delivery-confirmation]');
      const cancelButton = confirmation?.querySelector('[data-supplier-cancel-delivery]');
      confirmDeliveryButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      setShipmentFeedback('Updating delivery status…');
      const { error } = await supabase.rpc('update_marketplace_supplier_shipment', {
        p_order_id: confirmDeliveryButton.dataset.supplierConfirmDelivered,
        p_action: 'delivered',
        p_courier: '',
        p_tracking_number: '',
        p_tracking_url: '',
      });
      if (error) {
        confirmDeliveryButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        setShipmentFeedback(error.message || 'Delivery status could not be updated.', true);
        return;
      }
      setShipmentFeedback('The shipment has been marked as delivered.');
      try { await refreshSupplierPortal(); }
      catch (refreshError) { setShipmentFeedback(refreshError.message || 'Delivery status saved, but the order list could not refresh.', true); }
      return;
    }
    const editTrackingButton = event.target.closest('[data-supplier-edit-tracking]');
    if (editTrackingButton) {
      const orderCard = editTrackingButton.closest('.supplier-packaging-order');
      const form = orderCard?.querySelector('[data-shipment-action="edit_tracking"]');
      if (form) {
        trackingRefresh.open(form);
        form.hidden = false;
        editTrackingButton.hidden = true;
        form.elements.courier.focus();
      }
      return;
    }
    const cancelTrackingEdit = event.target.closest('[data-supplier-cancel-tracking-edit]');
    if (cancelTrackingEdit) {
      const form = cancelTrackingEdit.closest('[data-supplier-shipping-form]');
      if (form && !form.querySelector('[type="submit"]')?.disabled) {
        form.reset();
        if (form.dataset.shipmentAction === 'edit_tracking') form.hidden = true;
        trackingRefresh.close(form);
        const orderCard = form.closest('.supplier-packaging-order');
        const editButton = orderCard?.querySelector('[data-supplier-edit-tracking]');
        if (editButton) editButton.hidden = false;
        void refreshSupplierPortal().catch(() => {
          if (storeCurrent()) setShipmentFeedback('Tracking edit cancelled. Reload to refresh the order list.', true);
        });
      }
      return;
    }
  });
  if (storeRoot && (supplierForm || supplierProductListTarget || ordersTarget || packagingTarget)) {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.hidden = true;
    storeRoot.prepend(status);
    const report = (message) => {
      status.textContent = message;
      status.hidden = !message;
    };
    watchPortalData({
      client: supabase,
      root: storeRoot,
      tables: ['app_data', 'marketplace_item_returns', 'portal_notifications'],
      isCurrent: sessionCurrent,
      report,
      needsStockRefresh: () => Boolean(storeRoot.querySelector('[data-supplier-section="inventory"]:not([hidden])')),
      refresh: async (_groups, current) => {
        // Keep a submitted or open editor attached to its original baseline.
        if (storeRoot.querySelector('dialog[open]')) return;
        await refreshSupplierPortal();
        const inventory = storeRoot.querySelector('[data-supplier-section="inventory"]');
        if (current() && inventory && !inventory.hidden) await refreshWarehouseInventory?.(true);
        if (current()) report('');
      },
    });
  }

  const supplierOverview = document.querySelector('[data-marketplace-supplier-access-list]');
  const loadSupplierOverview = async () => {
    if (!supplierOverview) return;
    const { data, error } = await supabase.rpc('get_marketplace_supplier_accounts');
    if (error) throw error;
    if (!data?.length) { supplierOverview.innerHTML = '<p class="admin-market-empty">No store portal users are linked yet.</p>'; return; }
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
      const avatarUrl = account.avatar_path ? supabase.storage.from('supplier-profile-photos').getPublicUrl(account.avatar_path).data.publicUrl : 'Image/Other%20Image/Supplier%20Profile%20Picture.png';
      const linkedDate = entry.created_at ? new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date(entry.created_at)) : '—';
      const productList = summary.uniqueProducts.map((product) => {
        const variants = summary.supplierProducts.filter((item) => item.product.id === product.id);
        const sold = variants.reduce((total, item) => total + (summary.supplierItems.filter((line) => line.productId === product.id && line.variantId === item.variant.id).reduce((subtotal, line) => subtotal + (Number(line.quantity) || 0), 0)), 0);
        return `<li><span>${escapeHTML(product.name)} · ${escapeHTML(product.category || 'Other')}${product.productCode ? ` · ${escapeHTML(product.productCode)}` : ''}</span><small>${variants.map(({ variant }) => `${escapeHTML(variant.label || 'Variant')} · MYR ${Number(variant.price || 0).toFixed(2)}`).join(' / ')}</small><b>${sold} sold</b></li>`;
      }).join('');
      return `<details class="admin-supplier-overview-card"><summary><img class="admin-supplier-avatar" src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(entry.supplier_name)} profile photo" /><span class="admin-supplier-company">${escapeHTML(entry.supplier_name)}</span><span class="admin-supplier-email">${escapeHTML(account.email || 'Email unavailable')}</span></summary><div class="admin-supplier-overview-body"><div class="admin-supplier-user-details"><div><small>Name</small><strong>${escapeHTML(account.display_name || 'Name unavailable')}</strong></div><div><small>Email</small><strong>${escapeHTML(account.email || 'Email unavailable')}</strong></div><div><small>Phone</small><strong>${escapeHTML(phone || 'Phone unavailable')}</strong></div><div><small>Linked</small><strong>${escapeHTML(linkedDate)}</strong></div></div><div class="admin-supplier-sales-stats"><div><small>Paid sales</small><strong>MYR ${sales.toFixed(2)}</strong></div><div><small>Units sold</small><strong>${summary.supplierItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}</strong></div><div><small>Paid orders</small><strong>${new Set(summary.supplierItems.map((item) => item.orderId)).size}</strong></div><div><small>Products</small><strong>${summary.uniqueProducts.length}</strong></div></div><div class="admin-supplier-products"><h4>Products and sales</h4><ul>${productList || '<li>No products linked to this store name yet.</li>'}</ul></div></div></details>`;
    }).join('');
  };
  if (supplierOverview) void loadSupplierOverview().catch((error) => { supplierOverview.innerHTML = `<p class="admin-market-empty">Store details could not be loaded: ${escapeHTML(error.message || 'Supabase request failed')}</p>`; });

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
  const forms = document.querySelectorAll('[data-admin-banner-form]');
  if (!forms.length) return;
  const saveBanners = createSharedAppDataSaver(promotionStorageKey);
  const maximumImageSize = 2 * 1024 * 1024;
  const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  forms.forEach((form) => {
    const type = form.dataset.adminBannerForm;
    const bannerInput = form.querySelector('[data-promo-banner]');
    const mobileInput = form.querySelector('[data-promo-mobile-banner]');
    const preview = form.querySelector('[data-promo-preview]');
    const mobilePreview = form.querySelector('[data-promo-mobile-preview]');
    const feedback = form.querySelector('[data-admin-promo-feedback]');
    const previewUrls = new Map();
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
    const isAnnouncement = type === 'announcement';
    const banners = isAnnouncement ? loadAnnouncements() : loadPromotions();
    if (banners.length >= maximumPromotions) {
      feedback.textContent = `You can set up a maximum of ${maximumPromotions} ${isAnnouncement ? 'announcements' : 'promotions'}.`;
      feedback.classList.add('visible');
      return;
    }
    const destinationText = form.elements.destination.value.trim();
    const destination = destinationText ? normalizePromotionDestination(destinationText) : '';
    if (destinationText && !destination) {
      feedback.textContent = 'Enter an app route starting with # or a secure https:// URL.';
      feedback.classList.add('visible');
      return;
    }
    if (!isAnnouncement && !destination) {
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
      const banner = {
        id: `${isAnnouncement ? 'announcement' : 'promotion'}-${Date.now()}`,
        ...(isAnnouncement ? { type: 'announcement', details: form.elements.details.value.trim() } : {}),
        title: form.elements.title.value.trim(),
        destination,
        image,
        ...(mobileImage ? { mobileImage } : {}),
      };
      const allBanners = [...loadBannerRecords(), banner];
      await saveBanners(allBanners);
      void recordAdminAction(isAnnouncement ? 'announcement_uploaded' : 'promotion_uploaded', isAnnouncement ? 'announcement' : 'promotion', banner.id, { title: banner.title });
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      render();
    } catch (error) {
      feedback.textContent = error.message || 'The banner could not be processed or saved.';
      feedback.classList.add('visible');
    }
    });
  });

  document.querySelector('.admin-promotions-page, .admin-local-finder-page')?.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-delete-promotion], [data-delete-announcement]');
    if (!deleteButton) return;
    const isAnnouncement = deleteButton.hasAttribute('data-delete-announcement');
    const id = deleteButton.dataset.deleteAnnouncement || deleteButton.dataset.deletePromotion;
    const records = loadBannerRecords();
    const removed = records.find((item) => item.id === id);
    const remaining = records.filter((item) => item.id !== id);
    try { await saveBanners(remaining); }
    catch (error) { window.alert(error.message); return; }
    if (removed) void recordAdminAction(isAnnouncement ? 'announcement_removed' : 'promotion_removed', isAnnouncement ? 'announcement' : 'promotion', removed.id, { title: removed.title });
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
    const taxiFare = Number(form.elements.taxiFare?.value || 0);
    const taxiTotal = taxiOn && form.elements.taxiRouteMatched?.value === 'true' ? taxiFare * pets.length : 0;
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
    return { pet, pets, tier, packageItem, petPackages, packagePrice, daycareTotal, taxiTotal, taxiDistance, taxiFare, customAddOns, customAddOnTotal, total };
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
    const routeFare = petTaxiRouteFare(route, latestSettings);
    distanceInput.value = String(distanceKm);
    form.elements.taxiFare.value = String(routeFare);
    form.elements.taxiRouteMatched.value = String(Boolean(route));
    const petCount = Math.max(1, selectedPets().length);
    quote.innerHTML = route
      ? `<strong>Estimated taxi fare for ${petCount} pet${petCount === 1 ? '' : 's'}: ${money(routeFare * petCount)}</strong><span>${escapeHTML(route.city)} to ${escapeHTML(outlet)} · ${money(routeFare)} per one-way trip</span>`
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
    if (form.elements.includeTaxi.checked && (form.elements.taxiRouteMatched.value !== 'true' || !form.elements.taxiSchedule.value)) {
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
      includeTaxi: form.elements.includeTaxi.checked, pickup, dropoff, taxiDistance: quote.taxiDistance, taxiFare: quote.taxiFare, taxiTotal: quote.taxiTotal, taxiSchedule: form.elements.taxiSchedule.value,
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
          void refreshGroomingBookings(authData.user.id, 'customer').then(refreshSlots).catch((loadError) => console.error('Could not refresh grooming availability:', loadError));
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
          feedback.textContent = 'QR code scanned. Opening Current Order with the manual code filled in.';
          window.setTimeout(() => {
            if (dialog.open) dialog.close();
            window.location.hash = `#admin-current-order?code=${encodeURIComponent(manualCode)}`;
          }, 300);
          return true;
        },
      });
    } catch (error) {
      stopCamera();
      feedback.textContent = `${error.message} Opening the order page for manual code entry.`;
      window.setTimeout(() => { window.location.hash = '#admin-current-order'; }, 1400);
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
  let localFinderIndex = [];
  let localFinderIndexReady = false;
  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const localFinderIndexPromise = supabase
    ? supabase.from('local_finder_places').select('id,name,category,address,city,state,allowed_area,pet_allowed,pet_size,conditions').eq('status', 'approved').eq('is_hidden', false)
      .then(({ data, error }) => {
        if (error) { console.warn('Local Finder search results could not be loaded:', error.message); return []; }
        return data || [];
      }).catch((error) => { console.warn('Local Finder search results could not be loaded:', error.message); return []; })
    : Promise.resolve([]);
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
    const products = loadMarketplaceProducts().filter((product) => !product.hidden && !product.frozenByAdmin && product.variants?.some((variant) => !variant.frozen));
    const productMatches = products.map((product) => {
      const searchable = normalize([
        product.name, product.category, product.description, product.extraDescription,
        product.petTypes, product.suitableBreeds, product.issues, product.ingredients, product.nutrition, productAliases[product.id],
      ].filter(Boolean).join(' '));
      if (!searchable.includes(normalizedQuery)) return null;
      const isCookieSearch = normalize(productAliases[product.id]).includes(normalizedQuery) && /cookie|biscuit/.test(normalizedQuery);
      return {
        title: isCookieSearch ? `${query.trim()[0].toUpperCase()}${query.trim().slice(1)}` : product.name,
        detail: `${product.name} · Marketplace${product.category ? ` · ${product.category}` : ''}${product.variants.filter((variant) => !variant.frozen).every((variant) => Number(variant.stock) <= 0) ? ' · Out of stock' : ''}`,
        href: `#product?id=${encodeURIComponent(product.id)}`,
        searchText: searchable,
        selectedType: 'product',
        selectedKey: product.id,
      };
    }).filter(Boolean);
    const serviceMatches = serviceEntries.filter((entry) => normalize(`${entry.title} ${entry.detail} ${entry.keywords}`).includes(normalizedQuery)).map((entry) => ({ ...entry, searchText: normalize(`${entry.title} ${entry.detail} ${entry.keywords}`) }));
    const normalizedTerms = normalizedQuery.split(/\s+/).filter(Boolean);
    const placeMatches = localFinderIndexReady ? localFinderIndex.map((place) => {
      const searchText = normalize([place.name, place.address, place.city, place.state, place.allowed_area, place.pet_allowed, place.pet_size, place.conditions].filter(Boolean).join(' '));
      if (!normalizedTerms.every((term) => searchText.includes(term))) return null;
      const category = String(place.category || 'cafe').toLowerCase();
      return {
        title: place.name,
        detail: `${[place.city, place.state].filter(Boolean).join(', ') || place.address || 'Local Finder'} · Local Finder`,
        href: `#local-finder-place?category=${encodeURIComponent(category)}&id=${encodeURIComponent(place.id)}`,
        searchText,
        selectedType: 'local_finder',
        selectedKey: place.id,
      };
    }).filter(Boolean) : [];
    const allMatches = [...productMatches, ...serviceMatches, ...placeMatches].sort((a, b) => {
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

  void localFinderIndexPromise.then((places) => {
    localFinderIndex = places;
    localFinderIndexReady = true;
    if (input.value.trim()) renderResults(input.value);
  });

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
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!localFinderIndexReady) {
      localFinderIndex = await localFinderIndexPromise;
      localFinderIndexReady = true;
      renderResults(input.value);
    }
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

function fitHomeBalanceValues() {
  document.querySelectorAll('[data-fit-balance]').forEach((element) => {
    element.style.fontSize = '';
    let fontSize = Number.parseFloat(window.getComputedStyle(element).fontSize) || 12;
    const availableWidth = element.clientWidth || element.parentElement?.clientWidth || 0;
    if (!availableWidth) return;
    element.style.fontSize = `${fontSize}px`;
    while (element.scrollWidth > availableWidth + 1 && fontSize > 8) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;
    }
  });
}

function setupHomeBalanceValueFit() {
  window.requestAnimationFrame(fitHomeBalanceValues);
  if (window.furgoHomeBalanceFitResizeInstalled) return;
  window.addEventListener('resize', () => window.requestAnimationFrame(fitHomeBalanceValues));
  document.addEventListener('furgo-coins-balance-updated', () => window.requestAnimationFrame(fitHomeBalanceValues));
  window.furgoHomeBalanceFitResizeInstalled = true;
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
  setupHomeBalanceValueFit();
  setupHomeShortcutLiveRefresh();
  setupPetOverviewMedia();
  setupPetAvatarPage();
  setupPetProfileSwipe();
  setupPetProfileDelete();
  setupPetProfileForm();
  setupPetVaccinationPage();
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
  setupTokensPage(supabase);
  void refreshFurgoCoinBalance(supabase);
  setupAdminAccess();
  setupAdminSuppliers();
  void setupSellerPortal();
  setupAdminSellerManagement();
  void setupAdminSellerPayoutFee();
  setupAdminFeeRules();
  setupAdminCoinExchange();
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
  setupPetAssistant(supabase);
  setupAiNutritionist(supabase);
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
    if (profile.role === 'customer') saveCustomerRecord(profile);
    message.textContent = 'Your name has been updated.';
    message.classList.add('visible');
    if (window.location.hash.split('?')[0] === '#edit-profile') {
      const returnTo = new URLSearchParams(window.location.hash.split('?')[1] || '').get('from');
      window.setTimeout(() => { window.location.hash = ['admin', 'admin-access', 'driver'].includes(returnTo) ? `#${returnTo}` : returnTo === 'home' ? '#home' : '#profile'; }, 450);
    }
  });

  // Password changes are shared by customer, admin, driver, and store profile screens.
  document.querySelectorAll('[data-change-password-form]').forEach((passwordForm) => {
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!passwordForm.reportValidity()) return;
      const currentPassword = passwordForm.elements.currentPassword.value;
      const newPassword = passwordForm.elements.newPassword.value;
      const confirmPassword = passwordForm.elements.confirmPassword.value;
      const feedback = passwordForm.querySelector('[data-password-feedback], .form-feedback');
      const submit = passwordForm.querySelector('[type="submit"]');
      if (newPassword !== confirmPassword) {
        feedback.textContent = 'The new passwords do not match.';
        feedback.classList.add('visible');
        return;
      }
      submit.disabled = true;
      feedback.textContent = 'Updating password…';
      feedback.classList.add('visible');
      try {
        const { data: authData, error: userError } = await supabase.auth.getUser();
        if (userError || !authData.user?.email) throw new Error('Your account email could not be verified. Sign in again and retry.');
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email: authData.user.email, password: currentPassword });
        if (verifyError) throw new Error('Current password is incorrect.');
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        passwordForm.reset();
        feedback.textContent = 'Your password has been updated.';
      } catch (error) {
        feedback.textContent = error.message || friendlyAuthError(error);
      } finally {
        submit.disabled = false;
      }
    });
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

  // Saves, edits, and removes delivery addresses in browser storage for the customer portal prototype.
  const addressForm = document.querySelector('[data-address-form]');
  addressForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!addressForm.reportValidity()) return;
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    const address = Object.fromEntries(new FormData(addressForm).entries());
    const editIndex = address.editIndex === '' ? -1 : Number(address.editIndex);
    delete address.editIndex;
    if (Number.isInteger(editIndex) && editIndex >= 0 && editIndex < addresses.length) {
      address.isDefault = addresses[editIndex].isDefault === true;
      addresses[editIndex] = address;
    } else {
      if (!addresses.length) address.isDefault = true;
      addresses.push(address);
    }
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    render({ preserveScroll: editIndex >= 0 });
  });
  document.querySelectorAll('[data-edit-address]').forEach((button) => button.addEventListener('click', () => {
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    const index = Number(button.dataset.editAddress);
    const address = addresses[index];
    if (!address) return;
    addressForm.elements.editIndex.value = String(index);
    ['label', 'name', 'phone', 'postcode', 'street', 'city', 'state'].forEach((key) => {
      addressForm.elements[key].value = address[key] || '';
    });
    addressForm.querySelector('[data-address-form-title]').textContent = 'Edit Address';
    addressForm.querySelector('[type="submit"]').textContent = 'Save Changes';
    addressForm.querySelector('[data-cancel-address-edit]').hidden = false;
    addressForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addressForm.elements.label.focus({ preventScroll: true });
  }));
  document.querySelector('[data-cancel-address-edit]')?.addEventListener('click', () => {
    addressForm.reset();
    addressForm.elements.editIndex.value = '';
    addressForm.querySelector('[data-address-form-title]').textContent = 'Add A New Address';
    addressForm.querySelector('[type="submit"]').textContent = 'Save Address';
    addressForm.querySelector('[data-cancel-address-edit]').hidden = true;
  });
  document.querySelectorAll('[data-default-address]').forEach((button) => button.addEventListener('click', () => {
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    addresses.forEach((address, index) => { address.isDefault = index === Number(button.dataset.defaultAddress); });
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    render({ preserveScroll: true });
  }));
  const addressDeleteDialog = document.querySelector('[data-address-delete-dialog]');
  let pendingAddressRemoval = null;
  document.querySelectorAll('[data-remove-address]').forEach((button) => button.addEventListener('click', () => {
    pendingAddressRemoval = Number(button.dataset.removeAddress);
    addressDeleteDialog?.showModal();
  }));
  document.querySelector('[data-cancel-address-delete]')?.addEventListener('click', () => {
    pendingAddressRemoval = null;
    addressDeleteDialog?.close();
  });
  document.querySelector('[data-confirm-address-delete]')?.addEventListener('click', () => {
    if (!Number.isInteger(pendingAddressRemoval)) return;
    const addresses = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    const defaultIndex = Math.max(0, addresses.findIndex((address) => address.isDefault === true));
    const removedIndex = pendingAddressRemoval;
    if (removedIndex < 0 || removedIndex >= addresses.length) return;
    addresses.splice(removedIndex, 1);
    if (removedIndex === defaultIndex && addresses.length) addresses.forEach((address, index) => { address.isDefault = index === 0; });
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    pendingAddressRemoval = null;
    addressDeleteDialog?.close();
    render();
  });

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
    stopCloudAppData();
    void supabase.auth.signOut().finally(() => {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-customer-portal-view');
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
          : identity.role === 'supplier' ? 'Store sign-in successful. Opening the Marketplace Store Portal…'
          : identity.role === 'seller' ? 'Seller sign-in successful. Opening the Seller Portal…'
          : identity.role === 'driver' ? 'Driver sign-in successful. Opening the Driver Portal…'
            : 'Sign-in successful. Opening your Furgo home…';
      window.setTimeout(() => { window.location.hash = ['director', 'manager', 'executive'].includes(identity.role) ? '#admin' : identity.role === 'seller' ? '#seller-portal' : identity.role === 'supplier' ? '#supplier' : identity.role === 'driver' ? '#driver' : '#home'; }, 500);
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
async function render({ preserveScroll = false } = {}) {
  if (!supabaseAuthReady) return;
  const previousScrollY = window.scrollY;
  const requestedHash = window.location.hash;
  const shouldPreserveScroll = preserveScroll || requestedHash === lastRenderedHash;
  const requestedPage = requestedHash.slice(1).split('?')[0];
  if (['grooming', 'hotel', 'daycare', 'admin-access', 'admin-outlets', 'admin-users', 'admin-suppliers', 'admin-grooming', 'admin-hotel', 'admin-daycare', 'admin-pet-taxi'].includes(requestedPage)) {
    await refreshSharedOutlets();
    if (window.location.hash !== requestedHash) return render();
  }
  const [routeName = '', routeQuery = ''] = window.location.hash.slice(1).split('?');
  const page = routeName || 'home';
  const routeParams = new URLSearchParams(routeQuery);
  if (page === 'home' && routeParams.get('portal') === 'customer') sessionStorage.setItem('furgo-customer-portal-view', 'true');
  if (['supplier', 'seller-portal', 'driver', 'admin', 'admin-orders', 'admin-current-order', 'admin-access', 'admin-enquiries', 'admin-audit', 'admin-customers', 'admin-product-insights', 'admin-home-mvp', 'admin-outlets', 'admin-users', 'admin-suppliers', 'admin-seller-management', 'admin-seller-payout-fee', 'admin-fee-rules', 'admin-coin-exchange', 'admin-promotions', 'admin-pet-taxi', 'admin-marketplace-manage', 'admin-marketplace-products', 'admin-local-finder', 'admin-marketplace', 'admin-grooming', 'admin-hotel', 'admin-daycare', 'login'].includes(page)) sessionStorage.removeItem('furgo-customer-portal-view');
  const isCustomerPortalView = sessionStorage.getItem('furgo-customer-portal-view') === 'true';
  const hasDemoSession = sessionStorage.getItem('furgo-demo-auth') === 'true';
  if (hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'customer') {
    try {
      const currentCustomer = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
      saveCustomerRecord(currentCustomer);
    } catch { /* Keep the current page usable if local demo profile data is malformed. */ }
  }
  const directorPages = ['admin-customers', 'admin-product-insights', 'admin-home-mvp', 'admin-outlets', 'admin-users', 'admin-suppliers', 'admin-seller-management', 'admin-seller-payout-fee', 'admin-fee-rules'];
  const managerPages = ['admin-promotions', 'admin-pet-taxi', 'admin-marketplace-manage', 'admin-marketplace-products', 'admin-local-finder', 'admin-coin-exchange'];
  const serviceAdminPages = ['admin-marketplace', 'admin-grooming', 'admin-hotel', 'admin-daycare'];
  const portalPages = ['admin', 'admin-orders', 'admin-current-order', 'admin-access', 'admin-enquiries', 'admin-audit', ...managerPages, ...serviceAdminPages, ...directorPages];
  const supplierPages = ['supplier', 'supplier-product-edit'];
  const sellerPages = ['seller-portal'];
  const driverPages = ['driver'];
  const savedRole = sessionStorage.getItem('furgo-demo-user-role');
  const currentRole = savedRole === 'staff' ? 'executive' : savedRole === 'admin' ? 'director' : savedRole;
  let directorStoreContext = null;
  try { directorStoreContext = JSON.parse(sessionStorage.getItem('furgo-director-store-context') || 'null'); } catch { directorStoreContext = null; }
  const hasDirectorStoreContext = currentRole === 'director' && Boolean(directorStoreContext?.storeName);
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
  if (page === 'admin-coin-exchange' && !['manager', 'director'].includes(currentRole)) {
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
  if (supplierPages.includes(page) && (!hasDemoSession || (currentRole !== 'supplier' && !(currentRole === 'director' && hasDirectorStoreContext)))) {
    window.location.hash = '#login';
    return;
  }
  if (sellerPages.includes(page) && (!hasDemoSession || currentRole !== 'seller')) {
    window.location.hash = hasDemoSession ? (currentRole === 'director' ? '#admin' : currentRole === 'supplier' ? '#supplier' : '#home') : '#login';
    return;
  }
  if (hasDemoSession && currentRole === 'seller' && !sellerPages.includes(page) && !['login', 'change-password'].includes(page)) {
    window.location.hash = '#seller-portal';
    return;
  }
  if (hasDemoSession && currentRole === 'supplier' && !isCustomerPortalView && !supplierPages.includes(page) && !['login', 'notification-settings', 'change-password'].includes(page)) {
    window.location.hash = '#supplier';
    return;
  }
  if (page === 'notification-settings' && !hasDemoSession) {
    window.location.hash = '#login';
    return;
  }
  if (driverPages.includes(page) && (!hasDemoSession || sessionStorage.getItem('furgo-demo-user-role') !== 'driver')) {
    window.location.hash = '#login';
    return;
  }
  const protectedPages = ['home', 'search', 'services', 'about', 'profile', 'edit-profile', 'change-password', 'help-center', 'feedback', 'pet-profile', 'pet-profile-edit', 'pet-reminder', 'pet-vaccination', 'pet-record', 'pet-data', 'pet-avatar', 'pet-assistant', 'ai-nutritionist', 'address', 'payment-method', 'credit', 'tokens', 'marketplace', 'local-finder', 'local-finder-list', 'local-finder-search', 'local-finder-place', 'local-finder-favourites', 'product', 'seller', 'cart', 'checkout', 'orders', 'check-in', 'favourites', 'subscriptions', 'grooming', 'grooming-orders', 'hotel', 'daycare', 'seller-portal'];
  const driverAllowedPages = ['driver', 'profile', 'edit-profile', 'change-password', 'help-center', 'feedback', 'notification-settings', 'login'];
  if (hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'driver' && !isCustomerPortalView && !driverAllowedPages.includes(page)) {
    window.location.hash = '#driver';
    return;
  }
  if (protectedPages.includes(page) && hasDemoSession && sessionStorage.getItem('furgo-demo-user-role') === 'customer') {
    let customerProfile = {};
    try { customerProfile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { customerProfile = {}; }
    if (getCustomerAccountStatus(customerProfile) === 'Blacklisted') {
      sessionStorage.removeItem('furgo-demo-auth');
      sessionStorage.removeItem('furgo-customer-portal-view');
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
    'notification-settings': () => notificationSettingsPage(routeParams.get('from') || ''),
    'edit-profile': () => editProfilePage(routeParams.get('from') || 'profile'),
    'change-password': () => changePasswordPage(routeParams.get('from') || 'profile'),
    'help-center': () => helpCenterPage(routeParams.get('from') || 'profile'),
    feedback: () => feedbackPage(routeParams.get('from') || 'profile', routeParams.get('return') || 'profile'),
    address: () => addressPage(routeParams.get('from') || 'profile'),
    'payment-method': () => paymentMethodPage(routeParams.get('from') || 'profile'),
    credit: () => creditPage(routeParams.get('from') || 'profile'),
    tokens: tokensPage,
    'coin-topup': coinTopupPage,
    marketplace: () => marketplacePage(routeParams.get('category') || 'All'),
    'local-finder': localFinderPage,
    'local-finder-list': () => localFinderListPage(routeParams),
    'local-finder-search': () => localFinderSearchPage(routeParams),
    'local-finder-place': () => localFinderPlacePage(routeParams),
    'local-finder-favourites': localFinderFavoritesPage,
    'admin-local-finder': () => adminLocalFinderPage(routeParams),
    favourites: marketplaceFavoritesPage,
    subscriptions: marketplaceSubscriptionsPage,
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
    'pet-profile': () => routeParams.get('mode') === 'add-card' ? petProfileAddCardPage() : routeParams.get('mode') === 'add' || !routeParams.get('id') ? petProfileEditPage({ petId: '', mode: 'add', returnTo: routeParams.get('from') || 'home' }) : petProfileOverviewPage(routeParams.get('id')),
    'pet-profile-edit': () => petProfileEditPage({ petId: routeParams.get('id') || '', returnTo: routeParams.get('from') || 'pet-profile' }),
    'pet-reminder': () => petReminderPage(routeParams.get('id') || ''),
    'pet-vaccination': () => petVaccinationPage(routeParams.get('id') || ''),
    'pet-record': () => petRecordPage(routeParams.get('id') || ''),
    'pet-data': () => petDataPage(routeParams.get('id') || ''),
    'pet-avatar': () => petAvatarPage(routeParams.get('id') || ''),
    'pet-assistant': () => petAssistantPage(routeParams.get('pet') || ''),
    'ai-nutritionist': aiNutritionistPage,
    admin: adminPortalPage,
    'admin-orders': () => adminOrdersPage(routeParams),
    'admin-current-order': () => adminCurrentOrderPage(routeParams),
    'admin-promotions': adminPromotionsPage,
    'admin-marketplace': adminMarketplacePage,
    'admin-marketplace-manage': adminMarketplaceManagePage,
    'admin-marketplace-products': adminMarketplaceProductsPage,
    supplier: () => marketplaceSupplierPage(routeParams),
    'supplier-product-edit': () => marketplaceSupplierProductEditPage(routeParams),
    'admin-grooming': () => adminGroomingPage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-hotel': () => adminHotelPage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-daycare': () => adminDaycarePage({ settingsOnly: routeParams.get('manage') === '1', stage: routeParams.get('stage') || 'new' }),
    'admin-pet-taxi': adminPetTaxiPage,
    'admin-enquiries': adminEnquiriesPage,
    'admin-customers': () => adminCustomersPage(routeParams),
    'admin-access': adminAccessPage,
    'admin-home-mvp': adminHomeMvpPage,
    'admin-outlets': () => adminAccessPage('outlets'),
    'admin-users': () => adminAccessPage('team'),
    'admin-suppliers': adminSuppliersPage,
    'admin-seller-management': adminSellerManagementPage,
    'admin-seller-payout-fee': () => adminSellerPayoutFeePage(routeParams),
    'admin-fee-rules': adminFeeRulesPage,
    'seller-portal': () => sellerPortalPage(routeParams),
    'admin-coin-exchange': adminCoinExchangePage,
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
    'notification-settings': 'Notification — Furgo',
    'edit-profile': 'Edit Profile — Furgo',
    'change-password': 'Change Password — Furgo',
    'help-center': 'Help Center — Furgo',
    feedback: 'Share Feedback — Furgo',
    address: 'Address — Furgo',
    'payment-method': 'Payment Method — Furgo',
    credit: 'My Furgo Credit — Furgo',
    tokens: 'Furgo Coins — Furgo',
    marketplace: 'Marketplace — Furgo',
    'local-finder': 'Local Finder — Furgo',
    'local-finder-list': 'Nearby Places — Furgo',
    'local-finder-search': 'Search Places — Furgo',
    'local-finder-place': 'Place Details — Furgo',
    'local-finder-favourites': 'Favourite Places — Furgo',
    'admin-local-finder': 'Local Finder Management — Furgo Admin',
    favourites: 'My Favourites — Furgo',
    subscriptions: 'Subscriptions — Furgo',
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
    'pet-profile-edit': 'Edit Pet Profile — Furgo',
    'pet-avatar': 'This Pet Avatar — Furgo',
    'pet-reminder': 'Pet Reminder — Furgo',
    'pet-vaccination': 'Pet Vaccination — Furgo',
    'pet-record': 'Daily Care — Furgo',
    'pet-data': 'Pet Data — Furgo',
    'pet-assistant': 'Pet Assistant — Furgo',
    'ai-nutritionist': 'AI Nutritionist — Furgo',
    admin: 'Admin Portal — Furgo',
    'admin-orders': 'Furgo Order — Furgo Admin',
    'admin-current-order': 'Current Order — Furgo Admin',
    'admin-promotions': 'Manage Promotions — Furgo Admin',
    'admin-marketplace': 'Marketplace — Furgo Admin',
    'admin-marketplace-manage': 'Manage Marketplace — Furgo Admin',
    'admin-marketplace-products': 'Product And Store Mapping — Furgo Admin',
    supplier: 'Marketplace Store Portal — Furgo',
    'admin-grooming': 'Grooming — Furgo Admin',
    'admin-hotel': 'Pet Hotel — Furgo Admin',
    'admin-daycare': 'Pet Daycare — Furgo Admin',
    'admin-pet-taxi': 'Manage Pet Taxi — Furgo Admin',
    'admin-enquiries': 'Customer Enquiries — Furgo Admin',
    'admin-customers': 'Customer Profiles — Furgo Admin',
    'admin-access': 'Admin Access — Furgo',
    'admin-home-mvp': 'Manage Home MVP — Furgo Admin',
    'admin-outlets': 'Manage Outlets — Furgo Admin',
    'admin-users': 'Manage Admin — Furgo Admin',
    'admin-suppliers': 'Manage Store — Furgo Admin',
    'admin-seller-management': 'Manage Marketplace Sellers — Furgo Admin',
    'admin-seller-payout-fee': 'Payout & Fee — Furgo Admin',
    'admin-fee-rules': 'Manage Fee & Payout — Furgo Admin',
    'seller-portal': 'Seller Portal — Furgo',
    'admin-coin-exchange': 'Manage Coin Exchange — Furgo Admin',
    'coin-topup': 'Top Up Furgo Coins — Furgo',
    'admin-audit': 'Activity Log — Furgo',
    'admin-product-insights': 'Product & Service Insights — Furgo Admin',
    driver: 'Driver Portal — Furgo Pet Taxi',
  };
  let adminCatalogLoadMessage = '';
  if (page === 'admin-marketplace-products' && hasDemoSession && ['executive', 'manager', 'director'].includes(currentRole)) {
    const { data: cloudCatalog, error: cloudCatalogError } = await supabase
      .from('app_data')
      .select('payload')
      .eq('record_id', 'shared:furgo-demo-marketplace-products:shared')
      .maybeSingle();
    if (cloudCatalogError) {
      adminCatalogLoadMessage = `Latest Marketplace catalog could not be loaded from Supabase: ${cloudCatalogError.message}`;
      console.warn(adminCatalogLoadMessage);
    } else if (Array.isArray(cloudCatalog?.payload)) {
      // This route is already rendering immediately after the fetch; emitting
      // the cache helper's storage event here would recursively call render().
      cacheSyncedRecords(marketplaceProductsKey, cloudCatalog.payload, { notify: false });
    } else {
      adminCatalogLoadMessage = 'Supabase returned no shared Marketplace catalog. Products published in the Store Portal may not have synced to the shared catalog yet.';
      console.warn(adminCatalogLoadMessage);
    }
  }
  const renderPage = pageRenderers[page] || homePage;
  document.title = titles[page] || titles.home;
  stopPortalRecovery();
  document.querySelector('#app').innerHTML = page === 'admin-marketplace-products'
    ? adminMarketplaceProductsPage(adminCatalogLoadMessage)
    : renderPage();
  if (['executive', 'manager', 'director'].includes(currentRole) && isCustomerPortalView && !portalPages.includes(page) && !supplierPages.includes(page) && !driverPages.includes(page) && !['notification-settings', 'change-password'].includes(page)) {
    let adminProfile = {};
    try { adminProfile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { adminProfile = {}; }
    const adminName = adminProfile.name || adminProfile.email || 'Admin';
    document.querySelector('#app').insertAdjacentHTML('afterbegin', `<header class="admin-portal-header admin-customer-view-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(adminName)}</span><a class="admin-customer-portal-link" href="#admin">Open Admin Portal</a></div></header>`);
  }
  // Keep the Admin Portal navigation consistent across dashboard and management pages.
  if (portalPages.includes(page)) document.querySelector('#app').insertAdjacentHTML('beforeend', adminBottomNavigation(page === 'admin' ? 'admin' : page === 'admin-current-order' ? 'orders' : page === 'admin-enquiries' ? 'enquiries' : page === 'admin-access' ? 'admin-access' : '', currentRole));
  if (page === 'notification-settings' || page === 'change-password') {
    if (['executive', 'manager', 'director'].includes(currentRole)) document.querySelector('#app').insertAdjacentHTML('beforeend', adminBottomNavigation('admin-access', currentRole));
    else if (currentRole === 'supplier') document.querySelector('#app').insertAdjacentHTML('beforeend', '<nav class="bottom-nav supplier-bottom-nav" aria-label="Store Portal navigation"><a class="bottom-item" href="#supplier?tab=home"><img src="Image/Icon/Icon-01.png" alt="" /><span>Home</span></a><a class="bottom-item" href="#supplier?tab=packaging"><img src="Image/Icon/Icon-23.png" alt="" /><span>Pack &amp; Ship</span></a><a class="bottom-item" href="#supplier?tab=inventory"><img src="Image/Icon/Icon-25.png" alt="" /><span>Inventory</span></a><a class="bottom-item active" href="#supplier?tab=profile"><img src="Image/Icon/Icon-08.png" alt="" /><span>Profile</span></a></nav>');
    else if (currentRole === 'seller') document.querySelector('#app').insertAdjacentHTML('beforeend', '<nav class="bottom-nav supplier-bottom-nav seller-bottom-nav" aria-label="Seller Portal navigation"><a class="bottom-item" href="#seller-portal?section=overview"><img src="Image/Icon/Icon-01.png" alt=""/><span>Home</span></a><a class="bottom-item" href="#seller-portal?section=products"><img src="Image/Icon/Icon-23.png" alt=""/><span>My Products</span></a><a class="bottom-item" href="#seller-portal?section=inventory"><img src="Image/Icon/Icon-25.png" alt=""/><span>Inventory</span></a><a class="bottom-item active" href="#seller-portal?section=profile"><img src="Image/Icon/Icon-08.png" alt=""/><span>My Profile</span></a></nav>');
    else if (currentRole === 'driver') document.querySelector('#app').insertAdjacentHTML('beforeend', driverBottomNavigation('profile'));
    else document.querySelector('#app').insertAdjacentHTML('beforeend', bottomNavigation('profile', (file) => `Image/Icon/${encodeURIComponent(file)}`));
  }
  if (currentRole === 'driver' && ['driver', 'profile', 'help-center', 'feedback'].includes(page)) {
    const active = page === 'driver' ? (routeParams.get('view') === 'orders' ? 'orders' : 'driver') : page === 'profile' ? 'profile' : ['help-center', 'feedback'].includes(page) ? 'help' : '';
    document.querySelector('#app').insertAdjacentHTML('beforeend', driverBottomNavigation(active));
  }
  if (page === 'login' || page === 'register') recordOnboardingEvent('auth_portal_opened', page);
  if (page === 'register' && sessionStorage.getItem('furgo-demo-registration-started') !== 'true') {
    recordOnboardingEvent('registration_started', 'phone_direct');
    sessionStorage.setItem('furgo-demo-registration-started', 'true');
  }
  wireForms();
  setupPetCarePages();
  lastRenderedHash = requestedHash;
  window.scrollTo(0, shouldPreserveScroll ? previousScrollY : 0);
  if (page === 'pet-profile' && routeParams.get('section') === 'settings') {
    window.requestAnimationFrame(() => document.querySelector('.pet-profile-page .pet-care-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  if (page === 'pet-profile-edit' && routeParams.get('section') === 'weight') {
    window.requestAnimationFrame(() => document.getElementById('pet-weight-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  if (page === 'pet-data') {
    const dataSectionIds = { service: 'pet-data-service', weight: 'pet-data-weight', vaccination: 'pet-data-vaccination', medicine: 'pet-data-medicine', intake: 'pet-data-intake', exercise: 'pet-data-exercise' };
    const target = dataSectionIds[routeParams.get('section') || ''];
    if (target) window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  if (page === 'pet-record') {
    const recordSectionIds = { intake: 'pet-record-intake', medicine: 'pet-record-medicine', exercise: 'pet-record-exercise' };
    const target = recordSectionIds[routeParams.get('section') || ''];
    if (target) window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  if (page === 'admin-current-order' && routeParams.has('code')) {
    window.requestAnimationFrame(() => document.querySelector('.admin-checkin-scan-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  if (page === 'driver' && routeParams.get('view') === 'orders') {
    window.requestAnimationFrame(() => document.querySelector('#driver-trips')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

// Shows the Furgo brand splash briefly before the initial route.
let splashTimer;
let lastRenderedHash = null;
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
  if (event.key === 'furgo-service-outlet-directory' || /furgo-demo-(grooming-bookings|hotel-bookings|hotel-settings|pet-hotel-bookings|daycare-bookings|daycare-settings|pet-daycare-bookings|daycare-orders|check-in-tokens|driver-locations|customer-records|help-center-details|support-requests|marketplace-orders|marketplace-products|marketplace-offers|promotions|service-banners|marketplace-cart|marketplace-subscription-cart|marketplace-favorites|local-finder-favorites|addresses|payment-methods|credit-balance|credit-transactions|daycare-passes)/.test(event.key || '')) render();
});

window.addEventListener('furgo-sync-status', (event) => {
  const status = document.querySelector('#furgo-sync-status');
  status.textContent = event.detail || '';
  status.hidden = !event.detail;
});
window.addEventListener('furgo-cloud-reconciled', () => {
  if (!document.querySelector('.supplier-portal-page, [data-seller-portal], dialog[open]')
      && !document.activeElement?.matches('input, select, textarea, [contenteditable="true"]')) void render();
});
supabase.auth.onAuthStateChange((event, session) => {
  const switched = session?.user && activeSupabaseUserId && session.user.id !== activeSupabaseUserId;
  if (event !== 'SIGNED_OUT' && !switched) return;
  activeSupabaseUserId = '';
  sessionRestoreAttempt += 1;
  stopCloudAppData();
  reportSyncIssue('');
  for (const key of ['furgo-demo-auth', 'furgo-demo-user-profile', 'furgo-demo-user-role', 'furgo-demo-profile-complete', 'furgo-director-store-context', 'furgo-customer-portal-view']) {
    sessionStorage.removeItem(key);
  }
  document.querySelector('#app').replaceChildren();
  window.setTimeout(() => {
    if (switched) void initializeSupabaseSession();
    else { window.location.hash = '#login'; void render(); }
  }, 0);
});
void initializeSupabaseSession();
