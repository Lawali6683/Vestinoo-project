const admin = require("firebase-admin");
const crypto = require("crypto");
const fetch = require("node-fetch");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;
const NOWPAYMENTS_API_KEY = "REWYBWC-7EZ4BGR-QTQ42WF-9CYE26Y";

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

    const { fullName, email, username, country, password, referralBy } = req.body;
    if (!fullName || !email || !username || !country || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const vestinooID = `VTN-${crypto.randomBytes(4).toString("hex")}`;
        const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
        const referralLink = `https://vestinoo.pages.dev/?ref=${referralCode}`;

        let level2ReferralBy = null;
        if (referralBy) {
            const refUserSnapshot = await db.ref("users").orderByChild("referralCode").equalTo(referralBy).once("value");
            if (refUserSnapshot.exists()) {
                const refUser = Object.values(refUserSnapshot.val())[0];
                level2ReferralBy = refUser.referralBy || null;
            } else {
                return res.status(400).json({ error: "Invalid referral code" });
            }
        }

        const currencies = ["usdttrc20", "bnb", "btc", "usdtbep20"];
        const cryptoAddresses = {};

        for (const currency of currencies) {
            const nowPaymentsResponse = await fetch("https://api.nowpayments.io/v1/address", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": NOWPAYMENTS_API_KEY,
                },
                body: JSON.stringify({
                    currency,
                    ipn_callback_url: "https://vestinooproject.vercel.app/api/webhook",
                    order_id: `${email}_${currency}`,
                }),
            });

            if (!nowPaymentsResponse.ok) {
                throw new Error(`Failed to create NOWPayments address for ${currency}`);
            }

            const nowPaymentsData = await nowPaymentsResponse.json();
            cryptoAddresses[`${currency}Address`] = nowPaymentsData.address;
        }

        const createdAt = new Date().toISOString();

        const userData = {
            fullName,
            email,
            username,
            country,
            referralLink,
            referralCode,
            referralBy: referralBy || null,
            vestinooID,
            level2ReferralBy,
            userBalance: "$0.00",
            dailyProfit: "$0.00",
            deposit: "$0.00",
            tsohonUser: "false", 
            depositTime: null,
            wellecomeBonus: "$0.50",
            referralBonusLeve1: "$0.00",
            referralBonussLeve2: "$0.00",
            level1: "0",
            level2: "0",
            vestBit: "0.000000",
            ...cryptoAddresses,
            createdAt,
            registerTime: createdAt,
        };

        const userRef = await db.ref(`users`).push(userData);

        const auth = admin.auth();
        const userRecord = await auth.createUser({
            email,
            password,
        });

        await auth.generateEmailVerificationLink(email);

        return res.status(201).json({
            message: "Registration successful. Please verify your email.",
            userId: userRef.key,
            vestinooID,
        });
    } catch (error) {
        console.error("Error during registration:", error.message);
        return res.status(500).json({ error: "An error occurred during registration. Please try again." });
    }
};
