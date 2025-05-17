const crypto = require("crypto");
const fetch = require("node-fetch");

// Saka API keys kai tsaye don gwaji (kada a bar haka a production)
const MEXELPAY_API_KEY = "51tIVYtZKxmJfmGNJiM33JmNGo7pAA05";
const MEXELPAY_API_SECRET = "MisQmechjBmokNq8CFCQHN0yYlOPL2gr";

// Dole ne IV ya zama 16 characters, key kuma 32
function padKey(key) {
  return key.padEnd(32, "0").substring(0, 32);
}

function encryptPayload(secretKey, payloadObj) {
  const key = Buffer.from(padKey(secretKey), "utf8");
  const iv = Buffer.from(secretKey.substring(0, 16), "utf8"); // First 16 chars
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(payloadObj), "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid request fields", received: req.body });
    }

    const orderId = `${email}_${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

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

    const response = await fetch("https://api.maxelpay.com/v1/prod/merchant/order/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ data: encryptedData })
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid JSON returned by MaxelPay",
        statusCode: response.status,
        rawText
      });
    }

    if (!response.ok || !result?.payment_url) {
      return res.status(500).json({
        error: "MaxelPay returned error",
        statusCode: response.status,
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
    console.error("Internal error:", err); // will show in Vercel logs
    return res.status(500).json({
      error: "Server error",
      message: err.message,
      stack: err.stack
    });
  }
};
