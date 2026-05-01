const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

// Verifies the Bearer token from the Authorization header.
// Returns the decoded payload or null if invalid.
function verifyToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

// Express middleware — attaches decoded user to req.user or returns 401
function requireAuth(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Unauthorised" });
  req.user = payload;
  next();
}

module.exports = { signToken, verifyToken, requireAuth };
