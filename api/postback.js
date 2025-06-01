const admin = require("firebase-admin");
const crypto = require("crypto");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;
const KIWI_SECRET_KEY = process.env.KIWI_SECRET_KEY;

if (!admin.apps.length && SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  const {
    status,
    trans_id,
    sub_id,
    amount,
    offer_name,
    signature,
    ip_address,
  } = req.query;

  VERCEL_LOG("Received KiwiWall postback:", req.query);

  // Validate required fields
  if (
    !status ||
    !trans_id ||
    !sub_id ||
    !amount ||
    !offer_name ||
    !signature
  ) {
    return res.status(400).json({ error: "Missing required postback data" });
  }

  // Only process successful conversions
  if (status !== "1") {
    VERCEL_LOG(`Postback not successful (status=${status})`);
    return res.status(200).json({ message: "Postback ignored due to non-success status" });
  }

  try {
    // Validate signature
    const rawSignature = `${sub_id}:${amount}:${KIWI_SECRET_KEY}`;
    const expectedSignature = crypto.createHash("md5").update(rawSignature).digest("hex");

    if (expectedSignature !== signature) {
      VERCEL_LOG("Invalid signature:", { expectedSignature, received: signature });
      return res.status(403).json({ error: "Invalid signature" });
    }

    // Check if user exists
    const userRef = db.ref(`users/${sub_id}`);
    const snapshot = await userRef.once("value");
    const userData = snapshot.val();

    if (!userData) {
      VERCEL_LOG("User not found in database:", sub_id);
      return res.status(404).json({ error: "User not found" });
    }

    // Parse and calculate bonus
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ error: "Invalid amount format" });
    }

    const bonusToAdd = numericAmount / 2;
    const taskBonusPath = `users/${sub_id}/taskBonus`;

    const currentBonusSnapshot = await db.ref(taskBonusPath).once("value");
    const currentBonus = currentBonusSnapshot.val() || 0;

    const updatedBonus = currentBonus + bonusToAdd;
    await db.ref(taskBonusPath).set(updatedBonus);

    VERCEL_LOG(`✅ User ${sub_id} credited with bonus: ${bonusToAdd} (total: ${updatedBonus}) from offer: ${offer_name} | IP: ${ip_address}`);

    return res.status(200).json({ success: true, credited: bonusToAdd, total: updatedBonus });
  } catch (error) {
    VERCEL_LOG("Postback processing error:", error);
    return res.status(500).json({ error: "Internal server error", detail: error.message });
  }
};
