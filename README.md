# WashGo Promotions — backend

This backend provides simple promotion payments using Stripe Checkout and a webhook to activate promotions.

Files added/updated on branch feature/promote-payments:

- `server.js` — Express + Stripe server with /create-promotion, /promotions, /webhook endpoints.
- `promotions.json` — (created at runtime) stores active/pending promotions.
- `index.html` — frontend updated to fetch active promotions and display "Promoted" badges.

Quick start (local testing)

1. Install dependencies

```bash
npm install
```

2. Set environment variables (use your Stripe keys):

```bash
export STRIPE_SECRET_KEY="sk_test_..."
export STRIPE_WEBHOOK_SECRET="whsec_..."
export PUBLIC_URL="http://localhost:3000" # public URL used for checkout redirect
```

3. Run the server

```bash
npm start
```

4. Point the frontend to the server by setting this before the app loads (e.g. in your static HTML or hosting config):

```html
<script>window.WASHGO_PROMOTION_API_BASE = 'http://localhost:3000';</script>
```

Testing Webhooks locally

- Use the Stripe CLI to forward webhook events to your local server:

```bash
stripe listen --forward-to localhost:3000/webhook
```

- Then create a Checkout Session via the frontend and complete payment in test mode. The `checkout.session.completed` event will be sent and the server will activate the promotion.

Production notes

- Use a persistent database (Postgres, DynamoDB, etc.) instead of the simple JSON file used for this example.
- Make sure the webhook endpoint is reachable by Stripe and configured with the correct signing secret.
- Secure your endpoints and validate inputs.
- Add rate limiting and authentication for admin APIs if you expand the backend.
