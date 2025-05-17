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
      console.warn("Forbidden origin:", origin);
      return res.status(403).json({ error: "Forbidden origin", origin });
    }

    const clientApiKey = req.headers["x-api-key"];
    if (!clientApiKey || clientApiKey !== API_AUTH_KEY) {
      console.warn("Unauthorized API key");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, coin, amount } = req.body || {};
    if (!email || !coin || !amount || isNaN(amount)) {
      console.warn("Invalid request fields:", req.body);
      return res.status(400).json({ error: "Invalid request fields", received: req.body });
    }

    const orderId = `${email}_${crypto.randomBytes(6).toString("hex")}`;

    const postData = {
      public_key: PAYID19_PUBLIC_KEY,
      private_key: PAYID19_PRIVATE_KEY,
      email,
      price_amount: parseFloat(amount),
      price_currency: coin.toUpperCase(),
      order_id: orderId,
      title: "Vestinoo Deposit",
      description: `Deposit of ${amount} ${coin}`,
      add_fee_to_price: 1,
      callback_url: "https://vestinoo-project.vercel.app/api/webhook",
      expiration_date: 24,
      margin_ratio: 1.0
    };

    let fetchResponse, fetchResult;

    try {
      fetchResponse = await fetch(PAYID19_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(postData)
      });

      fetchResult = await fetchResponse.json();
    } catch (fetchError) {
      console.error("Fetch failed:", fetchError);
      return res.status(500).json({
        error: "Fetch to Payid19 failed",
        message: fetchError.message,
        stack: fetchError.stack,
        context: {
          request: postData,
        }
      });
    }

    if (!fetchResponse.ok || fetchResult.status === "error" || !fetchResult.message?.invoice?.payment_url) {
      console.error("Payid19 API returned error:", fetchResult);
      return res.status(500).json({
        error: "Failed to create payment with Payid19",
        statusCode: fetchResponse.status,
        statusText: fetchResponse.statusText,
        payidResponse: fetchResult,
        requestData: postData
      });
    }

    return res.status(200).json({
      success: true,
      order_id: orderId,
      payment_url: fetchResult.message.invoice.payment_url,
      raw: fetchResult // optional, can be removed later
    });

  } catch (err) {
    console.error("Unhandled server error:", err);
    return res.status(500).json({
      error: "Unhandled server error",
      message: err.message,
      stack: err.stack,
      env: {
        PAYID19_PUBLIC_KEY: !!PAYID19_PUBLIC_KEY,
        PAYID19_PRIVATE_KEY: !!PAYID19_PRIVATE_KEY,
        API_AUTH_KEY: !!API_AUTH_KEY
      }
    });
  }
};
