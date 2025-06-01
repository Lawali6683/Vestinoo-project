const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const KIWI_API_KEY = process.env.KIWI_API_KEY;

const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, ip, country } = req.body;

    if (!uid || !ip) {
      return res.status(400).json({ error: "Missing required fields: uid and ip" });
    }

    const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${country ? `&country=${country}` : ''}`;

    VERCEL_LOG("[KiwiWall API Request]:", apiUrl);

    https.get(apiUrl, (kiwiRes) => {
      let data = "";

      kiwiRes.on("data", (chunk) => {
        data += chunk;
      });

      kiwiRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          VERCEL_LOG("[KiwiWall API Response]:", parsed);
          res.status(200).json(parsed);
        } catch (error) {
          VERCEL_LOG("[JSON Parse Error]:", error);
          res.status(500).json({ error: "Failed to parse response from KiwiWall" });
        }
      });
    }).on("error", (err) => {
      VERCEL_LOG("[Request Error]:", err);
      res.status(500).json({ error: "Error contacting KiwiWall" });
    });

  } catch (err) {
    VERCEL_LOG("[Unhandled Error]:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
