import { escapeHTML } from '../shared.js';
import { defaultPetAvatarPath, loadPetProfiles, petAvatarUrl, saveSelectedPetAssistantId, selectedPetAssistantId } from './home.js';
import { applyFurgoCoinBalance, cachedFurgoCoinBalance, readFurgoCoinEnergyBalance } from '../coin-wallet.js';

const petAssistantHistoryKey = 'furgo-pet-assistant-preview-history';

function petAssistantPetPhoto(pet) {
  return petAvatarUrl(pet);
}

function readPetAssistantHistory(petId) {
  try {
    const history = JSON.parse(localStorage.getItem(petAssistantHistoryKey) || '{}');
    return Array.isArray(history[petId]) ? history[petId] : [];
  } catch { return []; }
}

function savePetAssistantHistory(petId, messages) {
  try {
    const history = JSON.parse(localStorage.getItem(petAssistantHistoryKey) || '{}');
    history[petId] = messages.slice(-40);
    localStorage.setItem(petAssistantHistoryKey, JSON.stringify(history));
  } catch { /* Keep the chat usable if browser storage is unavailable. */ }
}

function petAssistantMessageMarkup(message, pet) {
  const text = escapeHTML(message.text);
  if (message.role === 'user') return `<article class="pet-assistant-message is-user"><p>${text}</p></article>`;
  return `<article class="pet-assistant-message is-assistant"><img class="pet-assistant-message-avatar" src="${escapeHTML(petAssistantPetPhoto(pet))}" alt="" /><div class="pet-assistant-message-content"><span class="pet-assistant-message-name">${escapeHTML(pet?.name || 'Pet Assistant')}</span><div class="pet-assistant-message-bubble"><p>${text}</p></div></div></article>`;
}

