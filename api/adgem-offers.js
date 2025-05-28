const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY; // your backend verification key
const ADGEM_API_TOKEN = process.env.ADGEM_API_TOKEN; // AdGem Bearer token
const ADGEM_APP_ID = process.env.ADGEM_APP_ID; // Your AdGem app ID
const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  // 🔐 Check backend API key
  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid } = req.body;

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ error: "Invalid or missing UID" });
    }

    const encodedUID = encodeURIComponent(uid.trim());

    const url = `https://api.adgem.com/v1/offers?appid=${ADGEM_APP_ID}&user_id=${encodedUID}`;

    https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${ADGEM_API_TOKEN}`,
          Accept: "application/json",
        },
      },
      (apiRes) => {
        let data = "";

        apiRes.on("data", (chunk) => {
          data += chunk;
        });

        apiRes.on("end", () => {
          try {
            const json = JSON.parse(data);

            if (!json.offers || !Array.isArray(json.offers)) {
              VERCEL_LOG("❌ Invalid AdGem response structure:", json);
              return res.status(502).json({ error: "Invalid AdGem response format" });
            }

            const offers = json.offers.map((offer) => ({
              id: offer.offer_id,
              name: offer.title,
              description: offer.description,
              payout: offer.payout_usd,
              category: offer.creative_type || "unknown",
              icon: offer.icon,
              image: offer.image,
              offer_url: offer.offer_url,
              countries: offer.countries,
              platform: offer.platform,
            }));

            return res.status(200).json({ offers });
          } catch (err) {
            VERCEL_LOG("❌ Error parsing AdGem JSON:", err);
            return res.status(500).json({ error: "Error parsing AdGem response" });
          }
        });
      }
    ).on("error", (err) => {
      VERCEL_LOG("❌ HTTPS error contacting AdGem:", err);
      return res.status(502).json({ error: "Failed to fetch from AdGem" });
    });
  } catch (err) {
    VERCEL_LOG("❌ Unexpected server error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
};
