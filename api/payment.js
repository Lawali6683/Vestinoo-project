const crypto = require("crypto");
const fetch = require("node-fetch");

const {
  API_AUTH_KEY,
  MEXELPAY_API_KEY,
  MEXELPAY_API_SECRET
} = process.env;

const ALLOWED_ORIGIN = "https://vestinoo.pages.dev";
const MEXELPAY_URL = "https://api.maxelpay.com/v1/prod/merchant/order/checkout"; 

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Verify origin
  const origin = req.headers.origin;
  if (origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // Check API key
  const clientApiKey = req.headers["x-api-key"];
  if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Extract request data
  const { email, coin, amount } = req.body || {};
  if (!email || !coin || !amount || isNaN(amount)) {
    return res.status(400).json({ error: "Missing or invalid fields: email, coin, amount" });
  }

  // Generate unique order ID
  const orderId = `${email}_${crypto.randomBytes(8).toString("hex")}`;

  // Prepare MaxelPay payload
  const payload = {
    amount: parseFloat(amount),
    currency: coin.toUpperCase(),
    order_id: orderId,
    callback_url: "https://vestinoo-project.vercel.app/api/webhook",
    buyer_email: email
  };

  const headers = {
    "Content-Type": "application/json",
    "api-key": MEXELPAY_API_KEY,
    "api-secret": MEXELPAY_API_SECRET
  };

  try {
    const response = await fetch(MEXELPAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // Check if response is valid
    if (!response.ok || !result?.payment_url) {
      return res.status(500).json({
        error: "Failed to create payment with MaxelPay",
        details: result
      });
    }

    // Success - return payment URL to frontend
    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_url: result.payment_url
    });

  } catch (err) {
    console.error("MaxelPay API error:", err);
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};
