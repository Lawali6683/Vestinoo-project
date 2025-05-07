const admin = require("firebase-admin");
const crypto = require("crypto");
const fetch = require("node-fetch");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;
const NOWPAYMENTS_API_KEY = "REWYBWC-7EZ4BGR-QTQ42WF-9CYE26Y";
const NOWPAYMENTS_URL = "https://api.nowpayments.io/v1/payment";

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

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    const origin = req.headers.origin;
    if (origin !== "https://vestinoo.pages.dev") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    const { email, amount, currency } = req.body;
    if (!email || !amount || !currency) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        // Create payment request to NOWPayments
        const paymentPayload = {
            price_amount: parseFloat(amount),
            price_currency: "usd",
            pay_currency: currency.toLowerCase(),
            ipn_callback_url: "https://vestinooproject.vercel.app/api/webhook",
            order_id: `vestinoo-${crypto.randomBytes(8).toString("hex")}`,
            order_description: `User Payment for ${email}`,
            is_fixed_rate: true,
            is_fee_paid_by_user: false
        };

        const npRes = await fetch(NOWPAYMENTS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": NOWPAYMENTS_API_KEY
            },
            body: JSON.stringify(paymentPayload)
        });

        const npData = await npRes.json();

        if (!npRes.ok) {
            console.error("NOWPayments error:", npData);
            return res.status(500).json({ error: "NOWPayments error", details: npData });
        }

        const userRef = db.ref(`payments/${email.replace(/\./g, '_')}`);
        await userRef.set({
            ...npData,
            email,
            expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days in ms
        });

        return res.status(200).json({ success: true, payment: npData });
    } catch (err) {
        console.error("Internal error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
