const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const ADGEM_API_TOKEN = process.env.ADGEM_API_TOKEN;
const ADGEM_APP_ID = process.env.ADGEM_APP_ID;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    console.log("❌ Invalid HTTP Method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    console.log("❌ Unauthorized request, missing or wrong API key");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  try {
    const { uid } = req.body;

    if (!uid || typeof uid !== "string") {
      console.log("❌ Invalid or missing UID in request body:", req.body);
      return res.status(400).json({ error: "Invalid or missing UID" });
    }

    const encodedUID = encodeURIComponent(uid.trim());
    const adgemUrl = `https://api.adgem.com/v1/offers?appid=${ADGEM_APP_ID}&user_id=${encodedUID}`;

    console.log("📡 Fetching AdGem offers for UID:", uid);
    console.log("🔗 URL:", adgemUrl);

    https.get(
      adgemUrl,
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
            console.log("✅ AdGem response received:", JSON.stringify(json).slice(0, 300), "...");

            if (!json.offers || !Array.isArray(json.offers)) {
              console.log("❌ Invalid AdGem response structure:", json);
              return res.status(502).json({ error: "Invalid AdGem response format", adgemResponse: json });
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

            console.log(`✅ Successfully fetched ${offers.length} offers.`);
            return res.status(200).json({ offers });
          } catch (err) {
            console.log("❌ Error parsing AdGem JSON:", err.message);
            return res.status(500).json({ error: "Error parsing AdGem response", details: err.message });
          }
        });
      }
    ).on("error", (err) => {
      console.log("❌ HTTPS error contacting AdGem:", err.message);
      return res.status(502).json({ error: "Failed to fetch from AdGem", details: err.message });
    });
  } catch (err) {
    console.log("❌ Unexpected server error:", err.message);
    return res.status(500).json({ error: "Unexpected server error", details: err.message });
  }
};
