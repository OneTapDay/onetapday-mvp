/**
 * Subscription helpers (Stripe-first, local file second).
 *
 * Why this exists:
 * - server.js grew into a monster.
 * - Paid users were losing access after deploys/updates because the app relied
 *   on locally persisted status fields (users.json) that can reset or get stale.
 *
 * This module provides:
 * - a safe "upgrade-only" Stripe sync (never revokes access)
 * - small utilities to extract subscription periods from Stripe objects
 */

function _isoFromUnix(sec) {
  if (!sec) return null;
  const n = Number(sec);
  if (!isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function _nowMs() {
  return Date.now();
}

function _parseTimeMs(iso) {
  if (!iso) return 0;
  const t = new Date(String(iso)).getTime();
  return isFinite(t) ? t : 0;
}

function shouldStripeSync(user, nowMs, minIntervalMs) {
  if (!user) return false;
  const status = String(user.status || 'none');
  const endMs = _parseTimeMs(user.endAt);
  const last = _parseTimeMs(user.stripeLastSyncAt);

  // If we synced recently, don't spam Stripe.
  if (last && (nowMs - last) < minIntervalMs) return false;

  // If user is not active, or end is missing/expired, attempt recovery.
  if (status !== 'active' && status !== 'discount_active') return true;
  if (!endMs) return true;
  if (endMs < nowMs) return true;
  return false;
}

function pickBestActiveSubscription(subs, nowMs) {
  const list = Array.isArray(subs) ? subs : [];
  const okStatuses = new Set(['active', 'trialing', 'past_due']);

  const candidates = list
    .filter(s => s && okStatuses.has(String(s.status || '')))
    .map(s => {
      const endIso = _isoFromUnix(s.current_period_end);
      const endMs = endIso ? _parseTimeMs(endIso) : 0;
      return { sub: s, endMs, endIso };
    })
    .filter(x => x.endMs && x.endMs > nowMs);

  // Pick the one that ends the latest.
  candidates.sort((a, b) => (b.endMs - a.endMs));
  return candidates.length ? candidates[0].sub : null;
}

async function findActiveSubscriptionByEmail(stripe, email, hintCustomerId) {
  if (!stripe || !email) return null;

  // 1) Try hinted customer id first (fast path)
  if (hintCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: hintCustomerId, status: 'all', limit: 20 });
      const best = pickBestActiveSubscription((subs && subs.data) || [], _nowMs());
      if (best) return { customerId: hintCustomerId, subscription: best };
    } catch (_e) {
      // ignore, fallback to email search
    }
  }

  // 2) Find customers by email (Stripe supports filtering customers list by email).
  let customers = [];
  try {
    const cs = await stripe.customers.list({ email: String(email), limit: 10 });
    customers = (cs && cs.data) ? cs.data : [];
  } catch (_e) {
    customers = [];
  }

  // 3) For each customer, try to find an active subscription.
  const nowMs = _nowMs();
  for (const c of customers) {
    if (!c || !c.id) continue;
    try {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 20 });
      const best = pickBestActiveSubscription((subs && subs.data) || [], nowMs);
      if (best) return { customerId: c.id, subscription: best };
    } catch (_e) {
      // continue
    }
  }

  return null;
}

function extractPeriodFromSubscription(sub) {
  if (!sub) return { startIso: null, endIso: null };
  return {
    startIso: _isoFromUnix(sub.current_period_start) || null,
    endIso: _isoFromUnix(sub.current_period_end) || null,
  };
}

/**
 * Upgrade-only sync:
 * - If Stripe says there's an active subscription, we set user.status=active and update dates.
 * - If Stripe has nothing, we DO NOTHING (no revocation).
 */
async function maybeSyncStripeForUser({ stripe, stripeConfigured, user, saveUsers, log = console }) {
  if (!stripeConfigured || !stripe || !user || !user.email) return { synced: false, reason: 'stripe_not_configured' };

  const nowMs = _nowMs();
  const minIntervalMs = 10 * 60 * 1000; // 10 minutes
  if (!shouldStripeSync(user, nowMs, minIntervalMs)) return { synced: false, reason: 'skip_interval' };

  const email = String(user.email);
  const hintCustomerId = user.stripeCustomerId || null;

  const found = await findActiveSubscriptionByEmail(stripe, email, hintCustomerId);
  user.stripeLastSyncAt = new Date().toISOString();

  if (!found || !found.subscription) {
    try { if (typeof saveUsers === 'function') saveUsers(); } catch(_e) {}
    return { synced: false, reason: 'no_active_subscription' };
  }

  const sub = found.subscription;
  const period = extractPeriodFromSubscription(sub);
  const startIso = period.startIso || user.startAt || new Date().toISOString();
  const endIso = period.endIso || user.endAt || null;

  if (!endIso) {
    // If Stripe didn't provide dates for some reason, don't change access state.
    try { if (typeof saveUsers === 'function') saveUsers(); } catch(_e) {}
    return { synced: false, reason: 'missing_period' };
  }

  // Upgrade access
  user.status = 'active';
  user.startAt = startIso;
  user.endAt = endIso;
  user.demoUsed = true;
  user.stripeCustomerId = found.customerId || user.stripeCustomerId || null;
  user.stripeSubscriptionId = sub.id || user.stripeSubscriptionId || null;
  user.stripeSubStatus = String(sub.status || '');

  try { if (typeof saveUsers === 'function') saveUsers(); } catch(_e) {}
  try { log && log.log && log.log(`[STRIPE-SYNC] upgraded ${email} until ${endIso}`); } catch(_e) {}

  return { synced: true, endAt: endIso };
}

module.exports = {
  shouldStripeSync,
  extractPeriodFromSubscription,
  findActiveSubscriptionByEmail,
  maybeSyncStripeForUser,
};
