const admin = require("firebase-admin");
const crypto = require("crypto");
const https = require("https");

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

function callCreateWalletApi(data) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(data);
    const options = {
      hostname: "bonus-gamma.vercel.app",
      port: 443,
      path: "/api/createWallet",
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject({
              error: `createWallet Error: ${res.statusCode}`,
              response: parsedData,
            });
          }
        } catch (e) {
          reject({ error: "Invalid JSON", raw: responseData });
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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const origin = req.headers.origin;
  if (origin && origin !== "https://vestinoo.pages.dev") {
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

  // ✅ Mataki na farko: duba ko email yana Firebase Auth
  try {
    await admin.auth().getUserByEmail(normalizedEmail);
    return res.status(409).json({ error: "Email already in use" });
  } catch (e) {
    if (e.code !== "auth/user-not-found") {
      return res.status(500).json({ error: "Error checking user", details: e.message });
    }
  }

  // ✅ Mataki na biyu: tabbatar da referral kafin ƙirƙirar user
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

  // ✅ Mataki na uku: create user a Firebase Auth
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password,
      displayName: fullName,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create user", details: error.message });
  }

  const uid = userRecord.uid;
  const userCoinpayid = "CPID-" + uid.slice(0, 12);
  const vestinooID = `VTN-${crypto.randomBytes(2).toString("hex")}`;
  const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
  const referralLink = `https://vestinoo.pages.dev/?ref=${referralCode}`;

  let walletData;
  try {
    walletData = await callCreateWalletApi({ userCoinpayid });
  } catch (error) {
    await admin.auth().deleteUser(uid);
    return res.status(500).json({ error: "Failed to generate wallet", details: error });
  }

  const createdAt = new Date().toISOString();
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
    userCoinpayid,
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
    createdAt,
    network: walletData.network,
    userWalletPrivateKey: walletData.userWalletPrivateKey,
    userBnbWalletAddress: walletData.userBnbWalletAddress,
    bnbBep20Address: walletData.bnbBep20Address,
    usdtBep20Address: walletData.usdtBep20Address,
    usdcBep20Address: walletData.usdcBep20Address,
    trxBep20Address: walletData.trxBep20Address
  };

  await db.ref(`users/${uid}`).set(userData);

  // Update referral counts
  if (validReferralBy) {
    const refUserSnapshot = await db.ref("users")
      .orderByChild("referralCode")
      .equalTo(validReferralBy)
      .once("value");

    if (refUserSnapshot.exists()) {
      const refUserKey = Object.keys(refUserSnapshot.val())[0];
      const refUser = refUserSnapshot.val()[refUserKey];
      const currentLevel1 = refUser.referralRegisterLevel1 || 0;

      await db.ref(`users/${refUserKey}/referralRegisterLevel1`).set(currentLevel1 + 1);

      if (refUser.referralBy) {
        const refUser2Snapshot = await db.ref("users")
          .orderByChild("referralCode")
          .equalTo(refUser.referralBy)
          .once("value");

        if (refUser2Snapshot.exists()) {
          const refUser2Key = Object.keys(refUser2Snapshot.val())[0];
          const refUser2 = refUser2Snapshot.val()[refUser2Key];
          const currentLevel2 = refUser2.referralRegisterLevel2 || 0;

          await db.ref(`users/${refUser2Key}/referralRegisterLevel2`).set(currentLevel2 + 1);
        }
      }
    }
  }

  return res.status(201).json({
    message: "User registered and wallets created.",
    userId: uid,
    vestinooID,
    userCoinpayid,
    walletData,
  });
};
