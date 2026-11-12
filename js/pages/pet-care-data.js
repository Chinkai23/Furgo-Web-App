import { loadGroomingBookings } from './grooming-data.js';
import { loadHotelBookings } from './hotel-data.js';
import { loadDaycareBookings } from './daycare-data.js';

export const petReminderStorageKey = (petId) => `furgo-pet-reminders-${String(petId || '')}`;
export const petRecordStorageKey = (petId) => `furgo-pet-records-${String(petId || '')}`;
export const petRemindersCloudKey = 'furgo-demo-pet-reminders';
export const petRecordsCloudKey = 'furgo-demo-pet-records';
export function localPetDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadPetReminders(petId) {
  const id = String(petId || '');
  try {
    const all = JSON.parse(localStorage.getItem(petRemindersCloudKey) || 'null');
    if (all && Object.prototype.hasOwnProperty.call(all, id)) return all[id] || {};
    const legacy = JSON.parse(localStorage.getItem(petReminderStorageKey(id)) || 'null');
    if (legacy && typeof legacy === 'object') {
      localStorage.setItem(petRemindersCloudKey, JSON.stringify({ ...(all || {}), [id]: legacy }));
      return legacy;
    }
    return {};
  } catch { return {}; }
}

export function savePetReminders(petId, value) {
  const id = String(petId || '');
  const all = safePetCollection(petRemindersCloudKey);
  all[id] = value;
  localStorage.setItem(petRemindersCloudKey, JSON.stringify(all));
}

export function loadPetRecords(petId) {
  const id = String(petId || '');
  try {
    const all = JSON.parse(localStorage.getItem(petRecordsCloudKey) || 'null');
    if (all && Object.prototype.hasOwnProperty.call(all, id)) return Array.isArray(all[id]) ? all[id] : [];
    const value = JSON.parse(localStorage.getItem(petRecordStorageKey(id)) || 'null');
    if (Array.isArray(value)) {
      localStorage.setItem(petRecordsCloudKey, JSON.stringify({ ...(all || {}), [id]: value }));
      return value;
    }
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function savePetRecord(petId, record) {
  const previous = loadPetRecords(petId).find((item) => item.date === record.date) || {};
  const merged = { ...previous, ...record };
  const records = loadPetRecords(petId).filter((item) => item.date !== record.date);
  records.unshift(merged);
  const all = safePetCollection(petRecordsCloudKey);
  all[String(petId || '')] = records.slice(0, 60);
  localStorage.setItem(petRecordsCloudKey, JSON.stringify(all));
  return records.slice(0, 60);
}

export function deletePetCareData(petId) {
  const id = String(petId || '');
  for (const [key, legacyKey] of [[petRemindersCloudKey, petReminderStorageKey(id)], [petRecordsCloudKey, petRecordStorageKey(id)]]) {
    const all = safePetCollection(key);
    delete all[id];
    localStorage.setItem(key, JSON.stringify(all));
    localStorage.removeItem(legacyKey);
  }
}

function safePetCollection(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function petServiceReminders(pet) {
  if (!pet?.id) return [];
  const today = localPetDate();
  const petMatches = (booking) => [booking.petId, ...(booking.petIds || []), ...(booking.pets || []).map((item) => item.id)]
    .some((id) => String(id) === String(pet.id));
  const upcoming = [
    ...loadGroomingBookings().filter((booking) => petMatches(booking) && String(booking.date || '').slice(0, 10) >= today && !['cancelled', 'completed', 'rejected'].includes(String(booking.status || '').toLowerCase())).map((booking) => ({ ...booking, service: 'Grooming' })),
    ...loadHotelBookings().filter((booking) => petMatches(booking) && String(booking.checkIn || booking.startDate || booking.date || '').slice(0, 10) >= today && !['cancelled', 'completed', 'rejected'].includes(String(booking.status || '').toLowerCase())).map((booking) => ({ ...booking, date: booking.checkIn || booking.startDate || booking.date, service: 'Pet Hotel' })),
    ...loadDaycareBookings().filter((booking) => petMatches(booking) && String(booking.date || '').slice(0, 10) >= today && !['cancelled', 'completed', 'rejected'].includes(String(booking.status || '').toLowerCase()) && booking.type !== 'pass-purchase').map((booking) => ({ ...booking, service: 'Pet Daycare' })),
  ];
  return upcoming.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function formatPetDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === today.getTime()) return 'today';
  if (date.getTime() === tomorrow.getTime()) return 'tomorrow';
  return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
