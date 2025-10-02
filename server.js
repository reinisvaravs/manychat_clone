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

    // Save user token
    await supabase.from("auth_tokens").insert([
      {
        user_id: me.id,
        access_token: longData.access_token,
        expires_in: longData.expires_in,
      },
    ]);

    console.log("Saved token in Supabase for user", me.id);

    // 4. Fetch Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${longData.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.data && pagesData.data.length > 0) {
      for (const page of pagesData.data) {
        const pageId = page.id;
        const pageName = page.name;

        // 5. Get Page access token
        const pageRes = await fetch(
          `https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${longData.access_token}`
        );
        const pageData = await pageRes.json();
        const pageAccessToken = pageData.access_token;

        let igId = null;
        let igUsername = null;

        // 6. Check if page has IG business account
        if (page.instagram_business_account) {
          igId = page.instagram_business_account.id;

          // fetch IG username
          const igRes = await fetch(
            `https://graph.facebook.com/v20.0/${igId}?fields=username&access_token=${pageAccessToken}`
          );
          const igData = await igRes.json();
          igUsername = igData.username;
        }

        // 7. Save page + IG info in Supabase
        const { error } = await supabase.from("auth_tokens").insert([
          {
            user_id: me.id,
            page_id: pageId,
            page_name: pageName,
            page_access_token: pageAccessToken,
            ig_id: igId,
            ig_username: igUsername,
          },
        ]);

        if (error) {
          console.error("Error saving page info:", error);
        } else {
          console.log(
            `Saved page ${pageName} (${pageId}) with IG ${igUsername}`
          );
        }
      }
    }

    res.send("Instagram connected and data saved! You can close this window.");
  } catch (err) {
    console.error("Error in callback:", err);
    res.status(500).send("Auth failed");
  }
});

app.listen(process.env.PORT || 3000, (res, err) =>
  console.log("Webhook listening on localhost:", process.env.PORT || 3000, err)
);
