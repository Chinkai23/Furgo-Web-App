// Persist the exact request before sending it. There is one unresolved stock
// movement per operator so a changed form cannot replace an uncertain request.
export async function submitWarehouseStockRequest(supabase, actorId, operation, fields, requestId = crypto.randomUUID()) {
  return withStockRequestLock(actorId, async (key) => {
    const pending = readPendingRequest(key);
    if (pending) {
      if (pending.operation !== operation || JSON.stringify(pending.fields) !== JSON.stringify(fields)) {
        throw new Error('A previous stock movement is awaiting confirmation. Reconnect or reload to recover it first.');
      }
      return sendStockRequest(supabase, actorId, key, pending);
    }

    const request = { requestId, operation, fields };
    localStorage.setItem(key, JSON.stringify(request));
    return sendStockRequest(supabase, actorId, key, request);
  });
}

export async function recoverWarehouseStockRequest(supabase, actorId) {
  return withStockRequestLock(actorId, async (key) => {
    const pending = readPendingRequest(key);
    if (!pending) return null;
    await sendStockRequest(supabase, actorId, key, pending);
    return pending.operation;
  });
}

const activeRequests = new Map();

function withStockRequestLock(actorId, action) {
  const key = `furgo-warehouse-stock-request:${actorId}`;
  if (!actorId) throw new Error('Sign in to manage warehouse stock.');
  if (navigator.locks) return navigator.locks.request(key, () => action(key));
  const running = activeRequests.get(key);
  const next = (running || Promise.resolve()).catch(() => {}).then(() => action(key));
  activeRequests.set(key, next);
  return next.finally(() => {
    if (activeRequests.get(key) === next) activeRequests.delete(key);
  });
}

function readPendingRequest(key) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : null;
}

async function sendStockRequest(supabase, actorId, key, request) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData?.user?.id !== actorId) {
    throw new Error('Sign in again with the account that submitted this stock movement.');
  }
  const { operation, fields, requestId } = request;
  const response = operation === 'receive'
    ? await supabase.rpc('receive_warehouse_inventory_lot', { p_request_id: requestId, p_lot: fields })
    : await supabase.rpc('adjust_warehouse_inventory_lot', { ...fields, p_request_id: requestId });

  if (response.error) {
    // A SQL rejection rolled back the transaction. Gateway errors and missing
    // responses leave the original request available for recovery.
    if (/^(PT(403|409|422)|22[A-Z0-9]{3}|23[A-Z0-9]{3})$/.test(response.error.code || '')) {
      localStorage.removeItem(key);
      throw response.error;
    }
    throw new Error('Stock confirmation is pending. Reconnect or reload to recover the request.');
  }
  if (!response.data?.lot_id) throw new Error('Stock confirmation is pending. Reconnect or reload to recover the request.');
  localStorage.removeItem(key);
  return response.data;
}
