const https = require("https");

const KIWI_API_KEY = process.env.KIWI_API_KEY; // example: Kn0z2rkWet0KfIS35H6hwYh9tL1ZMT
const API_AUTH_KEY = process.env.API_AUTH_KEY; // your custom backend key for security

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
    const { uid, ip_address } = req.body;

    if (!uid || !ip_address) {
      return res.status(400).json({ error: "Missing uid or ip_address" });
    }

    const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip_address}`;

    VERCEL_LOG("[KiwiWall Request]:", apiUrl);

    https.get(apiUrl, (apiRes) => {
      let data = "";

      apiRes.on("data", chunk => {
        data += chunk;
      });

      apiRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          VERCEL_LOG("[KiwiWall Response]:", parsed);
          res.status(200).json(parsed);
        } catch (error) {
          VERCEL_LOG("[KiwiWall JSON Parse Error]:", error);
          res.status(500).json({ error: "Invalid JSON from KiwiWall" });
        }
      });
    }).on("error", (error) => {
      VERCEL_LOG("[KiwiWall Request Error]:", error);
      res.status(500).json({ error: "Failed to fetch offers from KiwiWall" });
    });

  } catch (error) {
    VERCEL_LOG("[Unhandled Error]:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
