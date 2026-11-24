import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const categoryByEvent: Record<string, string> = {
  marketplace_order_status: 'orders_services',
  service_booking_update: 'orders_services',
  pet_reminder: 'pet_reminders',
  pet_care_update: 'pet_care_updates',
  furgo_update: 'furgo_updates',
};
const orderAction = (eventType: string) => eventType === 'marketplace_order_status' || eventType === 'service_booking_update' ? '#orders' : eventType === 'pet_reminder' || eventType === 'pet_care_update' ? '#pet-profile' : '#home';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const expectedSecret = Deno.env.get('FURGO_PUSH_WEBHOOK_SECRET');
  if (!expectedSecret || request.headers.get('x-furgo-webhook-secret') !== expectedSecret) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    return Response.json({ error: 'Push environment is incomplete.' }, { status: 503 });
  }

  let webhook: { type?: string; table?: string; record?: Record<string, unknown> };
  try { webhook = await request.json(); } catch { return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 }); }
  const record = webhook.record;
  if (webhook.table !== 'portal_notifications' || webhook.type !== 'INSERT' || !record) return Response.json({ skipped: true });

  const eventType = String(record.event_type || '');
  const category = categoryByEvent[eventType];
  const recipient = String(record.recipient_user_id || '');
  if (!category || !recipient) return Response.json({ skipped: true });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: preferenceRow }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
    admin.from('portal_notification_preferences').select('preferences').eq('user_id', recipient).maybeSingle(),
    admin.from('portal_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', recipient),
  ]);
  if (subscriptionError) return Response.json({ error: 'Could not load push subscriptions.' }, { status: 500 });
  const preference = preferenceRow?.preferences?.[category] || {};
  if (preference.browser !== true || !subscriptions?.length) return Response.json({ sent: 0, skipped: true });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: String(record.title || 'Furgo'),
    body: String(record.message || 'You have a new Furgo update.'),
    tag: String(record.id || record.entity_id || ''),
    icon: 'Image/Icon/Logo.png',
    data: { url: orderAction(eventType) },
  });
  let sent = 0;
  const expiredIds: string[] = [];
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
      else console.warn('Push delivery failed:', error);
    }
  }));
  if (expiredIds.length) await admin.from('portal_push_subscriptions').delete().in('id', expiredIds);
  return Response.json({ sent, removedExpired: expiredIds.length });
});
