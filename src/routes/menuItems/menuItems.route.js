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

// Free vendor এর সর্বোচ্চ 3টি active item। Premium এ সীমা নেই।
const canActivateItem = async (vendorId, vendor) => {
  if (isPremium(vendor)) return true;

  const activeCount = await menuItemsCollection.countDocuments({
    vendorId,
    active: true,
  });

  return activeCount < FREE_ACTIVE_LIMIT;
};

// Client থেকে শুধু এই field গুলো নেওয়া হয়। status, active, vendorId কখনো body থেকে নয়।
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

// POST /api/menu-items  (vendor, status pending)
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

// GET /api/menu-items  (public: শুধু approved ও active)
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

// GET /api/menu-items/featured  (public: homepage এর 6টি)
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

// GET /api/menu-items/vendor/my  (vendor নিজের সব item)
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

// GET /api/menu-items/admin/all?search=&status=&category=&vendor=&sort=&page=&limit=
router.get(
  "/admin/all",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { search, status, category, vendor, sort } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20),
    );

    const filter = {};

    // status: pending | rejected | approved | active | inactive
    if (
      status === "pending" ||
      status === "rejected" ||
      status === "approved"
    ) {
      filter.status = status;
    } else if (status === "active") {
      filter.status = "approved";
      filter.active = true;
    } else if (status === "inactive") {
      filter.status = "approved";
      filter.active = { $ne: true };
    }

    if (category && CATEGORIES.includes(String(category))) {
      filter.category = String(category);
    }

    if (vendor && ObjectId.isValid(vendor)) {
      filter.vendorId = new ObjectId(vendor);
    }

    if (search && String(search).trim()) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { itemName: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { location: { $regex: safe, $options: "i" } },
        { vendorEmail: { $regex: safe, $options: "i" } },
        { vendorName: { $regex: safe, $options: "i" } },
      ];
    }

    let sortBy = { createdAt: -1 };
    if (sort === "oldest") sortBy = { createdAt: 1 };
    if (sort === "price-asc") sortBy = { price: 1 };
    if (sort === "price-desc") sortBy = { price: -1 };
    if (sort === "name-asc") sortBy = { itemName: 1 };

    const [items, total] = await Promise.all([
      menuItemsCollection
        .find(filter)
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      menuItemsCollection.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  }),
);

// GET /api/menu-items/admin/vendors  (vendor dropdown এর জন্য)
router.get(
  "/admin/vendors",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const vendors = await menuItemsCollection
      .aggregate([
        { $match: { vendorId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$vendorId",
            email: { $first: "$vendorEmail" },
            name: { $first: "$vendorName" },
          },
        },
        { $sort: { name: 1 } },
      ])
      .toArray();

    res.status(200).json(
      vendors.map((v) => ({
        value: v._id.toString(),
        label: v.name
          ? `${v.name} (${v.email ?? ""})`
          : (v.email ?? "Unknown vendor"),
      })),
    );
  }),
);

// GET /api/menu-items/:id  (login লাগে)
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

// PATCH /api/menu-items/:id  (vendor নিজের item edit, আবার pending হয়)
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

// DELETE /api/menu-items/:id  (vendor owner বা admin)
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

// Vendor availability: approved item চালু বা বন্ধ
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

// Frontend এর পুরনো path রাখা হয়েছে
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
// approve  -> status approved, active true (free plan limit চেক হয়)
// reject   -> status rejected, active false
// inactive -> status approved থাকে, শুধু active false
const moderateItem = async (req, res, action) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid item ID" });
  }

  const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

  if (!item) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  if (action === "approved") {
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

  if (action === "rejected") {
    await menuItemsCollection.updateOne(
      { _id: item._id },
      { $set: { status: "rejected", active: false, updatedAt: new Date() } },
    );

    return res.status(200).json({ message: "Menu item rejected" });
  }

  if (action === "inactive") {
    if (item.status !== "approved") {
      return res
        .status(409)
        .json({ message: "Only approved items can be made inactive" });
    }

    await menuItemsCollection.updateOne(
      { _id: item._id },
      { $set: { active: false, updatedAt: new Date() } },
    );

    return res.status(200).json({ message: "Menu item made inactive" });
  }

  return res.status(400).json({ message: "Invalid status" });
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
