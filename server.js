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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// GET for verification handshake
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

// POST for events
app.post("/webhook", (req, res) => {
  // Meta sends Instagram updates under the "instagram" object with a "messages" field
  // You will normalize this later; for now just log + 200
  console.log("IG webhook payload:", JSON.stringify(req.body, null, 2));

  // TODO: trigger your handler here when you detect a DM message event
  res.sendStatus(200);
});

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

    // 2. Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${process.env.APP_ID}` +
        `&client_secret=${process.env.APP_SECRET}` +
        `&fb_exchange_token=${data.access_token}`
    );
    const longData = await longRes.json();

    // 3. Get FB user info
    const meRes = await fetch(
      `https://graph.facebook.com/v20.0/me?access_token=${longData.access_token}`
    );
    const me = await meRes.json();

    console.log("User logged in:", me);

    // 4. Save or update user token in Supabase (upsert ensures no duplicates)
    await supabase.from("auth_tokens").upsert({
      user_id: me.id,
      access_token: longData.access_token,
      expires_in: longData.expires_in,
    });

    console.log("Saved user token in Supabase for user", me.id);

    // 5. Fetch Pages this user manages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${longData.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.data && pagesData.data.length > 0) {
      for (const page of pagesData.data) {
        const pageId = page.id;
        const pageName = page.name;
        const pageAccessToken = page.access_token; // included in response

        let igId = null;
        let igUsername = null;

        // 6. If page has an Instagram business account, fetch IG username
        if (page.instagram_business_account) {
          igId = page.instagram_business_account.id;

          const igRes = await fetch(
            `https://graph.facebook.com/v20.0/${igId}?fields=username&access_token=${pageAccessToken}`
          );
          const igData = await igRes.json();
          igUsername = igData.username || null;
        }

        // 7. Update Supabase row for this user with Page + IG info
        const { error: updateError } = await supabase
          .from("auth_tokens")
          .update({
            page_id: pageId,
            page_name: pageName,
            page_access_token: pageAccessToken,
            ig_id: igId,
            ig_username: igUsername,
          })
          .eq("user_id", me.id);

        if (updateError) {
          console.error("Error updating page info:", updateError);
        } else {
          console.log(`Updated Supabase with page ${pageName} (${pageId})`);
        }

        // 8. Auto-subscribe this Page to webhook
        const subRes = await fetch(
          `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: ["messages"],
              access_token: pageAccessToken,
            }),
          }
        );
        const subData = await subRes.json();

        if (subData.success) {
          console.log(`✅ Subscribed page ${pageName} (${pageId}) to webhook`);
          await supabase
            .from("auth_tokens")
            .update({
              subscribed: true,
              last_subscribed_at: new Date().toISOString(),
            })
            .eq("user_id", me.id);
        } else {
          console.error("❌ Failed to subscribe page:", subData);
        }
      }
    }

    res.send(
      "Instagram connected, Pages/IG saved, and webhook subscribed! You can close this window."
    );
  } catch (err) {
    console.error("Error in callback:", err);
    res.status(500).send("Auth failed");
  }
});

app.listen(process.env.PORT || 3000, (res, err) =>
  console.log("Webhook listening on localhost:", process.env.PORT || 3000, err)
);
