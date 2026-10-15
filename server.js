const express = require('express');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://example.com';

const PROMOTION_PRICING = {
  '7': 5000,
  '14': 9000,
  '30': 15000,
};

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'washgo-promotions' });
});

app.post('/create-promotion', async (req, res) => {
  const { key, name, days } = req.body || {};

  if (!key || !days) {
    return res.status(400).json({ error: 'Missing listing key or duration' });
  }

  const amount = PROMOTION_PRICING[String(days)];
  if (!amount) {
    return res.status(400).json({ error: 'Invalid promotion duration' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'zar',
          product_data: {
            name: `Promoted listing: ${name || 'Car Wash'}`,
            metadata: {
              wash_key: key,
              days: String(days),
            },
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: `${PUBLIC_URL}/?promote_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/?promote_cancel=1`,
      metadata: {
        wash_key: key,
        days: String(days),
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe checkout failed:', err);
    return res.status(500).json({ error: 'Stripe checkout error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`WashGo promotions server running on http://localhost:${PORT}`);
});
