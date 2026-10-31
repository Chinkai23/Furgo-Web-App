// Shared marketplace demo records used by the customer catalog and Admin Portal.
export const marketplaceProductsKey = 'furgo-demo-marketplace-products';
export const marketplaceSuppliersKey = 'furgo-demo-marketplace-suppliers';
const marketplaceTestCatalogResetKey = 'furgo-marketplace-test-catalog-reset-0039';
if (localStorage.getItem(marketplaceTestCatalogResetKey) !== 'done') {
  localStorage.removeItem(marketplaceProductsKey);
  localStorage.removeItem(marketplaceSuppliersKey);
  localStorage.setItem(marketplaceTestCatalogResetKey, 'done');
}
export const marketplaceCartKey = 'furgo-demo-marketplace-cart';
export const marketplaceFavoritesKey = 'furgo-demo-marketplace-favorites';
export const marketplaceOrdersKey = 'furgo-demo-marketplace-orders';
export const marketplaceOfferSettingsKey = 'furgo-demo-marketplace-offers';
export const freeShippingMinimum = 80;
export const defaultMarketplaceOfferSettings = {
  freeShippingMinimum,
  deliveryFee: 8,
  offerTitle: 'Furgo Marketplace offer',
  offerDescription: 'Shop trusted essentials for happier, healthier pets.',
  voucher: { code: 'FURGO10', discountType: 'percent', discountValue: 10, minimumSpend: 50, enabled: true },
  furgoVouchers: [{ id: 'furgo-voucher-default', code: 'FURGO10', discountType: 'percent', discountValue: 10, minimumSpend: 50, enabled: true }],
};

// Loads customer-facing delivery, voucher, and offer settings saved by the Admin Portal.
export function loadMarketplaceOfferSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceOfferSettingsKey) || 'null');
    const settings = {
      ...defaultMarketplaceOfferSettings,
      ...(saved && typeof saved === 'object' ? saved : {}),
      voucher: { ...defaultMarketplaceOfferSettings.voucher, ...(saved?.voucher || {}) },
    };
    // Preserve an intentionally empty list; older saved settings still migrate their single voucher.
    settings.furgoVouchers = Array.isArray(saved?.furgoVouchers)
      ? saved.furgoVouchers
      : saved?.voucher
        ? [{ id: 'furgo-voucher-legacy', ...settings.voucher }]
        : defaultMarketplaceOfferSettings.furgoVouchers;
    return settings;
  } catch { return defaultMarketplaceOfferSettings; }
}

// Allows safe web/local product images and uploaded image data saved by this prototype.
export function safeMarketplaceImage(value) {
  const image = String(value || '').trim();
  if (/^https:\/\//i.test(image)) return image;
  if (/^Image\/[\w ./()-]+\.(png|jpe?g|webp)$/i.test(image)) return image;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(image)) return image;
  return '';
}

const starterCatalog = [];

// Reads the current marketplace catalog; fresh browser profiles start empty.
export function loadMarketplaceProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceProductsKey) || 'null');
    return Array.isArray(saved) ? saved.map((product) => {
      const seeded = starterCatalog.find((item) => item.id === product.id);
      return seeded ? { ...seeded, ...product, suitableBreeds: product.suitableBreeds || seeded.suitableBreeds, issues: product.issues || seeded.issues } : product;
    }) : starterCatalog;
  } catch { return starterCatalog; }
}

// Returns saved supplier contacts plus suppliers already referenced by catalog variants.
export function loadMarketplaceSuppliers(products = loadMarketplaceProducts()) {
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(marketplaceSuppliersKey) || '[]');
    if (Array.isArray(parsed)) saved = parsed;
  } catch { saved = []; }
  const byName = new Map();
  saved.forEach((entry) => {
    const supplier = typeof entry === 'string' ? { name: entry } : entry;
    const name = String(supplier?.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    byName.set(key, { id: String(supplier.id || `supplier-${key.replace(/[^a-z0-9]+/g, '-')}`), name, phone: String(supplier.phone || ''), orderLink: String(supplier.orderLink || '') });
  });
  products.flatMap((product) => product.variants || []).forEach((variant) => {
    const name = String(variant.supplierId || variant.supplier || '').trim();
    if (!name || name.toLowerCase() === 'unassigned') return;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { id: `supplier-${key.replace(/[^a-z0-9]+/g, '-')}`, name, phone: '', orderLink: '' });
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function saveMarketplaceSuppliers(suppliers) {
  localStorage.setItem(marketplaceSuppliersKey, JSON.stringify(suppliers));
}

// Reads the current customer's locally stored multi-item cart.
export function loadMarketplaceCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceCartKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

// Reads unique product IDs saved to this customer's favourite list.
export function loadMarketplaceFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceFavoritesKey) || '[]');
    return Array.isArray(saved) ? [...new Set(saved.map(String))] : [];
  } catch { return []; }
}

// Reads customer order snapshots shared with the Admin Portal prototype.
export function loadMarketplaceOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceOrdersKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

// Calculates a cart line using the selected product variant's current retail price.
export function marketplaceLine(cartItem, products = loadMarketplaceProducts()) {
  const product = products.find((item) => item.id === cartItem.productId);
  const variant = product?.variants.find((item) => item.id === cartItem.variantId);
  if (!product || product.hidden || product.frozenByAdmin || !variant || variant.frozen) return null;
  return { product, variant, quantity: Number(cartItem.quantity) || 1, total: variant.price * (Number(cartItem.quantity) || 1) };
}
