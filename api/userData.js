const admin = require("firebase-admin");
const crypto = require("crypto");
const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;
const XAIGATE_API_KEY = process.env.XAIGATE_API_KEY;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

function postData(path, data) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(data);
    const options = {
      hostname: "wallet-api.xaigate.com",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataString),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try {
          const parsedData = JSON.parse(responseData);
          console.log(`[XaiGate ${path}] Status:`, res.statusCode);
          console.log(`[XaiGate ${path}] Body:`, parsedData);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject({
              error: `XaiGate Error: ${res.statusCode}`,
              response: parsedData,
            });
          }
        } catch (e) {
          console.error("JSON Parse Error:", e);
          reject({ error: "Invalid JSON", raw: responseData });
        }
      });
    });

    req.on("error", (e) => {
      console.error("HTTPS Request Error:", e);
      reject({ error: "Request error", details: e });
    });

    req.write(dataString);
    req.end();
  });
}

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
    const user = await admin.auth().getUserByEmail(normalizedEmail);
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

    // STEP 1: Create user in XaiGate
    let createUserResponse;
    try {
      createUserResponse = await postData("/api/v1/createUser", {
        name: fullName,
        apiKey: XAIGATE_API_KEY,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to create XaiGate user", details: error });
    }

    const xaigateUserId = createUserResponse.userId;
    if (!xaigateUserId) {
      return res.status(422).json({ error: "XaiGate user ID not returned" });
    }

    // STEP 2: Generate wallet addresses
    const wallets = {};

    const coins = [
      { coin: "BNB", field: "bnbBep20Address", networkId: "56" },
      { coin: "USDT", field: "usdtBep20Address", networkId: "56" },
      { coin: "USDC", field: "usdcBep20Address", networkId: "56" },
      { coin: "TRX", field: "trxBep20Address", networkId: "tron" }, // or use "1" if XaiGate docs prefer
    ];

    for (const { coin, field, networkId } of coins) {
      try {
        const response = await postData("/api/v1/generateAddress", {
          apiKey: XAIGATE_API_KEY,
          userId: xaigateUserId,
          coin,
          networkId,
        });

        if (!response.address) throw new Error("No address returned");
        wallets[field] = response.address;
        console.log(`✅ ${coin} → ${field}: ${response.address}`);
      } catch (err) {
        return res.status(500).json({ error: `Failed to generate ${coin} address`, details: err });
      }
    }

    // STEP 3: Save to Firebase with addresses at root level
    const userData = {
      fullName,
      email: normalizedEmail,
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
      xaigateUserId,
      createdAt,
      ...wallets,
    };

    await db.ref(`users/${user.uid}`).set(userData);

    return res.status(201).json({
      message: "User registered and wallets created.",
      userId: user.uid,
      vestinooID,
    });
  } catch (error) {
    return res.status(500).json({
      error: "An unexpected error occurred.",
      details: error.message || error,
    });
  }
};
