import { escapeHTML } from '../shared.js';
import { customerOrderStatus } from '../order-status.js';
import { marketplaceOrdersKey, loadMarketplaceOrders } from './marketplace-data.js';
import { groomingBookingsKey, loadGroomingBookings } from './grooming-data.js';
import { hotelBookingsKey, loadHotelBookings } from './hotel-data.js';
import { recordAdminAction } from '../admin-audit.js';

// Customer directory storage shared by customer sign-in and Admin customer management.
export const customerRecordsKey = 'furgo-demo-customer-records';
const petProfilesKey = 'furgo-demo-pet-profiles';
const daycareKeys = ['furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders'];

function readArray(key) {
  try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
function customerId(profile) {
  const phone = normalizePhone(profile.phone);
  const email = normalizeEmail(profile.email);
  return phone ? `phone-${phone}` : `email-${encodeURIComponent(email)}`;
}

// Returns the stable local record ID used to link a signed-in customer's pets.
export function getCustomerRecordId(profile) { return customerId(profile); }

function identityMatches(first, second) {
  const firstPhone = normalizePhone(first.phone);
  const secondPhone = normalizePhone(second.phone);
  const firstEmail = normalizeEmail(first.email);
  const secondEmail = normalizeEmail(second.email);
  return Boolean((firstPhone && secondPhone && firstPhone === secondPhone) || (firstEmail && secondEmail && firstEmail === secondEmail));
}

// Saves a customer record while retaining the Admin-managed account status.
export function saveCustomerRecord(profile) {
  if (!profile || profile.role === 'admin' || (!profile.email && !profile.phone)) return null;
  const customers = readArray(customerRecordsKey);
  let customer = customers.find((item) => identityMatches(item, profile));
  let changed = false;
  if (!customer) {
    customer = { id: customerId(profile), status: 'Active', createdAt: new Date().toISOString() };
    customers.push(customer);
    changed = true;
  }
  const updatedFields = {
    name: String(profile.name || customer.name || 'Pet Parent').trim(),
    email: String(profile.email || customer.email || '').trim(),
    phone: String(profile.phone || customer.phone || '').trim(),
    authChannel: profile.authChannel || customer.authChannel || '',
  };
  for (const [key, value] of Object.entries(updatedFields)) {
    if (value !== customer[key]) { customer[key] = value; changed = true; }
  }
  if (!['Active', 'Blacklisted', 'Restricted'].includes(customer.status)) { customer.status = 'Active'; changed = true; }
  if (changed) {
    customer.updatedAt = new Date().toISOString();
    localStorage.setItem(customerRecordsKey, JSON.stringify(customers));
    void recordAdminAction('customer_record_status_updated', 'customer_account', '', { status: customer.status });
    document.dispatchEvent(new CustomEvent('furgo-customer-status-updated', { detail: customer }));
  }
  return customer;
}

// Reads an Admin-managed status for the customer currently using this browser session.
export function getCustomerAccountStatus(profile) {
  const customer = readArray(customerRecordsKey).find((item) => identityMatches(item, profile));
  return customer?.status || 'Active';
}

// Associates legacy unassigned pet profiles with the customer who is signed in.
export function assignUnownedPetProfiles(profile) {
  const customer = saveCustomerRecord(profile);
  if (!customer) return;
  const pets = readArray(petProfilesKey);
  let changed = false;
  for (const pet of pets) {
    const alreadyMatches = (pet.ownerId && pet.ownerId === customer.id)
      || (pet.ownerEmail && normalizeEmail(pet.ownerEmail) === normalizeEmail(customer.email))
      || (pet.ownerPhone && normalizePhone(pet.ownerPhone) === normalizePhone(customer.phone));
    if (!alreadyMatches && !pet.ownerId && !pet.ownerEmail && !pet.ownerPhone) {
      Object.assign(pet, { ownerId: customer.id, ownerEmail: customer.email, ownerPhone: customer.phone });
      changed = true;
    }
  }
  if (changed) localStorage.setItem(petProfilesKey, JSON.stringify(pets));
}

function collectCustomerData() {
  const customerMap = new Map();
  const aliases = new Map();
  const register = (profile) => {
    if (!profile || (!profile.email && !profile.phone)) return null;
    const existing = [normalizePhone(profile.phone), normalizeEmail(profile.email)].filter(Boolean).map((alias) => aliases.get(alias)).find(Boolean);
    const customer = existing || { id: profile.id || customerId(profile), name: 'Pet Parent', email: '', phone: '', status: 'Active', createdAt: '' };
    Object.assign(customer, {
      name: profile.name || customer.name,
      email: profile.email || customer.email,
      phone: profile.phone || customer.phone,
      status: profile.status || customer.status || 'Active',
      createdAt: profile.createdAt || customer.createdAt,
      authChannel: profile.authChannel || customer.authChannel,
    });
    customerMap.set(customer.id, customer);
    for (const alias of [normalizePhone(customer.phone), normalizeEmail(customer.email)].filter(Boolean)) aliases.set(alias, customer);
    return customer;
  };

  readArray(customerRecordsKey).forEach((customer) => register(customer));
  const orderSources = [
    { service: 'Marketplace', key: marketplaceOrdersKey, load: loadMarketplaceOrders },
    { service: 'Grooming', key: groomingBookingsKey, load: loadGroomingBookings },
    { service: 'Pet Hotel', key: hotelBookingsKey, load: loadHotelBookings },
    ...daycareKeys.map((key) => ({ service: 'Pet Daycare', key, load: () => readArray(key) })),
  ];
  const orders = [];
  for (const source of orderSources) {
    for (const order of source.load()) {
      const email = order.customerEmail || order.email || '';
      const phone = order.customerPhone || order.phone || order.deliveryPhone || '';
      if (!email && !phone) continue;
      const customer = register({ name: order.customerName || order.name, email, phone });
      if (!customer) continue;
      const amount = Number(order.total ?? order.packagePrice ?? order.amount ?? 0) || 0;
      const serviceId = source.service === 'Marketplace' ? 'marketplace' : source.service === 'Grooming' ? 'grooming' : source.service === 'Pet Hotel' ? 'hotel' : 'daycare';
      const record = { ...order, status: customerOrderStatus({ ...order, serviceId }), service: source.service, customerId: customer.id, amount };
      customer.orders ||= [];
      customer.orders.push(record);
      orders.push(record);
    }
  }

  const pets = readArray(petProfilesKey);
  const customers = [...customerMap.values()].map((customer) => {
    const matchedPets = pets.filter((pet) => pet.ownerId === customer.id
      || (pet.ownerEmail && normalizeEmail(pet.ownerEmail) === normalizeEmail(customer.email))
      || (pet.ownerPhone && normalizePhone(pet.ownerPhone) === normalizePhone(customer.phone)));
    const customerOrders = customer.orders || [];
    const serviceSummary = ['Marketplace', 'Grooming', 'Pet Hotel', 'Pet Daycare'].map((service) => {
      const serviceOrders = customerOrders.filter((order) => order.service === service);
      return { service, count: serviceOrders.length, spend: serviceOrders.reduce((sum, order) => sum + order.amount, 0) };
    });
    return { ...customer, pets: matchedPets, orders: customerOrders.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0)), serviceSummary, totalSpend: customerOrders.reduce((sum, order) => sum + order.amount, 0) };
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return customers;
}

function money(value) { return `MYR ${Number(value || 0).toFixed(2)}`; }

function customerDetail(customer) {
  const serviceRows = customer.serviceSummary.map((summary) => `<article class="admin-customer-analytics-card"><span>${escapeHTML(summary.service)}</span><strong>${summary.count} ${summary.count === 1 ? 'order' : 'orders'}</strong><small>${money(summary.spend)} total</small></article>`).join('');
  const pets = customer.pets.map((pet) => {
    const remarks = Array.isArray(pet.remarks) ? pet.remarks : [...(pet.tags || []), ...(pet.redFlagRemark ? [pet.redFlagRemark] : [])];
    const remarkRows = remarks.map((remark) => `<div class="admin-customer-remark-row"><input data-customer-remark-value value="${escapeHTML(remark)}" maxlength="160" aria-label="Pet remark" /><button type="button" data-remove-customer-remark aria-label="Delete remark">×</button></div>`).join('');
    const vaccinationLinks = (pet.vaccinationCards || []).map((card) => `<a href="${escapeHTML(card.data)}" target="_blank" rel="noopener">${escapeHTML(card.name)}</a>`).join('');
    return `<article class="admin-customer-pet-card"><header><img src="${escapeHTML(pet.photo || 'Image/Icon/Profile Picture.png')}" alt="${escapeHTML(pet.name || 'Pet profile')}" /><div><span>Pet Profile</span><h3>${escapeHTML(pet.name || 'Unnamed pet')}</h3><p>${escapeHTML(pet.breed || 'Breed not added')}${pet.sex ? ` · ${escapeHTML(pet.sex)}` : ''}</p></div></header><dl><div><dt>Birth date</dt><dd>${escapeHTML(pet.birthDate || 'Not provided')}</dd></div><div><dt>Neutered / spayed</dt><dd>${escapeHTML(pet.neutered || 'Not provided')}</dd></div><div><dt>Weight</dt><dd>${pet.weight ? `${escapeHTML(pet.weight)} kg` : 'Not provided'}</dd></div><div><dt>Colour</dt><dd>${escapeHTML(pet.colour || 'Not provided')}</dd></div></dl><div class="admin-customer-vaccination-links">${vaccinationLinks || '<span>No vaccination documents uploaded</span>'}</div><section class="admin-customer-pet-remarks" data-customer-pet-remarks="${escapeHTML(pet.id)}"><h4>Pet Remarks</h4><p>Edit, add, or remove care and safety remarks.</p><div data-customer-remark-list>${remarkRows}</div><button class="button button-light" type="button" data-add-customer-remark>Add remark</button><button class="button button-primary" type="button" data-save-customer-remarks="${escapeHTML(pet.id)}">Save remarks</button><span class="admin-customer-save-message" role="status"></span></section></article>`;
  }).join('');
  const orders = customer.orders.map((order) => `<li><span><strong>${escapeHTML(order.service)}</strong><small>${escapeHTML(order.reference || order.id || 'Order')} · ${escapeHTML(order.createdAt ? new Date(order.createdAt).toLocaleDateString() : order.date || 'Date not recorded')}</small></span><span><b>${escapeHTML(order.status || 'New')}</b><small>${money(order.amount)}</small></span></li>`).join('');
  return `<header class="admin-market-heading"><a href="#admin-customers" aria-label="Back to Customers">‹</a><div><span>Customer Profile</span><h1>${escapeHTML(customer.name || 'Pet Parent')}</h1></div></header><section class="admin-market-panel admin-customer-profile-panel"><div class="admin-customer-contact"><div><span>User ID</span><strong>${escapeHTML(customer.phone || customer.id)}</strong></div><div><span>Phone Number</span><strong>${escapeHTML(customer.phone || 'Not provided')}</strong></div><div><span>Email Address</span><strong>${escapeHTML(customer.email || 'Not provided')}</strong></div><div><span>Registration Channel</span><strong>${escapeHTML(customer.authChannel || 'Not recorded')}</strong></div></div><div class="admin-customer-status-control"><label>Account Status<select data-customer-status>${['Active', 'Blacklisted', 'Restricted'].map((status) => `<option ${customer.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button class="button button-primary" type="button" data-save-customer-status="${escapeHTML(customer.id)}">Save Status</button><span data-customer-status-feedback role="status"></span></div></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Pet Records</span><h2>${customer.pets.length} ${customer.pets.length === 1 ? 'Pet Profile' : 'Pet Profiles'}</h2></div><p>Customer and Admin care notes for each linked pet.</p></div><div class="admin-customer-pet-list">${pets || '<p class="admin-market-empty">No pet profiles are linked to this customer.</p>'}</div></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer Analytics</span><h2>Purchase And Service Activity</h2></div><p>${customer.orders.length} recorded orders · ${money(customer.totalSpend)} total value</p></div><div class="admin-customer-analytics-grid">${serviceRows}</div><ul class="admin-customer-order-list">${orders || '<li class="admin-market-empty">No purchase or service activity recorded yet.</li>'}</ul></section>`;
}

// Admin customer page: list registered customers or open a detailed, analytics-backed customer profile.
export function adminCustomersPage(routeParams = new URLSearchParams()) {
  const customers = collectCustomerData();
  const selectedId = routeParams.get('id');
  const selected = customers.find((customer) => customer.id === selectedId);
  const body = selected ? customerDetail(selected) : `<header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Dashboard">‹</a><div><span>Customer management</span><h1>Customers</h1></div></header><section class="admin-market-stats"><article><span>Customer accounts</span><strong>${customers.length}</strong></article><article><span>Active</span><strong>${customers.filter((customer) => customer.status === 'Active').length}</strong></article><article><span>Restricted / blacklisted</span><strong>${customers.filter((customer) => customer.status !== 'Active').length}</strong></article></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer directory</span><h2>Customer Profiles</h2></div><p>Open a customer to review account details, pet profiles, care remarks, and service activity.</p></div><div class="admin-customer-directory">${customers.map((customer) => `<a class="admin-customer-directory-row" href="#admin-customers?id=${encodeURIComponent(customer.id)}"><span class="admin-customer-avatar">${escapeHTML((customer.name || 'P').trim().slice(0, 1).toUpperCase())}</span><span class="admin-customer-directory-copy"><strong>${escapeHTML(customer.name || 'Pet Parent')}</strong><small>${escapeHTML(customer.phone || customer.email || 'Contact details not provided')}</small></span><span class="admin-customer-directory-meta"><b class="admin-customer-status-badge status-${String(customer.status).toLowerCase()}">${escapeHTML(customer.status)}</b><small>${customer.pets.length} pets · ${customer.orders.length} orders</small></span><span aria-hidden="true">›</span></a>`).join('') || '<p class="admin-market-empty">Customer profiles will appear after customers register or place an order in this browser prototype.</p>'}</div></section>`;
  const searchInsights = `<section class="admin-search-analytics" data-admin-search-analytics aria-labelledby="admin-search-title"><div class="admin-search-analytics-heading"><div><span>Customer demand</span><h2 id="admin-search-title">Search Insights</h2><p>Search volume, no-result demand, and the services or products customers select.</p></div><label>Period<select data-search-analytics-period><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label></div><div class="admin-search-analytics-content" data-search-analytics-content role="status" aria-live="polite">Loading search insights…</div></section>`;
  return `<main class="admin-portal-page admin-customers-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin">Dashboard</a><button type="button" data-logout>Log out</button></div></header>${body}${searchInsights}</main>`;
}

// Saves status and remark edits directly into the shared customer and pet records.
export function setupAdminCustomers() {
  document.querySelector('[data-save-customer-status]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const id = button.dataset.saveCustomerStatus;
    const customers = readArray(customerRecordsKey);
    let customer = customers.find((item) => item.id === id);
    if (!customer) {
      const record = collectCustomerData().find((item) => item.id === id);
      if (record) { customer = { id, name: record.name, email: record.email, phone: record.phone, status: record.status, createdAt: record.createdAt }; customers.push(customer); }
    }
    if (!customer) return;
    customer.status = document.querySelector('[data-customer-status]')?.value || 'Active';
    customer.updatedAt = new Date().toISOString();
    localStorage.setItem(customerRecordsKey, JSON.stringify(customers));
    const feedback = document.querySelector('[data-customer-status-feedback]');
    if (feedback) feedback.textContent = `Account status saved as ${customer.status}.`;
  });

  document.querySelectorAll('[data-customer-pet-remarks]').forEach((section) => {
    section.querySelector('[data-add-customer-remark]')?.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'admin-customer-remark-row';
      const input = document.createElement('input');
      input.dataset.customerRemarkValue = '';
      input.maxLength = 160;
      input.setAttribute('aria-label', 'Pet remark');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removeCustomerRemark = '';
      remove.setAttribute('aria-label', 'Delete remark');
      remove.textContent = '×';
      row.append(input, remove);
      section.querySelector('[data-customer-remark-list]').append(row);
      input.focus();
    });
    section.addEventListener('click', (event) => {
      if (event.target.closest('[data-remove-customer-remark]')) event.target.closest('.admin-customer-remark-row')?.remove();
      const saveButton = event.target.closest('[data-save-customer-remarks]');
      if (!saveButton) return;
      const petId = saveButton.dataset.saveCustomerRemarks;
      const pets = readArray(petProfilesKey);
      const pet = pets.find((item) => String(item.id) === petId);
      if (!pet) return;
      pet.remarks = [...section.querySelectorAll('[data-customer-remark-value]')].map((input) => input.value.trim()).filter(Boolean);
      localStorage.setItem(petProfilesKey, JSON.stringify(pets));
      void recordAdminAction('pet_remarks_updated', 'pet_profile');
      document.dispatchEvent(new CustomEvent('furgo-admin-pet-remarks-updated', { detail: pet }));
      const message = section.querySelector('.admin-customer-save-message');
      if (message) message.textContent = 'Pet remarks saved.';
    });
  });
}
