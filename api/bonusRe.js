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

  const { email, wellecomeBonus, referralBonusLeve1, referralBonussLeve2 } = req.body;

  if (
    !email ||
    (wellecomeBonus === undefined &&
      referralBonusLeve1 === undefined &&
      referralBonussLeve2 === undefined)
  ) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  try {
    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");

    let userKey = null;
    let userData = null;

    snapshot.forEach(child => {
      const data = child.val();
      if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
        userKey = child.key;
        userData = data;
      }
    });

    if (!userKey) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};
    let newBalance = userData.userBalance || 0;

    if (wellecomeBonus > 0 && userData.wellecomeBonus > 0) {
      updates.wellecomeBonus = 0;
      newBalance += 0.50;
    }

    if (referralBonusLeve1 > 0 && userData.referralBonusLeve1 > 0) {
      updates.referralBonusLeve1 = 0;
      newBalance += referralBonusLeve1;
    }

    if (referralBonussLeve2 > 0 && userData.referralBonussLeve2 > 0) {
      updates.referralBonussLeve2 = 0;
      newBalance += referralBonussLeve2;
    }

    updates.userBalance = newBalance;

    await db.ref(`users/${userKey}`).update(updates);

    return res.status(200).json({ message: "Bonus processed successfully" });

  } catch (error) {
    console.error("Error processing the bonus:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
