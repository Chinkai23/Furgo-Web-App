import { escapeHTML } from '../shared.js';
import { saveSharedAppData } from '../app-data-sync.js';

export const homeShortcutSettingsKey = 'furgo-demo-home-service-shortcuts';

export const homeShortcutOptions = [
  { id: 'marketplace', name: 'Marketplace', icon: 'MVP Icon-01.png', href: '#marketplace' },
  { id: 'local-finder', name: 'Local Finder', icon: 'MVP Icon-06.png', href: '#local-finder' },
  { id: 'grooming', name: 'Grooming', icon: 'MVP Icon-02.png', href: '#grooming' },
  { id: 'hotel', name: 'Pet Hotel', icon: 'MVP Icon-04.png', href: '#hotel' },
  { id: 'daycare', name: 'Pet Daycare', icon: 'MVP Icon-03.png', href: '#daycare' },
  { id: 'ai-nutritionist', name: 'AI Nutritionist', icon: 'MVP Icon-07.png', href: '#ai-nutritionist' },
];

const defaultShortcutIds = homeShortcutOptions.map(({ id }) => id);
let liveRefreshInstalled = false;
try {
  if (localStorage.getItem(homeShortcutSettingsKey) === null) {
    localStorage.setItem(homeShortcutSettingsKey, JSON.stringify(defaultShortcutIds));
  }
} catch { /* The default shortcuts still render if browser storage is unavailable. */ }

export function loadHomeShortcutIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(homeShortcutSettingsKey) || 'null');
    if (Array.isArray(saved)) {
      const validIds = saved.filter((id, index) => homeShortcutOptions.some((option) => option.id === id) && saved.indexOf(id) === index);
      return validIds;
    }
  } catch { /* Use the built-in home shortcuts until the saved settings can be read. */ }
  return defaultShortcutIds;
}

export function homeServiceShortcutsMarkup() {
  const orderedIds = loadHomeShortcutIds();
  const optionsById = new Map(homeShortcutOptions.map((option) => [option.id, option]));
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  return orderedIds.map((id) => optionsById.get(id)).filter(Boolean).map(({ id, name, icon: file, href }) => (
    `<a class="shortcut" href="${href}" data-service="${id}"><img src="${icon(file)}" alt="" /><span>${name}</span></a>`
  )).join('');
}

export function setupHomeShortcutLiveRefresh() {
  if (liveRefreshInstalled) return;
  liveRefreshInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== homeShortcutSettingsKey) return;
    const homeHeader = document.querySelector('.mobile-home .home-orange');
    if (!homeHeader) return;
    const markup = homeServiceShortcutsMarkup();
    const nav = homeHeader.querySelector('.service-shortcuts');
    if (!markup) { nav?.remove(); return; }
    if (nav) nav.innerHTML = markup;
    else homeHeader.querySelector('.credit-row')?.insertAdjacentHTML('afterend', `<nav class="service-shortcuts" id="services" aria-label="Pet services">${markup}</nav>`);
  });
}

export function adminHomeShortcutSettingsMarkup() {
  const shortcutIds = loadHomeShortcutIds();
  const selected = new Set(shortcutIds);
  const rows = [...homeShortcutOptions].sort((a, b) => {
    const rank = (id) => {
      const savedIndex = shortcutIds.indexOf(id);
      return savedIndex >= 0 ? savedIndex : shortcutIds.length + defaultShortcutIds.indexOf(id);
    };
    return rank(a.id) - rank(b.id);
  });
  return `<section class="admin-market-panel admin-home-shortcut-panel" aria-labelledby="home-shortcut-settings-title"><div class="admin-market-panel-heading"><div><span>Customer portal</span><h2 id="home-shortcut-settings-title">Home MVP Functions</h2></div><p>Choose which functions appear on the customer home page and arrange their order. The shortcuts wrap after four per row.</p></div><form data-home-shortcut-settings><p class="admin-home-shortcut-drag-hint">Drag the three-line handle to change the order. Use the up and down arrow keys when the handle is focused.</p><ol class="admin-home-shortcut-list" data-home-shortcut-list>${rows.map(({ id, name, icon }) => `<li class="admin-home-shortcut-row" data-home-shortcut-id="${id}"><button class="admin-home-shortcut-drag" type="button" draggable="false" data-home-shortcut-drag aria-label="Reorder ${escapeHTML(name)}" title="Drag to reorder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button><label><input type="checkbox" data-home-shortcut-enabled ${selected.has(id) ? 'checked' : ''} /><img src="Image/Icon/${encodeURIComponent(icon)}" alt="" /><span>${escapeHTML(name)}</span></label></li>`).join('')}</ol><div class="admin-market-form-actions"><button class="button button-primary" type="submit">Save Home Functions</button><span data-home-shortcut-feedback role="status" aria-live="polite"></span></div></form></section>`;
}

