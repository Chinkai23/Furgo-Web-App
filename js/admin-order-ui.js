import { escapeHTML } from './shared.js';
import { customerOrderStatus, statusCategory } from './order-status.js';

export function adminOrderStage(order) {
  const status = customerOrderStatus(order);
  if (['completed', 'canceled', 'no-show'].includes(statusCategory(status))) return 'completed';
  if (order.serviceId === 'marketplace') return status === 'In Progress' ? 'progressing' : 'new';
  return order.receipt ? 'progressing' : 'new';
}

export function adminOrderStageFilters(orders, serviceId, selectedStage = 'new') {
  const stages = [
    { id: 'new', label: 'New Order' },
    { id: 'progressing', label: 'Progressing Order' },
    { id: 'completed', label: 'Completed Order' },
  ];
  return `<nav class="my-orders-status-tabs admin-order-stage-tabs" aria-label="Filter ${escapeHTML(serviceId)} orders">${stages.map((stage) => `<a class="my-orders-status-tab ${selectedStage === stage.id ? 'is-active' : ''}" href="#admin-${encodeURIComponent(serviceId)}?stage=${stage.id}" ${selectedStage === stage.id ? 'aria-current="page"' : ''}>${stage.label}<span>${orders.filter((order) => adminOrderStage(order) === stage.id).length}</span></a>`).join('')}</nav>`;
}

export function adminOtherServiceOrderLinks(currentService = '') {
  const services = [
    { id: 'grooming', label: 'Grooming Orders', href: '#admin-grooming' },
    { id: 'hotel', label: 'Pet Hotel Orders', href: '#admin-hotel' },
    { id: 'daycare', label: 'Pet Daycare Orders', href: '#admin-daycare' },
    { id: 'marketplace', label: 'Marketplace Orders', href: '#admin-marketplace' },
  ].filter((service) => service.id !== currentService);
  return `<nav class="admin-other-service-orders" aria-label="Other service order pages"><h2>Other Service Orders</h2><div>${services.map((service) => `<a class="button button-light" href="${service.href}">${service.label}</a>`).join('')}</div></nav>`;
}

export function adminOrderReceiptStatus(order) {
  if (!order.receipt) return 'Not Uploaded';
  const receiptType = String(order.receipt.type || order.paymentStatus || '').toLowerCase();
  if (receiptType.includes('full')) return 'Full Payment Receipt Uploaded';
  return 'Deposit Receipt Uploaded';
}

export function adminOrderProgressMarkup(order) {
  const currentStatus = customerOrderStatus(order);
  const taxiEnabled = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff);
  let steps;
  if (currentStatus === 'Pending Payment') {
    steps = order.serviceId === 'marketplace'
      ? ['Pending Payment', 'New Order', 'In Progress', 'Completed']
      : ['Pending Payment', 'New Order', ...(taxiEnabled ? ['Received Order', 'Pet Taxi Delivering...', 'Checked-In', 'Service Complete · Awaiting Pickup', 'Pet Taxi Delivering...', 'Completed'] : ['Received Order', 'Checked-In', 'Completed'])];
  } else if (currentStatus === 'Cancelled' || currentStatus === 'No-Show') {
    steps = ['New Order', ...(order.serviceId !== 'marketplace' && order.receipt ? ['Received Order'] : []), currentStatus];
  } else if (order.serviceId === 'marketplace') {
    steps = ['New Order', 'In Progress', 'Completed'];
  } else if (taxiEnabled) {
    steps = ['New Order', 'Received Order', 'Pet Taxi Delivering...', 'Checked-In', 'Service Complete · Awaiting Pickup', 'Pet Taxi Delivering...', 'Completed'];
  } else {
    steps = ['New Order', 'Received Order', 'Checked-In', 'Completed'];
  }
  let activeIndex = steps.lastIndexOf(currentStatus);
  if (currentStatus === 'Pet Taxi Delivering...' && order.taxiProgress?.status !== 'Returning to Customer') {
    activeIndex = steps.indexOf(currentStatus);
  }
  if (activeIndex < 0) activeIndex = 0;
  return `<ol class="admin-order-progress">${steps.map((status, index) => {
    const active = index === activeIndex;
    const phase = status === 'Pet Taxi Delivering...' ? `<small>${index === steps.lastIndexOf(status) ? 'Return trip' : 'Pickup trip'}</small>` : '';
    return `<li class="${active ? 'is-active' : 'is-inactive'}"><span>${escapeHTML(status)}</span>${phase}</li>`;
  }).join('')}</ol>`;
}

