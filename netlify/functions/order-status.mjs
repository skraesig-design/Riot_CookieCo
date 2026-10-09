// GET /.netlify/functions/order-status?session_id=cs_...
// Returns a few safe details about a finished Stripe Checkout Session
// so the site can show an order confirmation after the shopper returns.

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: 'Payments are not set up yet.' });

  const id = new URL(req.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json(400, { error: 'Invalid session.' });

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${id}?expand[]=line_items`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  const s = await res.json();
  if (!res.ok) return json(404, { error: 'Order not found.' });

  return json(200, {
    paid: s.payment_status === 'paid',
    email: (s.customer_details && s.customer_details.email) || null,
    name: (s.customer_details && s.customer_details.name) || null,
    total: s.amount_total,
    shipping: s.total_details ? s.total_details.amount_shipping : null,
    items: ((s.line_items && s.line_items.data) || []).map(li => ({
      name: li.description,
      qty: li.quantity,
      amount: li.amount_total,
    })),
    reference: s.id.slice(-8).toUpperCase(),
    subscription: s.mode === 'subscription',
  });
};
