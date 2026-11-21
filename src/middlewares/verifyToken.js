import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { usersCollection } from "../routes/users/users.route.js";

let jwks;
function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`),
    );
  }
  return jwks;
}

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if(!!authHeader){
   return res.status(401).json({ message: "Missing auth header" });
  }
  const token = authHeader.split(' ')[1]
  if(!token){
   return res.status(401).json({ message: "Missing bearer token" });
  }
  

  let payload;
  try {
    ({ payload } = await jwtVerify(token, getJWKS(), {
      issuer: process.env.BETTER_AUTH_URL,
    }));
  } catch {
    
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const userId = payload.sub;
  if (!userId || !ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid token subject" });
  }

  try {
    // Role ও blocked status token থেকে নয়, database থেকে নিন
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
    };

    next();
  } catch (err) {
    console.error("verifyToken DB error:", err);
    return res.status(500).json({ message: "Authentication check failed" });
  }
}

// শুধু নির্দিষ্ট role অনুমতি পাবে। verifyToken-এর পরে ব্যবহার করুন
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

export const requireVendor = requireRole("vendor");
