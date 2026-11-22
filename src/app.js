import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
import { stripe } from "./config/stripe.js";
import {
  transactionCollection,
  usersCollection,
} from "./config/collections.js";
import usersRouter from "./routes/users/users.route.js";
import menuRouter from "./routes/menuItems/menuItems.route.js";
import ordersRouter from "./routes/orders/orders.route.js";
import transactionRouter from "./routes/transaction/transaction.route.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// Stripe webhook: raw body দরকার, তাই express.json() এর আগে থাকতে হবে
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const stripeEvent = req.body;
    const signature = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        stripeEvent,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (e) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;
        const transactionId = session.metadata?.transactionId;
        const vendorId = session.metadata?.vendorId;

        if (transactionId && ObjectId.isValid(transactionId)) {
          await transactionCollection.updateOne(
            { _id: new ObjectId(transactionId) },
            {
              $set: {
                status: "paid",
                stripeSessionId: session.id,
                stripeSubscriptionId: session.subscription ?? null,
                paidAt: new Date(),
              },
            },
          );
        }

        if (vendorId && ObjectId.isValid(vendorId)) {
          const expireDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          await usersCollection.updateOne(
            { _id: new ObjectId(vendorId) },
            {
              $set: {
                subscriptionPlan: "premium",
                subscriptionExpiresAt: expireDate,
              },
            },
          );
        }
      }
    } catch (e) {
      console.error("Stripe webhook handling failed:", e);
      return res.status(500).json({ message: "Webhook handling failed" });
    }

    res.json({ received: true });
  },
);

app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/menu-items", menuRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/transactions", transactionRouter);


app.get('/' , (req,res)=>{
  res.send("server running successfully")
})

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

export default app;