export function setupAdminHomeShortcutSettings() {
  const form = document.querySelector('[data-home-shortcut-settings]');
  const list = form?.querySelector('[data-home-shortcut-list]');
  const feedback = form?.querySelector('[data-home-shortcut-feedback]');
  if (!form || !list || !feedback) return;

  let draggingRow = null;
  let pointerId = null;
  const moveRow = (row, target, after = false) => {
    if (!row || !target || row === target) return;
    list.insertBefore(row, after ? target.nextElementSibling : target);
  };
  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-home-shortcut-drag]');
    if (!handle || event.button !== 0) return;
    draggingRow = handle.closest('[data-home-shortcut-id]');
    pointerId = event.pointerId;
    draggingRow?.classList.add('is-dragging');
    handle.setPointerCapture?.(pointerId);
    event.preventDefault();
  });
  list.addEventListener('pointermove', (event) => {
    if (!draggingRow || event.pointerId !== pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-home-shortcut-id]');
    if (!target || !list.contains(target) || target === draggingRow) return;
    const bounds = target.getBoundingClientRect();
    moveRow(draggingRow, target, event.clientY > bounds.top + bounds.height / 2);
  });
  const finishPointerDrag = (event) => {
    if (!draggingRow || (event && event.pointerId !== pointerId)) return;
    draggingRow.classList.remove('is-dragging');
    draggingRow = null;
    pointerId = null;
  };
  list.addEventListener('pointerup', finishPointerDrag);
  list.addEventListener('pointercancel', finishPointerDrag);
  list.addEventListener('keydown', (event) => {
    const handle = event.target.closest('[data-home-shortcut-drag]');
    const row = handle?.closest('[data-home-shortcut-id]');
    if (!row || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const sibling = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    moveRow(row, sibling, event.key === 'ArrowDown');
    handle.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedIds = [...list.querySelectorAll('[data-home-shortcut-id]')]
      .filter((row) => row.querySelector('[data-home-shortcut-enabled]').checked)
      .map((row) => row.dataset.homeShortcutId);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    feedback.textContent = 'Saving customer home functions…';
    feedback.classList.remove('is-error');
    try {
      await saveSharedAppData(homeShortcutSettingsKey, selectedIds);
      feedback.textContent = 'Customer home functions saved.';
    } catch (error) {
      feedback.textContent = error.message || 'Home functions could not be saved.';
      feedback.classList.add('is-error');
    } finally {
      submit.disabled = false;
    }
  });
}

export function adminHomeMvpPage() {
  const profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}');
  const adminName = profile.name || profile.email || 'Director';
  return `<main class="admin-portal-page admin-home-mvp-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><span>${escapeHTML(adminName)}</span><a class="admin-customer-portal-link" href="#home?portal=customer">Open Customer Portal</a></div></header><header class="admin-market-heading"><a href="#admin" aria-label="Back to Admin Home">‹</a><div><span>Manage Web</span><h1>Home MVP</h1></div></header>${adminHomeShortcutSettingsMarkup()}</main>`;
}