export function adminOrderCardMarkup({ order, serviceLabel, title, summary, summaryMarkup, reference, date, total, details }) {
  const status = customerOrderStatus(order);
  const category = statusCategory(status);
  const statusClass = category === 'canceled' ? 'is-canceled' : category === 'completed' ? 'is-complete' : category === 'no-show' ? 'is-no-show' : '';
  const formattedDate = date ? new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const amount = Number(total ?? order.totalAmount ?? order.total);
  const orderReference = reference || order.reference || order.id || '';
  return `<details class="my-order-card admin-service-order-card"><summary class="my-order-card-summary"><div class="my-order-card-top"><span class="my-order-service-label">${escapeHTML(serviceLabel)}</span><b class="my-order-status ${statusClass}">${escapeHTML(status)}</b></div><h2>${escapeHTML(title || 'Order')}</h2><p class="my-order-summary ${summaryMarkup ? 'admin-market-order-summary' : ''}">${summaryMarkup || escapeHTML(summary || 'Order details will appear here.')}</p><div class="my-order-card-bottom"><small>${[orderReference, formattedDate].filter(Boolean).map(escapeHTML).join(' · ')}</small><strong>MYR ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}</strong></div><span class="my-order-expand-hint">View Order Details <span aria-hidden="true">⌄</span></span></summary><div class="my-order-expanded admin-service-order-details">${details}</div></details>`;
}

export function adminOrderStatusControl(order, storageKey = order.storageKey || '') {
  const current = customerOrderStatus(order);
  const marketplace = order.serviceId === 'marketplace';
  const taxiEnabled = Boolean(order.includeTaxi || order.taxi?.pickup || order.taxi?.dropoff)
    || ['Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup'].includes(current);
  const options = marketplace
    ? ['New Order', 'Pending Payment', 'In Progress', 'Completed', 'Cancelled']
    : ['New Order', 'Pending Payment', 'Received Order', ...(taxiEnabled ? ['Pet Taxi Delivering...', 'Checked-In', 'Service Complete · Awaiting Pickup'] : ['Checked-In']), 'Completed', 'Cancelled'];
  if (!marketplace && canMarkOrderNoShow(order)) options.push('No-Show');
  if (current && !options.includes(current)) options.unshift(current);
  return `<label class="admin-order-status-control">Update Status<select data-admin-order-status="${escapeHTML(storageKey)}|${escapeHTML(order.id)}" aria-label="Update order status">${options.map((status) => `<option ${status === current ? 'selected' : ''}>${escapeHTML(status)}</option>`).join('')}</select></label>`;
}

export function canMarkOrderNoShow(order, now = new Date()) {
  const status = customerOrderStatus(order);
  if (['Pending Payment', 'Completed', 'Cancelled', 'No-Show', 'Checked-In', 'Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup'].includes(status)) return false;
  const date = order.serviceId === 'hotel'
    ? order.checkIn || order.startDate
    : order.date || order.visitDate || order.bookingDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const timeValue = order.serviceId === 'daycare' ? order.dropoffTime : order.time || order.dropoffTime;
  let scheduled = new Date(`${date}T00:00:00`);
  if (!timeValue && order.serviceId !== 'hotel') {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return date < today;
  }
  const match = String(timeValue || '').match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (match) {
    let hours = Number(match[1]);
    if (match[3]) hours = (hours % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0);
    scheduled.setHours(hours, Number(match[2]), 0, 0);
  } else if (order.serviceId === 'hotel') {
    scheduled.setHours(23, 59, 59, 999);
  }
  return !Number.isNaN(scheduled.getTime()) && scheduled < now;
}

export function isOrderCurrentToday(order, now = new Date()) {
  const status = customerOrderStatus(order);
  if (['completed', 'canceled', 'no-show'].includes(statusCategory(status)) || status === 'Pending Payment') return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (order.serviceId === 'marketplace') return false;
  if (order.serviceId === 'hotel') {
    const start = order.checkIn || order.startDate || '';
    const end = order.checkOut || order.endDate || start;
    return /^\d{4}-\d{2}-\d{2}$/.test(start) && start <= today && end >= today;
  }
  const date = order.date || order.visitDate || order.bookingDate || '';
  const currentlyInCare = ['Checked-In', 'Pet Taxi Delivering...', 'Service Complete · Awaiting Pickup'].includes(status);
  return currentlyInCare || date === today;
}
