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

  // Handling OPTIONS request for CORS
  if (req.method === "OPTIONS") return res.status(204).end();

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, wellecomeBonus, referralBonusLeve1, referralBonusLeve2 } = req.body;

  if (!email || (wellecomeBonus === undefined && referralBonusLeve1 === undefined && referralBonusLeve2 === undefined)) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  // Fetch the user data from Firebase
  try {
    const userRef = db.ref(`users`).orderByChild('email').equalTo(email);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userKey = Object.keys(snapshot.val())[0];
    const userData = snapshot.val()[userKey];

    // Process Wellecome Bonus
    if (wellecomeBonus > 0) {
      await db.ref(`users/${userKey}`).update({
        wellecomeBonus: 0,
        userBalance: userData.userBalance + 0.50, 
      });
    }

    // Process Referral Bonus Level 1
    if (referralBonusLeve1 > 0) {
      await db.ref(`users/${userKey}`).update({
        referralBonusLeve1: 0, 
        userBalance: userData.userBalance + referralBonusLeve1, 
      });
    }

    // Process Referral Bonus Level 2
    if (referralBonusLeve2 > 0) {
      await db.ref(`users/${userKey}`).update({
        referralBonussLeve2: 0, 
        userBalance: userData.userBalance + referralBonusLeve2, 
      });
    }

    return res.status(200).json({ message: "Bonus processed successfully" });

  } catch (error) {
    console.error("Error processing the bonus:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
