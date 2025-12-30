// Subscription helpers (Stripe → local user record)
// Goal: make access reliable even if webhooks were missed or state was lost after deploy.

function toIsoFromUnixSeconds(sec) {
  const n = Number(sec);
  if (!isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(e) {
  return String(e || '').toLowerCase().trim();
}

function pickBestSub(subscriptions) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  if (!list.length) return null;

  const now = Date.now();
  const score = (s) => {
    if (!s) return -1;
    const st = String(s.status || '').toLowerCase();

    // Best: active/trialing
    if (st === 'active') return 100;
    if (st === 'trialing') return 90;

    // Still likely usable: past_due for a short time (Stripe can keep it active-ish)
    if (st === 'past_due') {
      const end = (s.current_period_end ? Number(s.current_period_end) * 1000 : 0);
      // If period end is in the future, we treat it as usable.
      if (end && end > now) return 70;
      return 50;
    }

    return 0;
  };

  return list
    .slice()
    .sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds) return ds;
      const ae = Number(a && a.current_period_end ? a.current_period_end : 0);
      const be = Number(b && b.current_period_end ? b.current_period_end : 0);
      return be - ae;
    })[0] || null;
}

function isUsableSubscription(sub) {
  if (!sub) return false;
  const st = String(sub.status || '').toLowerCase();
  if (!['active', 'trialing', 'past_due'].includes(st)) return false;
  const endMs = sub.current_period_end ? (Number(sub.current_period_end) * 1000) : 0;
  if (endMs && isFinite(endMs) && endMs < Date.now()) return false;
  return true;
}


async function findActiveSubscriptionByEmail(stripe, email) {
  const e = normalizeEmail(email);
  if (!e) return null;

  // Stripe can have multiple customers with the same email (humans are creative).
  const customers = await stripe.customers.list({ email: e, limit: 10 });
  const data = (customers && customers.data) ? customers.data : [];
  if (!data.length) return null;

  for (const c of data) {
    try {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 20 });
      const best = pickBestSub((subs && subs.data) ? subs.data : []);
      if (best && isUsableSubscription(best)) {
        return { customer: c, subscription: best };
      }
    } catch (_e) {
      // ignore and keep searching other customers
    }
  }

  return null;
}

function applyStripeSubscriptionToUser(user, customer, subscription) {
  if (!user || !subscription) return false;

  const st = String(subscription.status || '').toLowerCase();
  const startIso = toIsoFromUnixSeconds(subscription.current_period_start) || nowIso();
  const endIso   = toIsoFromUnixSeconds(subscription.current_period_end);

  // Map Stripe state to our coarse app states
  user.status = isUsableSubscription(subscription) ? 'active' : 'ended';
  user.startAt = startIso;
  if (endIso) user.endAt = endIso;
  user.demoUsed = true;

  if (customer && customer.id) user.stripeCustomerId = customer.id;
  user.stripeSubId = subscription.id;
  user.lastStripeSyncAt = nowIso();
  return true;
}


async function maybeSyncUserFromStripe(stripe, user, saveUsers, opts) {
  opts = opts || {};
  if (!stripe || !user || !user.email) return false;

  const cooldownMs = Number(opts.cooldownMs) || 10 * 60 * 1000; // 10 min
  const force = !!opts.force;

  const last = user.lastStripeSyncAt ? new Date(user.lastStripeSyncAt).getTime() : 0;
  if (!force && last && isFinite(last) && (Date.now() - last) < cooldownMs) {
    return false;
  }

  const endMs = user.endAt ? new Date(user.endAt).getTime() : 0;
  const needsSync = force || !user.status || user.status === 'ended' || !user.endAt || (isFinite(endMs) && endMs < Date.now());
  if (!needsSync) return false;

  // Prefer stored Stripe IDs (survives email mismatch + lets us recover after deploy)
  if (user.stripeSubId) {
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubId);
      const custId = (typeof sub.customer === 'string') ? sub.customer : null;
      const cust = custId ? await stripe.customers.retrieve(custId) : null;

      // Keep customer id even if this subscription id is stale.
      if (custId && !user.stripeCustomerId) user.stripeCustomerId = custId;

      if (isUsableSubscription(sub)) {
        applyStripeSubscriptionToUser(user, cust || {}, sub);
        user.lastStripeSyncAt = now.toISOString();
        await saveUsers();
        return true;
      }
      // Stale subscription id: fall through to find a newer active one.
    } catch (e) {
      console.warn('[SYNC] Failed to retrieve subscription by stripeSubId, fallback to email search');
    }
  }
  if (user.stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 20 });
      const best = pickBestSub(subs.data || []);
      if (best && isUsableSubscription(best)) {
        const cust = await stripe.customers.retrieve(user.stripeCustomerId);
        applyStripeSubscriptionToUser(user, cust || {}, best);
        user.lastStripeSyncAt = now.toISOString();
        await saveUsers();
        return true;
      }
    } catch (e) {
      console.warn('[SYNC] Failed to list subscriptions by stripeCustomerId, fallback to email search');
    }
  }

  const found = await findActiveSubscriptionByEmail(stripe, user.email);
  if (found && found.subscription) {
    const ok = applyStripeSubscriptionToUser(user, found.customer, found.subscription);
    if (ok && typeof saveUsers === 'function') saveUsers();
    return ok;
  }

  // No active subscription found. Still record that we checked (so we don't hammer Stripe).
  user.lastStripeSyncAt = nowIso();
  if (typeof saveUsers === 'function') saveUsers();
  return false;
}

