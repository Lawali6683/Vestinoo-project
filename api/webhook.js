const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

if (!admin.apps.length && SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

// Investment plans
const plans = [
  { amount: 800, dailyProfit: 30.8, days: 49 },
  { amount: 400, dailyProfit: 16.8, days: 45 },
  { amount: 200, dailyProfit: 8.9, days: 43 },
  { amount: 100, dailyProfit: 4.8, days: 40 },
  { amount: 50, dailyProfit: 2.64, days: 35 },
  { amount: 30, dailyProfit: 1.62, days: 34 },
  { amount: 15, dailyProfit: 0.87, days: 33 },
  { amount: 8, dailyProfit: 0.46, days: 32 },
  { amount: 4, dailyProfit: 0.25, days: 31 },
  { amount: 2, dailyProfit: 0.16, days: 22 },
];

// Utility functions
function parseAmount(val) {
  if (typeof val === "number") return val;
  return parseFloat(val.toString().replace("$", "").trim());
}
function roundToTwo(val) {
  return Math.round((parseFloat(val) + Number.EPSILON) * 100) / 100;
}

// Main webhook handler
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    // API key security
    if (req.headers["x-api-key"] !== "@haruna66") return res.status(403).send("Forbidden");

    const data = req.body;
    const {
      uid,
      userCoinpayid,
      coin,
      amount,
      txHash,
      status,
    } = data;

    if (!uid || !coin || !amount || !txHash) {
      return res.status(400).send("Missing required fields");
    }

    // Only process "pending" or "confirmed" deposits
    if (status && status !== "pending" && status !== "confirmed") {
      return res.status(200).send("Ignored - Not a deposit event");
    }

    // Ensure idempotency: check if already processed
    const logsRef = db.ref("/depositWebhookLogs/" + txHash);
    const logSnap = await logsRef.once("value");
    if (logSnap.exists()) return res.status(200).send("Already processed");

    // Find user by uid
    const userSnap = await db.ref("/users/" + uid).once("value");
    if (!userSnap.exists()) {
      await logsRef.set({ error: true, reason: "User not found", data });
      return res.status(400).send("User not found");
    }
    const user = userSnap.val();

    const depositAmount = roundToTwo(parseAmount(user.deposit || 0));
    const paymentAmount = roundToTwo(parseAmount(amount));
    const newTotal = roundToTwo(depositAmount + paymentAmount);

    // Get plan
    const selectedPlan = [...plans].reverse().find((plan) => newTotal >= plan.amount);

    const updates = {};
    updates["/users/" + uid + "/deposit"] = newTotal;
    updates["/users/" + uid + "/lastDepositTx"] = txHash;
    updates["/users/" + uid + "/lastDepositCoin"] = coin;
    updates["/users/" + uid + "/lastDepositAmount"] = paymentAmount;
    updates["/users/" + uid + "/lastDepositTime"] = new Date().toISOString();

    if (selectedPlan) {
      updates["/users/" + uid + "/dailyProfit"] = selectedPlan.dailyProfit;
      updates["/users/" + uid + "/depositTime"] = new Date().toISOString();
    }

    // Referral bonuses (only on first deposit)
    if (user.tsohonUser !== "yes") {
      updates["/users/" + uid + "/tsohonUser"] = "yes";

      // Level 1 referral
      if (user.referralBy) {        
        const snapshot = await db.ref("/users").orderByChild("referralCode").equalTo(user.referralBy).once("value");
        snapshot.forEach((refUserSnap) => {
          const refUid = refUserSnap.key;
          const refVal = refUserSnap.val();
          const currentBonus = roundToTwo(parseAmount(refVal.referralBonusLeve1 || 0));
          const bonus = roundToTwo(paymentAmount * 0.08);
          const currentCount = parseInt(refVal.level1 || "0");
          updates["/users/" + refUid + "/referralBonusLeve1"] = roundToTwo(currentBonus + bonus);
          updates["/users/" + refUid + "/level1"] = currentCount + 1;
        });
      }

      // Level 2 referral
      if (user.level2ReferralBy) {
        const snapshot = await db.ref("/users").orderByChild("referralCode").equalTo(user.level2ReferralBy).once("value");
        snapshot.forEach((refUserSnap) => {
          const refUid = refUserSnap.key;
          const refVal = refUserSnap.val();
          const currentBonus = roundToTwo(parseAmount(refVal.referralBonussLeve2 || 0));
          const bonus = roundToTwo(paymentAmount * 0.06); // 6% for level 2
          const currentCount = parseInt(refVal.level2 || "0");
          updates["/users/" + refUid + "/referralBonussLeve2"] = roundToTwo(currentBonus + bonus);
          updates["/users/" + refUid + "/level2"] = currentCount + 1;
        });
      }
    }

    // Apply all updates
    await db.ref().update(updates);
    await logsRef.set({ success: true, data });
   
    try {
      await fetch("https://bonus-gamma.vercel.app/gasManager.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "@haruna66" },
        body: JSON.stringify({ uid, userCoinpayid, coin, amount: paymentAmount, txHash }),
      });
    } catch (e) {      
      await db.ref("/gasManagerNotifyFails/" + txHash).set({
        error: e.message,
        timestamp: new Date().toISOString(),
        txHash,
        uid,
      });
    }

    res.status(200).send("Deposit processed");
  } catch (err) {
    const fallbackId = crypto.randomUUID();
    await db.ref("/depositWebhookErrors/" + fallbackId).set({
      error: err.message,
      full: err.toString(),
      timestamp: new Date().toISOString(),
    });
    res.status(500).send("Error processing deposit");
  }
};
