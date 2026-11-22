import { Router } from "express";
import { ObjectId } from "mongodb";
import {
  menuItemsCollection,
  ordersCollection,
} from "../../config/collections.js";
import { requireRole, verifyToken } from "../../middlewares/verifyToken.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const router = Router();

const ACTIVE_STATUSES = ["pending", "accepted"];

// Converts any date input to midnight UTC, so the same day always matches
const toDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

// POST /api/orders  (customer places an order)
router.post(
  "/",
  verifyToken,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const { itemId, deliveryDate, deliveryAddress, message = "" } = req.body;

    if (!ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const day = toDay(deliveryDate);
    if (!day) {
      return res.status(400).json({ message: "Invalid delivery date" });
    }

    if (day < toDay(new Date())) {
      return res
        .status(400)
        .json({ message: "Delivery date cannot be in the past" });
    }

    const address = String(deliveryAddress ?? "").trim();
    if (address.length < 5) {
      return res.status(400).json({ message: "Delivery address is required" });
    }

    const item = await menuItemsCollection.findOne({
      _id: new ObjectId(itemId),
    });

    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (item.status !== "approved" || item.active !== true) {
      return res.status(400).json({ message: "This item is not available" });
    }

    if (item.vendorId.toString() === req.user.id) {
      return res
        .status(403)
        .json({ message: "You cannot order your own item" });
    }

    const duplicate = await ordersCollection.findOne({
      customerId: new ObjectId(req.user.id),
      itemId: item._id,
      deliveryDate: day,
      status: { $in: ACTIVE_STATUSES },
    });

    if (duplicate) {
      return res.status(409).json({
        message: "You already have an active order for this item on this date",
      });
    }

    const now = new Date();
    const result = await ordersCollection.insertOne({
      itemId: item._id,
      itemName: item.itemName,
      itemImage: item.images?.[0] ?? "",
      vendorId: item.vendorId,
      vendorName: item.vendorName ?? "",
      vendorEmail: item.vendorEmail ?? "",
      customerId: new ObjectId(req.user.id),
      customerName: req.user.name,
      customerEmail: req.user.email,
      deliveryDate: day,
      deliveryAddress: address,
      message: String(message).trim().slice(0, 500),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      message: "Order placed successfully",
      insertedId: result.insertedId,
    });
  }),
);

// GET /api/orders/my  (customer's own orders)
router.get(
  "/my",
  verifyToken,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const orders = await ordersCollection
      .find({ customerId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(orders);
  }),
);

// GET /api/orders/vendor  (orders for this vendor only)
router.get(
  "/vendor",
  verifyToken,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const orders = await ordersCollection
      .find({ vendorId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(orders);
  }),
);

// GET /api/orders/admin?status=pending  (admin only)
router.get(
  "/admin",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (
      ["pending", "accepted", "rejected", "cancelled"].includes(
        req.query.status,
      )
    ) {
      filter.status = req.query.status;
    }

    const orders = await ordersCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(orders);
  }),
);

// Vendor accept or reject. Only pending orders can change, and only once.
const decideOrder = (nextStatus) =>
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.vendorId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You can only manage your own orders" });
    }

    // The status is part of the filter, so two requests at the same time can't both succeed
    const result = await ordersCollection.updateOne(
      { _id: order._id, status: "pending" },
      {
        $set: {
          status: nextStatus,
          respondedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return res
        .status(409)
        .json({ message: "Only pending orders can be updated" });
    }

    res.status(200).json({ message: `Order ${nextStatus}` });
  });

router.patch(
  "/:id/accept",
  verifyToken,
  requireRole("vendor"),
  decideOrder("accepted"),
);

router.patch(
  "/:id/reject",
  verifyToken,
  requireRole("vendor"),
  decideOrder("rejected"),
);

// PATCH /api/orders/:id/cancel  (customer cancels own pending order)
router.patch(
  "/:id/cancel",
  verifyToken,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.customerId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You can only cancel your own orders" });
    }

    const result = await ordersCollection.updateOne(
      { _id: order._id, status: "pending" },
      { $set: { status: "cancelled", updatedAt: new Date() } },
    );

    if (!result.matchedCount) {
      return res
        .status(409)
        .json({ message: "Only pending orders can be cancelled" });
    }

    res.status(200).json({ message: "Order cancelled" });
  }),
);

export default router;
