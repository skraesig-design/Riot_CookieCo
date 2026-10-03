# Riot Cookie Company: going live with Stripe

```
riot-cookie-company/
├── index.html                          the storefront
├── netlify.toml                        tells Netlify where the functions are
└── netlify/functions/
    ├── create-checkout.mjs             sends the cart to Stripe Checkout (real prices live here)
    └── order-status.mjs                reads back a paid order for the thank-you screen
```

## 1. Get your Stripe key
1. Sign up at stripe.com. You can start in **test mode** before your business details are approved.
2. Go to **Developers → API keys** and copy the **Secret key**. It starts with `sk_test_` in test mode.
   Never paste it into index.html or share it.

## 2. Add the key to Netlify
Netlify → **riot-cookie-company** → **Project configuration → Environment variables → Add a variable**
- Key: `STRIPE_SECRET_KEY`
- Value: your secret key
- Mark it **secret**; the scope can be "All" or just "Functions"

## 3. Deploy (the functions need one of these; drag-and-drop doesn't include them)

**A. From Terminal on your Mac** (needs Node.js from nodejs.org):
```
cd ~/Sites/riot-cookie-company
npx netlify-cli login
npx netlify-cli link --id 3ae1eafb-1fa1-4133-9959-3c1839d8c729
npx netlify-cli deploy --prod
```

**B. Through GitHub** (no Terminal):
1. Create a new repository on github.com and use **Add file → Upload files** to drag in everything from this folder.
   Keep the `netlify/functions` folders intact.
2. Netlify → riot-cookie-company → **Project configuration → Build & deploy → Link repository** and choose it.
   Leave the build command empty; publish directory is `.`
3. Every change you upload to GitHub now redeploys the site automatically.

## 4. Test, then go live
- With the `sk_test_` key, pay with card `4242 4242 4242 4242`, any future date and any CVC.
- Orders appear in Stripe → **Payments**. Delivery notes are on each payment under **Custom fields**.
- When ready, swap the variable for your `sk_live_` key and redeploy.

## Changing prices or shipping
Edit the top of `netlify/functions/create-checkout.mjs`. That's what customers are charged.
Then update `PRICES`, `FREE_SHIP_THRESHOLD` and `SHIPPING_FEE` near the top of `index.html`
so the site shows the same numbers.
