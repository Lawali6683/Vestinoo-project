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

  // API Key authentication
  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, type } = req.body;
  if (!email || !type) {
    return res.status(400).json({ error: "Email and type are required" });
  }

  try {
    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");

    let foundUserKey = null;
    let foundUser = null;

    snapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val();
      if (user.email === email) {
        foundUserKey = childSnapshot.key;
        foundUser = user;
      }
    });

    if (!foundUserKey || !foundUser) {
      return res.status(404).json({ error: "User with this email not found" });
    }

    const userRef = db.ref(`users/${foundUserKey}`);

    switch (type) {
      case "expiredPlan":
        await userRef.update({ deposit: 0, dailyProfit: 0, depositTime: null });
        break;

      case "dailyProfit":
        await handleDailyProfit(userRef, foundUser);
        break;

      case "sellVestBit":
        await handleVestBitReward(userRef, foundUser);
        break;

      default:
        return res.status(400).json({ error: "Invalid request type" });
    }

    return res.json({ message: `${type} processed successfully.` });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};

// DAILY PROFIT HANDLER
async function handleDailyProfit(userRef, user) {
  const now = Date.now();
  const lastClearTime = user.lastClearTime || 0;
  const depositTime = user.depositTime || 0;
  const duration = user.duration || 0;

  const planExpired = now > (depositTime + duration * 24 * 60 * 60 * 1000);
  if (planExpired) {
    await userRef.update({ deposit: 0, dailyProfit: 0, depositTime: null });
    throw new Error("Plan expired and reset.");
  }

  if (user.dailyProfit <= 0) {
    throw new Error("No daily profit available.");
  }

  const hoursPassed = (now - lastClearTime) / (60 * 60 * 1000);
  if (hoursPassed < 24) {
    throw new Error(`Wait ${Math.ceil(24 - hoursPassed)} more hour(s).`);
  }

  const newBalance = user.userBalance + user.dailyProfit;

  await userRef.update({
    userBalance: newBalance,
    lastClearTime: now,
    dailyProfit: 0
  });
}

// VESTBIT BONUS
async function handleVestBitReward(userRef, user) {
  if (user.vestBit >= 1) {
    await userRef.update({
      userBalance: user.userBalance + 1,
      vestBit: 0
    });
  } else {
    throw new Error("VestBit must be at least 1 to convert.");
  }
}
