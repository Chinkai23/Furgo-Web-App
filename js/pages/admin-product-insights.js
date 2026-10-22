import { escapeHTML } from '../shared.js';
import { supabase } from '../supabase.js';

const money = (value) => `MYR ${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const integer = (value) => Number(value || 0).toLocaleString('en-MY');

function dataTable(rows, columns, emptyText) {
  if (!Array.isArray(rows) || rows.length === 0) return `<p class="admin-market-empty">${escapeHTML(emptyText)}</p>`;
  return `<div class="admin-product-insights-table-wrap"><table class="admin-product-insights-table"><thead><tr>${columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr>${columns.map((column) => `<td>${escapeHTML(String(column.value(row) ?? '—'))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function adminProductServiceInsightsPage() {
  return `<main class="admin-portal-page admin-product-insights-page"><header class="admin-portal-header"><a class="admin-portal-brand" href="#admin"><img src="Image/Icon/Logo.png" alt="Furgo" /><span>Admin Portal</span></a><div class="admin-portal-account"><a href="#admin-access">Admin</a><button type="button" data-logout>Log out</button></div></header><header class="admin-market-heading"><a href="#admin-access" aria-label="Back to Admin">‹</a><div><span>Director reports</span><h1>Product &amp; Service Insights</h1></div></header><section class="admin-product-insights-filters"><label>Date range<select data-product-insights-days><option value="30">Last 30 days</option><option value="365" selected>Last 12 months</option><option value="1825">Last 5 years</option><option value="3650">Last 10 years</option></select></label><label>Timeline grouped by<select data-product-insights-granularity><option value="day">Day</option><option value="month" selected>Month</option><option value="year">Year</option></select></label><p>Purchase and service activity is aggregated without showing customer names or contact details. Daily view is limited to the last 90 days.</p></section><div class="admin-product-insights-content" data-product-insights-content role="status" aria-live="polite">Loading business insights…</div></main>`;
}

export function setupAdminProductServiceInsights() {
  const root = document.querySelector('.admin-product-insights-page');
  const content = root?.querySelector('[data-product-insights-content]');
  const days = root?.querySelector('[data-product-insights-days]');
  const granularity = root?.querySelector('[data-product-insights-granularity]');
  if (!root || !content || !days || !granularity) return;

  const render = async () => {
    content.textContent = 'Loading business insights…';
    const { data, error } = await supabase.rpc('get_director_product_service_insights', {
      p_days: Number(days.value),
      p_granularity: granularity.value,
    });
    if (error) {
      content.innerHTML = `<p class="admin-product-insights-error">${escapeHTML(error.message || 'Could not load product and service insights. Apply migration 0013 in Supabase.')}</p>`;
      return;
    }
    const totals = data?.totals || {};
    const timeline = data?.timeline || [];
    const products = data?.products || [];
    const breeds = data?.pet_breeds || [];
    const weights = data?.pet_weight_bands || [];
    const segments = data?.service_pet_segments || [];
    const serviceLocations = data?.service_locations || [];
    const marketplaceLocations = data?.marketplace_locations || [];
    const grainName = { day: 'day', month: 'month', year: 'year' }[data?.granularity] || 'month';
    const trendColumns = [
      { label: grainName[0].toUpperCase() + grainName.slice(1), value: (row) => new Date(`${row.period}T00:00:00`).toLocaleDateString('en-MY', data?.granularity === 'year' ? { year: 'numeric' } : data?.granularity === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }) },
      { label: 'Marketplace orders', value: (row) => integer(row.marketplace_orders) },
      { label: 'Product units', value: (row) => integer(row.product_units) },
      { label: 'Product sales', value: (row) => money(row.marketplace_sales) },
      { label: 'Grooming', value: (row) => integer(row.grooming_bookings) },
      { label: 'Pet Hotel', value: (row) => integer(row.hotel_bookings) },
      { label: 'Daycare', value: (row) => integer(row.daycare_bookings) },
      { label: 'Service sales', value: (row) => money(row.service_sales) },
    ];
    const productColumns = [
      { label: 'Product', value: (row) => row.name },
      { label: 'Category', value: (row) => row.category },
      { label: 'Nutrition information', value: (row) => row.nutrition },
      { label: 'Ingredients', value: (row) => row.ingredients },
      { label: 'Units', value: (row) => integer(row.units_sold) },
      { label: 'Orders', value: (row) => integer(row.orders) },
      { label: 'Sales', value: (row) => money(row.sales) },
    ];
    const segmentColumns = [
      { label: 'Service', value: (row) => row.service },
      { label: 'Pet breed', value: (row) => row.breed },
      { label: 'Pet weight band', value: (row) => row.weight_band },
      { label: 'Bookings', value: (row) => integer(row.bookings) },
      { label: 'Sales', value: (row) => money(row.sales) },
    ];
    content.innerHTML = `<section class="admin-product-insights-stats"><article class="admin-product-insights-stat"><span>Marketplace orders</span><strong>${integer(totals.marketplace_orders)}</strong></article><article class="admin-product-insights-stat"><span>Product units sold</span><strong>${integer(totals.product_units)}</strong></article><article class="admin-product-insights-stat"><span>Product sales</span><strong>${money(totals.marketplace_sales)}</strong></article><article class="admin-product-insights-stat"><span>Service bookings</span><strong>${integer(totals.service_bookings)}</strong></article><article class="admin-product-insights-stat"><span>Service sales</span><strong>${money(totals.service_sales)}</strong></article><article class="admin-product-insights-stat"><span>Current pet profiles</span><strong>${integer(totals.pet_profiles)}</strong></article></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Purchase timeline</span><h2>Sales And Bookings By ${escapeHTML(grainName)}</h2></div><p>Marketplace totals include orders marked paid. Cancelled service bookings are excluded.</p></div>${dataTable(timeline, trendColumns, 'No purchase or service activity in this date range.')}</section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Product demand</span><h2>Products And Nutrition Information</h2></div><p>Each row combines product nutrition and ingredient details with paid purchase counts, units, and sales.</p></div>${dataTable(products, productColumns, 'No paid product purchases in this date range.')}</section><section class="admin-product-insights-grid"><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer pets</span><h2>Breed Distribution</h2></div><p>Current pet profiles across all dates.</p></div>${dataTable(breeds, [{ label: 'Breed', value: (row) => row.breed }, { label: 'Pets', value: (row) => integer(row.pets) }], 'No pet profiles recorded.')}</section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Customer pets</span><h2>Weight Bands</h2></div><p>Current pet profiles across all dates.</p></div>${dataTable(weights, [{ label: 'Weight band', value: (row) => row.weight_band }, { label: 'Pets', value: (row) => integer(row.pets) }], 'No pet weight data recorded.')}</section></section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Service demand</span><h2>Bookings By Pet Profile</h2></div><p>Service records include a pet snapshot, so these counts can be grouped by the breed and weight recorded for each booking.</p></div>${dataTable(segments, segmentColumns, 'No service bookings with pet details in this date range.')}</section><section class="admin-product-insights-grid"><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Service locations</span><h2>Bookings By Outlet</h2></div></div>${dataTable(serviceLocations, [{ label: 'Service', value: (row) => row.service }, { label: 'Outlet', value: (row) => row.location }, { label: 'Bookings', value: (row) => integer(row.bookings) }], 'No service location data recorded.')}</section><section class="admin-market-panel"><div class="admin-market-panel-heading"><div><span>Marketplace locations</span><h2>Delivery Areas</h2></div><p>City and state only; street address and customer identity are not included.</p></div>${dataTable(marketplaceLocations, [{ label: 'City', value: (row) => row.city }, { label: 'State', value: (row) => row.state }, { label: 'Orders', value: (row) => integer(row.orders) }], 'No paid delivery location data recorded.')}</section></section>`;
  };

  days.addEventListener('change', render);
  granularity.addEventListener('change', render);
  void render();
}
