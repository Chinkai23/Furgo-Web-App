// Shared marketplace demo records used by the customer catalog and Admin Portal.
export const marketplaceProductsKey = 'furgo-demo-marketplace-products';
export const marketplaceSuppliersKey = 'furgo-demo-marketplace-suppliers';
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
};

// Loads customer-facing delivery, voucher, and offer settings saved by the Admin Portal.
export function loadMarketplaceOfferSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceOfferSettingsKey) || 'null');
    return {
      ...defaultMarketplaceOfferSettings,
      ...(saved && typeof saved === 'object' ? saved : {}),
      voucher: { ...defaultMarketplaceOfferSettings.voucher, ...(saved?.voucher || {}) },
    };
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

const starterCatalog = [
  { id: 'furgo-food-salmon', name: 'Salmon & Brown Rice Dog Food', category: 'Food', emoji: '🥣', description: 'Complete daily nutrition with salmon as the first ingredient. Suitable for adult dogs.', suitableBreeds: 'All adult breeds; Labrador Retriever, Golden Retriever, Siberian Husky', issues: 'Sensitive digestion, dry coat, everyday balanced nutrition', ingredients: 'Salmon, brown rice, oats, pumpkin, flaxseed, vitamins and minerals.', nutrition: 'Crude protein 26% · Crude fat 14% · Fibre 4% · Moisture 10%', variants: [{ id: '2kg', label: '2 kg bag', price: 58, stock: 18, sku: 'FUR-FOOD-SAL-2K', supplier: 'Paw Pantry Distribution', supplierSku: 'PP-SAL-2', cost: 34 }, { id: '5kg', label: '5 kg bag', price: 118, stock: 9, sku: 'FUR-FOOD-SAL-5K', supplier: 'Paw Pantry Distribution', supplierSku: 'PP-SAL-5', cost: 72 }] },
  { id: 'furgo-treat-chicken', name: 'Air-Dried Chicken Bites', category: 'Snacks', emoji: '🦴', description: 'Single-protein training treats made with gently air-dried chicken.', suitableBreeds: 'All breeds; small dogs, Beagle, Poodle, Labrador Retriever', issues: 'Reward-based training, picky eating, high-value treat', ingredients: 'Chicken breast, vegetable glycerine.', nutrition: 'Crude protein 55% · Crude fat 8% · Fibre 2% · Moisture 12%', variants: [{ id: '80g', label: '80 g pouch', price: 22, stock: 24, sku: 'FUR-SNK-CHK-80', supplier: 'Happy Tails Trading', supplierSku: 'HT-CHK-80', cost: 11 }, { id: '200g', label: '200 g pouch', price: 45, stock: 12, sku: 'FUR-SNK-CHK-200', supplier: 'Happy Tails Trading', supplierSku: 'HT-CHK-200', cost: 24 }] },
  { id: 'furgo-supp-joint', name: 'Daily Joint Support Chews', category: 'Supplements', emoji: '🫙', description: 'Soft daily chews formulated to support mobility and healthy joints.', suitableBreeds: 'Large breeds; Golden Retriever, German Shepherd, Labrador Retriever; senior dogs', issues: 'Joint mobility, stiffness, active or ageing dogs', ingredients: 'Glucosamine, chondroitin, green-lipped mussel, pumpkin.', nutrition: '30 chews · Suggested use: follow the pack guide by body weight.', variants: [{ id: '30ct', label: '30 chews', price: 64, stock: 14, sku: 'FUR-SUP-JNT-30', supplier: 'WellPet Supplies', supplierSku: 'WP-JOINT-30', cost: 37 }] },
  { id: 'furgo-toy-rope', name: 'Cotton Rope Tug Toy', category: 'Toys', emoji: '🪢', description: 'A braided cotton tug toy for supervised play and light chewing.', suitableBreeds: 'Medium and large breeds; Border Collie, Beagle, Labrador Retriever', issues: 'Boredom, enrichment, supervised chewing and tug play', ingredients: 'Natural cotton rope.', nutrition: 'One medium toy · Always supervise play.', variants: [{ id: 'medium', label: 'Medium', price: 26, stock: 20, sku: 'FUR-TOY-ROP-M', supplier: 'Happy Tails Trading', supplierSku: 'HT-ROPE-M', cost: 12 }, { id: 'large', label: 'Large', price: 34, stock: 11, sku: 'FUR-TOY-ROP-L', supplier: 'Happy Tails Trading', supplierSku: 'HT-ROPE-L', cost: 16 }] },
  { id: 'furgo-groom-brush', name: 'Gentle Slicker Brush', category: 'Grooming', emoji: '🪮', description: 'A comfortable everyday brush for loose coat and light tangles.', suitableBreeds: 'Long or double coats; Siberian Husky, Pomeranian, Shih Tzu, Golden Retriever', issues: 'Loose fur, light tangles, regular coat care', ingredients: 'Rounded stainless-steel pins, soft-grip handle.', nutrition: 'Small / Medium size · Clean brush after use.', variants: [{ id: 'sm', label: 'Small', price: 29, stock: 15, sku: 'FUR-GRM-BRU-S', supplier: 'Paw Pantry Distribution', supplierSku: 'PP-BRUSH-S', cost: 14 }, { id: 'md', label: 'Medium', price: 36, stock: 13, sku: 'FUR-GRM-BRU-M', supplier: 'Paw Pantry Distribution', supplierSku: 'PP-BRUSH-M', cost: 18 }] },
  { id: 'furgo-snack-pumpkin', name: 'Pumpkin & Oat Biscuits', category: 'Snacks', emoji: '🍪', description: 'Crunchy oven-baked biscuits made for little reward moments.', suitableBreeds: 'All breeds; small and medium dogs', issues: 'Treat-time variety, reward-based training', ingredients: 'Pumpkin, oats, brown rice flour, coconut oil.', nutrition: 'Crude protein 10% · Crude fat 7% · Fibre 5% · 120 g pack', variants: [{ id: '120g', label: '120 g pack', price: 19, stock: 30, sku: 'FUR-SNK-PMP-120', supplier: 'Paw Pantry Distribution', supplierSku: 'PP-PUMP-120', cost: 8 }] },
];

// Reads the demo catalog or provides seed products for a fresh browser profile.
export function loadMarketplaceProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(marketplaceProductsKey) || 'null');
    return Array.isArray(saved) ? saved.map((product) => {
      const seeded = starterCatalog.find((item) => item.id === product.id);
      return seeded ? { ...seeded, ...product, suitableBreeds: product.suitableBreeds || seeded.suitableBreeds, issues: product.issues || seeded.issues } : product;
    }) : starterCatalog;
  } catch { return starterCatalog; }
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
  if (!product || product.hidden || !variant) return null;
  return { product, variant, quantity: Number(cartItem.quantity) || 1, total: variant.price * (Number(cartItem.quantity) || 1) };
}
