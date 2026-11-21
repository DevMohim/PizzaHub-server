import { ObjectId } from "mongodb";
import { Router } from "express";
import { stripe } from "../../config/stripe.js";
import { db } from "../../config/db.js";
import { verifyToken, requireRole } from "../../middlewares/verifyToken.js";
import { usersCollection } from "../users/users.route.js";

export const transactionCollection = db.collection("Transaction");

const router = Router();

const PLANS = {
  premium: { name: "Premium", price: 29.99, currency: "usd" },
};

router.post(
  "/create-checkout-session",
  verifyToken,
  requireRole("vendor"),
  async (req, res) => {
    let transactionId;

    try {
      const vendorId = req.user.id;
      const plan = PLANS[req.body.plan];

      if (!plan) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

      if (!clientUrl) {
        console.error("CLIENT_URL is missing from environment variables");
        return res.status(500).json({ message: "Server configuration error" });
      }

      const vendor = await usersCollection.findOne({
        _id: new ObjectId(vendorId),
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const transaction = await transactionCollection.insertOne({
        vendorId,
        plan: req.body.plan,
        amount: plan.price,
        currency: plan.currency,
        status: "pending",
        createdAt: new Date(),
      });

      transactionId = transaction.insertedId;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: vendor.email,
        line_items: [
          {
            price_data: {
              currency: plan.currency,
              product_data: { name: `${plan.name} Subscription` },
              unit_amount: Math.round(plan.price * 100),
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel`,
        metadata: {
          transactionId: transactionId.toString(),
          vendorId,
        },
      });

      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
      }

      await transactionCollection.updateOne(
        { _id: transactionId },
        { $set: { stripeSessionId: session.id } },
      );

      // Browser-কে Stripe Checkout page-এ পাঠায়
      return res.status(200).json({ success: true, url: session.url });
    } catch (error) {
      console.error("Create checkout session error:", error);

      if (transactionId) {
        await transactionCollection.deleteOne({ _id: transactionId });
      }

      return res.status(500).json({
        message: "Failed to create checkout session",
      });
    }
  },
);

export default router;