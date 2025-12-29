'use strict';

/**
 * Subscription helpers (Stripe).
 * Goal: keep server.js thinner and make access resilient after deploys.
 * - Upgrade-only: we never revoke access here, only restore/extend when Stripe proves it's active.
 * - Works even when Stripe customer email differs: we fallback to checkout session metadata email.
 */

function isoFromUnixSeconds(sec) {
  if (!sec || typeof sec !== 'number') return null;
  return new Date(sec * 1000).toISOString();
}

function isStripeSubActive(status) {
  const s = String(status || '').toLowerCase();
  return s === 'active' || s === 'trialing' || s === 'past_due';
}

function pickBestSubscription(subs) {
  if (!subs || !subs.length) return null;
  // Prefer active/trialing, then the one with the farthest current_period_end.
  const active = subs.filter(s => isStripeSubActive(s && s.status));
  const pool = active.length ? active : subs;
  pool.sort((a, b) => {
    const ae = (a && a.current_period_end) ? Number(a.current_period_end) : 0;
    const be = (b && b.current_period_end) ? Number(b.current_period_end) : 0;
    return be - ae;
  });
  return pool[0] || null;
}

async function safeRetrieveSubscription(stripe, subId) {
  if (!stripe || !subId) return null;
  try {
    return await stripe.subscriptions.retrieve(subId);
  } catch (e) {
    return null;
  }
}

async function listSubscriptionsForCustomer(stripe, customerId) {
  if (!stripe || !customerId) return [];
  try {
    const res = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    return (res && res.data) ? res.data : [];
  } catch (e) {
    return [];
  }
}

async function findSubscriptionByCustomerEmail(stripe, email) {
  if (!stripe || !email) return null;
  try {
    const cust = await stripe.customers.list({ email, limit: 10 });
    const customers = (cust && cust.data) ? cust.data : [];
    for (const c of customers) {
      const subs = await listSubscriptionsForCustomer(stripe, c.id);
      const best = pickBestSubscription(subs);
      if (best) return { customerId: c.id, subscription: best };
    }
  } catch (e) {}
  return null;
}

async function findSubscriptionByMetadataEmail(stripe, email) {
  // Requires Stripe Search API (usually enabled). Safe fallback if not available.
  if (!stripe || !email || !stripe.subscriptions || !stripe.subscriptions.search) return null;
  try {
    const q = `metadata['app_email']:'${String(email).replace(/'/g, "\\'")}'`;
    const res = await stripe.subscriptions.search({ query: q, limit: 5 });
    const subs = (res && res.data) ? res.data : [];
    const best = pickBestSubscription(subs);
    if (!best) return null;
    return { customerId: best.customer, subscription: best };
  } catch (e) {
    return null;
  }
}

async function findSubscriptionViaCheckoutSessions(stripe, email, scanLimit) {
  // Early-stage friendly: scan last N sessions and match metadata.email.
  if (!stripe || !email) return null;
  const limit = Math.max(10, Math.min(Number(scanLimit || 100), 100));
  try {
    const res = await stripe.checkout.sessions.list({ limit });
    const sessions = (res && res.data) ? res.data : [];
    for (const s of sessions) {
      const metaEmail = (s && s.metadata && (s.metadata.email || s.metadata.app_email)) ? String(s.metadata.email || s.metadata.app_email).toLowerCase() : '';
      if (!metaEmail) continue;
      if (metaEmail !== String(email).toLowerCase()) continue;
      if (!s.subscription) continue;
      const sub = await safeRetrieveSubscription(stripe, s.subscription);
      if (!sub) continue;
      return { customerId: s.customer || sub.customer, subscription: sub, checkoutSessionId: s.id };
    }
  } catch (e) {}
  return null;
}

function entitlementFromSubscription(sub, customerId) {
  if (!sub) return null;
  const startAt = isoFromUnixSeconds(sub.current_period_start) || new Date().toISOString();
  const endAt = isoFromUnixSeconds(sub.current_period_end);
  return {
    active: isStripeSubActive(sub.status) && !!endAt,
    startAt,
    endAt,
    stripeCustomerId: customerId || sub.customer || null,
    stripeSubscriptionId: sub.id || null,
    stripeSubStatus: sub.status || null
  };
}

function shouldUpgradeCurrentEnd(currentEndIso, newEndIso) {
  if (!newEndIso) return false;
  try {
    const n = new Date(newEndIso).getTime();
    if (!currentEndIso) return true;
    const c = new Date(currentEndIso).getTime();
    return n > c;
  } catch (e) {
    return true;
  }
}

