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
    const { uid, vestBit } = req.body;

    if (!uid || typeof vestBit !== "number") {
      return res.status(400).json({ error: "Missing or invalid uid or vestBit" });
    }

    const userRef = db.ref(`users/${uid}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snapshot.val();
    const currentBalance = typeof userData.userBalance === "number" ? userData.userBalance : 0;
    const currentVestBit = typeof userData.vestBit === "number" ? userData.vestBit : 0;

    if (currentVestBit >= 1.0) {
      await userRef.update({
        vestBit: 0.00000,
        userBalance: +(currentBalance + 1.0).toFixed(2),
      });

      return res.status(200).json({ message: "VestBit converted to $1 successfully." });
    } else {
      return res.status(400).json({ error: "Not enough vestBit to convert (minimum 1.0 required)" });
    }

  } catch (error) {
    console.error("vestBit API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
