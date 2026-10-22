import { escapeHTML } from '../shared.js';

export const recentSearchesKey = 'furgo-recent-searches';

function readRecentSearches() {
  try {
    const searches = JSON.parse(localStorage.getItem(recentSearchesKey) || '[]');
    return Array.isArray(searches) ? searches.filter((item) => typeof item === 'string').slice(0, 8) : [];
  } catch { return []; }
}

// Dedicated full-screen search view, with recent searches and useful starting points.
export function searchPage() {
  const recents = readRecentSearches();
  const discoveries = [
    ['Pet cookies', 'cookies'], ['Pet food', 'food'], ['Grooming', 'grooming'],
    ['Pet hotel', 'hotel'], ['Pet daycare', 'daycare'], ['Dog toys', 'toys'],
  ];
  return `<main class="search-page" data-search-page>
    <header class="search-page-header">
      <a class="search-back" href="#home" aria-label="Back to Home">‹</a>
      <form class="search-page-form" role="search" data-search-page-form>
        <span class="search-symbol" aria-hidden="true"></span>
        <input type="search" name="query" placeholder="Search products and services" aria-label="Search products and services" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="search-results" aria-expanded="false" data-search-page-input autofocus />
        <button type="submit">Search</button>
      </form>
    </header>
    <section class="search-page-content">
      <section class="search-recent-section" data-recent-section ${recents.length ? '' : 'hidden'}>
        <div class="search-section-heading"><h2>Recent Searches</h2><button type="button" data-clear-searches>Clear all</button></div>
        <div class="search-chips" data-recent-searches>${recents.map((term) => `<button type="button" class="search-chip" data-search-term="${escapeHTML(term)}">${escapeHTML(term)}</button>`).join('')}</div>
      </section>
      <section class="search-discover-section" data-discover-section>
        <h2>Discover</h2>
        <div class="search-discover-grid">${discoveries.map(([label, term]) => `<button type="button" class="search-discover-item" data-search-term="${escapeHTML(term)}">${escapeHTML(label)}</button>`).join('')}</div>
      </section>
      <section class="search-results-section" id="search-results" data-search-results role="region" aria-label="Search results" aria-live="polite" hidden></section>
    </section>
  </main>`;
}
