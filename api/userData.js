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
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(parsedData);
          }
        } catch (e) {
          reject({ error: "Invalid JSON response", details: e });
        }
      });
    });

    req.on("error", (e) => {
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
  console.log("Normalized Email:", normalizedEmail);

  try {
    const user = await admin.auth().getUserByEmail(normalizedEmail);
    console.log("Firebase Auth User UID:", user.uid);

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

    // STEP 1: Create XaiGate user
    let createUserResponse;
    try {
      createUserResponse = await postData("/api/v1/createUser", {
        name: fullName,
        apiKey: XAIGATE_API_KEY,
      });
    } catch (error) {
      console.error("Error creating XaiGate user:", error);
      return res.status(500).json({ error: "Failed to create XaiGate user" });
    }

    const xaigateUserId = createUserResponse.id;
    if (!xaigateUserId) {
      return res.status(422).json({ error: "XaiGate user ID is null or undefined" });
    }

    console.log("XaiGate User ID:", xaigateUserId);

    // STEP 2: Create wallets
    const coinNetworks = [
      { name: "bnbBep20Address", networkId: "BEP20-BNB" },
      { name: "usdtBep20Address", networkId: "BEP20-USDT" },
      { name: "usdcBep20Address", networkId: "BEP20-USDC" },
      { name: "trxBep20Address", networkId: "BEP20-TRX" },
    ];

    const walletAddresses = {};

    for (const coin of coinNetworks) {
      try {
        const wallet = await postData("/api/v1/generateAddress", {
          apiKey: XAIGATE_API_KEY,
          userId: xaigateUserId,
          networkId: coin.networkId,
        });

        if (!wallet.address) throw new Error("No address returned");

        walletAddresses[coin.name] = wallet.address;
        console.log(`${coin.name} created: ${wallet.address}`);
      } catch (err) {
        console.error(`Error generating wallet for ${coin.name}:`, err);
        return res.status(500).json({ error: `Failed to generate ${coin.name}` });
      }
    }

    // STEP 3: Save user data
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
      ...walletAddresses,
    };

    await db.ref(`users/${user.uid}`).set(userData);
    console.log(`User saved at: users/${user.uid}`);

    return res.status(201).json({
      message: "Registration successful. Wallets created.",
      userId: user.uid,
      vestinooID,
    });
  } catch (error) {
    console.error("Error during registration:", error.message);
    console.error("Full error object:", error);
    return res.status(500).json({ error: "An error occurred during registration. Please try again." });
  }
};
