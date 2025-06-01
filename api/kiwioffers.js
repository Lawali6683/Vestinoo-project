const https = require("https");

const KIWI_API_KEY = process.env.KIWI_API_KEY;
const API_AUTH_KEY = process.env.API_AUTH_KEY;

const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    VERCEL_LOG("[Invalid Method]:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    VERCEL_LOG("[Unauthorized Access]:", authHeader);
    return res.status(401).json({ error: "Unauthorized request" });
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const parsedBody = JSON.parse(body);
      const { uid, ip_address } = parsedBody;

      VERCEL_LOG("[Parsed Request Body]:", parsedBody);

      if (!uid || !ip_address) {
        VERCEL_LOG("[Missing uid or ip_address]:", { uid, ip_address });
        return res.status(400).json({ error: "Missing uid or ip_address" });
      }

      const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip_address}`;
      VERCEL_LOG("[KiwiWall Request URL]:", apiUrl);

      https.get(apiUrl, (apiRes) => {
        let data = "";

        apiRes.on("data", chunk => {
          data += chunk;
        });

        apiRes.on("end", () => {
          VERCEL_LOG("[Raw KiwiWall Response]:", data);
          try {
            const parsed = JSON.parse(data);
            VERCEL_LOG("[Parsed KiwiWall Response]:", parsed);
            res.status(200).json(parsed);
          } catch (parseError) {
            VERCEL_LOG("[JSON Parse Error]:", parseError.message);
            res.status(500).json({ error: "Failed to parse KiwiWall response", detail: parseError.message });
          }
        });
      }).on("error", (error) => {
        VERCEL_LOG("[Request Error]:", error.message);
        res.status(500).json({ error: "Failed to fetch offers", detail: error.message });
      });

    } catch (err) {
      VERCEL_LOG("[Body Parse Error]:", err.message);
      return res.status(400).json({ error: "Invalid JSON body", detail: err.message });
    }
  });
};
