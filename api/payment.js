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
  try {
    const key = Buffer.from(secretKey, "utf8");
    const iv = Buffer.from(secretKey.substring(0, 16), "utf8"); // IV: 16 bytes from secret
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(JSON.stringify(payloadObj), "utf8", "base64");
    encrypted += cipher.final("base64");
    return encrypted;
  } catch (e) {
    throw new Error("Encryption failed: " + e.message);
  }
}

module.exports = async (req, res) => {
  try {
    // CORS setup
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const origin = req.headers.origin;
    if (origin !== ALLOWED_ORIGIN) {
      return res.status(403).json({ error: "Forbidden origin", received_origin: origin });
    }

    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      return res.status(401).json({ error: "Unauthorized", received_key: clientApiKey });
    }

    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      return res.status(400).json({
        error: "Invalid or missing request fields",
        expected: ["email", "coin", "amount"],
        received: req.body
      });
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

    let encryptedData;
    try {
      encryptedData = encryptPayload(MEXELPAY_API_SECRET, payload);
    } catch (e) {
      return res.status(500).json({
        error: "Encryption error",
        message: e.message,
        payload: payload
      });
    }

    const headers = {
      "Content-Type": "application/json",
      "api-key": MEXELPAY_API_KEY
    };

    let response, resultText, result;
    try {
      response = await fetch(MEXELPAY_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ data: encryptedData })
      });
      resultText = await response.text();

      try {
        result = JSON.parse(resultText);
      } catch (jsonErr) {
        return res.status(502).json({
          error: "MaxelPay returned invalid JSON",
          status: response.status,
          text: resultText
        });
      }

      if (!response.ok || !result?.payment_url) {
        return res.status(500).json({
          error: "MaxelPay error",
          status: response.status,
          result: result,
          payloadSent: payload,
          encryptedDataSent: encryptedData
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
        error: "Network or Fetch error",
        message: err.message,
        payload: payload,
        encryptedData: encryptedData
      });
    }

  } catch (err) {
    return res.status(500).json({
      error: "Unexpected server error",
      message: err.message,
      stack: err.stack
    });
  }
};
