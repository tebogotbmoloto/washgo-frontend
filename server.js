const fs = require('fs');
const path = require('path');
const express = require('express');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const DATA_FILE = path.join(__dirname, 'promotions.json');

const PROMOTION_PRICING = {
  '7': 5000,   // R50.00
  '14': 9000,  // R90.00
  '30': 15000, // R150.00
};

// helper: read/write promotions JSON (very small-scale demo)
function loadPromotions() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('loadPromotions error', err);
    return [];
  }
}

function savePromotions(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('savePromotions error', err);
  }
}

// middleware: JSON for normal routes
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'washgo-promotions' });
});

// public list of active promotions
app.get('/promotions', (req, res) => {
  const all = loadPromotions();
  const now = Date.now();
  const active = all.filter(p => p.status === 'active' && p.expiresAt && p.expiresAt > now);
  res.json(active);
});

// create a checkout session for a promotion
app.post('/create-promotion', async (req, res) => {
  const { key, name, days } = req.body || {};
  if (!key || !days) return res.status(400).json({ error: 'Missing key or days' });
  const amount = PROMOTION_PRICING[String(days)];
  if (!amount) return res.status(400).json({ error: 'Invalid days' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'zar',
          product_data: {
            name: `Promote listing: ${name || 'Car Wash'}`,
            metadata: { wash_key: key, days: String(days) }
          },
          unit_amount: amount
        },
        quantity: 1
      }],
      success_url: `${PUBLIC_URL}/?promote_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/?promote_cancel=1`,
      metadata: { wash_key: key, days: String(days) }
    });

    // create a pending record (optional). We'll rely on webhook for activation but storing pending helps preview.
    const promotions = loadPromotions();
    promotions.push({
      id: session.id,
      wash_key: key,
      name: name || null,
      days: Number(days),
      status: 'pending',
      createdAt: Date.now()
    });
    savePromotions(promotions);

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('create-promotion error', err);
    res.status(500).json({ error: 'stripe_error', details: err.message });
  }
});

// Stripe webhook (requires raw body to validate signature)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('No STRIPE_WEBHOOK_SECRET set — cannot verify webhook');
  }

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // If no secret provided, fall back to parsing body (only for local/dev testing)
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event types we care about
  switch (event.type) {
    case 'checkout.session.completed':
      (async () => {
        try {
          const session = event.data.object;
          // use metadata to find the wash key and days
          const wash_key = session.metadata?.wash_key || session.client_reference_id || null;
          const days = Number(session.metadata?.days || session.metadata?.duration || 0);

          if (!wash_key || !days) {
            console.warn('checkout.session.completed missing metadata', session);
            break;
          }

          const promotions = loadPromotions();
          // compute expiry
          const now = Date.now();
          const expiresAt = now + (days * 24 * 60 * 60 * 1000);

          // mark existing pending record if found
          let rec = promotions.find(p => p.id === session.id || (p.wash_key === wash_key && p.status === 'pending'));
          if (rec) {
            rec.status = 'active';
            rec.expiresAt = expiresAt;
            rec.activatedAt = now;
            rec.sessionId = session.id;
          } else {
            // create
            promotions.push({
              id: session.id,
              wash_key: wash_key,
              name: session.metadata?.name || null,
              days: days,
              status: 'active',
              createdAt: now,
              activatedAt: now,
              expiresAt: expiresAt,
              sessionId: session.id
            });
          }

          savePromotions(promotions);
          console.log(`Activated promotion for ${wash_key} for ${days} days`);
        } catch (err) {
          console.error('Error handling checkout.session.completed:', err);
        }
      })();
      break;
    default:
      // unhandled events
      break;
  }

  res.json({ received: true });
});

// small helper to clear expired promotions periodically
setInterval(() => {
  try {
    const promotions = loadPromotions();
    const now = Date.now();
    const filtered = promotions.filter(p => !(p.expiresAt && p.expiresAt <= now && p.status === 'active'));
    if (filtered.length !== promotions.length) {
      savePromotions(filtered);
      console.log('Cleared expired promotions');
    }
  } catch (err) {
    console.error('Error clearing promotions', err);
  }
}, 60 * 60 * 1000); // every hour

app.listen(PORT, () => console.log(`WashGo promotions server listening on ${PORT}`));
