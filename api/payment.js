const crypto = require("crypto");

const {
  PAYID19_PUBLIC_KEY,
  PAYID19_PRIVATE_KEY,
  API_AUTH_KEY
} = process.env;

const ALLOWED_ORIGIN = "https://vestinoo.pages.dev";
const PAYID19_URL = "https://payid19.com/api/v1/create_invoice";

module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const origin = req.headers.origin;
    if (origin !== ALLOWED_ORIGIN) {
      console.error("❌ Blocked origin:", origin);
      return res.status(403).json({ error: "Forbidden origin", origin });
    }

    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      console.error("❌ Invalid or missing API key:", clientApiKey);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, coin, network, amount } = req.body || {};

    if (!email || !coin || !amount || isNaN(amount)) {
      console.error("❌ Invalid request fields:", { email, coin, network, amount });
      return res.status(400).json({
        error: "Invalid request fields",
        received: { email, coin, network, amount }
      });
    }

    const orderId = `${email}_${crypto.randomBytes(6).toString("hex")}`;

    const postData = {
      public_key: PAYID19_PUBLIC_KEY,
      private_key: PAYID19_PRIVATE_KEY,
      email,
      price_amount: parseFloat(amount),
      price_currency: "USD",
      order_id: orderId,
      title: "Vestinoo Deposit",
      description: `Deposit of ${amount} USD`,
      add_fee_to_price: 1,
      callback_url: "https://vestinoo-project.vercel.app/api/webhook",
      expiration_date: 24,
      margin_ratio: 1.0,
      coin
    };

    if (network) {
      postData.network = network;
    }

    console.log("📤 Sending request to Payid19:", JSON.stringify(postData, null, 2));

    const response = await fetch(PAYID19_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(postData)
    });

    const result = await response.json();

    console.log("📥 Received response from Payid19:", JSON.stringify(result, null, 2));

    if (!response.ok || result.status === 'error' || !result.message?.invoice?.payment_url) {
      console.error("❌ Payid19 Error:", {
        status: result?.status,
        message: result?.message,
        full: result
      });
      return res.status(500).json({
        error: "Failed to create payment with Payid19",
        details: result?.message || result
      });
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
      walletAddress: result.message.invoice?.wallet_address || null,
      payment_url: result.message.invoice?.payment_url,
      invoice_id: result.message.invoice?.id
    });

  } catch (err) {
    console.error("❌ Unexpected server error:", {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      error: "Server error",
      message: err.message,
      stack: err.stack
    });
  }
};
