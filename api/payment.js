const crypto = require("crypto");
const fetch = require("node-fetch");

const {
  API_AUTH_KEY,
  MEXELPAY_API_KEY,
  MEXELPAY_API_SECRET
} = process.env;

const ALLOWED_ORIGIN = "https://vestinoo.pages.dev";
const MEXELPAY_URL = "https://api.maxelpay.com/v1/prod/merchant/order/checkout";

// AES-256-CBC Encryption Function
function encryptPayload(secretKey, payloadObj) {
  const key = Buffer.from(secretKey, "utf8");
  const iv = Buffer.from(secretKey.substring(0, 16), "utf8"); // First 16 chars as IV
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(payloadObj), "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

module.exports = async (req, res) => {
  try {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const origin = req.headers.origin;
    if (origin !== ALLOWED_ORIGIN) {
      return res.status(403).json({ error: "Forbidden origin", origin });
    }

    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid request fields", received: req.body });
    }

    const orderId = `${email}_${crypto.randomBytes(8).toString("hex")}`;

    
    const timestamp = Math.floor(Date.now() / 1000) + 86400; 

    const payload = {
      orderID: orderId,
      amount: parseFloat(amount),
      currency: coin.toUpperCase(),
      timestamp: timestamp,
      userName: "Vestinoo",
      siteName: "Vestinoo",
      userEmail: email,
      webhookUrl: "https://vestinoo-project.vercel.app/api/webhook"     
    };

    const encryptedData = encryptPayload(MEXELPAY_API_SECRET, payload);

    const headers = {
      "Content-Type": "application/json",
      "api-key": MEXELPAY_API_KEY
    };

    const response = await fetch(MEXELPAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: encryptedData })
    });

    const resultText = await response.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch {
      return res.status(500).json({ error: "Invalid JSON response from MaxelPay", raw: resultText });
    }

    if (!response.ok || !result?.payment_url) {
      return res.status(500).json({
        error: "Failed to create payment with MaxelPay",
        response_status: response.status,
        details: result
      });
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_url: result.payment_url,
      expires_at: timestamp
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      message: err.message,
      stack: err.stack
    });
  }
};
