const crypto = require("crypto");
const fetch = require("node-fetch");

const {
  API_AUTH_KEY,
  NOWPAYMENTS_API_KEY,
} = process.env;

const NOWPAYMENTS_URL = "https://api.nowpayments.io/v1/payment";
const ALLOWED_ORIGIN = "https://vestinoo.pages.dev";

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    console.log("Preflight OPTIONS request received.");
    return res.status(204).end();
  }

  try {
    const origin = req.headers.origin;
    if (origin !== ALLOWED_ORIGIN) {
      console.warn("Forbidden origin:", origin);
      return res.status(403).json({ error: "Forbidden origin" });
    }

    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      console.warn("Unauthorized request. API Key mismatch.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      console.warn("Invalid or missing fields:", { email, coin, amount });
      return res.status(400).json({ error: "Missing or invalid fields: email, coin, amount" });
    }

    const orderId = crypto.randomBytes(8).toString("hex");

    const paymentData = {
      price_amount: parseFloat(amount),
      price_currency: "usd",
      pay_currency: coin,
      ipn_callback_url: "https://vestinoo-project.vercel.app/api/webhook",
      order_id: orderId,
      order_description: `Payment from ${email} - Order ID: ${orderId}`,
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    };

    console.log("Sending payment data to NOWPayments:", paymentData);

    const nowResponse = await fetch(NOWPAYMENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify(paymentData),
    });

    const status = nowResponse.status;
    const contentType = nowResponse.headers.get("content-type");

    console.log("NOWPayments response status:", status);
    console.log("NOWPayments response content-type:", contentType);

    if (!nowResponse.ok) {
      let errorBody;
      try {
        errorBody = await nowResponse.text();
        console.error("NOWPayments returned error response body:", errorBody);
      } catch (err) {
        console.error("Error reading NOWPayments error body:", err);
      }
      return res.status(500).json({
        error: "NOWPayments API returned an error",
        status,
        raw: errorBody,
      });
    }

    const nowResult = await nowResponse.json();
    console.log("NOWPayments successful response:", nowResult);

    if (!nowResult.payment_id) {
      console.error("NOWPayments response missing payment_id:", nowResult);
      return res.status(500).json({
        error: "Missing payment_id in NOWPayments response",
        details: nowResult,
      });
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_id: nowResult.payment_id,
      pay_address: nowResult.pay_address,
      pay_currency: nowResult.pay_currency,
      price_amount: nowResult.price_amount,
      expiration_estimate_date: nowResult.expiration_estimate_date,
      created_at: nowResult.created_at,
    });

  } catch (err) {
    console.error("Unhandled server error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
};
