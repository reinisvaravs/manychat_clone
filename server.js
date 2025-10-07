// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// serve landing page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// --- ✅ Webhook verification handshake
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- ✅ Instagram webhook listener
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📥 Webhook received:", JSON.stringify(body, null, 2));

    // handle incoming Instagram DM payloads (supports only entry.messaging)
    if (body.object === "instagram" && body.entry) {
      for (const entry of body.entry) {
        if (entry.messaging && Array.isArray(entry.messaging)) {
          for (const msgEvent of entry.messaging) {
            const senderId =
              msgEvent.sender?.id || msgEvent.from || msgEvent.sender_id;
            const text = msgEvent.message?.text || msgEvent.text || null;
            const messageId =
              msgEvent.message?.mid || msgEvent.mid || msgEvent.id;
            console.log("💬 Instagram DM (messaging):", {
              senderId,
              text,
              messageId,
            });
            await saveMessageToSupabase(
              entry.id || entry.id,
              senderId,
              text,
              messageId
            );
          }
          continue;
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// --- ✅ helper: save messages
async function saveMessageToSupabase(pageId, senderId, text, messageId) {
  const { data: rows } = await supabase
    .from("auth_tokens")
    .select("user_id, ig_id")
    .or(`page_id.eq.${pageId},ig_id.eq.${pageId}`)
    .limit(1);

  if (rows && rows.length > 0) {
    const userId = rows[0].user_id;
    const igId = rows[0].ig_id;

    await supabase.from("messages").insert([
      {
        user_id: userId,
        page_id: pageId,
        ig_id: igId,
        sender_id: senderId,
        message_text: text,
        message_id: messageId,
      },
    ]);
  }
}

// --- ✅ Auth callback
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code provided");

  try {
    // 1. Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `client_id=${process.env.APP_ID}` +
        `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
        `&client_secret=${process.env.APP_SECRET}` +
        `&code=${code}`
    );
    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error.message);

    // 2. Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${process.env.APP_ID}` +
        `&client_secret=${process.env.APP_SECRET}` +
        `&fb_exchange_token=${data.access_token}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error(longData.error.message);
    console.log("Long-lived token:", longData);

    // 3. Get user info
    const meRes = await fetch(
      `https://graph.facebook.com/v20.0/me?access_token=${longData.access_token}`
    );
    const me = await meRes.json();

    // 4. Save user + token
    await supabase.from("auth_tokens").upsert(
      {
        user_id: me.id,
        access_token: longData.access_token,
        expires_in: null, // not sure how to track expiry for long-lived tokens yet
      },
      { onConflict: "user_id" }
    );

    // 5. Get pages with Instagram accounts
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.data && pagesData.data.length > 0) {
      for (const page of pagesData.data) {
        const pageAccessToken = page.access_token;
        const igId = page.instagram_business_account?.id;

        if (igId) {
          // subscribe only Instagram DMs
          await fetch(
            `https://graph.facebook.com/v20.0/${igId}/subscribed_apps`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscribed_fields: ["instagram_messages"],
                access_token: pageAccessToken,
              }),
            }
          );
          console.log("📡 Subscribed IG account:", igId);
        }
      }
    }

    res.send("✅ Instagram connected and webhook subscribed!");
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).send("Auth failed");
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("✅ Listening on port", process.env.PORT || 3000)
);