async function handleStripeEvent(event, ctx) {
  const stripe = ctx && ctx.stripe;
  const findUserByEmail = ctx && ctx.findUserByEmail;
  const saveUsers = ctx && ctx.saveUsers;

  if (!stripe || !event || !event.type || typeof findUserByEmail !== 'function') return;

  const type = String(event.type);

  // 1) Checkout completed (first purchase)
  if (type === 'checkout.session.completed') {
    const session = event.data && event.data.object;
    const email =
      (session && session.metadata && session.metadata.email) ||
      (session && session.customer_details && session.customer_details.email) ||
      (session && session.customer_email) ||
      '';

    if (!email) return;
    const u = findUserByEmail(email);
    if (!u) return;

    let customer = null;
    let sub = null;

    try {
      if (session && session.customer) customer = await stripe.customers.retrieve(session.customer);
    } catch (_e) {}

    try {
      if (session && session.subscription) sub = await stripe.subscriptions.retrieve(session.subscription);
    } catch (_e) {}

    if (sub) {
      applyStripeSubscriptionToUser(u, customer, sub);
      if (typeof saveUsers === 'function') saveUsers();
      return;
    }

    // Fallback: if subscription retrieval failed, try searching by email.
    try {
      await maybeSyncUserFromStripe(stripe, u, saveUsers, { force: true });
    } catch (_e) {}
    return;
  }

  // 2) Invoice paid (renewals)
  if (type === 'invoice.paid') {
    const inv = event.data && event.data.object;
    const customerId = inv && inv.customer;
    const subId = inv && inv.subscription;
    if (!customerId || !subId) return;

    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer && customer.email;
      if (!email) return;
      const u = findUserByEmail(email);
      if (!u) return;

      const sub = await stripe.subscriptions.retrieve(subId);
      if (!sub) return;

      applyStripeSubscriptionToUser(u, customer, sub);
      if (typeof saveUsers === 'function') saveUsers();
    } catch (_e) {}
    return;
  }

  // 3) Subscription updated (status/period changes)
  
  // Recurring billing: invoice events are the most reliable "money went through" signal
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    const inv = event.data.object || {};
    const subId = inv.subscription;
    const custId = inv.customer;
    if (!subId) return null;

    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      const cust = custId ? await stripe.customers.retrieve(custId) : null;

      const email = normalizeEmail((cust && cust.email) ? cust.email : (inv.customer_email || ''));
      if (!email) return null;

      const u = findUserByEmail(email);
      if (!u) return null;

      applyStripeSubscriptionToUser(u, cust || {}, sub);
      u.stripeCustomerId = custId || u.stripeCustomerId || null;
      u.stripeSubId = sub.id || u.stripeSubId || null;

      await saveUsers();
      return { ok: true, type, email, status: u.status, endAt: u.endAt };
    } catch (e) {
      console.error('[WEBHOOK] invoice sync failed', e && e.message ? e.message : e);
      return null;
    }
  }

if (type === 'customer.subscription.updated') {
    const sub = event.data && event.data.object;
    if (!sub || !sub.customer) return;
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer && customer.email;
      if (!email) return;
      const u = findUserByEmail(email);
      if (!u) return;

      const st = String(sub.status || '').toLowerCase();
      if (['active', 'trialing', 'past_due'].includes(st)) {
        applyStripeSubscriptionToUser(u, customer, sub);
      }
      if (typeof saveUsers === 'function') saveUsers();
    } catch (_e) {}
    return;
  }

  // 4) Subscription deleted (cancelled/ended)
  if (type === 'customer.subscription.deleted') {
    const sub = event.data && event.data.object;
    if (!sub || !sub.customer) return;
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer && customer.email;
      if (!email) return;
      const u = findUserByEmail(email);
      if (!u) return;

      u.status = 'ended';
      u.endAt = nowIso();
      u.lastStripeSyncAt = nowIso();
      if (typeof saveUsers === 'function') saveUsers();
    } catch (_e) {}
    return;
  }
}

module.exports = {
  maybeSyncUserFromStripe,
  handleStripeEvent,
  findActiveSubscriptionByEmail,
  applyStripeSubscriptionToUser
};
