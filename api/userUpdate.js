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

    const { email, type } = req.body;
    if (!email || !type) {
        return res.status(400).json({ error: "Email and type are required" });
    }

    try {
        const userId = crypto.createHash("md5").update(email).digest("hex");
        const userRef = db.ref(`users/${userId}`);
        const snapshot = await userRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = snapshot.val();

        switch (type) {
            case "expiredPlan":
                await resetExpiredPlan(userRef);
                break;
            case "dailyProfit":
                await handleDailyProfit(userRef, user);
                break;
            case "sellVestBit":
                await handleVestBitReward(userRef, user);
                break;
            case "referralBonusLevel1":
                await handleReferralBonus(userRef, user, 1);
                break;
            case "referralBonusLevel2":
                await handleReferralBonus(userRef, user, 2);
                break;
            case "welcomeBonus":
                await handleWelcomeBonus(userRef, user);
                break;
            default:
                return res.status(400).json({ error: "Invalid request type" });
        }

        return res.json({ message: `${type} processed successfully.` });
    } catch (err) {
        return res.status(500).json({ error: "Internal server error", details: err.message });
    }
};

// ==== EXPIRED PLAN ====
async function resetExpiredPlan(userRef) {
    await userRef.update({
        deposit: 0,
        dailyProfit: 0,
        depositTime: null
    });
}

// ==== DAILY PROFIT ====
async function handleDailyProfit(userRef, user) {
    const now = Date.now();
    const lastClearTime = user.lastClearTime || 0;

    const depositTime = user.depositTime || 0;
    const duration = user.duration || 0;
    const planExpired = now > (depositTime + duration * 24 * 60 * 60 * 1000);

    if (planExpired) {
        await resetExpiredPlan(userRef);
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

// ==== SELL VESTBIT ====
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

// ==== REFERRAL BONUS ====
async function handleReferralBonus(userRef, user, level) {
    const field = level === 1 ? "referralBonusLeve1" : "referralBonussLeve2";
    const bonus = user[field] || 0;

    if (bonus > 0) {
        await userRef.update({
            userBalance: user.userBalance + bonus,
            [field]: 0
        });
    } else {
        throw new Error(`No referral bonus for level ${level}.`);
    }
}

// ==== WELCOME BONUS ====
async function handleWelcomeBonus(userRef, user) {
    const bonus = user.wellecomeBonus || 0;

    if (bonus > 0) {
        await userRef.update({
            userBalance: user.userBalance + bonus,
            wellecomeBonus: 0
        });
    } else {
        throw new Error("No welcome bonus available.");
    }
}
