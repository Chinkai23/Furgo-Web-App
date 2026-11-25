import {
  cacheSyncedRecords, findMarketplaceCheckout, marketplaceCheckoutOwner, quoteMarketplaceOrder,
  refreshMarketplaceCatalogFromDatabase, refreshMarketplaceDemoCredit, saveMarketplaceOrder, syncConfirmedMarketplaceCart,
} from './app-data-sync.js';
import {
  loadMarketplaceCart, loadMarketplaceCartSelection, marketplaceCartKey, marketplaceCartLineKey,
  marketplaceCartSelectionKey, marketplaceCheckoutSelectionKey, marketplaceLine,
} from './pages/marketplace-data.js';

// Checkout amounts are kept in cents until display or the existing order JSON format.
export function marketplaceMoneyCents(value) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? ''));
  if (!match) return 0;
  const fraction = (match[2] || '').padEnd(3, '0');
  const cents = Number(match[1]) * 100 + Number(fraction.slice(0, 2)) + Number(fraction[2] >= '5');
  return Number.isSafeInteger(cents) ? cents : 0;
}

export function formatMarketplaceCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function checkoutCartLineKey({ productId, variantId }) {
  return JSON.stringify([productId, variantId]);
}

export function cartAfterMarketplaceCheckout(cart, submittedCart, items) {
  const original = new Map(submittedCart.map((line) => [checkoutCartLineKey(line), line.quantity]));
  const purchased = new Map(items.map((line) => [checkoutCartLineKey(line), line.quantity]));
  // Preserve a line if it was removed or decreased while checkout was in flight.
  return cart.flatMap((line) => {
    const key = checkoutCartLineKey(line);
    const quantity = Number(line.quantity);
    const purchasedQuantity = purchased.get(key);
    const submittedQuantity = original.get(key);
    if (!submittedQuantity || !purchasedQuantity || quantity < Math.max(submittedQuantity, purchasedQuantity)) return [line];
    return quantity === purchasedQuantity ? [] : [{ ...line, quantity: quantity - purchasedQuantity }];
  });
}

let checkoutDatabase;
function openCheckoutDatabase() {
  if (!checkoutDatabase) {
    checkoutDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('furgo-marketplace-checkout', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attempts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      checkoutDatabase = null;
      throw error;
    });
  }
  return checkoutDatabase;
}

// A single persisted attempt per account lets different tabs recover the same
// request, including its original slip. Successful attempts remove that data.
async function checkoutAttempt(owner, change) {
  const database = await openCheckoutDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('attempts', change ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('attempts');
    const lookup = store.get(owner);
    let result;
    lookup.onsuccess = () => {
      const existing = lookup.result || null;
      result = change ? change(existing) : existing;
      if (!change || result === existing) return;
      if (result) store.put(result, owner);
      else store.delete(owner);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error('Checkout recovery storage is unavailable.'));
  });
}

export const readCheckoutAttempt = (owner) => checkoutAttempt(owner);
export const startCheckoutAttempt = (owner, attempt) => checkoutAttempt(owner, (existing) => existing || attempt);
export const updateCheckoutAttempt = (owner, id, update) => checkoutAttempt(owner, (existing) =>
  existing?.id === id ? update(existing) : existing);

const activeCheckouts = new Set();

export async function withMarketplaceCheckout(owner, run) {
  if (activeCheckouts.has(owner)) return;
  activeCheckouts.add(owner);
  try {
    if (navigator.locks) return await navigator.locks.request(`furgo-checkout:${owner}`, run);
    return await run();
  } finally {
    activeCheckouts.delete(owner);
  }
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : null;
  } catch { return null; }
}

function readTransferSlip(file) {
  if (!file || file.size > 1.5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG, WebP or PDF transfer slip up to 1.5 MB.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = () => reject(new Error('The transfer slip could not be read. Choose it again.'));
    reader.readAsDataURL(file);
  });
}

