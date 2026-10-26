// Keeps daycare catalog, capacity, pass, and booking records in the local prototype store.
import { getSharedOutletNames } from './outlet-directory.js';
export const daycareSettingsKey = 'furgo-demo-daycare-settings';
export const daycareBookingsKey = 'furgo-demo-daycare-bookings';
export const daycarePassesKey = 'furgo-demo-daycare-passes';

const defaultDaycareSettings = {
  serviceName: 'Furgo Pet Daycare',
  serviceDescription: 'A supervised, comfortable daycare stay with flexible hourly and full-day booking options.',
  outlets: ['Furgo Pet Care - Petaling Jaya'],
  openingTime: '09:00',
  closingTime: '18:00',
  capacity: 12,
  smallMaxKg: 10,
  mediumMaxKg: 25,
  hourlyRates: { small: 12, medium: 18, large: 25 },
  dailyRates: { small: 65, medium: 90, large: 120 },
  bookingHorizonDays: 90,
  closedDates: [],
  passes: [
    { id: 'pass-5', name: '5-Day Pass', sessions: 5, bonusSessions: 0, validityDays: 90, price: 280, active: true, description: 'Five daycare visits to use within 90 days.' },
    { id: 'pass-10', name: '10-Day Pass', sessions: 10, bonusSessions: 2, validityDays: 180, price: 520, active: true, description: 'Ten visits plus two bonus sessions, valid for 180 days.' },
    { id: 'pass-monthly', name: 'Monthly Unlimited', sessions: 30, bonusSessions: 0, validityDays: 30, price: 720, active: true, description: 'Up to 30 visits within 30 days.' },
  ],
  addOns: [
    { id: 'feeding', name: 'Extra feeding', description: 'Additional meal service during the visit.', price: 8, active: true },
    { id: 'medication', name: 'Medication administration', description: 'Staff administers owner-provided medication as instructed.', price: 12, active: true },
    { id: 'playtime', name: 'Interactive playtime', description: 'A dedicated one-to-one play session.', price: 15, active: true },
    { id: 'paws', name: 'Paws cleaning', description: 'Paw wash and gentle drying before pickup.', price: 10, active: true },
  ],
  taxiBaseFare: 10,
  taxiPerKm: 2.5,
  taxiRoutes: [{ city: 'Petaling Jaya', distanceKm: 8 }, { city: 'Kuala Lumpur', distanceKm: 18 }, { city: 'Subang Jaya', distanceKm: 12 }],
  voucher: { code: 'DAYCARE10', type: 'percent', value: 10, minimumSpend: 50, enabled: true },
};

// Reads settings with safe defaults so an incomplete localStorage record does not break the page.
export function loadDaycareSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(daycareSettingsKey) || 'null');
    if (!saved || typeof saved !== 'object') return structuredClone(defaultDaycareSettings);
    return {
      ...structuredClone(defaultDaycareSettings), ...saved,
      hourlyRates: { ...defaultDaycareSettings.hourlyRates, ...(saved.hourlyRates || {}) },
      dailyRates: { ...defaultDaycareSettings.dailyRates, ...(saved.dailyRates || {}) },
      voucher: { ...defaultDaycareSettings.voucher, ...(saved.voucher || {}) },
      passes: Array.isArray(saved.passes) ? saved.passes : structuredClone(defaultDaycareSettings.passes),
      addOns: Array.isArray(saved.addOns) ? saved.addOns : structuredClone(defaultDaycareSettings.addOns),
      outlets: getSharedOutletNames([...defaultDaycareSettings.outlets]),
      closedDates: Array.isArray(saved.closedDates) ? saved.closedDates : [],
      taxiRoutes: Array.isArray(saved.taxiRoutes) ? saved.taxiRoutes : [...defaultDaycareSettings.taxiRoutes],
    };
  } catch { return structuredClone(defaultDaycareSettings); }
}

// Provides a normalized list of daycare bookings, accepting older prototype key names.
export function loadDaycareBookings() {
  try { const records = JSON.parse(localStorage.getItem(daycareBookingsKey) || '[]'); return Array.isArray(records) ? records : []; }
  catch { return []; }
}

// Loads daycare pass balances for the currently signed-in customer.
export function loadDaycarePasses() {
  try { const records = JSON.parse(localStorage.getItem(daycarePassesKey) || '[]'); return Array.isArray(records) ? records : []; }
  catch { return []; }
}

// Matches pet weight to the same small, medium, and large pricing bands used by service modules.
export function daycareWeightTier(weight, settings = loadDaycareSettings()) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= Number(settings.smallMaxKg)) return 'small';
  if (value <= Number(settings.mediumMaxKg)) return 'medium';
  return 'large';
}

// Counts bookings against daily capacity while excluding cancelled and completed visits.
export function daycareOccupancy(date, bookings = loadDaycareBookings()) {
  return bookings.filter((booking) => booking.date === date && !/cancel|complete|checked out/i.test(String(booking.status || ''))).length;
}
