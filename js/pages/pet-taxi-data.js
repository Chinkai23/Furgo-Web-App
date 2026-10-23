// Shared Pet Taxi pricing, pickup times, and route estimates for every customer service.
export const petTaxiSettingsKey = 'furgo-demo-pet-taxi-settings';

export const defaultPetTaxiSettings = {
  baseFare: 8,
  farePerKm: 2.2,
  scheduleSlots: ['09:00', '12:00', '15:00'],
  routes: [
    { city: 'Petaling Jaya', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 8 },
    { city: 'Bangsar', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 6 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Bangsar', distanceKm: 10 },
    { city: 'Kuala Lumpur', outlet: 'Furgo Pet Care - Petaling Jaya', distanceKm: 16 },
    { city: 'Petaling Jaya', outlet: '*', distanceKm: 8 },
    { city: 'Kuala Lumpur', outlet: '*', distanceKm: 18 },
    { city: 'Subang Jaya', outlet: '*', distanceKm: 12 },
  ],
};

// Reads the shared catalog, migrating the previous Grooming taxi setup as the initial source.
export function loadPetTaxiSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(petTaxiSettingsKey) || 'null');
    if (saved && typeof saved === 'object') return {
      ...defaultPetTaxiSettings,
      ...saved,
      scheduleSlots: Array.isArray(saved.scheduleSlots) ? saved.scheduleSlots : defaultPetTaxiSettings.scheduleSlots,
      routes: Array.isArray(saved.routes) ? saved.routes : defaultPetTaxiSettings.routes,
    };
    const legacyGrooming = JSON.parse(localStorage.getItem('furgo-demo-grooming-settings') || 'null');
    const legacyDaycare = JSON.parse(localStorage.getItem('furgo-demo-daycare-settings') || 'null');
    const routes = [...(legacyGrooming?.taxiRouteEstimates || defaultPetTaxiSettings.routes)];
    for (const route of legacyDaycare?.taxiRoutes || []) {
      if (route?.city && !routes.some((item) => item.city.toLowerCase() === route.city.toLowerCase() && item.outlet === '*')) {
        routes.push({ city: route.city, outlet: '*', distanceKm: Number(route.distanceKm) });
      }
    }
    return {
      ...defaultPetTaxiSettings,
      baseFare: Number(legacyGrooming?.taxiBaseFare ?? defaultPetTaxiSettings.baseFare),
      farePerKm: Number(legacyGrooming?.taxiPerKm ?? defaultPetTaxiSettings.farePerKm),
      scheduleSlots: Array.isArray(legacyGrooming?.taxiScheduleSlots) ? legacyGrooming.taxiScheduleSlots : defaultPetTaxiSettings.scheduleSlots,
      routes,
    };
  } catch { return { ...defaultPetTaxiSettings, scheduleSlots: [...defaultPetTaxiSettings.scheduleSlots], routes: [...defaultPetTaxiSettings.routes] }; }
}

// Prefers an exact outlet route, then falls back to a wildcard route for that city.
export function matchPetTaxiRoute(cityText, outlet, settings = loadPetTaxiSettings()) {
  const normalized = String(cityText || '').toLowerCase();
  const matches = settings.routes.filter((route) => route?.city && normalized.includes(String(route.city).toLowerCase()));
  return matches.find((route) => route.outlet === outlet) || matches.find((route) => route.outlet === '*') || null;
}
