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
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    // Handle OPTIONS request (CORS Preflight)
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // Verify origin to prevent unauthorized access
    const origin = req.headers.origin;
    if (origin !== "https://vestinoo.pages.dev") {
        return res.status(403).json({ error: "Forbidden" });
    }

    // Verify API key for authentication
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    // Ensure method is POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // Parse the request body
        const { email, amount, welletAddress, withdrawalTime } = req.body;

        if (!email || !amount || !welletAddress || !withdrawalTime) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Fetch user data from Firebase based on email
        const usersRef = db.ref("users");
        const snapshot = await usersRef.once("value");

        let userId = null;
        let userData = null;

        snapshot.forEach((childSnapshot) => {
            const user = childSnapshot.val();
            if (user.email === email) {
                userId = childSnapshot.key;
                userData = user;
            }
        });

        // If user not found
        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if `approvedWithdrawals` exists, if not, create it
        const approvedWithdrawalsRef = db.ref(`users/${userId}/approvedWithdrawals`);
        const approvedSnapshot = await approvedWithdrawalsRef.once("value");

        if (!approvedSnapshot.exists()) {
            await approvedWithdrawalsRef.set([]);
        }

        // Add the withdrawal data to `approvedWithdrawals`
        const newWithdrawal = {
            amount,
            welletAddress,
            withdrawalTime,
        };

        await approvedWithdrawalsRef.push(newWithdrawal);

        // Success response
        return res.status(200).json({
            message: "Withdrawal approved and data recorded successfully",
            withdrawal: newWithdrawal,
        });
    } catch (error) {
        console.error("Error processing withdrawal:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
