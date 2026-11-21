import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { usersCollection } from "../routes/users/users.route.js";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(' ')[1];

  console.log('token ' , token)
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) {
    console.error("CLIENT_URL is not configured");
    return res.status(500).json({ message: "Server configuration error" });
  }

  const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", clientUrl));

  let payload;

  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: clientUrl,
    }));
  } catch (error) {
    console.error("JWT verification failed:", error);
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const userId = payload.sub;

  if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid token subject" });
  }

  try {
    const dbUser = await usersCollection.findOne({
      _id: new ObjectId(userId),
    });

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
