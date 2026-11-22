import { Router } from "express";
import { ObjectId } from "mongodb";
import {
  menuItemsCollection,
  usersCollection,
} from "../../config/collections.js";
import { requireRole, verifyToken } from "../../middlewares/verifyToken.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const router = Router();

const FREE_ACTIVE_LIMIT = 3;
const CATEGORIES = [
  "classic-pizzas",
  "vegetarian-pizzas",
  "meat-lovers",
  "specialty-gourmet-pizzas",
  "sides-appetizers",
  "beverages-desserts",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isOwner = (item, user) => item.vendorId?.toString() === user.id;

const isPremium = (vendor = {}) =>
  vendor.subscriptionPlan === "premium" &&
  Boolean(vendor.subscriptionExpiresAt) &&
  new Date(vendor.subscriptionExpiresAt) > new Date();

// Free vendors can have at most 3 active items. Premium vendors have no limit.
const canActivateItem = async (vendorId, vendor) => {
  if (isPremium(vendor)) return true;

  const activeCount = await menuItemsCollection.countDocuments({
    vendorId,
    active: true,
  });

  return activeCount < FREE_ACTIVE_LIMIT;
};

// Only these fields can come from the client. status, active, vendorId are never taken from the body.
const validateItem = (body = {}) => {
  const itemName = String(body.itemName ?? "").trim();
  const category = String(body.category ?? "").trim();
  const description = String(body.description ?? "").trim();
  const location = String(body.location ?? "").trim();
  const price = Number(body.price);
  const images = Array.isArray(body.images)
    ? body.images
        .filter((url) => typeof url === "string" && /^https?:\/\//.test(url))
        .slice(0, 5)
    : [];

  if (!itemName || !description || !location) {
    return { error: "Item name, description and location are required" };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: "Invalid category" };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Price must be a positive number" };
  }
  if (images.length === 0) {
    return { error: "At least one item image is required" };
  }

  return { data: { itemName, category, description, location, price, images } };
};

// POST /api/menu-items  (vendor creates an item, status is pending)
router.post(
  "/",
  verifyToken,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const { data, error } = validateItem(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const now = new Date();
    const result = await menuItemsCollection.insertOne({
      ...data,
      vendorId: new ObjectId(req.user.id),
      vendorEmail: req.user.email,
      vendorName: req.user.name,
      status: "pending",
      active: false,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      message: "Item submitted for admin review",
      insertedId: result.insertedId,
    });
  }),
);

// GET /api/menu-items  (public: only approved and active items)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, category, location, sort } = req.query;

    const filter = { status: "approved", active: true };

    if (category && category !== "all") {
      if (!CATEGORIES.includes(String(category))) {
        return res.status(400).json({ message: "Invalid category" });
      }
      filter.category = String(category);
    }

    if (location && location !== "all") {
      filter.location = {
        $regex: `^${escapeRegex(String(location))}$`,
        $options: "i",
      };
    }

    if (search && String(search).trim()) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { itemName: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { location: { $regex: safe, $options: "i" } },
      ];
    }

    let sortBy = { createdAt: -1 };
    if (sort === "price-asc") sortBy = { price: 1 };
    if (sort === "price-desc") sortBy = { price: -1 };

    const items = await menuItemsCollection.find(filter).sort(sortBy).toArray();
    res.status(200).json(items);
  }),
);

// GET /api/menu-items/featured  (public: 6 approved and active items for the homepage)
router.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    const items = await menuItemsCollection
      .find({ status: "approved", active: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(items);
  }),
);

// GET /api/menu-items/vendor/my  (vendor sees own items, including pending and rejected)
router.get(
  "/vendor/my",
  verifyToken,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const items = await menuItemsCollection
      .find({ vendorId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(items);
  }),
);

// GET /api/menu-items/admin/all?status=pending  (admin review queue)
router.get(
  "/admin/all",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { status, search } = req.query;
    const filter = {};

    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (search && String(search).trim()) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { itemName: { $regex: safe, $options: "i" } },
        { vendorEmail: { $regex: safe, $options: "i" } },
      ];
    }

    const items = await menuItemsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(items);
  }),
);

// GET /api/menu-items/:id  (login required)
// Other users can see only approved and active items. Owners and admins can see all.
router.get(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const canSeeAll = req.user.role === "admin" || isOwner(item, req.user);
    const isPublished = item.status === "approved" && item.active === true;

    if (!canSeeAll && !isPublished) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json(item);
  }),
);

