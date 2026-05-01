const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { connectDB, User } = require("../lib/db");
const { signToken, verifyToken } = require("../lib/authMiddleware");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  await connectDB();

  // POST /auth/google — verify Google ID token, find or create user
  if (req.method === "POST" && req.url?.includes("google")) {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Google credential is required" });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "Google auth not configured" });

    try {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email) return res.status(400).json({ error: "Invalid Google token" });

      const { email, name, picture, sub: googleId } = payload;

      // Find existing user or create new one
      let user = await User.findOne({ email });
      if (user) {
        // Update Google info if signing in with Google for the first time on existing account
        if (!user.googleId) {
          user.googleId = googleId;
          user.avatar = picture || user.avatar;
          await user.save();
        }
      } else {
        user = await User.create({ email, name: name || "", googleId, avatar: picture || "" });
      }

      const token = signToken({ userId: user._id, email: user.email });
      return res.json({
        token,
        user: { id: user._id, email: user.email, name: user.name, avatar: user.avatar, profile: user.profile },
      });
    } catch (err) {
      console.error(err);
      return res.status(401).json({ error: "Google sign-in failed" });
    }
  }

  // POST /auth/register
  if (req.method === "POST" && req.url?.includes("register")) {
    const { email, password, name } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed, name: name || "" });
    const token = signToken({ userId: user._id, email: user.email });

    return res.status(201).json({
      token,
      user: { id: user._id, email: user.email, name: user.name, profile: user.profile },
    });
  }

  // POST /auth/login
  if (req.method === "POST" && req.url?.includes("login")) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.password) return res.status(401).json({ error: "This account uses Google sign-in" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken({ userId: user._id, email: user.email });
    return res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, profile: user.profile },
    });
  }

  // GET /auth/me — returns current user from token
  if (req.method === "GET") {
    const payload = verifyToken(req);
    if (!payload) return res.status(401).json({ error: "Unauthorised" });

    const user = await User.findById(payload.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      user: { id: user._id, email: user.email, name: user.name, profile: user.profile },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
