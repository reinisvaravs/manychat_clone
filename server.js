// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

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

app.listen(process.env.PORT || 3000, () =>
  console.log("Webhook listening on", process.env.PORT || 3000)
);
