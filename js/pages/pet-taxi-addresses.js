import { escapeHTML } from '../shared.js';

export function loadProfileAddresses() {
  try {
    const value = JSON.parse(localStorage.getItem('furgo-demo-addresses') || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function getSelectedProfileAddress(select) {
  if (!select || select.value === 'new') return null;
  return loadProfileAddresses()[Number(select.value)] || null;
}

export function renderPetTaxiAddressPicker({ addresses = loadProfileAddresses(), profile = {}, selectName, manualName }) {
  const options = addresses.map((address, index) => {
    const label = [address.label || `Address ${index + 1}`, address.street, address.city, address.state].filter(Boolean).join(' · ');
    return `<option value="${index}" ${index === 0 ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  }).join('');
  const showEditor = addresses.length === 0;
  return `<div class="pet-taxi-address-picker" data-pet-taxi-address-picker>
    <label class="grooming-field">Pickup address<select name="${escapeHTML(selectName)}" data-pet-taxi-address-select ${addresses.length ? '' : 'required'}>${options}<option value="new" ${showEditor ? 'selected' : ''}>Add a new address…</option></select></label>
    <div class="pet-taxi-address-editor" data-pet-taxi-address-editor ${showEditor ? '' : 'hidden'}>
      <p class="pet-taxi-address-note">Add an address to your profile. It will be saved automatically after you enter the street, city, and state.</p>
      <div class="grooming-form-grid">
        <label class="grooming-field">Address name<input data-pet-address-field="label" value="${addresses.length ? '' : 'Home'}" placeholder="Home, Work" autocomplete="off" /></label>
        <label class="grooming-field">Recipient name<input data-pet-address-field="name" value="${escapeHTML(profile.name || '')}" autocomplete="name" /></label>
        <label class="grooming-field">Phone number<input data-pet-address-field="phone" type="tel" value="${escapeHTML(profile.phone || '')}" autocomplete="tel" /></label>
        <label class="grooming-field">Postcode<input data-pet-address-field="postcode" inputmode="numeric" autocomplete="postal-code" /></label>
        <label class="grooming-field">Street address<input name="${escapeHTML(manualName)}" data-pet-address-field="street" autocomplete="street-address" placeholder="House, street, or building" ${showEditor ? 'required' : ''} /></label>
        <label class="grooming-field">City<input data-pet-address-field="city" autocomplete="address-level2" ${showEditor ? 'required' : ''} /></label>
        <label class="grooming-field">State<input data-pet-address-field="state" autocomplete="address-level1" ${showEditor ? 'required' : ''} /></label>
      </div>
      <p class="pet-taxi-address-saved" data-pet-address-saved role="status" aria-live="polite"></p>
    </div>
  </div>`;
}

export function setupPetTaxiAddressPicker(root, onChange = () => {}) {
  const picker = root?.matches?.('[data-pet-taxi-address-picker]') ? root : root?.querySelector?.('[data-pet-taxi-address-picker]');
  if (!picker) return;
  const select = picker.querySelector('[data-pet-taxi-address-select]');
  const editor = picker.querySelector('[data-pet-taxi-address-editor]');
  const savedNote = picker.querySelector('[data-pet-address-saved]');
  let savedIndex = null;
  const toggleEditor = () => {
    const editing = select.value === 'new';
    editor.hidden = !editing;
    const enabled = root.closest('form')?.querySelector('[name="includeTaxi"]')?.checked !== false;
    select.required = enabled;
    editor.querySelectorAll('[data-pet-address-field="street"], [data-pet-address-field="city"], [data-pet-address-field="state"]').forEach((input) => { input.required = editing && enabled; });
    onChange();
  };
  const persistAddress = () => {
    if (select.value !== 'new' && savedIndex === null) return;
    const value = (key) => picker.querySelector(`[data-pet-address-field="${key}"]`)?.value.trim() || '';
    const street = value('street'); const city = value('city'); const state = value('state');
    if (!street || !city || !state) return;
    const addresses = loadProfileAddresses();
    const index = savedIndex === null ? addresses.length : savedIndex;
    const prior = addresses[index] || {};
    addresses[index] = {
      ...prior,
      label: value('label') || prior.label || `Address ${index + 1}`,
      name: value('name') || prior.name || '',
      phone: value('phone') || prior.phone || '',
      postcode: value('postcode') || prior.postcode || '',
      street, city, state,
    };
    localStorage.setItem('furgo-demo-addresses', JSON.stringify(addresses));
    savedIndex = index;
    const selected = String(index);
    select.innerHTML = `${addresses.map((address, addressIndex) => {
      const label = [address.label || `Address ${addressIndex + 1}`, address.street, address.city, address.state].filter(Boolean).join(' · ');
      return `<option value="${addressIndex}" ${addressIndex === index ? 'selected' : ''}>${escapeHTML(label)}</option>`;
    }).join('')}<option value="new">Add a new address…</option>`;
    select.value = selected;
    select.required = false;
    savedNote.textContent = 'Saved to your profile. You can keep editing this address or choose “Add a new address…” to add another.';
    onChange();
  };
  select.addEventListener('change', () => {
    savedIndex = null;
    savedNote.textContent = '';
    if (select.value === 'new') {
      editor.querySelectorAll('[data-pet-address-field]').forEach((input) => { input.value = ''; });
      const label = picker.querySelector('[data-pet-address-field="label"]'); if (label) label.value = `Address ${loadProfileAddresses().length + 1}`;
      let profile = {};
      try { profile = JSON.parse(sessionStorage.getItem('furgo-demo-user-profile') || '{}'); } catch { profile = {}; }
      editor.querySelector('[data-pet-address-field="name"]').value = profile.name || '';
      editor.querySelector('[data-pet-address-field="phone"]').value = profile.phone || '';
    }
    toggleEditor();
  });
  root.closest('form')?.querySelector('[name="includeTaxi"]')?.addEventListener('change', toggleEditor);
  editor.addEventListener('input', persistAddress);
  editor.addEventListener('change', persistAddress);
  editor.addEventListener('focusout', persistAddress);
  toggleEditor();
}
