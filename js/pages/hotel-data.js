// Pet Hotel reservations and room inventory are shared between the customer and Admin Portal prototypes.
export const hotelSettingsKey = 'furgo-demo-hotel-settings';
export const hotelBookingsKey = 'furgo-demo-hotel-bookings';

export const defaultHotelSettings = {
  bookingHorizonDays: 180,
  closedDates: [],
  outlets: ['Furgo Pet Care - Petaling Jaya', 'Furgo Pet Care - Bangsar'],
  rooms: [
    { id: 'standard', name: 'Standard Room', description: 'A comfortable private space for a restful stay.', amenities: 'Fresh bedding, daily updates, supervised play', dimensions: '1.2m × 1.5m', nightlyRate: 65, capacity: 8, active: true, photo: '' },
    { id: 'vip-suite', name: 'VIP Suite', description: 'An extra spacious suite with added comfort.', amenities: 'Premium bedding, quiet space, daily updates', dimensions: '1.8m × 2m', nightlyRate: 110, capacity: 3, active: true, photo: '' },
  ],
  groomingPackages: [
    { id: 'bath-brush', name: 'Basic Bath & Brush', description: 'Bath, blow dry and brush-out.', small: 58, medium: 82, large: 115, active: true },
    { id: 'full-groom', name: 'Full Grooming', description: 'Bath and breed-appropriate haircut.', small: 88, medium: 128, large: 178, active: true },
  ],
  groomingTimeSlots: ['10:00', '13:00', '15:00'],
  addOns: [
    { id: 'extra-walk', name: 'Extra walk / playtime', description: 'An additional supervised activity session.', price: 15, active: true },
    { id: 'medication', name: 'Medication administration', description: 'Staff administers owner-provided medication.', price: 10, active: true },
    { id: 'snacks', name: 'Snacks / treats', description: 'A small treat serving during the stay.', price: 8, active: true },
  ],
  taxiBaseFare: 8,
  taxiPerKm: 2.2,
  taxiRouteEstimates: [
    { city: 'Petaling Jaya', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 8 },
    { city: 'Bangsar', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 6 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 10 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 16 },
  ],
  voucher: { code: 'HOTEL10', type: 'percent', value: 10, minimumSpend: 100, enabled: true },
};

// Reads Admin-edited room, add-on, transport and voucher settings from this browser.
export function loadHotelSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(hotelSettingsKey) || 'null');
    return {
      ...defaultHotelSettings,
      ...(saved && typeof saved === 'object' ? saved : {}),
      rooms: Array.isArray(saved?.rooms) ? saved.rooms : defaultHotelSettings.rooms,
      addOns: Array.isArray(saved?.addOns) ? saved.addOns : defaultHotelSettings.addOns,
      groomingPackages: Array.isArray(saved?.groomingPackages) ? saved.groomingPackages : defaultHotelSettings.groomingPackages,
      outlets: Array.isArray(saved?.outlets) && saved.outlets.length ? saved.outlets : defaultHotelSettings.outlets,
      closedDates: Array.isArray(saved?.closedDates) ? saved.closedDates : defaultHotelSettings.closedDates,
      groomingTimeSlots: Array.isArray(saved?.groomingTimeSlots) && saved.groomingTimeSlots.length ? saved.groomingTimeSlots : defaultHotelSettings.groomingTimeSlots,
      taxiRouteEstimates: Array.isArray(saved?.taxiRouteEstimates) ? saved.taxiRouteEstimates : defaultHotelSettings.taxiRouteEstimates,
      voucher: { ...defaultHotelSettings.voucher, ...(saved?.voucher || {}) },
    };
  } catch { return defaultHotelSettings; }
}

// Loads hotel reservations so the customer and admin views use the same live availability list.
export function loadHotelBookings() {
  try {
    const bookings = JSON.parse(localStorage.getItem(hotelBookingsKey) || '[]');
    return Array.isArray(bookings) ? bookings.filter((booking) => booking && typeof booking === 'object') : [];
  } catch { return []; }
}

// Uses the established grooming weight bands to select a matching hotel grooming rate.
export function hotelWeightTier(weight) {
  const kg = Number.parseFloat(weight);
  return !Number.isFinite(kg) || kg <= 10 ? 'small' : kg <= 25 ? 'medium' : 'large';
}

// Counts room units already reserved across any overlapping portion of a requested stay.
export function availableHotelRooms(room, outlet, checkIn, checkOut, bookings = loadHotelBookings()) {
  return availableHotelUnits(room, outlet, checkIn, checkOut, bookings).filter((unit) => unit.available).length;
}

// Shows every numbered room unit and marks the units reserved for any overlapping stay as unavailable.
export function availableHotelUnits(room, outlet, checkIn, checkOut, bookings = loadHotelBookings()) {
  const unitCount = Math.max(0, Number(room.capacity) || 0);
  const units = Array.from({ length: unitCount }, (_, index) => `Unit ${String(index + 1).padStart(2, '0')}`);
  if (!checkIn || !checkOut || checkOut <= checkIn) return units.map((unit) => ({ unit, available: false, reason: 'Choose stay dates' }));
  const occupied = bookings.filter((booking) => booking.roomId === room.id && booking.outlet === outlet
    && !/cancel|completed/i.test(String(booking.status || ''))
    && booking.checkIn < checkOut && booking.checkOut > checkIn);
  const unavailable = new Set(occupied.map((booking) => booking.assignedUnit).filter(Boolean));
  let unassignedOccupancy = occupied.filter((booking) => !booking.assignedUnit).length;
  for (const unit of units) {
    if (unassignedOccupancy <= 0) break;
    if (unavailable.has(unit)) continue;
    unavailable.add(unit);
    unassignedOccupancy -= 1;
  }
  return units.map((unit) => ({ unit, available: !unavailable.has(unit), reason: unavailable.has(unit) ? 'Reserved for these dates' : 'Available' }));
}
