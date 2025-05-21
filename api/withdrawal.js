const admin = require("firebase-admin");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
    ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
    : null;

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
        databaseURL: FIREBASE_DATABASE_URL,
    });
}

const db = admin.database();

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    // Handle preflight request
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // Only allow requests from your site
    const origin = req.headers.origin;
    if (origin !== "https://vestinoo.pages.dev") {
        return res.status(403).json({ error: "Forbidden: Invalid origin" });
    }

    // Check API key
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid API key" });
    }

    // Only allow POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { email, amount, walletAddress, coin, networkId, withdrawalTime } = req.body;

        // Validate input
        if (!email || !amount || !walletAddress || !coin || !networkId || !withdrawalTime) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Find user by email
        const usersRef = db.ref("users");
        const snapshot = await usersRef.once("value");

        let userId = null;
        let userData = null;

        snapshot.forEach((child) => {
            const data = child.val();
            if (data.email === email) {
                userId = child.key;
                userData = data;
            }
        });

        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        // Add to approvedWithdrawals
        const withdrawalRef = db.ref(`users/${userId}/approvedWithdrawals`);
        const newWithdrawal = {
            amount,
            walletAddress,
            coin,
            networkId,
            withdrawalTime,
        };

        await withdrawalRef.push(newWithdrawal);

        return res.status(200).json({
            message: "Withdrawal request recorded successfully.",
            withdrawal: newWithdrawal,
        });
    } catch (err) {
        console.error("Error in withdrawal request:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
