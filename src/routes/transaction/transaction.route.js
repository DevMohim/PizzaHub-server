import { Router } from "express";
import { ObjectId } from "mongodb";
import { stripe } from "../../config/stripe.js";
import { transactionCollection } from "../../config/collections.js";
import { requireRole, verifyToken } from "../../middlewares/verifyToken.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const router = Router();

// Backend is the only source of truth for prices
const PLANS = {
  premium: { name: "Premium", price: 29.99, currency: "usd" },
};

// POST /api/transactions/create-checkout-session  (vendor only)
router.post(
  "/create-checkout-session",
  verifyToken,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const clientUrl = (process.env.CLIENT_URL || "").replace(/\/+$/, "");

    if (!clientUrl) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    const plan = PLANS[req.body?.plan];
    if (!plan) {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const isAlreadyPremium =
      req.user.subscriptionPlan === "premium" &&
      req.user.subscriptionExpiresAt &&
      new Date(req.user.subscriptionExpiresAt) > new Date();

    if (isAlreadyPremium) {
      return res
        .status(409)
        .json({ message: "You already have an active Premium plan" });
    }

    // Vendor সবসময় logged-in user, body থেকে নেওয়া হয় না
    const { insertedId: transactionId } = await transactionCollection.insertOne(
      {
        vendorId: new ObjectId(req.user.id),
        vendorEmail: req.user.email,
        plan: "premium",
        amount: plan.price,
        currency: plan.currency,
        status: "pending",
        createdAt: new Date(),
      },
    );

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: req.user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: plan.currency,
              product_data: { name: `${plan.name} Subscription` },
              unit_amount: Math.round(plan.price * 100),
              recurring: { interval: "month" },
            },
          },
        ],
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel`,
        metadata: {
          transactionId: transactionId.toString(),
          vendorId: req.user.id,
        },
        subscription_data: {
          metadata: {
            transactionId: transactionId.toString(),
            vendorId: req.user.id,
          },
        },
      });
    } catch (error) {
      await transactionCollection.updateOne(
        { _id: transactionId },
        { $set: { status: "failed" } },
      );
      throw error;
    }

    await transactionCollection.updateOne(
      { _id: transactionId },
      { $set: { stripeSessionId: session.id } },
    );

    res.status(200).json({ success: true, url: session.url });
  }),
);

// GET /api/transactions  (admin only, read-only)
router.get(
  "/",
  verifyToken,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const filter = {};

    if (["pending", "paid", "failed"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const transactions = await transactionCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(transactions);
  }),
);

export default router;
