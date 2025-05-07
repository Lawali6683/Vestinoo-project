const crypto = require("crypto");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// Load environment variables
const {
  API_AUTH_KEY,
  FIREBASE_DATABASE_URL,
  FIREBASE_SERVICE_ACCOUNT,
} = process.env;

const NOWPAYMENTS_API_KEY = "REWYBWC-7EZ4BGR-QTQ42WF-9CYE26Y";
const NOWPAYMENTS_URL = "https://api.nowpayments.io/v1/payment";
const ALLOWED_ORIGIN = "https://vestinoo.pages.dev";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  // Set CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Restrict allowed origin
  const origin = req.headers.origin;
  if (origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // Authenticate request
  const clientApiKey = req.headers["x-api-key"];
  if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate body
  const { email, coin, amount } = req.body || {};
  if (!email || !coin || !amount || isNaN(amount)) {
    return res
      .status(400)
      .json({ error: "Missing or invalid fields: email, coin, amount" });
  }

  const orderId = crypto.randomBytes(8).toString("hex");

  const paymentData = {
    price_amount: parseFloat(amount),
    price_currency: "usd",
    pay_currency: coin,
    ipn_callback_url: "https://vestinooproject.vercel.app/api/webhook",
    order_id: orderId,
    order_description: `Payment from ${email} - Order ID: ${orderId}`,
    is_fixed_rate: true,
    is_fee_paid_by_user: false,
  };

  try {
    const nowResponse = await fetch(NOWPAYMENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify(paymentData),
    });

    const nowResult = await nowResponse.json();

    if (!nowResponse.ok || !nowResult.payment_id) {
      return res.status(500).json({
        error: "Failed to create payment with NOWPayments",
        details: nowResult,
      });
    }

    // Store to Firebase
    const paymentRef = db.ref(`payments/${orderId}`);
    await paymentRef.set({
      email,
      coin,
      amount: parseFloat(amount),
      payment_id: nowResult.payment_id,
      pay_address: nowResult.pay_address,
      pay_currency: nowResult.pay_currency,
      status: "waiting",
      created_at: nowResult.created_at,
      expiration_estimate_date: nowResult.expiration_estimate_date,
    });

    // Send response to client
    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_id: nowResult.payment_id,
      pay_address: nowResult.pay_address,
      pay_currency: nowResult.pay_currency,
      price_amount: nowResult.price_amount,
      expiration_estimate_date: nowResult.expiration_estimate_date,
    });
  } catch (err) {
    console.error("NOWPayments error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
