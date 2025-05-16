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
  try {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    // Origin check
    const origin = req.headers.origin;
    if (origin !== ALLOWED_ORIGIN) {
      console.error("Origin not allowed:", origin);
      return res.status(403).json({ error: "Forbidden origin", origin });
    }

    // API key check
    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      console.error("Invalid or missing API key:", clientApiKey);
      return res.status(401).json({ error: "Unauthorized", key: clientApiKey });
    }

    // Body validation
    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      console.error("Invalid request body:", req.body);
      return res.status(400).json({ error: "Missing or invalid fields", received: req.body });
    }

    const orderId = `${email}_${crypto.randomBytes(8).toString("hex")}`;

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

    console.log("Sending payload to MaxelPay:", payload);

    const response = await fetch(MEXELPAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const resultText = await response.text();
    let result;

    try {
      result = JSON.parse(resultText);
    } catch (jsonError) {
      console.error("Failed to parse MaxelPay response as JSON:", resultText);
      return res.status(500).json({ error: "Invalid JSON response from MaxelPay", raw: resultText });
    }

    if (!response.ok || !result?.payment_url) {
      console.error("MaxelPay response error:", result);
      return res.status(500).json({
        error: "Failed to create payment with MaxelPay",
        response_status: response.status,
        details: result
      });
    }

    console.log("Payment URL received:", result.payment_url);

    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_url: result.payment_url
    });

  } catch (err) {
    console.error("Unexpected server error:", err);
    return res.status(500).json({
      error: "Server crash or unexpected error",
      message: err.message,
      stack: err.stack
    });
  }
};
