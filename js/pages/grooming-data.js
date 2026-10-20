// Shared grooming booking records and outlet pricing used by customer and Admin Portal views.
export const groomingSettingsKey = 'furgo-demo-grooming-settings';
export const groomingBookingsKey = 'furgo-demo-grooming-bookings';

export const defaultGroomingSettings = {
  outlets: ['Furgo Pet Care - Petaling Jaya', 'Furgo Pet Care - Bangsar'],
  timeSlots: ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00'],
  bookingHorizonDays: 60,
  availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
  closedDates: [],
  slotCapacity: 1,
  smallMaxKg: 10,
  mediumMaxKg: 25,
  daycareHourlyRate: 12,
  taxiBaseFare: 8,
  taxiPerKm: 2.2,
  taxiScheduleSlots: ['09:00', '12:00', '15:00'],
  // Demo route estimates use a saved address city and selected outlet; Admin can edit these values.
  taxiRouteEstimates: [
    { city: 'Petaling Jaya', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 8 },
    { city: 'Bangsar', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 6 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 10 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 16 },
  ],
  voucher: { code: 'GROOM10', type: 'percent', value: 10, minimumSpend: 50, enabled: true },
  packages: [
    { id: 'bath-brush', name: 'Basic Bath & Brush', description: 'Bath, blow dry, brush-out, and ear cleaning.', small: 58, medium: 82, large: 115, durationMinutes: 90, active: true },
    { id: 'full-groom', name: 'Full Grooming', description: 'Bath and breed-appropriate haircut with finishing trim.', small: 88, medium: 128, large: 178, durationMinutes: 150, active: true },
    { id: 'spa-groom', name: 'Spa Grooming', description: 'Full groom with coat-conditioning treatment and paw care.', small: 118, medium: 168, large: 228, durationMinutes: 180, active: true },
  ],
};

// Reads editable demo settings, merging new defaults into older browser saves safely.
export function loadGroomingSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(groomingSettingsKey) || 'null');
    return {
      ...defaultGroomingSettings,
      ...(saved && typeof saved === 'object' ? saved : {}),
      voucher: { ...defaultGroomingSettings.voucher, ...(saved?.voucher || {}) },
      packages: Array.isArray(saved?.packages) ? saved.packages : defaultGroomingSettings.packages,
      outlets: Array.isArray(saved?.outlets) && saved.outlets.length ? saved.outlets : defaultGroomingSettings.outlets,
      timeSlots: Array.isArray(saved?.timeSlots) && saved.timeSlots.length ? saved.timeSlots : defaultGroomingSettings.timeSlots,
      availableWeekdays: Array.isArray(saved?.availableWeekdays) && saved.availableWeekdays.length ? saved.availableWeekdays : defaultGroomingSettings.availableWeekdays,
      closedDates: Array.isArray(saved?.closedDates) ? saved.closedDates : defaultGroomingSettings.closedDates,
      taxiScheduleSlots: Array.isArray(saved?.taxiScheduleSlots) && saved.taxiScheduleSlots.length ? saved.taxiScheduleSlots : defaultGroomingSettings.taxiScheduleSlots,
      taxiRouteEstimates: Array.isArray(saved?.taxiRouteEstimates) ? saved.taxiRouteEstimates : defaultGroomingSettings.taxiRouteEstimates,
      // Each advertised time is a single bookable appointment and closes as soon as it is reserved.
      slotCapacity: defaultGroomingSettings.slotCapacity,
    };
  } catch { return defaultGroomingSettings; }
}

// Reads grooming appointments created by customers in this browser prototype.
export function loadGroomingBookings() {
  try {
    const saved = JSON.parse(localStorage.getItem(groomingBookingsKey) || '[]');
    return Array.isArray(saved) ? saved.filter((booking) => booking && typeof booking === 'object' && !Array.isArray(booking)) : [];
  } catch { return []; }
}

// Matches pet weight to the outlet pricing band selected for the grooming package.
export function groomingWeightTier(weight, settings = loadGroomingSettings()) {
  const kg = Number.parseFloat(weight);
  if (!Number.isFinite(kg)) return 'small';
  if (kg <= Number(settings.smallMaxKg)) return 'small';
  if (kg <= Number(settings.mediumMaxKg)) return 'medium';
  return 'large';
}
