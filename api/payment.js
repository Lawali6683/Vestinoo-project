const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const XAIGATE_API_KEY = process.env.XAIGATE_API_KEY;

function postData(path, data) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(data);
    const options = {
      hostname: "wallet-api.xaigate.com",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataString),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({
              error: `XaiGate Error: ${res.statusCode}`,
              details: parsed,
            });
          }
        } catch (err) {
          reject({ error: "Response Parse Error", raw: responseData });
        }
      });
    });

    req.on("error", (e) => {
      reject({ error: "HTTPS Request Error", details: e });
    });

    req.write(dataString);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const origin = req.headers.origin;
  if (origin !== "https://vestinoo-project.vercel.app") {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { amount, walletAddress, coin, networkId, xaigateUserId } = req.body || {};

  if (!amount || !walletAddress || !coin || !networkId || !xaigateUserId) {
    return res.status(400).json({
      error: "Missing required withdrawal parameters",
      received: { amount, walletAddress, coin, networkId, xaigateUserId },
    });
  }

  try {
    const payload = {
      apiKey: XAIGATE_API_KEY,
      userId: xaigateUserId,
      coin,
      receivedAddress: walletAddress,
      amount: String(amount),
      networkId: String(networkId),
    };

    console.log("🔄 Withdrawal Payload Sent to XaiGate:", payload);

    const response = await postData("/api/v1/withdraw", payload);

    return res.status(200).json({
      success: true,
      message: "Withdrawal initiated successfully",
      response,
    });
  } catch (err) {
    console.error("❌ Withdrawal Error:", {
      input: req.body,
      error: err.error,
      details: err.details || err.raw,
    });

    return res.status(500).json({
      success: false,
      message: "Withdrawal failed",
      error: err.error || "Unknown error",
      details: err.details || err.raw || null,
      input: req.body,
    });
  }
};
