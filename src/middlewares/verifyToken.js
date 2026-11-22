import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { usersCollection } from "../config/collections.js";

const clientUrl = (process.env.CLIENT_URL || "").replace(/\/+$/, "");

// Created once, not on every request
const JWKS = clientUrl
  ? createRemoteJWKSet(new URL("/api/auth/jwks", clientUrl))
  : null;

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";


  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!JWKS) {
    console.error("CLIENT_URL is not configured");
    return res.status(500).json({ message: "Server configuration error" });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, { issuer: clientUrl }));
  } catch (error) {
    console.error("JWT verify failed:", error.code, error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const userId = payload.sub;

  if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
    console.error("Invalid sub (not ObjectId):", userId);
    return res.status(401).json({ message: "Invalid token subject" });
  }

  try {
    // Always read the user from the DB so blocks and plan changes apply immediately
    const dbUser = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!dbUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (dbUser.isBlocked === true) {
      return res.status(403).json({ message: "Account blocked" });
    }

    req.user = {
      id: dbUser._id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      subscriptionPlan: dbUser.subscriptionPlan ?? "free",
      subscriptionExpiresAt: dbUser.subscriptionExpiresAt ?? null,
    };

    return next();
  } catch (error) {
    console.error("verifyToken DB error:", error);
    return res.status(500).json({ message: "Authentication check failed" });
  }
};

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

export const requireVendor = requireRole("vendor");
export const requireAdmin = requireRole("admin");
export const requireCustomer = requireRole("customer");
