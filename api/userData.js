const admin = require("firebase-admin");
const crypto = require("crypto");
const https = require("https");
const fetch = require("node-fetch");

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

// Send email using your email.js service
async function sendEmail(to, subject, htmlContent) {
  try {
    const res = await fetch("https://bonus-gamma.vercel.app/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, htmlContent }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send email");
    return data;
  } catch (error) {
    throw new Error("Email send error: " + error.message);
  }
}

// Create wallet
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

  try {
    // Check if email is already used
    try {
      await admin.auth().getUserByEmail(normalizedEmail);
      return res.status(409).json({ error: "Email already in use" });
    } catch (e) {
      if (e.code !== "auth/user-not-found") {
        return res.status(500).json({ error: "Error checking user", details: e.message });
      }
    }

    let level2ReferralBy = null;
    let validReferralBy = null;

    if (referralBy) {
      const usersSnapshot = await db.ref("users").once("value");
      let found = false;
      usersSnapshot.forEach((childSnapshot) => {
        const user = childSnapshot.val();
        if (user.referralCode === referralBy) {
          validReferralBy = referralBy;
          level2ReferralBy = user.referralBy || null;
          found = true;
        }
      });
      if (!found) {
        return res.status(400).json({ error: "Invalid referral code" });
      }
    }

    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password,
      displayName: fullName,
    });

    const uid = userRecord.uid;
    const userCoinpayid = "CPID-" + uid.slice(0, 12);
    const vestinooID = `VTN-${crypto.randomBytes(2).toString("hex")}`;
    const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    const referralLink = `https://vestinoo.pages.dev/?ref=${referralCode}`;

    // Wallet API
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
      wellecomeBonus: 0.5,
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
      trxBep20Address: walletData.trxBep20Address,
    };

    await db.ref(`users/${uid}`).set(userData);

    // Referral Updates
    if (validReferralBy) {
      const usersSnapshot = await db.ref("users").once("value");
      usersSnapshot.forEach(async (childSnapshot) => {
        const refUser = childSnapshot.val();
        const key = childSnapshot.key;
        if (refUser.referralCode === validReferralBy) {
          const currentLevel1 = refUser.referralRegisterLevel1 || 0;
          await db.ref(`users/${key}/referralRegisterLevel1`).set(currentLevel1 + 1);
          if (refUser.referralBy) {
            usersSnapshot.forEach(async (innerSnapshot) => {
              const refUser2 = innerSnapshot.val();
              const key2 = innerSnapshot.key;
              if (refUser2.referralCode === refUser.referralBy) {
                const currentLevel2 = refUser2.referralRegisterLevel2 || 0;
                await db.ref(`users/${key2}/referralRegisterLevel2`).set(currentLevel2 + 1);
              }
            });
          }
        }
      });
    }

    // Prepare Email
    const emailVerifyLink = await admin.auth().generateEmailVerificationLink(normalizedEmail);
    const redirectLink = emailVerifyLink.includes("emailVerify")
      ? emailVerifyLink
      : `https://vestinoo.pages.dev/emailVerify`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;padding:20px;background:#f4f4f4">
        <div style="max-width:600px;margin:auto;background:#fff;padding:20px;border-radius:10px;box-shadow:0 0 10px rgba(0,0,0,0.1)">
          <div style="text-align:center">
            <img src="https://vestinoo.pages.dev/log" alt="Vestinoo Logo" width="120">
            <h2 style="color:#2a8ae2">Verify Your Email</h2>
            <p>Welcome <strong>${fullName}</strong>! Please click the button below to verify your email address and activate your Vestinoo account.</p>
            <a href="${redirectLink}" style="display:inline-block;margin-top:20px;padding:12px 25px;background-color:#2a8ae2;color:#fff;text-decoration:none;border-radius:5px">Verify Email</a>
            <p style="margin-top:30px;font-size:12px;color:#999">If you didn’t request this email, you can safely ignore it.</p>
          </div>
        </div>
      </div>
    `;

    try {
      await sendEmail(normalizedEmail, "Vestinoo Email Verification", htmlContent);
    } catch (emailErr) {
      await admin.auth().deleteUser(uid);
      await db.ref(`users/${uid}`).remove();
      return res.status(500).json({ error: "User registration canceled. Failed to send verification email." });
    }

    return res.status(201).json({
      message: "User registered. Email verification sent.",
      userId: uid,
      vestinooID,
      userCoinpayid,
      walletData,
    });

  } catch (error) {
    return res.status(500).json({
      error: "An unexpected error occurred.",
      details: error.message || error,
    });
  }
};
