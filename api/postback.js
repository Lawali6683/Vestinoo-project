const admin = require("firebase-admin");
const CryptoJS = require("crypto-js");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const POSTBACK_KEY = process.env.ADGEM_POSTBACK_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Step 1: Get full request URL for verification
    const protocol = req.connection.encrypted ? "https" : "http";
    const fullUrl = new URL(protocol + "://" + req.headers.host + req.url);

    // Step 2: Extract and remove verifier
    const verifier = fullUrl.searchParams.get("verifier");
    if (!verifier) {
      return res.status(422).send("Error: missing verifier");
    }
    fullUrl.searchParams.delete("verifier");

    // Step 3: Verify request integrity
    const hash = CryptoJS.HmacSHA256(fullUrl.href, POSTBACK_KEY).toString(CryptoJS.enc.Hex);
    if (hash !== verifier) {
      return res.status(422).send("Error: invalid verifier");
    }

    // Step 4: Extract user data
    const uid = fullUrl.searchParams.get("uid");
    const payout = parseFloat(fullUrl.searchParams.get("payout"));
    const offer = fullUrl.searchParams.get("offer");
    const transaction = fullUrl.searchParams.get("transaction");

    if (!uid || !payout || !offer || !transaction) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const rewardRef = db.ref(`users/${uid}`);
    const txFlagRef = db.ref(`adgem_postbacks/${transaction}`);

    // Step 5: Check if transaction already processed
    const alreadyProcessed = await txFlagRef.once("value");
    if (alreadyProcessed.exists()) {
      return res.status(200).send("Transaction already processed");
    }

    // Step 6: Apply payout (50% of payout value)
    const bonusToAdd = payout / 2;
    const snapshot = await rewardRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snapshot.val();
    const currentBonus = parseFloat(userData.taskBonus) || 0;
    await rewardRef.update({ taskBonus: currentBonus + bonusToAdd });

    // Step 7: Mark transaction as processed
    await txFlagRef.set({ status: "completed", timestamp: Date.now() });

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Postback error:", err);
    try {
      const fallbackId = `failed_${Date.now()}`;
      await db.ref(`adgem_failed_postbacks/${fallbackId}`).set({
        error: err.message,
        url: req.url,
        timestamp: Date.now(),
      });
    } catch (logError) {
      console.error("❌ Failed to log fallback postback:", logError);
    }
    return res.status(500).send("Server error");
  }
};