// PATCH /api/menu-items/:id  (vendor edits own item)
// Editing sends the item back to pending, so admin must review it again.
router.patch(
  "/:id",
  verifyToken,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (!isOwner(item, req.user)) {
      return res
        .status(403)
        .json({ message: "You can only edit your own items" });
    }

    const { data, error } = validateItem(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    await menuItemsCollection.updateOne(
      { _id: item._id },
      {
        $set: {
          ...data,
          status: "pending",
          active: false,
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({ message: "Item updated and sent for review" });
  }),
);

// DELETE /api/menu-items/:id  (vendor owner or admin)
router.delete(
  "/:id",
  verifyToken,
  requireRole("vendor", "admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (req.user.role === "vendor" && !isOwner(item, req.user)) {
      return res
        .status(403)
        .json({ message: "You can only delete your own items" });
    }

    await menuItemsCollection.deleteOne({ _id: item._id });

    res.status(200).json({ message: "Menu item deleted" });
  }),
);

// Vendor availability: turn an approved item on or off
const setAvailability = async (req, res, active) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid item ID" });
  }

  const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

  if (!item) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  if (!isOwner(item, req.user)) {
    return res
      .status(403)
      .json({ message: "You can only change your own items" });
  }

  if (item.status !== "approved") {
    return res
      .status(409)
      .json({ message: "Only approved items can be activated or deactivated" });
  }

  if (active && !item.active) {
    const allowed = await canActivateItem(new ObjectId(req.user.id), req.user);
    if (!allowed) {
      return res.status(403).json({
        message:
          "Free plan allows 3 active items. Upgrade to Premium to activate more.",
      });
    }
  }

  await menuItemsCollection.updateOne(
    { _id: item._id },
    { $set: { active, updatedAt: new Date() } },
  );

  res
    .status(200)
    .json({ message: active ? "Item activated" : "Item deactivated" });
};

router.patch(
  "/:id/availability",
  verifyToken,
  requireRole("vendor"),
  asyncHandler((req, res) =>
    setAvailability(req, res, req.body.active === true),
  ),
);

// Kept for compatibility with the existing frontend paths
router.patch(
  "/:id/active",
  verifyToken,
  requireRole("vendor"),
  asyncHandler((req, res) => setAvailability(req, res, true)),
);

router.patch(
  "/:id/inactive",
  verifyToken,
  requireRole("vendor"),
  asyncHandler((req, res) => setAvailability(req, res, false)),
);

// Admin moderation
const moderateItem = async (req, res, status) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid item ID" });
  }

  const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

  if (!item) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  if (status === "approved") {
    if (!item.active) {
      const vendor = await usersCollection.findOne(
        { _id: item.vendorId },
        { projection: { subscriptionPlan: 1, subscriptionExpiresAt: 1 } },
      );

      const allowed = await canActivateItem(item.vendorId, vendor);
      if (!allowed) {
        return res.status(409).json({
          message:
            "This vendor has reached the free plan limit of 3 active items",
        });
      }
    }

    await menuItemsCollection.updateOne(
      { _id: item._id },
      { $set: { status: "approved", active: true, updatedAt: new Date() } },
    );

    return res.status(200).json({ message: "Menu item approved" });
  }

  // "rejected" or "inactive"
  await menuItemsCollection.updateOne(
    { _id: item._id },
    { $set: { status, active: false, updatedAt: new Date() } },
  );

  return res.status(200).json({ message: `Menu item ${status}` });
};

router.patch(
  "/:id/approve",
  verifyToken,
  requireRole("admin"),
  asyncHandler((req, res) => moderateItem(req, res, "approved")),
);

router.patch(
  "/:id/reject",
  verifyToken,
  requireRole("admin"),
  asyncHandler((req, res) => moderateItem(req, res, "rejected")),
);

// PATCH /api/menu-items/:id/moderate  body: { status: "approved" | "rejected" | "inactive" }
router.patch(
  "/:id/moderate",
  verifyToken,
  requireRole("admin"),
  asyncHandler((req, res) => {
    const { status } = req.body;

    if (!["approved", "rejected", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    return moderateItem(req, res, status);
  }),
);

export default router;
