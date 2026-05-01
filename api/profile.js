const { connectDB, User } = require("../lib/db");
const { verifyToken } = require("../lib/authMiddleware");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Unauthorised" });

  await connectDB();

  // GET /profile
  if (req.method === "GET") {
    const user = await User.findById(payload.userId).select("profile name email");
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ profile: user.profile, name: user.name, email: user.email });
  }

  // PUT /profile — update profile + name
  if (req.method === "PUT") {
    const { name, activities, heatSensitivity, coldSensitivity, otherPreferences } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (activities !== undefined) update["profile.activities"] = activities;
    if (heatSensitivity !== undefined) update["profile.heatSensitivity"] = heatSensitivity;
    if (coldSensitivity !== undefined) update["profile.coldSensitivity"] = coldSensitivity;
    if (otherPreferences !== undefined) update["profile.otherPreferences"] = otherPreferences;

    const user = await User.findByIdAndUpdate(
      payload.userId,
      { $set: update },
      { new: true, select: "profile name email" }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ profile: user.profile, name: user.name, email: user.email });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
