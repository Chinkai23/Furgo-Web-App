// Section: Furgo Coin wallet display
// Function: Keep the visible balance in sync with the authenticated Supabase wallet.
export const furgoCoinBalanceKey = 'furgo-demo-token-balance';

export function cachedFurgoCoinBalance() {
  try { return Math.max(0, Number(localStorage.getItem(furgoCoinBalanceKey) || 0) || 0); }
  catch { return 0; }
}

export function applyFurgoCoinBalance(value) {
  const balance = Math.max(0, Number(value) || 0);
  try { localStorage.setItem(furgoCoinBalanceKey, String(balance)); } catch { /* UI can still update without browser storage. */ }
  document.querySelectorAll('[data-furgo-coins-balance]').forEach((element) => {
    element.textContent = balance.toLocaleString();
  });
  document.dispatchEvent(new CustomEvent('furgo-coins-balance-updated', { detail: { balance } }));
  return balance;
}

export async function readFurgoCoinEnergyBalance(supabase) {
  if (!supabase?.rpc) throw new Error('Furgo wallet is not connected.');
  const { data, error } = await supabase.rpc('get_furgo_coin_energy_balance');
  if (error) throw error;
  return {
    coinBalance: Math.max(0, Number(data?.coin_balance) || 0),
    energyBalance: Math.max(0, Number(data?.energy_balance) || 0),
  };
}

export async function refreshFurgoCoinBalance(supabase) {
  if (!document.querySelector('[data-furgo-coins-balance]')) return null;
  try {
    const wallet = await readFurgoCoinEnergyBalance(supabase);
    applyFurgoCoinBalance(wallet.coinBalance);
    return wallet;
  } catch (error) {
    console.info('Furgo Coin balance is showing its saved preview value:', error?.message || error);
    return null;
  }
}
