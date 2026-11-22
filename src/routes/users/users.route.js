import { Router } from "express";
import { ObjectId } from "mongodb";
import { usersCollection } from "../../config/collections.js";
import { requireRole, verifyToken } from "../../middlewares/verifyToken.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const router = Router();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const publicFields = { projection: { password: 0 } };

// GET /api/users?role=vendor&search=abc  (admin only)
router.get(
  "/",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { role, search } = req.query;

    const filter = { role: { $in: ["customer", "vendor"] } };

    if (role === "customer" || role === "vendor") {
      filter.role = role;
    }

    if (search && String(search).trim()) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }

    const users = await usersCollection
      .find(filter, publicFields)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(users);
  }),
);

// GET /api/users/me  (logged-in user's own profile)
router.get(
  "/me",
  verifyToken,
  asyncHandler(async (req, res) => {
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.id) },
      publicFields,
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  }),
);

// PATCH /api/users/me  (name, image, businessName only)
// role, subscriptionPlan, isBlocked and email can never be changed here
router.patch(
  "/me",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { name, image, businessName } = req.body;
    const $set = {};

    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        return res
          .status(400)
          .json({ message: "Name must be at least 2 characters" });
      }
      $set.name = trimmed;
    }

    if (typeof image === "string") {
      $set.image = image.trim();
    }

    if (typeof businessName === "string" && req.user.role === "vendor") {
      $set.businessName = businessName.trim();
    }

    if (Object.keys($set).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    $set.updatedAt = new Date();

    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set },
    );

    res.status(200).json({ message: "Profile updated" });
  }),
);

// GET /api/users/:userEmail  (own profile or admin)
router.get(
  "/:userEmail",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userEmail } = req.params;

    if (req.user.role !== "admin" && userEmail !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await usersCollection.findOne(
      { email: userEmail },
      publicFields,
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  }),
);

const setBlockState = (isBlocked) =>
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (id === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot block or unblock yourself" });
    }

    const target = await usersCollection.findOne({ _id: new ObjectId(id) });

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "admin") {
      return res
        .status(403)
        .json({ message: "Admin accounts cannot be blocked" });
    }

    await usersCollection.updateOne(
      { _id: target._id },
      {
        $set: {
          isBlocked,
          status: isBlocked ? "BLOCKED" : "ACTIVE",
          updatedAt: new Date(),
        },
      },
    );

    res
      .status(200)
      .json({ message: isBlocked ? "User blocked" : "User unblocked" });
  });

// PATCH /api/users/:id/block  (admin only)
router.patch(
  "/:id/block",
  verifyToken,
  requireRole("admin"),
  setBlockState(true),
);

// PATCH /api/users/:id/unBlock  (admin only, path kept the same as your frontend)
router.patch(
  "/:id/unBlock",
  verifyToken,
  requireRole("admin"),
  setBlockState(false),
);

export default router;
