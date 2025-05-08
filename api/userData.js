const admin = require("firebase-admin");
const crypto = require("crypto");

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  const origin = req.headers.origin;
  if (origin !== "https://vestinoo.pages.dev") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { fullName, email, username, country, password, referralBy } = req.body;

  if (!fullName || !email || !username || !country || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);

    const vestinooID = `VTN-${crypto.randomBytes(2).toString("hex")}`;
    const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    const referralLink = `https://vestinoo.pages.dev/?ref=${referralCode}`;

    let level2ReferralBy = null;
    let validReferralBy = null;

    if (referralBy) {
      const refUserSnapshot = await db.ref("users")
        .orderByChild("referralCode")
        .equalTo(referralBy)
        .once("value");

      if (refUserSnapshot.exists()) {
        const refUser = Object.values(refUserSnapshot.val())[0];
        validReferralBy = referralBy;
        level2ReferralBy = refUser.referralBy || null;
      } else {
        return res.status(400).json({ error: "Invalid referral code" });
      }
    }

    const createdAt = new Date().toISOString();

    const userData = {
      fullName,
      email,
      username,
      country,
      referralLink,
      referralCode,
      referralBy: validReferralBy,
      level2ReferralBy,
      vestinooID,
      userBalance: 0,
      deposit: 0,
      dailyProfit: 0,
      vestBit: 0,
      tsohonUser: "false",
      depositTime: null,
      wellecomeBonus: 0.50,
      referralBonusLeve1: 0,
      referralBonussLeve2: 0,
      level1: "0",
      level2: "0",
      usdttrc20Address: "---",
      bnbAddress: "---",
      btcAddress: "---",
      usdtbep20Address: "---",
      createdAt,
      registerTime: createdAt,
    };

    await db.ref(`users/${user.uid}`).set(userData);

    return res.status(201).json({
      message: "Registration successful. Please verify your email.",
      userId: user.uid,
      vestinooID,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    return res.status(500).json({ error: "An error occurred during registration. Please try again." });
  }
};
