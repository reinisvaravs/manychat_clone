# 🚀 Instagram DM Automation — Refined TODO (Based on Current Code)

## ✅ Already Done

- Basic OAuth flow → long-lived token saved
- Supabase integration (`auth_tokens`, `messages`)
- Webhook GET handshake
- Webhook POST handler for `changes` + `messaging`
- Auto-subscribe to Pages after auth
- Messages inserted into Supabase

---

## 🔒 Step 1. Webhook Security

- [ ] Add X-Hub-Signature-256 verification
  - Use `APP_SECRET` to hash request body (HMAC-SHA256)
  - Reject invalid signatures **before** processing
- [ ] Move webhook logging to `console.debug` instead of `console.log` in production

---

## 🗄️ Step 2. Database Refactor

Current: `auth_tokens` is overloaded (user+page+ig+token).  
Target: normalized schema:

- **users**
  - user_id (FB id), access_token, expires_in, created_at
- **pages**
  - page_id, page_name, page_access_token, subscribed, last_subscribed_at, user_id (FK)
- **instagram_accounts**
  - ig_id, ig_username, page_id (FK)
- **messages** (already exists, keep)
  - message_id, sender_id, text, user_id, page_id, ig_id, created_at

Refactor `/auth/callback` to:

- Insert/Upsert `users`
- Insert pages under each user
- Insert IG account (if any) linked to page
- Don’t keep everything in `auth_tokens`

---

## 🔄 Step 3. Token Refresh Automation

- [ ] Cron job (daily) → refresh long-lived user tokens
- [ ] Update `users.access_token` in Supabase
- [ ] If refresh fails → mark token invalid, prompt re-auth
- [ ] (Future) Store refresh logs in a `token_logs` table

---

## ⚡ Step 4. Webhook Handler Improvements

- [ ] Respond `200 OK` immediately → push processing into queue (BullMQ, Supabase function, or background worker)
- [ ] Normalize payload → always map to `{page_id, ig_id, sender_id, text, message_id}`
- [ ] Add retry logic if DB insert fails
- [ ] Store raw webhook event JSON in a `webhook_logs` table for debugging

---

## 🧪 Step 5. Debug Endpoints

- [ ] `/debug/messages` → last 20 messages (from `messages`)
- [ ] `/debug/pages` → list connected Pages + IG accounts
- [ ] `/debug/tokens` → show user tokens + expirations (mask tokens)

---

## 💬 Step 6. Outbound Messaging

- [ ] Helper → `sendMessage(pageId, recipientId, text)` using Page Access Token
- [ ] Endpoint `/send/:page_id` for manual test
- [ ] Build auto-reply flow → reply "Thanks for your message!"

---

## 🖥️ Step 7. Deployment & Runtime

- [ ] Upgrade Node.js to v20 in `Coolify` / Docker
- [ ] Add proper `.env.example` with all keys (APP_ID, APP_SECRET, VERIFY_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIRECT_URI, PORT)
- [ ] Use `pino` or `winston` for structured logging
- [ ] Add health check endpoint `/health`

---

## 🎯 Step 8. Production Readiness

- [ ] Privacy Policy + Data Deletion endpoints for Meta App Review
- [ ] Screencast of OAuth → webhook → DM reply working
- [ ] App Review scopes: `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata`, etc.
- [ ] Monitoring: Supabase logs + Cloudflare/NGINX access logs

---

👉 With these changes, your system evolves from a **monolithic prototype** into a **scalable Manychat-style SaaS**.
