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
  
  try {
    console.log('[SYNC] start', {
      email: user && user.email,
      status: user && user.status,
      force: !!(opts && opts.force),
      stripeCustomerId: user && user.stripeCustomerId,
      stripeSubId: user && user.stripeSubId
    });
  } catch(_e) {}

const score = (s) => {
    if (!s) return -1;
    const st = String(s.status || '').toLowerCase();

    // Best: active/trialing
    if (st === 'active') return 100;
    if (st === 'trialing') return 90;

    // Still likely usable: past_due for a short time (Stripe can keep it active-ish)
    if (st === 'past_due') {
      const end = (s.current_period_end ? Number(s.current_period_end) * 1000 : 0);
      if (end && end > now) return 70;
      return 50;
    }

    // If Stripe says it's not active but period end is still in the future, it can still be usable
    const end = (s.current_period_end ? Number(s.current_period_end) * 1000 : 0);
    if (end && end > now) return 30;

    return 0;
  };

  return list
    .slice()
    .sort((a, b) => score(b) - score(a))[0] || null;
}

async function findActiveSubscriptionByEmail(stripe, email) {
  const e = normalizeEmail(email);
  if (!e) return null;

  const customers = await stripe.customers.list({ email: e, limit: 10 });
  const data = (customers && customers.data) ? customers.data : [];
  if (!data.length) return null;

  for (const c of data) {
    try {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 20 });
      const best = pickBestSub((subs && subs.data) ? subs.data : []);
      if (!best) continue;

      const st = String(best.status || '').toLowerCase();
      const endMs = best.current_period_end ? Number(best.current_period_end) * 1000 : 0;
      const usable = (['active', 'trialing', 'past_due'].includes(st)) || (endMs && endMs > Date.now());

      if (usable) return { customer: c, subscription: best };
    } catch (_e) {
      // ignore and keep searching other customers
    }
  }

  return null;
}

function applyStripeSubscriptionToUser(user, customer, subscription) {
  if (!user || !subscription) return false;

  const startIso = toIsoFromUnixSeconds(subscription.current_period_start) || nowIso();
  const endIso   = toIsoFromUnixSeconds(subscription.current_period_end);

  
  // Defensive fallback: if Stripe object is oddly missing period fields but status is active-ish,
  // do not leave an old expired endAt in place (it would immediately lock the user).
  const activeish = (st === 'active' || st === 'trialing' || st === 'past_due' || st === 'unpaid');
  if (!startIso && activeish) {
    user.startAt = nowIso();
    user.startAtGuessed = true;
  }
  if (!endIso && activeish) {
    const fallbackEnd = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
    user.endAt = fallbackEnd;
    user.endAtGuessed = true;
    console.warn('[SYNC] Missing current_period_end; applied fallback endAt for', user.email, '=>', fallbackEnd);
  }

// IMPORTANT: overwrite endAt when we have it, otherwise old (expired) endAt will keep killing access.
  user.status = 'active';
  user.startAt = startIso;
  if (endIso) user.endAt = endIso;

  user.demoUsed = true;
  if (customer && customer.id) user.stripeCustomerId = customer.id;
  if (subscription && subscription.id) user.stripeSubId = subscription.id;

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

  // Prefer stored Stripe subscription ID
  if (user.stripeSubId) {
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubId);
      
      try {
        console.log('[SYNC] retrieved by subId', {
          id: sub && sub.id,
          status: sub && sub.status,
          current_period_start: sub && sub.current_period_start,
          current_period_end: sub && sub.current_period_end,
          canceled_at: sub && sub.canceled_at,
          cancel_at: sub && sub.cancel_at,
          cancel_at_period_end: sub && sub.cancel_at_period_end
        });
      } catch(_e) {}

const st = String(sub && sub.status || '').toLowerCase();
      const subEndMs = sub && sub.current_period_end ? Number(sub.current_period_end) * 1000 : 0;
      const usable = (['active', 'trialing', 'past_due'].includes(st)) || (subEndMs && subEndMs > Date.now());
      if (!usable) throw new Error('Subscription not usable');

      const custId = (sub && typeof sub.customer === 'string') ? sub.customer : null;
      const cust = custId ? await stripe.customers.retrieve(custId) : null;

      applyStripeSubscriptionToUser(user, cust || {}, sub);
      user.lastStripeSyncAt = nowIso();
      await saveUsers();
      return true;
    } catch (_e) {
      console.warn('[SYNC] stripeSubId retrieve failed/not usable; fallback to customer/email search');
    }
  }

  // Prefer stored Stripe customer ID
  if (user.stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 20 });
      
          try {
            console.log('[SYNC] list subs by customerId', {
              customerId: user && user.stripeCustomerId,
              count: subs && subs.data ? subs.data.length : 0,
              ids: (subs && subs.data ? subs.data.slice(0,5).map(s => ({ id: s.id, status: s.status, end: s.current_period_end })) : [])
            });
          } catch(_e) {}

const best = pickBestSub(subs && subs.data ? subs.data : []);
      if (best) {
        const st = String(best.status || '').toLowerCase();
        const bestEndMs = best.current_period_end ? Number(best.current_period_end) * 1000 : 0;
        const usable = (['active', 'trialing', 'past_due'].includes(st)) || (bestEndMs && bestEndMs > Date.now());
        if (usable) {
          const cust = await stripe.customers.retrieve(user.stripeCustomerId);
          applyStripeSubscriptionToUser(user, cust || {}, best);
          user.lastStripeSyncAt = nowIso();
          await saveUsers();
          return true;
        }
      }
    } catch (_e) {
      console.warn('[SYNC] stripeCustomerId list failed; fallback to email search');
    }
  }

  // Fallback: search by email
  const found = await findActiveSubscriptionByEmail(stripe, user.email);
  if (found && found.subscription) {
    const ok = applyStripeSubscriptionToUser(user, found.customer, found.subscription);
    if (ok && typeof saveUsers === 'function') await saveUsers();
    return ok;
  }

  // No active subscription found. Still record that we checked (so we don't hammer Stripe).
  user.lastStripeSyncAt = nowIso();
  if (typeof saveUsers === 'function') await saveUsers();
    try { console.warn('[SYNC] no active subscription found for', user && user.email, 'customerId=', user && user.stripeCustomerId, 'subId=', user && user.stripeSubId); } catch(_e) {}

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
      if (typeof saveUsers === 'function') await saveUsers();
      return;
    }

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
      if (typeof saveUsers === 'function') await saveUsers();
    } catch (_e) {}
    return;
  }

  // Recurring billing: invoice events are the most reliable "money went through" signal
  if (type === 'invoice.payment_succeeded') {
    const inv = event.data && event.data.object || {};
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

      if (typeof saveUsers === 'function') await saveUsers();
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
      const endMs = sub.current_period_end ? Number(sub.current_period_end) * 1000 : 0;
      const usable = (['active', 'trialing', 'past_due'].includes(st)) || (endMs && endMs > Date.now());
      if (usable) {
        applyStripeSubscriptionToUser(u, customer, sub);
      }
      if (typeof saveUsers === 'function') await saveUsers();
    } catch (_e) {}
    return;
  }

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
      if (typeof saveUsers === 'function') await saveUsers();
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