export function petAssistantPage(selectedPetId = '') {
  const pets = loadPetProfiles();
  const selectedPet = pets.find((pet) => String(pet.id) === String(selectedPetId))
    || pets.find((pet) => String(pet.id) === String(selectedPetAssistantId()))
    || pets[0];
  if (selectedPet) saveSelectedPetAssistantId(selectedPet.id);
  const messages = selectedPet ? readPetAssistantHistory(selectedPet.id) : [];
  const messageMarkup = messages.map((message) => petAssistantMessageMarkup(message, selectedPet)).join('');
  const petMenu = pets.map((pet) => `<button class="pet-assistant-pet-menu-option ${selectedPet?.id === pet.id ? 'is-selected' : ''}" type="button" data-pet-assistant-option="${escapeHTML(pet.id)}" role="option" aria-selected="${selectedPet?.id === pet.id}"><img src="${escapeHTML(petAssistantPetPhoto(pet))}" alt="" /><span>${escapeHTML(pet.name)}</span></button>`).join('');
  const petProfileLinkMarkup = selectedPet ? `<a class="pet-assistant-profile-link" href="#pet-profile?id=${encodeURIComponent(selectedPet.id)}&amp;from=home" aria-label="Open ${escapeHTML(selectedPet.name)}’s profile"><img src="Image/Icon/Icon-19.png" alt="" /></a>` : '';
  const petSwitcherMarkup = selectedPet ? `<div class="pet-assistant-pet-switcher"><button class="pet-assistant-pet-switcher-button" type="button" data-pet-assistant-toggle aria-expanded="false" aria-haspopup="listbox"><img src="${escapeHTML(petAssistantPetPhoto(selectedPet))}" alt="" /><span>${escapeHTML(selectedPet.name)}</span><span class="pet-assistant-pet-switcher-chevron" aria-hidden="true"></span></button><div class="pet-assistant-pet-menu" data-pet-assistant-menu role="listbox" aria-label="Choose a pet" hidden>${petMenu}</div></div>` : '';
  return `<main class="pet-assistant-page" data-pet-assistant data-selected-pet="${escapeHTML(selectedPet?.id || '')}">
    <header class="pet-assistant-header"><a href="#home" aria-label="Back to Home">‹</a><div class="pet-assistant-title"><span>Furgo AI</span><h1>Pet Assistant</h1></div>${selectedPet ? `<div class="pet-assistant-header-actions">${petProfileLinkMarkup}</div>` : '<span class="pet-assistant-header-spacer" aria-hidden="true"></span>'}</header>
    ${pets.length ? `<div class="pet-assistant-energy-layout"><section class="pet-assistant-energy-banner" data-pet-assistant-energy aria-label="Pet Assistant Energy"><div class="pet-assistant-energy-right-content"><h2 class="pet-assistant-energy-title">Pet Assistant’s Energy</h2><div class="pet-assistant-energy-main"><button class="button button-primary pet-assistant-energy-feed" type="button" data-pet-assistant-energy-topup>Add 100 Energy</button><p class="pet-assistant-energy-rate">1 Furgo Coin = 100 Energy</p><div class="pet-assistant-energy-coins"><img src="Image/Other%20Image/Pet%20Token-1.png" alt="" /><span><strong data-pet-assistant-coins>${cachedFurgoCoinBalance().toLocaleString()}</strong> Furgo Coins Left</span></div><span class="pet-assistant-energy-status" data-pet-assistant-energy-status role="status" aria-live="polite"></span></div></div><div class="pet-assistant-energy-meter" role="progressbar" aria-label="Energy remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><filter id="pet-assistant-ring-inner-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="ring-blur"/><feOffset in="ring-blur" dy="1" result="ring-offset"/><feComposite in="SourceAlpha" in2="ring-offset" operator="out" result="ring-inner-edge"/><feFlood flood-color="#713c1f" flood-opacity=".24" result="ring-shadow-color"/><feComposite in="ring-shadow-color" in2="ring-inner-edge" operator="in" result="ring-inner-shadow"/><feComposite in="ring-inner-shadow" in2="SourceGraphic" operator="over"/></filter></defs><circle class="pet-assistant-energy-ring-track" cx="60" cy="60" r="52"></circle><circle class="pet-assistant-energy-ring-progress" cx="60" cy="60" r="52" data-pet-assistant-energy-fill></circle></svg><div class="pet-assistant-energy-meter-copy"><strong data-pet-assistant-energy-value>0</strong><span>Energy Left</span></div></div></section></div><section class="pet-assistant-chat" aria-label="Pet Assistant chat"><div class="pet-assistant-chat-header"><div class="pet-assistant-chat-header-copy"><strong>AI CHAT SYSTEM</strong><span>AI can make mistakes. Check important info.</span></div>${petSwitcherMarkup}</div><div class="pet-assistant-messages" data-pet-assistant-messages role="log" aria-live="polite">${messageMarkup || petAssistantMessageMarkup({ role: 'assistant', text: `Hi! Ask me about ${selectedPet.name}, their saved profile, or how to use Furgo.` }, selectedPet)}<p class="pet-assistant-status" data-pet-assistant-status role="status" aria-live="polite"></p></div><form class="pet-assistant-composer" data-pet-assistant-form><textarea id="pet-assistant-message" name="message" aria-label="Write a message" rows="1" maxlength="1200" placeholder="Write a message…" required></textarea><button type="submit" aria-label="Send message">➤</button></form></section>` : `<section class="pet-assistant-no-pets"><img src="${defaultPetAvatarPath}" alt="" /><h2>Add a pet to get started</h2><p>Pet Assistant uses a pet’s saved profile to personalize the chat.</p><a class="button button-primary" href="#pet-profile?mode=add&amp;from=home">Add Pet Profile</a></section>`}
  </main>`;
}

