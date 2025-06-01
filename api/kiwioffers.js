const API_AUTH_KEY = process.env.API_AUTH_KEY;
const KIWI_API_KEY = process.env.KIWI_API_KEY;

const VERCEL_LOG = (...args) => console.log("[KIWI_POSTBACK]", ...args);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    VERCEL_LOG("OPTIONS preflight received");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    VERCEL_LOG("Invalid method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    VERCEL_LOG("Unauthorized request");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { uid, ip, country } = req.body;

  if (!uid || !ip) {
    VERCEL_LOG("Missing uid or ip:", { uid, ip });
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${country ? `&country=${country}` : ""}`;

  VERCEL_LOG("Sending fetch request to:", apiUrl);

  try {
    const response = await fetch(apiUrl);
    const result = await response.text(); // text first to log raw

    VERCEL_LOG("Raw response from KiwiWall:", result);

    try {
      const parsed = JSON.parse(result);
      VERCEL_LOG("Parsed JSON from KiwiWall:", parsed);
      return res.status(200).json(parsed);
    } catch (parseErr) {
      VERCEL_LOG("JSON parse error:", parseErr.message);
      return res.status(500).json({ error: "Failed to parse KiwiWall response", raw: result });
    }

  } catch (fetchErr) {
    VERCEL_LOG("Fetch error:", fetchErr.message);
    return res.status(500).json({ error: "Error contacting KiwiWall", detail: fetchErr.message });
  }
}
