const admin = require("firebase-admin");
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
  return parseFloat(val.toString().replace("$", "").trim());
}

function toDollars(val) {
  return "$" + val.toFixed(2);
}

function roundToTwo(val) {
  return Math.round((parseFloat(val) + Number.EPSILON) * 100) / 100;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const data = req.body;
    const {
      transaction_id,
      status,
      coin,
      amount,
      address,
      txid,
      timestamp,
      userId,
    } = data;

    if (status !== "confirmed") return res.status(200).send("Ignored - Not confirmed");

    const logsRef = db.ref("/xaiWebhookLogs/" + transaction_id);
    const logSnap = await logsRef.once("value");
    if (logSnap.exists()) return res.status(200).send("Already processed");

    const usersRef = db.ref("/users");
    const snapshot = await usersRef.once("value");
    let matchedUser = null;
    snapshot.forEach((child) => {
      if (child.val().xaigateUserId === userId) {
        matchedUser = { key: child.key, data: child.val() };
      }
    });

    if (!matchedUser) {
      await logsRef.set({ error: true, reason: "User not found", data });
      return res.status(400).send("User not found");
    }

    const uid = matchedUser.key;
    const user = matchedUser.data;
    const depositAmount = roundToTwo(parseAmount(user.deposit || "$0.00"));
    const paymentAmount = roundToTwo(parseAmount(amount));
    const newTotal = roundToTwo(depositAmount + paymentAmount);

    // Duba mafi girman plan da bai wuce newTotal ba
    const selectedPlan = [...plans].reverse().find((plan) => newTotal >= plan.amount);

    const updates = {};
    updates["/users/" + uid + "/deposit"] = toDollars(newTotal);
    updates["/users/" + uid + "/lastDepositTx"] = txid;

    if (selectedPlan) {
      updates["/users/" + uid + "/dailyProfit"] = toDollars(selectedPlan.dailyProfit);
      updates["/users/" + uid + "/depositTime"] = new Date(timestamp).toISOString();
    }

    // Bonus ga sababbin users
    if (user.tsohonUser === "false") {
      updates["/users/" + uid + "/tsohonUser"] = "yes";

      if (user.referralBy) {
        snapshot.forEach((refUser) => {
          if (refUser.val().referralCode === user.referralBy) {
            const refUid = refUser.key;
            const refVal = refUser.val();
            const currentBonus = parseAmount(refVal.referralBonusLeve1 || "$0.00");
            const currentCount = parseInt(refVal.level1 || "0");
            const bonus = roundToTwo(paymentAmount * 0.08);

            updates["/users/" + refUid + "/referralBonusLeve1"] = toDollars(currentBonus + bonus);
            updates["/users/" + refUid + "/level1"] = currentCount + 1;
          }
        });
      }

      if (user.level2ReferralBy) {
        snapshot.forEach((refUser) => {
          if (refUser.val().referralCode === user.level2ReferralBy) {
            const refUid = refUser.key;
            const refVal = refUser.val();
            const currentBonus = parseAmount(refVal.referralBonussLeve2 || "$0.00");
            const currentCount = parseInt(refVal.level2 || "0");
            const bonus = roundToTwo(paymentAmount * 0.10);

            updates["/users/" + refUid + "/referralBonussLeve2"] = toDollars(currentBonus + bonus);
            updates["/users/" + refUid + "/level2"] = currentCount + 1;
          }
        });
      }
    }

    await db.ref().update(updates);
    await logsRef.set({ success: true, data });

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
