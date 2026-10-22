import { supabase } from './supabase.js';

// Store a short, non-sensitive summary of an authenticated portal action.
export async function recordAdminAction(action, targetType, targetId = '', details = {}) {
  const { error } = await supabase.rpc('log_admin_action', {
    p_action: String(action || '').slice(0, 80),
    p_target_type: String(targetType || '').slice(0, 60),
    p_target_id: String(targetId || '').slice(0, 120),
    p_details: details && typeof details === 'object' ? details : {},
  });
  if (error) console.warn('Admin activity could not be recorded:', error.message);
}
