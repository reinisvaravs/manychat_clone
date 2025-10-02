// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?` +
      `client_id=${process.env.APP_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
      `&client_secret=${process.env.APP_SECRET}` +
      `&code=${code}`
  );
  const data = await tokenRes.json();

  // Exchange for long-lived token
  const longRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${process.env.APP_ID}` +
      `&client_secret=${process.env.APP_SECRET}` +
      `&fb_exchange_token=${data.access_token}`
  );
  const longData = await longRes.json();

  // TODO: store longData.access_token in DB linked to this user
  console.log("User long-lived token:", longData.access_token);

  res.send("Instagram connected! You can close this window.");
});

app.listen(process.env.PORT || 3000, (res, err) =>
  console.log("Webhook listening on localhost:", process.env.PORT || 3000, err)
);
