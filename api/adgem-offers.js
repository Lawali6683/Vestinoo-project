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
    console.log("❌ Invalid Method:", req.method);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    console.log("❌ Unauthorized Request - Invalid API Key");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  try {
    const { uid, country_codes, platform, categories, tracking_types } = req.body;

    console.log("📥 Incoming Request Body:", JSON.stringify(req.body, null, 2));

    if (!uid || typeof uid !== "string") {
      console.log("❌ Missing UID");
      return res.status(400).json({ error: "Invalid or missing UID" });
    }

    const encodedUID = encodeURIComponent(uid.trim());
    let adgemUrl = `https://offer-api.adgem.com/v1/offers?appid=${ADGEM_APP_ID}&user_id=${encodedUID}`;

    const appendParam = (key, value) => {
      if (value && typeof value === "string" && value.trim() !== "") {
        adgemUrl += `&${key}=${encodeURIComponent(value.trim())}`;
      }
    };

    appendParam("country_codes", country_codes || "US,GB,NG");
    appendParam("platform", platform || "android");
    appendParam("categories", categories || "app,survey");
    appendParam("tracking_types", tracking_types || "CPI,Survey");

    console.log("📡 Sending Request to AdGem:");
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
          console.log("📥 Raw Response from AdGem:", data);

          try {
            const json = JSON.parse(data);

            if (!json.offers || !Array.isArray(json.offers)) {
              console.log("❌ Invalid response structure from AdGem:", json);
              return res.status(502).json({
                error: "Invalid AdGem response format",
                adgemResponse: json,
              });
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

            console.log(`✅ Successfully fetched ${offers.length} offers`);

            res.setHeader("Content-Type", "application/json");
            return res.status(200).json({ offers, rawResponse: json });

          } catch (parseErr) {
            console.log("❌ Error parsing AdGem JSON:", parseErr.message);
            return res.status(502).json({
              error: "Failed to parse JSON from AdGem",
              rawResponse: data,
              details: parseErr.message,
            });
          }
        });
      }
    ).on("error", (err) => {
      console.log("❌ HTTPS Error contacting AdGem:", err);
      return res.status(502).json({
        error: "Failed to fetch from AdGem",
        details: err.message,
      });
    });

  } catch (err) {
    console.log("❌ Unexpected Server Error:", err);
    return res.status(500).json({
      error: "Unexpected server error",
      details: err.message,
    });
  }
};
