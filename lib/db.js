const mongoose = require("mongoose");

let cached = global._mongoConn;

async function connectDB() {
  if (cached) return cached;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  cached = await mongoose.connect(uri);
  global._mongoConn = cached;
  return cached;
}

// User schema
const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null },  // null for Google-only accounts
  googleId: { type: String, default: null },  // Google sub ID for OAuth users
  name:     { type: String, trim: true, default: "" },
  avatar:   { type: String, default: "" },    // Google profile picture URL
  profile: {
    activities:       { type: [String], default: [] },
    heatSensitivity:  { type: String, enum: ["low", "normal", "high"], default: "normal" },
    coldSensitivity:  { type: String, enum: ["low", "normal", "high"], default: "normal" },
    otherPreferences: { type: String, default: "" },
  },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, User };