async function reconcileMarketplaceCheckout(owner, attempt, order) {
  if (owner !== marketplaceCheckoutOwner()) return;
  const resolution = await updateCheckoutAttempt(owner, attempt.id, (pending) => {
    if (pending.resolution) return pending;
    const current = loadMarketplaceCart();
    return {
      id: pending.id,
      resolution: {
        cartBefore: JSON.stringify(current),
        cartAfter: cartAfterMarketplaceCheckout(current, pending.payload.items, order.items),
        selection: pending.selection,
        savedAddress: pending.saveAddress ? pending.payload.address : null,
      },
    };
  });
  if (!resolution?.resolution || resolution.id !== attempt.id || owner !== marketplaceCheckoutOwner()) return;
  const { cartBefore, cartAfter, selection, savedAddress } = resolution.resolution;
  const currentCart = JSON.stringify(loadMarketplaceCart());
  if (currentCart === cartBefore) cacheSyncedRecords(marketplaceCartKey, cartAfter, { notify: false });
  if (currentCart === cartBefore || currentCart === JSON.stringify(cartAfter)) {
    // Retain the confirmed attempt until a synced cart reload can see the change.
    await syncConfirmedMarketplaceCart(owner, cartAfter);
  }
  if (owner !== marketplaceCheckoutOwner()) return;
  const selectionKeys = new Set(loadMarketplaceCart().map(marketplaceCartLineKey));
  const savedSelection = loadMarketplaceCartSelection();
  if (savedSelection) {
    localStorage.setItem(marketplaceCartSelectionKey, JSON.stringify(savedSelection.filter((key) => selectionKeys.has(key))));
  }
  if (localStorage.getItem(marketplaceCheckoutSelectionKey) === selection) localStorage.removeItem(marketplaceCheckoutSelectionKey);
  if (savedAddress) {
    const key = 'furgo-demo-addresses';
    const addresses = readStoredArray(key) || [];
    if (!addresses.some((address) => Object.keys(savedAddress).every((field) => address[field] === savedAddress[field]))) {
      localStorage.setItem(key, JSON.stringify([...addresses, { label: 'Delivery', ...savedAddress }]));
    }
  }
  await updateCheckoutAttempt(owner, attempt.id, () => null);
  if (order.paymentChannel === 'demo_credit') void refreshMarketplaceDemoCredit(owner).catch(console.warn);
  void refreshMarketplaceCatalogFromDatabase().catch(console.warn);
  if (window.location.hash.split('?')[0] === '#checkout') window.location.hash = '#orders?from=marketplace';
}

function readCheckoutAddress(form, addressSelect) {
  if (addressSelect && addressSelect.value !== 'manual') {
    const saved = readStoredArray('furgo-demo-addresses')?.[Number(addressSelect.value)];
    if (saved) {
      const fields = ['name', 'phone', 'street', 'postcode', 'city', 'state'];
      return Object.fromEntries(fields.map((field) => [field, String(saved[field] || '').trim()]));
    }
    throw new Error('Choose or enter a delivery address.');
  }
  return {
    name: form.elements.recipient.value.trim(),
    phone: form.elements.phone.value.trim(),
    street: form.elements.street.value.trim(),
    postcode: form.elements.postcode.value.trim(),
    city: form.elements.city.value.trim(),
    state: form.elements.state.value.trim(),
  };
}

