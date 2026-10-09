// POST /.netlify/functions/create-checkout
// Body: { items: [{ id: "baked-10", qty: 2, plan: "once" | "monthly" }, ...] }
// Creates a Stripe Checkout Session and returns { url } to redirect the shopper to.
//
// One-time carts: payment mode, $9.95 shipping under $75, free above.
// Carts with any monthly subscription: subscription mode. Subscription boxes are
// billed and shipped monthly with free shipping; any one-time boxes in the same
// cart are charged once on the first invoice and ship free with it.
//
// Prices live HERE, on the server, so nobody can change them from the browser.
// Keep them in sync with PRICES in index.html (that copy is only for display).
// Requires the environment variable STRIPE_SECRET_KEY (sk_test_... or sk_live_...).

// TEMPORARY prices (in cents): replace with final prices.
const PRODUCTS = {
  'baked-10': { name: '10-Piece Chocolate Chip Cookies (GF/Egg-Free)',      cents: 3500 },
  'baked-20': { name: '20-Piece Chocolate Chip Cookies (GF/Egg-Free)',      cents: 6400 },
  'baked-30': { name: '30-Piece Chocolate Chip Cookies (GF/Egg-Free)',      cents: 9000 },
  'dough-10': { name: '10-Piece Chocolate Chip Cookie Dough (GF/Egg-Free)', cents: 3200 },
  'dough-20': { name: '20-Piece Chocolate Chip Cookie Dough (GF/Egg-Free)', cents: 5700 },
  'dough-30': { name: '30-Piece Chocolate Chip Cookie Dough (GF/Egg-Free)', cents: 8100 },
};
const FREE_SHIP_THRESHOLD_CENTS = 7500;
const SHIPPING_CENTS = 995;
const MAX_QTY_PER_ITEM = 20;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: 'Payments are not set up yet (missing STRIPE_SECRET_KEY).' });

  let items;
  try {
    ({ items } = await req.json());
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  // Validate against the server-side catalogue; merge duplicate lines.
  const lines = {};
  for (const it of Array.isArray(items) ? items : []) {
    const qty = Math.floor(Number(it && it.qty));
    if (!PRODUCTS[it && it.id] || !(qty >= 1)) continue;
    const plan = it.plan === 'monthly' ? 'monthly' : 'once';
    const k = `${it.id}|${plan}`;
    lines[k] = lines[k] || { id: it.id, plan, qty: 0 };
    lines[k].qty = Math.min(MAX_QTY_PER_ITEM, lines[k].qty + qty);
  }
  const list = Object.values(lines);
  if (list.length === 0) return json(400, { error: 'Your cart is empty.' });

  const isSubscription = list.some(l => l.plan === 'monthly');
  const subtotal = list.reduce((sum, l) => sum + PRODUCTS[l.id].cents * l.qty, 0);
  const shipping = isSubscription || subtotal >= FREE_SHIP_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;
  const hasDough = list.some(l => l.id.startsWith('dough'));

  const origin = new URL(req.url).origin;
  const p = new URLSearchParams();
  p.set('mode', isSubscription ? 'subscription' : 'payment');
  p.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url', `${origin}/?checkout=cancelled`);
  p.set('shipping_address_collection[allowed_countries][0]', 'US');
  p.set('phone_number_collection[enabled]', 'true');
  p.set('billing_address_collection', 'auto');

  list.forEach((l, i) => {
    const monthly = l.plan === 'monthly';
    p.set(`line_items[${i}][quantity]`, String(l.qty));
    p.set(`line_items[${i}][price_data][currency]`, 'usd');
    p.set(`line_items[${i}][price_data][unit_amount]`, String(PRODUCTS[l.id].cents));
    p.set(`line_items[${i}][price_data][product_data][name]`,
      monthly ? `${PRODUCTS[l.id].name} · Monthly` : PRODUCTS[l.id].name);
    p.set(`line_items[${i}][price_data][product_data][metadata][sku]`, l.id);
    if (monthly) p.set(`line_items[${i}][price_data][recurring][interval]`, 'month');
  });

  if (isSubscription) {
    // Stripe Checkout has no shipping rates in subscription mode; subscriptions ship free.
    p.set('subscription_data[description]', 'Riot Cookie Company monthly box. Free shipping.');
    p.set('subscription_data[metadata][contains_dough]', hasDough ? 'yes' : 'no');
  } else {
    p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipping));
    p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
    p.set('shipping_options[0][shipping_rate_data][display_name]',
      shipping === 0 ? 'Free shipping' : 'Standard shipping');
    if (hasDough) {
      p.set('shipping_options[0][shipping_rate_data][metadata][note]', 'Includes cold packs for dough');
    }
  }

  p.set('custom_fields[0][key]', 'delivery_notes');
  p.set('custom_fields[0][label][type]', 'custom');
  p.set('custom_fields[0][label][custom]', 'Delivery notes (optional)');
  p.set('custom_fields[0][type]', 'text');
  p.set('custom_fields[0][optional]', 'true');

  p.set('metadata[contains_dough]', hasDough ? 'yes' : 'no');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: p,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe error', data && data.error);
    return json(502, { error: 'Could not start checkout. Please try again.' });
  }
  return json(200, { url: data.url });
};
