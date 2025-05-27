const admin = require("firebase-admin");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
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

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, taskBonus, referralBy, level2ReferralBy, code = "" } = req.body;
    if (!email || typeof taskBonus !== "number") {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // 1. Find user by email
    const usersSnapshot = await db.ref("users").once("value");
    let userId = null;

    usersSnapshot.forEach((child) => {
      if (child.val().email === email) {
        userId = child.key;
      }
    });

    if (!userId) {
      return res.status(404).json({ error: "User not found" });
    }

    const userRef = db.ref(`users/${userId}`);
    const userSnapshot = await userRef.once("value");
    const userData = userSnapshot.val();

    const currentBonus = parseFloat(userData.taskBonus) || 0;
    if (currentBonus <= 0) {
      return res.status(400).json({ error: "No bonus available" });
    }

    // 2. Add taskBonus to userBalance and reset taskBonus
    const currentBalance = parseFloat(userData.userBalance) || 0;
    const newBalance = currentBalance + currentBonus;

    await userRef.update({
      userBalance: newBalance,
      taskBonus: 0,
    });

    // 3. Pay referral level 1 bonus (4%)
    if (referralBy) {
      let ref1Id = null;
      usersSnapshot.forEach((child) => {
        if (child.val().referralCode === referralBy) {
          ref1Id = child.key;
        }
      });

      if (ref1Id) {
        const ref1Ref = db.ref(`users/${ref1Id}`);
        const ref1Snap = await ref1Ref.once("value");
        const ref1Data = ref1Snap.val();
        const ref1Bonus = parseFloat(ref1Data.referralBonusLeve1) || 0;
        const bonusToAdd = parseFloat((currentBonus * 0.04).toFixed(2));
        await ref1Ref.update({
          referralBonusLeve1: ref1Bonus + bonusToAdd,
        });
      }
    }

    // 4. Pay referral level 2 bonus (6%)
    if (level2ReferralBy) {
      let ref2Id = null;
      usersSnapshot.forEach((child) => {
        if (child.val().referralCode === level2ReferralBy) {
          ref2Id = child.key;
        }
      });

      if (ref2Id) {
        const ref2Ref = db.ref(`users/${ref2Id}`);
        const ref2Snap = await ref2Ref.once("value");
        const ref2Data = ref2Snap.val();
        const ref2Bonus = parseFloat(ref2Data.referralBonusLeve2) || 0;
        const bonusToAdd = parseFloat((currentBonus * 0.06).toFixed(2));
        await ref2Ref.update({
          referralBonusLeve2: ref2Bonus + bonusToAdd,
        });
      }
    }

    return res.status(200).json({ success: true, message: "Task bonus and referrals processed." });
  } catch (error) {
    console.error("Error processing task bonus:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
