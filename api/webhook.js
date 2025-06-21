const admin = require("firebase-admin");
const crypto = require("crypto");
const https = require("https");

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

function parseAmount(val) {
  if (typeof val === "number") return val;
  return parseFloat(val.toString().replace("$", "").trim());
}

function roundToTwo(val) {
  return Math.round((parseFloat(val) + Number.EPSILON) * 100) / 100;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const data = req.body;
    const { transaction_id, status, coin, amount, address, txid, timestamp, uid } = data;

    if (status !== "confirmed") return res.status(200).send("Ignored - Not confirmed");

    const logsRef = db.ref("/xaiWebhookLogs/" + transaction_id);
    const logSnap = await logsRef.once("value");
    if (logSnap.exists()) return res.status(200).send("Already processed");

    const userSnap = await db.ref("/users/" + uid).once("value");
    if (!userSnap.exists()) return res.status(404).send("User not found");

    const user = userSnap.val();

    const depositAmount = roundToTwo(parseAmount(user.deposit || 0));
    const paymentAmount = roundToTwo(parseAmount(amount));
    const newTotal = roundToTwo(depositAmount + paymentAmount);

    const selectedPlan = [...plans].reverse().find((plan) => newTotal >= plan.amount);

    const updates = {};
    updates["/users/" + uid + "/deposit"] = newTotal;
    updates["/users/" + uid + "/lastDepositTx"] = txid;

    if (selectedPlan) {
      updates["/users/" + uid + "/dailyProfit"] = selectedPlan.dailyProfit;
      updates["/users/" + uid + "/depositTime"] = new Date(timestamp).toISOString();
    }

    // Referral bonus (1st level)
    if (user.tsohonUser === "false") {
      updates["/users/" + uid + "/tsohonUser"] = "yes";

      if (user.referralBy) {
        const refUserSnap = await db
          .ref("/users")
          .orderByChild("referralCode")
          .equalTo(user.referralBy)
          .once("value");

        if (refUserSnap.exists()) {
          const refUid = Object.keys(refUserSnap.val())[0];
          const refData = Object.values(refUserSnap.val())[0];

          const currentBonus = roundToTwo(parseAmount(refData.referralBonusLeve1 || 0));
          const bonus = roundToTwo(paymentAmount * 0.08);
          const currentCount = parseInt(refData.level1 || "0");

          updates["/users/" + refUid + "/referralBonusLeve1"] = roundToTwo(currentBonus + bonus);
          updates["/users/" + refUid + "/level1"] = currentCount + 1;
        }
      }

      // Referral bonus (2nd level) with 6% now
      if (user.level2ReferralBy) {
        const refUser2Snap = await db
          .ref("/users")
          .orderByChild("referralCode")
          .equalTo(user.level2ReferralBy)
          .once("value");

        if (refUser2Snap.exists()) {
          const refUid2 = Object.keys(refUser2Snap.val())[0];
          const refData2 = Object.values(refUser2Snap.val())[0];

          const currentBonus2 = roundToTwo(parseAmount(refData2.referralBonussLeve2 || 0));
          const bonus2 = roundToTwo(paymentAmount * 0.06);
          const currentCount2 = parseInt(refData2.level2 || "0");

          updates["/users/" + refUid2 + "/referralBonussLeve2"] = roundToTwo(currentBonus2 + bonus2);
          updates["/users/" + refUid2 + "/level2"] = currentCount2 + 1;
        }
      }
    }

    await db.ref().update(updates);
    await logsRef.set({ success: true, data });

    // GAS MANAGER: Notify to set fee and sweep
    await fetch("https://bonus-gamma.vercel.app/gasManager.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_AUTH_KEY,
      },
      body: JSON.stringify({ uid, coin, amount, txid }),
    });

    res.status(200).send("Deposit processed");
  } catch (err) {
    const fallbackId = crypto.randomUUID();
    await db.ref("/xaiWebhookErrors/" + fallbackId).set({
      error: err.message,
      full: err.toString(),
      timestamp: new Date().toISOString(),
    });
    res.status(500).send("Error processing deposit");
  }
};
