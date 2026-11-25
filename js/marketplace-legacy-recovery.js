// Public wrapping key for the Furgo Dev v1 recovery queue. The private half
// is held outside the application and is used only for verified recovery.
const recoveryPublicKey = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAv0Ewn4aFDSOeBrtWSmCyEzz73TeJ5ES7ZxWNA+2Wh+lnyFK3XhtfODFhuz2AFw3MNP3cLWl5b7XiQ7fTEx3o4l7wuDrTHSLiA31WD4UGFYhOrrOXNcqmFqPGokdax5nvzDxXCJdSzUK/00XUlZs411Th4pZYIFHMHtQNhlMTZoGFPp2izsxZw1Axkp+s5IeFovHnqSvPTrGQ8sNCg5IxAdCKdod/B7HjdWeu2l3vBZTHM6B9NxL/D4kjvH9NiNNP2JjWSxy+Vy3BJxwzlH22hTz8+6tzd5CJhFZozEEVIWTPSju0Fl4H4uYEkCjwFnFsN9+TGeV1zcbt5WRVbCQRR8VDqP0awT5tjA54avEHhCiOqdVirtgWzury2T1XFcZcbVC0kRu/WTZXmCKbvhHpR8YMbIqMjKy6LZC5rbQhMsCoXQpKk6RmOCrqT/AyBFdA3+v3zxqFzy6uhEbwWErSg9ivvgrRH80AuWhac+7QCycSyaIh98dzdGa9Na5IMBEvAgMBAAE=';
const protocol = 'furgo-marketplace-legacy-v1';
const marketplaceOrdersKey = 'furgo-demo-marketplace-orders';
const oldArchivePrefix = 'furgo-marketplace-order-archive:';
const encoder = new TextEncoder();
let recoveryDatabase;
let sealing;

function base64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return btoa(binary);
}

function openRecoveryDatabase() {
  if (!recoveryDatabase) {
    recoveryDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('furgo-marketplace-legacy-recovery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The legacy recovery store is blocked by another tab.'));
      request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
      recoveryDatabase = undefined;
      throw error;
    });
  }
  return recoveryDatabase;
}

async function useRecoveryStore(mode, operation) {
  const database = await openRecoveryDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('snapshots', mode, { durability: 'strict' });
    const request = operation(transaction.objectStore('snapshots'));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = () => reject(transaction.error || new Error('Legacy recovery storage was interrupted.'));
  });
}

async function sealSnapshot(snapshot, publicKey) {
  const bytes = encoder.encode(snapshot);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const [wrapped, ciphertext, digest] = await Promise.all([
    crypto.subtle.wrapKey('raw', key, publicKey, 'RSA-OAEP'),
    crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(protocol) }, key, bytes),
    crypto.subtle.digest('SHA-256', bytes),
  ]);
  return {
    storageId: base64(new Uint8Array(digest)),
    envelope: [protocol, base64(new Uint8Array(wrapped)), base64(iv), base64(new Uint8Array(ciphertext))].join('.'),
  };
}

async function sealLegacyStorage() {
  const keys = Object.keys(localStorage).filter((key) => key === marketplaceOrdersKey || key.startsWith(oldArchivePrefix));
  if (!keys.length) return;
  const publicKey = await crypto.subtle.importKey(
    'spki', Uint8Array.from(atob(recoveryPublicKey), (character) => character.charCodeAt(0)),
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey'],
  );

  for (const key of keys) {
    // Re-read inside the loop if another tab changes a legacy value.
    let snapshot = localStorage.getItem(key);
    while (snapshot != null) {
      if (snapshot && snapshot !== '[]') {
        const sealed = await sealSnapshot(snapshot, publicKey);
        await useRecoveryStore('readwrite', (store) => {
          const lookup = store.get(sealed.storageId);
          lookup.onsuccess = () => {
            // Keep the original ciphertext so an uncertain upload can be retried.
            if (!lookup.result && localStorage.getItem(key) === snapshot) store.add(sealed, sealed.storageId);
          };
        });
      }
      if (localStorage.getItem(key) === snapshot) localStorage.removeItem(key);
      snapshot = localStorage.getItem(key);
    }
  }
}

export function sealMarketplaceLegacySnapshots() {
  if (!sealing) sealing = sealLegacyStorage().finally(() => { sealing = undefined; });
  return sealing;
}

export async function uploadMarketplaceLegacySnapshots(preserve) {
  await sealMarketplaceLegacySnapshots();
  const sealed = await useRecoveryStore('readonly', (store) => store.getAll());
  for (const { storageId, envelope } of sealed) {
    if (await preserve(envelope) !== true) throw new Error('Legacy history preservation was not acknowledged.');
    await useRecoveryStore('readwrite', (store) => store.delete(storageId));
  }
}
