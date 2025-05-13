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
    const {
      email,
      wellecomeBonus = 0,
      referralBonusLeve1 = 0,
      referralBonussLeve2 = 0,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");

    let userKey = null;
    let userData = null;

    snapshot.forEach((child) => {
      const data = child.val();
      if (data.email && data.email.trim().toLowerCase() === normalizedEmail) {
        userKey = child.key;
        userData = data;
      }
    });

    if (!userKey || !userData) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};
    let updatedBalance = parseFloat(userData.userBalance) || 0;

    const welcomeBonusValue = parseFloat(wellecomeBonus);
    const level1BonusValue = parseFloat(referralBonusLeve1);
    const level2BonusValue = parseFloat(referralBonussLeve2);

    if (welcomeBonusValue > 0 && parseFloat(userData.wellecomeBonus) > 0) {
      updates.wellecomeBonus = 0;
      updatedBalance += welcomeBonusValue;
    }

    if (level1BonusValue > 0 && parseFloat(userData.referralBonusLeve1) > 0) {
      updates.referralBonusLeve1 = 0;
      updatedBalance += level1BonusValue;
    }

    if (level2BonusValue > 0 && parseFloat(userData.referralBonussLeve2) > 0) {
      updates.referralBonussLeve2 = 0;
      updatedBalance += level2BonusValue;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(200).json({ message: "No bonuses available or already claimed" });
    }

    updates.userBalance = parseFloat(updatedBalance.toFixed(2));

    await db.ref(`users/${userKey}`).update(updates);

    return res.status(200).json({
      message: "Bonuses applied successfully",
      updates,
    });
  } catch (error) {
    console.error("Bonus processing error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
};