async function resolveStripeEntitlement(stripe, email, hints) {
  if (!stripe || !email) return null;
  const subHint = hints && hints.stripeSubscriptionId;
  const custHint = hints && hints.stripeCustomerId;

  // 1) direct subscription id
  if (subHint) {
    const sub = await safeRetrieveSubscription(stripe, subHint);
    if (sub) return entitlementFromSubscription(sub, custHint || sub.customer);
  }

  // 2) customer id -> subscriptions
  if (custHint) {
    const subs = await listSubscriptionsForCustomer(stripe, custHint);
    const best = pickBestSubscription(subs);
    if (best) return entitlementFromSubscription(best, custHint);
  }

  // 3) customers.list by email
  const byEmail = await findSubscriptionByCustomerEmail(stripe, email);
  if (byEmail && byEmail.subscription) {
    return entitlementFromSubscription(byEmail.subscription, byEmail.customerId);
  }

  // 4) subscriptions.search by metadata (new checkouts)
  const byMeta = await findSubscriptionByMetadataEmail(stripe, email);
  if (byMeta && byMeta.subscription) {
    return entitlementFromSubscription(byMeta.subscription, byMeta.customerId);
  }

  // 5) fallback: scan last checkout sessions by metadata.email
  const bySessions = await findSubscriptionViaCheckoutSessions(stripe, email, 100);
  if (bySessions && bySessions.subscription) {
    const ent = entitlementFromSubscription(bySessions.subscription, bySessions.customerId);
    if (ent) ent.checkoutSessionId = bySessions.checkoutSessionId;
    return ent;
  }

  return null;
}

/**
 * Upgrade-only sync: if Stripe proves active, restore user.status/endAt.
 * @returns {Promise<{updated:boolean, reason?:string, entitlement?:object}>}
 */
async function maybeSyncStripeForUser(stripe, user, saveUsers, opts) {
  if (!stripe || !user || !user.email) return { updated: false, reason: 'no_stripe_or_user' };
  const force = !!(opts && opts.force);
  const minIntervalMs = (opts && opts.minIntervalMs) ? Number(opts.minIntervalMs) : 60_000;

  try {
    if (!force && user.stripeLastSyncAt) {
      const last = new Date(user.stripeLastSyncAt).getTime();
      if (last && (Date.now() - last) < minIntervalMs) {
        return { updated: false, reason: 'throttled' };
      }
    }
  } catch (e) {}

  const ent = await resolveStripeEntitlement(stripe, String(user.email).toLowerCase(), {
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId
  });

  user.stripeLastSyncAt = new Date().toISOString();

  if (!ent || !ent.active) {
    if (saveUsers) saveUsers();
    return { updated: false, reason: 'no_active_entitlement', entitlement: ent || null };
  }

  let changed = false;

  // Upgrade-only: extend endAt if Stripe is later or if user isn't active.
  if (user.status !== 'active') { user.status = 'active'; changed = true; }
  if (shouldUpgradeCurrentEnd(user.endAt, ent.endAt)) { user.endAt = ent.endAt; changed = true; }
  if (!user.startAt || shouldUpgradeCurrentEnd(user.startAt, ent.startAt)) { user.startAt = ent.startAt; changed = true; }
  if (!user.demoUsed) { user.demoUsed = true; changed = true; }

  if (ent.stripeCustomerId && user.stripeCustomerId !== ent.stripeCustomerId) { user.stripeCustomerId = ent.stripeCustomerId; changed = true; }
  if (ent.stripeSubscriptionId && user.stripeSubscriptionId !== ent.stripeSubscriptionId) { user.stripeSubscriptionId = ent.stripeSubscriptionId; changed = true; }
  if (ent.stripeSubStatus && user.stripeSubStatus !== ent.stripeSubStatus) { user.stripeSubStatus = ent.stripeSubStatus; changed = true; }
  if (ent.checkoutSessionId && user.stripeLastCheckoutSessionId !== ent.checkoutSessionId) { user.stripeLastCheckoutSessionId = ent.checkoutSessionId; changed = true; }

  if (saveUsers) saveUsers();
  return { updated: changed, reason: changed ? 'upgraded' : 'already_ok', entitlement: ent };
}

module.exports = {
  maybeSyncStripeForUser,
  resolveStripeEntitlement,
  entitlementFromSubscription,
  isoFromUnixSeconds,
  isStripeSubActive
};
