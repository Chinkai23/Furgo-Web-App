import { cachedFurgoCoinBalance, applyFurgoCoinBalance, readFurgoCoinEnergyBalance } from '../coin-wallet.js';

const nutritionistImage = 'Image/Other%20Image/AI%20Nutritionist.png';

export function aiNutritionistPage() {
  return `<main class="pet-assistant-page ai-nutritionist-page" data-ai-nutritionist>
    <header class="pet-assistant-header"><a href="#home" aria-label="Back to Home">‹</a><div class="pet-assistant-title"><span>Furgo AI</span><h1>AI Nutritionist</h1></div><span class="pet-assistant-header-spacer" aria-hidden="true"></span></header>
    <div class="pet-assistant-energy-layout">
      <section class="pet-assistant-energy-banner" data-nutritionist-energy aria-label="Nutritionist’s Energy">
        <div class="pet-assistant-energy-right-content">
          <h2 class="pet-assistant-energy-title">Nutritionist’s Energy</h2>
          <div class="pet-assistant-energy-main">
            <button class="button button-primary pet-assistant-energy-feed" type="button" data-nutritionist-energy-topup>Add 100 Energy</button>
            <p class="pet-assistant-energy-rate">1 Furgo Coin = 100 Energy</p>
            <div class="pet-assistant-energy-coins"><img src="Image/Other%20Image/Pet%20Token-1.png" alt="" /><span><strong data-nutritionist-coins>${cachedFurgoCoinBalance().toLocaleString()}</strong> Furgo Coins Left</span></div>
            <span class="pet-assistant-energy-status" data-nutritionist-energy-status role="status" aria-live="polite"></span>
          </div>
        </div>
        <div class="pet-assistant-energy-meter" role="progressbar" aria-label="Nutritionist energy remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><filter id="pet-assistant-ring-inner-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="ring-blur"/><feOffset in="ring-blur" dy="1" result="ring-offset"/><feComposite in="SourceAlpha" in2="ring-offset" operator="out" result="ring-inner-edge"/><feFlood flood-color="#713c1f" flood-opacity=".24" result="ring-shadow-color"/><feComposite in="ring-shadow-color" in2="ring-inner-edge" operator="in" result="ring-inner-shadow"/><feComposite in="ring-inner-shadow" in2="SourceGraphic" operator="over"/></filter></defs><circle class="pet-assistant-energy-ring-track" cx="60" cy="60" r="52"></circle><circle class="pet-assistant-energy-ring-progress" cx="60" cy="60" r="52" data-nutritionist-energy-fill></circle></svg><div class="pet-assistant-energy-meter-copy"><strong data-nutritionist-energy-value>0</strong><span>Energy Left</span></div></div>
      </section>
    </div>
    <section class="pet-assistant-chat" aria-label="AI Nutritionist chat">
      <div class="pet-assistant-chat-header"><div class="pet-assistant-chat-header-copy"><strong>AI CHAT SYSTEM</strong><span>AI can make mistakes. Confirm nutrition advice with your veterinarian.</span></div></div>
      <div class="pet-assistant-messages" role="log" aria-live="polite"><article class="pet-assistant-message is-assistant"><img class="pet-assistant-message-avatar" src="${nutritionistImage}" alt="AI Nutritionist" /><div class="pet-assistant-message-content"><span class="pet-assistant-message-name">AI Nutritionist</span><div class="pet-assistant-message-bubble"><p>Hi! I’m your AI Nutritionist. Nutrition guidance will be available here soon.</p></div></div></article></div>
      <form class="pet-assistant-composer ai-nutritionist-composer" aria-label="Nutritionist message composer"><textarea aria-label="Write a message" rows="1" placeholder="AI Nutritionist chat is coming soon…" disabled></textarea><button type="button" aria-label="Send message" disabled>➤</button></form>
    </section>
  </main>`;
}

export function setupAiNutritionist(supabase) {
  const root = document.querySelector('[data-ai-nutritionist]');
  if (!root) return;
  const energyValue = root.querySelector('[data-nutritionist-energy-value]');
  const energyFill = root.querySelector('[data-nutritionist-energy-fill]');
  const energyMeter = root.querySelector('.pet-assistant-energy-meter');
  const coinValue = root.querySelector('[data-nutritionist-coins]');
  const status = root.querySelector('[data-nutritionist-energy-status]');
  const topup = root.querySelector('[data-nutritionist-energy-topup]');
  let energyBalance = 0;
  let coinBalance = cachedFurgoCoinBalance();
  let busy = false;

  const renderEnergy = () => {
    if (energyValue) energyValue.textContent = energyBalance.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (energyFill) energyFill.style.strokeDashoffset = String(326.73 * (1 - Math.max(0, Math.min(100, energyBalance)) / 100));
    if (energyMeter) energyMeter.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, energyBalance))));
    if (coinValue) coinValue.textContent = coinBalance.toLocaleString();
    if (topup) topup.disabled = busy || coinBalance < 1;
  };

  const refreshEnergy = async () => {
    if (!supabase?.rpc) return;
    try {
      const wallet = await readFurgoCoinEnergyBalance(supabase);
      energyBalance = wallet.energyBalance;
      coinBalance = wallet.coinBalance;
      applyFurgoCoinBalance(coinBalance);
      if (status) status.textContent = '';
    } catch (error) {
      if (status) status.textContent = 'Energy balance is unavailable right now.';
      console.info('AI Nutritionist Energy could not be loaded:', error?.message || error);
    }
    renderEnergy();
  };

  renderEnergy();
  void refreshEnergy();
  topup?.addEventListener('click', async () => {
    if (busy || coinBalance < 1 || !supabase?.rpc) return;
    busy = true;
    if (status) status.textContent = 'Adding 100 Energy…';
    renderEnergy();
    try {
      const { data, error } = await supabase.rpc('purchase_pet_assistant_energy');
      if (error) throw error;
      energyBalance = Math.max(0, Number(data?.energy_balance) || 0);
      coinBalance = Math.max(0, Number(data?.coin_balance) || 0);
      applyFurgoCoinBalance(coinBalance);
      if (status) status.textContent = '100 Energy added.';
    } catch (error) {
      if (status) status.textContent = error?.message || 'Could not add Energy. Please try again.';
    } finally {
      busy = false;
      renderEnergy();
    }
  });
}