export function setupMarketplaceCheckout() {
  if (window.location.hash.split('?')[0] !== '#checkout') return;
  const form = document.querySelector('[data-market-checkout]');
  const submit = form?.querySelector('[type="submit"]') || document.querySelector('[data-checkout-retry]');
  const feedback = form?.querySelector('.form-feedback') || document.querySelector('[data-checkout-recovery]');
  if (!submit || !feedback) return;
  const addressSelect = form?.querySelector('[data-saved-address]');
  const total = form?.querySelector('[data-checkout-total]');
  const owner = marketplaceCheckoutOwner();
  const selection = localStorage.getItem(marketplaceCheckoutSelectionKey);
  const selectedKeys = readStoredArray(marketplaceCheckoutSelectionKey);
  const items = loadMarketplaceCart().filter((line) => !selectedKeys || selectedKeys.includes(marketplaceCartLineKey(line)))
    .filter((line) => marketplaceLine(line))
    .map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity: Number(quantity) }));
  let appliedVoucher = '';
  let busy = false;
  const show = (message, error = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('visible', Boolean(message));
    feedback.classList.toggle('is-error', error);
  };
  const showQuote = (quote) => {
    if (!total) return;
    const money = (cents) => `MYR ${formatMarketplaceCents(cents)}`;
    total.textContent = money(quote.totalCents);
    total.dataset.totalCents = String(quote.totalCents);
    form.querySelector('[data-checkout-subtotal]').textContent = money(quote.subtotalCents);
    const shipping = quote.shippingCents - quote.shippingDiscountCents;
    form.querySelector('[data-checkout-shipping]').textContent = shipping ? money(shipping) : 'Free';
    for (const [selector, cents] of [['[data-checkout-discount]', quote.discountCents], ['[data-checkout-shipping-discount]', quote.shippingDiscountCents]]) {
      const row = form.querySelector(selector);
      row.hidden = !cents;
      row.querySelector('b').textContent = `− ${money(cents)}`;
    }
    const summaryLines = form.querySelectorAll('[data-checkout-line-total]');
    const reviewLines = form.querySelectorAll('[data-checkout-review-total]');
    const unitPrices = form.querySelectorAll('[data-checkout-unit-price]');
    quote.items.forEach((item) => {
      const index = item.inputIndex - 1;
      if (summaryLines[index]) summaryLines[index].textContent = money(item.lineTotalCents);
      if (reviewLines[index]) reviewLines[index].textContent = money(item.lineTotalCents);
      if (unitPrices[index]) unitPrices[index].textContent = `${money(item.unitPriceCents)} each · Quantity ${item.quantity}`;
    });
  };
  const confirmAmount = (before, after) => before === after || window.confirm(
    `The checkout total changed from MYR ${formatMarketplaceCents(before)} to MYR ${formatMarketplaceCents(after)}. Place the order at the updated total?`,
  );
  const run = async (callback) => {
    if (busy) return;
    if (!owner || owner !== marketplaceCheckoutOwner()) { show('Please sign in before placing your order.', true); return; }
    busy = true;
    submit.disabled = true;
    try { await withMarketplaceCheckout(owner, callback); }
    catch (error) { show(error.message || 'Checkout could not be completed. Please try again.', true); }
    finally { busy = false; submit.disabled = false; }
  };
  const finish = async (attempt, order) => {
    try { await reconcileMarketplaceCheckout(owner, attempt, order); }
    catch (error) {
      console.warn('The Marketplace order was placed, but the cart could not be reconciled:', error);
      show('Order placed. Retry to finish updating your cart.');
    }
  };
  const send = async (initialAttempt) => {
    let attempt = initialAttempt;
    while (attempt) {
      let result;
      try {
        result = await saveMarketplaceOrder(owner, attempt);
      } catch (error) {
        if (['PT400', 'PT402', 'PT403', 'PT422'].includes(error.code)) {
          await updateCheckoutAttempt(owner, attempt.id, () => null);
          show(error.message, true);
          if (error.code === 'PT402') {
            const link = document.createElement('a');
            link.href = '#credit?from=checkout';
            link.className = 'market-credit-link';
            link.textContent = 'Go to My Furgo Credit';
            feedback.append(link);
          }
        } else {
          show('We could not confirm this order yet. Retry to check the same checkout before placing another order.', true);
        }
        return;
      }
      if (result.order) { await finish(attempt, result.order); return; }
      showQuote(result.quote);
      if (!confirmAmount(attempt.totalCents, result.quote.totalCents)) {
        await updateCheckoutAttempt(owner, attempt.id, () => null);
        show('Review the updated total and place the order when you are ready.');
        return;
      }
      const totalCents = result.quote.totalCents;
      attempt = await updateCheckoutAttempt(owner, attempt.id, (pending) => ({ ...pending, totalCents }));
    }
  };

  if (form) {
    const transferUpload = form.querySelector('[data-transfer-upload]');
    const manualAddress = form.querySelector('[data-manual-address]');
    const updateAddressFields = () => {
      const saved = Boolean(addressSelect && addressSelect.value !== 'manual');
      manualAddress.hidden = saved;
      manualAddress.querySelectorAll('input').forEach((input) => {
        input.disabled = saved;
        input.required = !saved && input.name !== 'saveAddress';
      });
    };
    const updateTransferField = () => {
      const transfer = form.elements.payment.value === 'bank-transfer';
      transferUpload.hidden = !transfer;
      transferUpload.querySelector('input').required = transfer;
    };
    addressSelect?.addEventListener('change', updateAddressFields);
    form.querySelectorAll('[name="payment"]').forEach((input) => input.addEventListener('change', updateTransferField));
    updateAddressFields();
    updateTransferField();

    const couponButton = form.querySelector('[data-apply-coupon]');
    const couponInput = form.querySelector('[data-market-coupon]');
    couponInput.addEventListener('input', () => { appliedVoucher = ''; });
    couponButton.addEventListener('click', async () => {
      const message = form.querySelector('[data-coupon-feedback]');
      const code = couponInput.value.trim().toUpperCase();
      couponButton.disabled = true;
      appliedVoucher = '';
      try {
        const quote = await quoteMarketplaceOrder(items, code);
        if (couponInput.value.trim().toUpperCase() !== code) return;
        showQuote(quote);
        appliedVoucher = code;
        message.textContent = code ? `${code} applied.` : '';
        message.className = 'market-coupon-feedback success';
      } catch (error) {
        message.textContent = error.message || 'That voucher could not be applied.';
        message.className = 'market-coupon-feedback error';
      } finally { couponButton.disabled = false; }
    });
    // Recover the submitted attempt before validating empty fields after a reload.
    form.noValidate = true;
  }

  const submitCheckout = (event) => {
    event.preventDefault();
    void run(async () => {
      show('');
      const pending = await readCheckoutAttempt(owner);
      if (pending) {
        const order = await findMarketplaceCheckout(owner, pending.id);
        if (order) await finish(pending, order);
        else if (!pending.resolution) await send(pending);
        else show('The confirmed order is temporarily unavailable. Please retry.', true);
        return;
      }
      if (!form?.reportValidity()) return;
      const address = readCheckoutAddress(form, addressSelect);
      const payment = form.elements.payment.value;
      const voucherCode = appliedVoucher;
      const currentCart = new Map(loadMarketplaceCart().map((line) => [checkoutCartLineKey(line), Number(line.quantity)]));
      if (localStorage.getItem(marketplaceCheckoutSelectionKey) !== selection
        || items.some((item) => currentCart.get(checkoutCartLineKey(item)) !== item.quantity)) {
        show('Your cart changed. Reopen checkout to review the selected products.', true);
        return;
      }
      const saveAddress = Boolean(form.elements.saveAddress?.checked && !form.elements.saveAddress.disabled);
      const transferSlip = payment === 'bank-transfer' ? await readTransferSlip(form.elements.transferSlip.files?.[0]) : null;
      submit.textContent = 'Saving Order…';
      try {
        const displayed = Number(total.dataset.totalCents);
        const quote = await quoteMarketplaceOrder(items, voucherCode);
        showQuote(quote);
        if (!confirmAmount(displayed, quote.totalCents)) return;
        const attempt = {
          id: crypto.randomUUID(), payload: { items, address, voucherCode, payment, transferSlip },
          selection, saveAddress, totalCents: quote.totalCents,
        };
        const persisted = await startCheckoutAttempt(owner, attempt);
        if (persisted.resolution) {
          const order = await findMarketplaceCheckout(owner, persisted.id);
          if (order) await finish(persisted, order);
          return;
        }
        await send(persisted);
      } finally { submit.textContent = 'Place Order'; }
    });
  };
  if (form) form.addEventListener('submit', submitCheckout);
  else submit.addEventListener('click', submitCheckout);

  if (!owner) return;
  void run(async () => {
    const pending = await readCheckoutAttempt(owner);
    if (!pending) return;
    if (!form) submit.hidden = false;
    const order = await findMarketplaceCheckout(owner, pending.id);
    if (order) await finish(pending, order);
    else show('Retry to finish the checkout you already submitted.');
  });
}
