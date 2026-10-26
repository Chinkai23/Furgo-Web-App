import { supabase } from '../supabase.js';

export const outletDirectoryKey = 'furgo-service-outlet-directory';

function readDirectory() {
  try {
    const saved = JSON.parse(localStorage.getItem(outletDirectoryKey) || 'null');
    if (!saved || !Array.isArray(saved.names)) return null;
    return saved.names.map((name) => String(name || '').trim()).filter(Boolean);
  } catch { return null; }
}

// Returns the latest outlet names shared from Admin Access → Manage Outlets.
export function getSharedOutletNames(fallback = []) {
  return readDirectory() ?? fallback;
}

export function cacheSharedOutlets(outlets = []) {
  const names = [...new Set(outlets.map((outlet) => String(typeof outlet === 'string' ? outlet : outlet?.name || '').trim()).filter(Boolean))];
  try { localStorage.setItem(outletDirectoryKey, JSON.stringify({ names, updatedAt: new Date().toISOString() })); } catch { /* Keep pages usable if local storage is unavailable. */ }
  return names;
}

// The public RPC only returns active outlet names; staff setup metadata stays private.
export async function refreshSharedOutlets() {
  const { data, error } = await supabase.rpc('get_service_outlets');
  if (error) return getSharedOutletNames();
  return cacheSharedOutlets(Array.isArray(data) ? data : []);
}
