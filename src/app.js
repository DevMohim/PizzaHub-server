import express from "express";
import cors from "cors";
import menuItemsRoute from "./routes/menuItems/menuItems.route.js";
import ordersRoute from "./routes/orders/orders.route.js";
import usersRoute, { usersCollection } from "./routes/users/users.route.js";
import transactionRoute, { transactionCollection } from "./routes/transaction/transaction.route.js";
import { stripe } from "./config/stripe.js";
import { ObjectId } from "mongodb";

const app = express();


const startDate = new Date();

const expireDate = new Date(startDate);
expireDate.setMonth(expireDate.getMonth() + 1);


app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // After payment, Stripe sends an event here.

    // step-1: Get the raw event body and Stripe's signature header.
    // req.body is a Buffer (from express.raw above); constructEvent needs it unparsed.
    const stripeEvent = req.body;
    const signature = req.headers["stripe-signature"];

    // step-2: Verify the signature so only genuine Stripe events are accepted.
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

    // step-3: Handle the event types we care about
    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object;

        // The metadata is attached in POST /transactions/create-checkout-session.
        const transactionId = session.metadata?.transactionId;
        const vendorId = session.metadata?.vendorId;

        // Guard against missing/invalid ids. new ObjectId(undefined) silently
        // creates a random id, which makes updateOne match nothing.
        if (transactionId && ObjectId.isValid(transactionId)) {
          const updateStatus = await transactionCollection.updateOne(
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
        } else {
          console.error(
            "Webhook: invalid or missing transactionId in metadata:",
            transactionId,
          );
        }

        // Activate the vendor's premium plan so the app actually unlocks
        // unlimited menu items (frontend reads user.isPremium).
        if (vendorId && ObjectId.isValid(vendorId)) {
          await usersCollection.updateOne(
            { _id: new ObjectId(vendorId) },
            {
              $set: {
                isPremium: true,
                plan: "premium",
                planStatus: "active",
                premiumSince: new Date(),
                ExpireAt : expireDate
              },
            },
          );
        }
      }
    } catch (e) {
      // Returning 500 tells Stripe to retry the webhook later.
      console.error("Stripe webhook handling failed:", e);
      return res.status(500).json({ message: "Webhook handling failed" });
    }

    // step-4: Acknowledge receipt. Without a response Stripe times out and retries.
    res.json({ received: true });
  },
);




app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Server running successfully" });
});

//All route import here
app.use("/users", usersRoute);
app.use("/menuItems", menuItemsRoute);
app.use("/orders", ordersRoute);
app.use("/transactions", transactionRoute);

// সব route পরে
app.use((req, res) => {
  res.status(404).json({ message: "Route পাওয়া যায়নি" });
});

// Error handler সবার শেষে, ৪টা parameter সহ
app.use((err, req, res, next) => {
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

export default app;
