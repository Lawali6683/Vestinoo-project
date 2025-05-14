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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  try {
    const { uid, wellecomeBonus } = req.body || {};
    console.log("Request Body:", req.body);

    if (!uid || typeof wellecomeBonus !== "number" || wellecomeBonus <= 0) {
      return res.status(400).json({ error: "Invalid uid or wellecomeBonus" });
    }

    const userRef = db.ref(`users/${uid}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snapshot.val();
    const currentBalance = parseFloat(userData.userBalance) || 0;

    await userRef.update({
      userBalance: currentBalance + wellecomeBonus,
      wellecomeBonus: 0
    });

    return res.status(200).json({ success: true, message: "Welcome bonus cleared successfully" });

  } catch (error) {
    console.error("Error handling welcome bonus:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
