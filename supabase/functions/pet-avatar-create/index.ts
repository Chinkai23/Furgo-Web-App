// Creates one Furgo-style pet mascot from an authenticated customer's dog photo.
// OPENAI_API_KEY remains server-side in Supabase Edge Function secrets.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const VISION_MODEL = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-6-luna';
const IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2.5-sunburst';
const MAX_DATA_URL_LENGTH = 7_000_000;
const MAX_DAILY_AVATARS = 3;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function keyFromJsonSecret(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) return '';
  try {
    const keys = JSON.parse(raw);
    if (typeof keys === 'string') return keys;
    return String(keys.default || Object.values(keys)[0] || '');
  } catch {
    return raw;
  }
}

function outputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === 'string') return response.output_text.trim();
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    const content = (item as Record<string, unknown>)?.content;
    return Array.isArray(content) ? content : [];
  }).map((item) => {
    const row = item as Record<string, unknown>;
    return row.type === 'output_text' && typeof row.text === 'string' ? row.text : '';
  }).filter(Boolean).join('\n').trim();
}

function dataImage(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_DATA_URL_LENGTH
    && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(value);
}

async function dailyUsageCount(baseUrl: string, serviceKey: string, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = new URL('/rest/v1/pet_avatar_usage', baseUrl);
  url.searchParams.set('select', 'id');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('created_at', `gte.${since}`);
  const response = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact', Range: '0-99' },
  });
  if (!response.ok) throw new Error('Unable to check avatar creation limits.');
  const match = (response.headers.get('content-range') || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function safetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST to create a pet avatar.' });

  const accessToken = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!accessToken) return jsonResponse(401, { error: 'Sign in to create a pet avatar.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') || keyFromJsonSecret('SUPABASE_PUBLISHABLE_KEYS');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || keyFromJsonSecret('SUPABASE_SECRET_KEYS');
  const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!supabaseUrl || !publishableKey || !serviceKey || !openaiKey) {
    console.error('Pet avatar creation is missing a required server secret.');
    return jsonResponse(500, { error: 'Avatar creation is not configured yet.' });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonResponse(400, { error: 'The avatar request was not valid JSON.' }); }
  const photo = body.photo;
  const styleReference = body.style_reference;
  if (!dataImage(photo) || !dataImage(styleReference)) {
    return jsonResponse(400, { error: 'Choose a valid pet photo and Furgo style reference.' });
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!authResponse.ok) return jsonResponse(401, { error: 'Your session expired. Sign in again to create an avatar.' });
    const user = await authResponse.json();
    const userId = String(user?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return jsonResponse(401, { error: 'Could not verify your Furgo account.' });

    if (await dailyUsageCount(supabaseUrl, serviceKey, userId) >= MAX_DAILY_AVATARS) {
      return jsonResponse(429, { error: 'You have reached today’s avatar creation limit. Please try again tomorrow.' });
    }

    const visionResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: VISION_MODEL,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Check whether this photo clearly shows the face of at least one real dog. Ignore toys, drawings, and images of other animals. Return exactly one JSON object: {"dog_face_detected":true} or {"dog_face_detected":false}.' },
            { type: 'input_image', image_url: photo, detail: 'low' },
          ],
        }],
        max_output_tokens: 40,
        store: false,
      }),
    });
    const visionResult = await visionResponse.json().catch(() => ({}));
    if (!visionResponse.ok) {
      console.error('Pet photo check failed:', visionResponse.status, visionResult?.error?.code || 'upstream_error');
      return jsonResponse(502, { error: 'Could not check that photo right now. Please try again.' });
    }
    const visionText = outputText(visionResult);
    const jsonMatch = visionText.match(/\{[\s\S]*\}/);
    let dogDetected = false;
    try { dogDetected = JSON.parse(jsonMatch?.[0] || '{}')?.dog_face_detected === true; } catch { dogDetected = false; }
    if (!dogDetected) return jsonResponse(422, { code: 'dog_not_detected', error: 'No dog detected. Please upload a clear photo showing your dog’s face.' });

    const imageResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        images: [{ image_url: photo }, { image_url: styleReference }],
        prompt: 'Create one polished Furgo pet mascot by turning the dog shown in the first reference image into the exact illustration style and composition of the second reference image. Preserve the real dog’s recognizable breed-specific facial features, coat color, markings, and ear shape. Match the second image exactly in pose, body proportions, camera angle, size, framing, and centered placement: a friendly, front-facing, full-body dog sitting upright, wearing the same orange Furgo cap and orange polo shirt. Keep the complete character visible from cap to paws, occupying the same amount of the square canvas as the style reference. Use a fully transparent background. Do not add text, extra objects, a border, a badge, or a background. The final image must look like another member of the same Furgo mascot set.',
        background: 'transparent',
        output_format: 'webp',
        quality: 'medium',
        size: '1024x1024',
        n: 1,
        safety_identifier: await safetyIdentifier(userId),
      }),
    });
    const imageResult = await imageResponse.json().catch(() => ({}));
    const generated = imageResult?.data?.[0]?.b64_json;
    if (!imageResponse.ok || typeof generated !== 'string') {
      console.error('Pet avatar generation failed:', imageResponse.status, imageResult?.error?.code || 'upstream_error');
      return jsonResponse(502, { error: 'Avatar creation failed. Please try again shortly.' });
    }

    const usageResponse = await fetch(new URL('/rest/v1/pet_avatar_usage', supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ user_id: userId, model: IMAGE_MODEL }),
    });
    if (!usageResponse.ok) console.error('Pet avatar usage could not be recorded:', usageResponse.status);

    return jsonResponse(200, { avatar: `data:image/webp;base64,${generated}` });
  } catch (error) {
    console.error('Pet avatar request failed:', error instanceof Error ? error.message : 'unknown_error');
    return jsonResponse(500, { error: 'Avatar creation hit a temporary error. Please try again.' });
  }
});
