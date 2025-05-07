const admin = require("firebase-admin");

// Load environment variables
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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  const data = req.body;

  // Confirm payment is completed
  if (data.payment_status !== "finished") {
    return res.status(200).json({ message: "Payment not complete" });
  }

  try {
    const orderId = data.order_id || "";
    const amount = parseFloat(data.price_amount);
    if (!orderId || !data.payment_id || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid webhook data" });
    }

    // Extract email from order_id (format must match original API creator)
    // Make sure email does not contain "_" or change delimiter if needed
    const email = orderId.includes("_") ? orderId.split("_")[0] : null;
    if (!email) {
      return res.status(400).json({ error: "Invalid order_id format" });
    }

    // Find user by email
    const snapshot = await db
      .ref("users")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "User not found" });
    }

    const userKey = Object.keys(snapshot.val())[0];
    const userRef = db.ref(`users/${userKey}`);
    const userData = snapshot.val()[userKey];

    // Avoid duplicate processing
    const processed = userData.processedPayments || {};
    if (processed[data.payment_id]) {
      return res.status(200).json({ message: "Already processed" });
    }

    // Mark this payment as processed
    await userRef.child("processedPayments").update({
      [data.payment_id]: true,
    });

    // Update deposit amount
    await userRef.update({
      deposit: `$${amount.toFixed(2)}`,
    });

    // Match investment plan
    const selectedPlan = plans.find(plan => amount >= plan.amount);
    if (selectedPlan) {
      await userRef.update({
        dailyProfit: `$${selectedPlan.dailyProfit.toFixed(2)}`,
        depositTime: new Date().toISOString(),
      });
    }

    // === REFERRAL BONUS HANDLING ===
    if (userData.tsohonUser !== "yes") {
      // LEVEL 1 REFERRAL
      if (userData.referralBy) {
        const refSnap = await db
          .ref("users")
          .orderByChild("referralCode")
          .equalTo(userData.referralBy)
          .once("value");

        if (refSnap.exists()) {
          const refKey = Object.keys(refSnap.val())[0];
          const refUserRef = db.ref(`users/${refKey}`);
          const refUserData = refSnap.val()[refKey];

          const bonus1 = amount * 0.08;
          const newBonus1 =
            parseFloat(refUserData.referralBonusLeve1 || 0) + bonus1;
          const newLevel1 = (parseInt(refUserData.level1 || 0) + 1).toString();

          await refUserRef.update({
            referralBonusLeve1: `$${newBonus1.toFixed(2)}`,
            level1: newLevel1,
          });
        }
      }

      // LEVEL 2 REFERRAL
      if (userData.level2ReferralBy) {
        const refSnap2 = await db
          .ref("users")
          .orderByChild("referralCode")
          .equalTo(userData.level2ReferralBy)
          .once("value");

        if (refSnap2.exists()) {
          const refKey2 = Object.keys(refSnap2.val())[0];
          const refUserRef2 = db.ref(`users/${refKey2}`);
          const refUserData2 = refSnap2.val()[refKey2];

          const bonus2 = amount * 0.1;
          const newBonus2 =
            parseFloat(refUserData2.referralBonussLeve2 || 0) + bonus2;
          const newLevel2 = (parseInt(refUserData2.level2 || 0) + 1).toString();

          await refUserRef2.update({
            referralBonussLeve2: `$${newBonus2.toFixed(2)}`,
            level2: newLevel2,
          });
        }
      }

      // Mark user as old
      await userRef.update({ tsohonUser: "yes" });
    }

    return res.status(200).json({ message: "Processed successfully" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
