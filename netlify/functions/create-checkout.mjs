// POST /.netlify/functions/create-checkout
// Body: { items: [{ id: "baked-12", qty: 2 }, ...] }
// Creates a Stripe Checkout Session and returns { url } to redirect the shopper to.
//
// Prices live HERE, on the server, so nobody can change them from the browser.
// Keep them in sync with PRICES in index.html (that copy is only for display).
// Requires the environment variable STRIPE_SECRET_KEY (sk_test_... or sk_live_...).

const PRODUCTS = {
  'baked-12': { name: '12-Piece Chocolate Chip Cookies (GF/VG)',      cents: 4200 },
  'baked-24': { name: '24-Piece Chocolate Chip Cookies (GF/VG)',      cents: 7600 },
  'dough-12': { name: '12-Piece Chocolate Chip Cookie Dough (GF/VG)', cents: 3800 },
  'dough-24': { name: '24-Piece Chocolate Chip Cookie Dough (GF/VG)', cents: 6800 },
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

  // Validate against the server-side catalogue; merge duplicate ids.
  const qtyById = {};
  for (const it of Array.isArray(items) ? items : []) {
    const qty = Math.floor(Number(it && it.qty));
    if (!PRODUCTS[it && it.id] || !(qty >= 1)) continue;
    qtyById[it.id] = Math.min(MAX_QTY_PER_ITEM, (qtyById[it.id] || 0) + qty);
  }
  const ids = Object.keys(qtyById);
  if (ids.length === 0) return json(400, { error: 'Your cart is empty.' });

  const subtotal = ids.reduce((sum, id) => sum + PRODUCTS[id].cents * qtyById[id], 0);
  const shipping = subtotal >= FREE_SHIP_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;
  const hasDough = ids.some(id => id.startsWith('dough'));

  const origin = new URL(req.url).origin;
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url', `${origin}/?checkout=cancelled`);
  p.set('shipping_address_collection[allowed_countries][0]', 'US');
  p.set('phone_number_collection[enabled]', 'true');
  p.set('billing_address_collection', 'auto');

  ids.forEach((id, i) => {
    p.set(`line_items[${i}][quantity]`, String(qtyById[id]));
    p.set(`line_items[${i}][price_data][currency]`, 'usd');
    p.set(`line_items[${i}][price_data][unit_amount]`, String(PRODUCTS[id].cents));
    p.set(`line_items[${i}][price_data][product_data][name]`, PRODUCTS[id].name);
    p.set(`line_items[${i}][price_data][product_data][metadata][sku]`, id);
  });

  p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipping));
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
  p.set('shipping_options[0][shipping_rate_data][display_name]',
    shipping === 0 ? 'Free shipping' : 'Standard shipping');
  if (hasDough) {
    p.set('shipping_options[0][shipping_rate_data][metadata][note]', 'Includes cold packs for dough');
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
