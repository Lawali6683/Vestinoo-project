// register.js (userData.js)

const admin = require("firebase-admin");
const crypto = require("crypto");
const axios = require("axios");

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
    return res.status(403).json({ error: "Forbidden origin" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { fullName, email, username, country, password, referralBy } = req.body;
  if (!fullName || !email || !username || !country || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const uid = userRecord.uid;

    const vestinooID = `VTN-${crypto.randomBytes(2).toString("hex")}`;
    const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    const referralLink = `https://vestinoo.pages.dev/?ref=${referralCode}`;

    // Generate unique CoinPay ID
    const userCoinpayid = `CP-${crypto.randomBytes(3).toString("hex")}`;

    const coinpayCheck = await db.ref("users").orderByChild("userCoinpayid").equalTo(userCoinpayid).once("value");
    if (coinpayCheck.exists()) {
      return res.status(409).json({ error: "CoinPay ID already exists" });
    }

    // Create Wallet via external endpoint
    let walletResponse;
    try {
      const walletReq = await axios.post("https://bonus-gamma.vercel.app/api/createWallet", {
        userCoinpayid,
      });
      walletResponse = walletReq.data;
    } catch (err) {
      return res.status(500).json({ error: "Failed to create wallet", details: err.response?.data || err.message });
    }

    const createdAt = new Date().toISOString();
    const userData = {
      fullName,
      email: normalizedEmail,
      username,
      country,
      password,
      referralCode,
      referralLink,
      vestinooID,
      createdAt,
      userCoinpayid,
      ...walletResponse,
      userBalance: 0,
      deposit: 0,
      dailyProfit: 0,
      taskBonus: 0,
      vestBit: 0,
      tsohonUser: "false",
      depositTime: null,
      wellecomeBonus: 0.50,
      referralBonusLeve1: 0,
      referralBonussLeve2: 0,
      level1: "0",
      level2: "0",
      referralRegisterLevel1: 0,
      referralRegisterLevel2: 0,
    };

    await db.ref(`users/${uid}`).set(userData);

    return res.status(201).json({ message: "User registered successfully", userId: uid, userCoinpayid });
  } catch (error) {
    return res.status(500).json({ error: "Registration failed", details: error.message || error });
  }
};