export function setupPetAssistant(supabase) {
  const root = document.querySelector('[data-pet-assistant]');
  if (!root) return;
  const petToggle = root.querySelector('[data-pet-assistant-toggle]');
  const petMenu = root.querySelector('[data-pet-assistant-menu]');
  const messagesElement = root.querySelector('[data-pet-assistant-messages]');
  const form = root.querySelector('[data-pet-assistant-form]');
  const input = form?.elements.message;
  const energyBanner = root.querySelector('[data-pet-assistant-energy]');
  const energyValue = root.querySelector('[data-pet-assistant-energy-value]');
  const energyFill = root.querySelector('[data-pet-assistant-energy-fill]');
  const energyMeter = root.querySelector('.pet-assistant-energy-meter');
  const coinValue = root.querySelector('[data-pet-assistant-coins]');
  const energyStatus = root.querySelector('[data-pet-assistant-energy-status]');
  const energyTopup = root.querySelector('[data-pet-assistant-energy-topup]');
  let energyBalance = 0;
  let coinBalance = cachedFurgoCoinBalance();
  let energyBusy = false;
  let energyLoaded = false;
  const renderEnergy = () => {
    if (energyValue) energyValue.textContent = energyBalance.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const percentage = Math.max(0, Math.min(100, energyBalance));
    if (energyFill) energyFill.style.strokeDashoffset = String(326.73 * (1 - percentage / 100));
    if (energyMeter) energyMeter.setAttribute('aria-valuenow', String(percentage));
    if (coinValue) coinValue.textContent = coinBalance.toLocaleString();
    if (energyTopup) energyTopup.disabled = energyBusy || coinBalance < 1;
  };
  const refreshEnergy = async () => {
    if (!energyBanner || !supabase?.rpc) return;
    try {
      const wallet = await readFurgoCoinEnergyBalance(supabase);
      energyBalance = wallet.energyBalance;
      coinBalance = wallet.coinBalance;
      applyFurgoCoinBalance(coinBalance);
      energyLoaded = true;
      if (energyStatus) energyStatus.textContent = '';
    } catch (error) {
      energyLoaded = true;
      if (energyStatus) energyStatus.textContent = 'Energy balance is unavailable right now.';
      console.info('Pet Assistant Energy could not be loaded:', error?.message || error);
    }
    renderEnergy();
  };
  renderEnergy();
  void refreshEnergy();
  energyTopup?.addEventListener('click', async () => {
    if (energyBusy || coinBalance < 1) return;
    energyBusy = true;
    if (energyStatus) energyStatus.textContent = 'Adding 100 Energy…';
    renderEnergy();
    try {
      const { data, error } = await supabase.rpc('purchase_pet_assistant_energy');
      if (error) throw error;
      energyBalance = Math.max(0, Number(data?.energy_balance) || 0);
      coinBalance = Math.max(0, Number(data?.coin_balance) || 0);
      applyFurgoCoinBalance(coinBalance);
      if (energyStatus) energyStatus.textContent = '100 Energy added.';
    } catch (error) {
      if (energyStatus) energyStatus.textContent = error?.message || 'Could not add Energy. Please try again.';
    } finally {
      energyBusy = false;
      renderEnergy();
    }
  });
  let selectedPetId = root.dataset.selectedPet;
  if (selectedPetId) saveSelectedPetAssistantId(selectedPetId);
  let messages = selectedPetId ? readPetAssistantHistory(selectedPetId) : [];

  const getSelectedPet = () => loadPetProfiles().find((pet) => String(pet.id) === String(selectedPetId));
  const closePetMenu = () => {
    if (!petMenu || !petToggle) return;
    petMenu.hidden = true;
    petToggle.setAttribute('aria-expanded', 'false');
  };

  const renderMessages = () => {
    if (!messagesElement) return;
    const pet = getSelectedPet();
    const greeting = messages.length ? '' : petAssistantMessageMarkup({ role: 'assistant', text: `Hi! Ask me about ${pet?.name || 'your pet'}, their saved profile, or how to use Furgo.` }, pet);
    messagesElement.innerHTML = `${greeting}${messages.map((message) => petAssistantMessageMarkup(message, pet)).join('')}<p class="pet-assistant-status" data-pet-assistant-status role="status" aria-live="polite"></p>`;
    messagesElement.scrollTop = messagesElement.scrollHeight;
  };

  petToggle?.addEventListener('click', () => {
    const isOpen = petToggle.getAttribute('aria-expanded') === 'true';
    petToggle.setAttribute('aria-expanded', String(!isOpen));
    if (petMenu) petMenu.hidden = isOpen;
  });

  root.querySelectorAll('[data-pet-assistant-option]').forEach((option) => option.addEventListener('click', () => {
    selectedPetId = option.dataset.petAssistantOption;
    saveSelectedPetAssistantId(selectedPetId);
    root.dataset.selectedPet = selectedPetId;
    const pet = getSelectedPet();
    if (pet && petToggle) {
      petToggle.querySelector('img').src = petAssistantPetPhoto(pet);
      petToggle.querySelector('span').textContent = pet.name;
      petToggle.setAttribute('aria-label', `Choose a pet. Current pet: ${pet.name}`);
      const profileLink = root.querySelector('.pet-assistant-profile-link');
      if (profileLink) profileLink.href = `#pet-profile?id=${encodeURIComponent(pet.id)}&from=home`;
    }
    root.querySelectorAll('[data-pet-assistant-option]').forEach((item) => {
      const isSelected = item === option;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
    closePetMenu();
    messages = readPetAssistantHistory(selectedPetId);
    renderMessages();
  }));

  root.addEventListener('click', (event) => {
    if (!event.target.closest('.pet-assistant-pet-switcher')) closePetMenu();
  });
  petMenu?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePetMenu(); petToggle?.focus(); }
  });


  const syncComposerButton = () => form?.classList.toggle('has-message', Boolean(String(input?.value || '').trim()));
  input?.addEventListener('input', syncComposerButton);
  syncComposerButton();

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = String(input?.value || '').trim();
    if (!text || !selectedPetId) return;
    if (!energyLoaded) {
      if (energyStatus) energyStatus.textContent = 'Checking your Energy balance…';
      return;
    }
    if (energyBalance <= 0) {
      if (energyStatus) energyStatus.textContent = 'You’re out of Energy. Add 100 Energy with 1 Furgo Coin to continue.';
      return;
    }
    messages.push({ role: 'user', text, createdAt: new Date().toISOString() });
    input.value = '';
    syncComposerButton();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    renderMessages();
    const currentStatus = root.querySelector('[data-pet-assistant-status]');
    if (currentStatus) currentStatus.textContent = 'Thinking…';
    try {
      if (!supabase?.functions) throw new Error('The secure AI service is not connected yet.');
      const history = messages.slice(0, -1).slice(-10).map(({ role, text: content }) => ({ role, content }));
      const { data, error } = await supabase.functions.invoke('pet-assistant-chat', { body: { pet_id: selectedPetId, message: text, history } });
      if (error) throw error;
      energyBalance = Math.max(0, Number(data?.usage?.energy_balance) || 0);
      if (energyStatus) energyStatus.textContent = `Used ${Number(data?.usage?.energy_deducted || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} Energy for this reply.`;
      renderEnergy();
      const answer = String(data?.reply || '').trim();
      if (!answer) throw new Error('Pet Assistant did not return a reply.');
      messages.push({ role: 'assistant', text: answer, createdAt: new Date().toISOString() });
      savePetAssistantHistory(selectedPetId, messages);
      renderMessages();
    } catch (error) {
      const feedback = root.querySelector('[data-pet-assistant-status]');
      let errorMessage = error?.message || 'Pet Assistant could not reply. Please try again.';
      try {
        const response = error?.context;
        if (response?.json) {
          const payload = await response.json();
          if (payload?.energy_balance != null) {
            energyBalance = Math.max(0, Number(payload.energy_balance) || 0);
            renderEnergy();
          }
          errorMessage = payload?.error || errorMessage;
        }
      } catch { /* Keep the Supabase error message if its response body is unavailable. */ }
      if (feedback) feedback.textContent = errorMessage;
      console.info('Pet Assistant reply could not be completed:', error?.message || error);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  renderMessages();
}
