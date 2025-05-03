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

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, type, value } = req.body;
    if (!email || !type) {
        return res.status(400).json({ error: "Email and type are required" });
    }

    try {
        const userRef = db.ref(`users/${crypto.createHash("md5").update(email).digest("hex")}`);
        const userSnapshot = await userRef.once("value");

        if (!userSnapshot.exists()) {
            return res.status(404).json({ error: "User not found" });
        }

        const userData = userSnapshot.val();

        switch (type) {
            case "dailyProfit":
                await handleDailyProfit(userRef, userData);
                break;
            case "levelBonus":
                await handleLevelBonus(userRef, userData, value);
                break;
            case "welcomeBonus":
                await handleWelcomeBonus(userRef, userData);
                break;
            case "sellVestBit":
                await handleSellVestBit(userRef, userData);
                break;
            default:
                return res.status(400).json({ error: "Invalid request type" });
        }

        res.json({ message: `${type} processed successfully.` });
    } catch (error) {
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

// === HANDLE DAILY MINE ===
async function handleDailyProfit(userRef, userData) {
    const { dailyProfit, userBalance, deposit, depositTime, duration, lastClearTime = 0 } = userData;
    const now = Date.now();
    const planExpired = now > depositTime + duration * 24 * 60 * 60 * 1000;

    if (planExpired) {
        await userRef.update({
            deposit: 0,
            dailyProfit: 0,
            depositTime: null,
        });
        throw new Error("Plan expired and reset successfully.");
    }

    if (dailyProfit <= 0) {
        throw new Error("No daily profit available to clear.");
    }

    const hoursElapsed = (now - lastClearTime) / (60 * 60 * 1000);
    if (hoursElapsed < 24) {
        throw new Error(`You must wait ${Math.ceil(24 - hoursElapsed)} more hour(s) before clearing again.`);
    }

    const newBalance = userBalance + dailyProfit;
    await userRef.update({
        userBalance: newBalance,
        lastClearTime: now,
        dailyProfit: 0
    });
}

// === LEVEL BONUS ===
async function handleLevelBonus(userRef, userData, level) {
    const bonusField = level === 1 ? "referralBonusLeve1" : "referralBonussLeve2";
    const bonusAmount = userData[bonusField];

    if (bonusAmount > 0) {
        const newBalance = userData.userBalance + bonusAmount;
        await userRef.update({
            userBalance: newBalance,
            [bonusField]: 0
        });
    } else {
        throw new Error(`No Level ${level} bonus available.`);
    }
}

// === WELCOME BONUS ===
async function handleWelcomeBonus(userRef, userData) {
    const { wellecomeBonus, userBalance } = userData;

    if (wellecomeBonus > 0) {
        const newBalance = userBalance + wellecomeBonus;
        await userRef.update({
            userBalance: newBalance,
            wellecomeBonus: 0
        });
    } else {
        throw new Error("No welcome bonus available.");
    }
}

// === SELL VESTBIT ===
async function handleSellVestBit(userRef, userData) {
    const { vestBit, userBalance } = userData;

    if (vestBit >= 1) {
        const newBalance = userBalance + 1;
        await userRef.update({
            userBalance: newBalance,
            vestBit: 0
        });
    } else {
        throw new Error("Insufficient VestBit for sale.");
    }
}
