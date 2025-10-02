# Manychat Clone

Minimal Express app to connect Instagram via Facebook OAuth, save tokens/pages to Supabase, and receive Instagram webhook events.

## Features

- OAuth flow to get long-lived Facebook access token
- Persist user token + Page / Instagram info to Supabase
- Auto-subscribe Pages to your webhook
- Webhook verification + simple event receiver

## Requirements

- Node.js (16+)
- Supabase project (service role key)
- Facebook App with valid Redirect URI
- Public URL (ngrok or similar) to receive webhooks

## Quick start

1. Install dependencies

```sh
npm install
```

2. Copy env.example to `.env` and fill values:

- PORT (optional, default 3000)
- APP_ID — Facebook App ID
- APP_SECRET — Facebook App Secret
- REDIRECT_URI — must match your Facebook App OAuth redirect (e.g. https://your-public-url/auth/callback)
- VERIFY_TOKEN — string used for webhook verification
- SUPABASE_URL — your Supabase URL
- SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (server-only)

3. Start server

```sh
npm run dev
```

4. Expose locally (for Facebook webhooks)

```sh
# macOS example using ngrok
ngrok http 3000
# copy the https URL and set REDIRECT_URI and webhook callback URL in your Facebook App
```

5. Connect Instagram

- Open the app root in browser (http://localhost:3000/) and click Connect (update index.html client_id/redirect if needed)
- Complete Facebook OAuth; server will:
  - exchange code for long-lived token
  - fetch /me and the Pages the user manages
  - save tokens and page/IG info to Supabase
  - subscribe each Page to your webhook

## Endpoints

- GET / — serves index.html (link to OAuth dialog)
- GET /webhook — Facebook webhook verification (uses VERIFY_TOKEN)
- POST /webhook — receives Instagram events (currently logs payload)
- GET /auth/callback — OAuth callback handler

## Supabase table (recommended)

Table: auth_tokens

Columns (recommended types)

- user_id text primary key
- access_token text
- expires_in integer
- page_id text
- page_name text
- page_access_token text
- ig_id text
- ig_username text
- subscribed boolean default false
- last_subscribed_at timestamptz

Example SQL:

```sql
create table auth_tokens (
  user_id text primary key,
  access_token text,
  expires_in integer,
  page_id text,
  page_name text,
  page_access_token text,
  ig_id text,
  ig_username text,
  subscribed boolean default false,
  last_subscribed_at timestamptz
);
```

## Testing & Debugging

- After OAuth, check server logs for subscription messages and Supabase row updates.
- Use ngrok URL as the webhook callback in your Facebook App and verify webhook subscription works.
- Inspect POST /webhook payloads — they are logged to the console.

## Notes / TODO

- Normalize and handle Instagram DM message events in POST /webhook.
- Add robust error handling & retries for API calls.
- Securely store secrets and restrict Supabase service role usage to server-only.

## Author

Reinis Varavs
