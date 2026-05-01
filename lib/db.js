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
  password: { type: String, default: null },
  googleId: { type: String, default: null },
  name:     { type: String, trim: true, default: "" },
  avatar:   { type: String, default: "" },
  profile: {
    activities:       { type: [String], default: [] },
    heatSensitivity:  { type: String, enum: ["low", "normal", "high"], default: "normal" },
    coldSensitivity:  { type: String, enum: ["low", "normal", "high"], default: "normal" },
    otherPreferences: { type: String, default: "" },
  },
}, { timestamps: true });

// Weather memory schema — one document per search event per user
const memorySchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  city:        { type: String, required: true },
  country:     { type: String },
  conditionId: { type: Number },
  condition:   { type: String },   // e.g. "clear sky"
  tempC:       { type: Number },   // always stored in Celsius
  humidity:    { type: Number },
  windMs:      { type: Number },
  timeOfDay:   { type: String, enum: ["morning", "afternoon", "evening", "night"] },
  isWeekend:   { type: Boolean },
  searchedAt:  { type: Date, default: Date.now },
}, { timestamps: false });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const WeatherMemory = mongoose.models.WeatherMemory || mongoose.model("WeatherMemory", memorySchema);

module.exports = { connectDB, User, WeatherMemory };
