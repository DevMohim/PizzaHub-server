import { ObjectId } from "mongodb";
import { db } from "../../config/db.js";
import { stripe } from "../../config/stripe.js";
import { Router } from "express";
import { usersCollection } from "../users/users.route.js";

export const transactionCollection = db.collection('Transaction')

const router = Router()

// Subscription plans with pricing — backend is the source of truth
const PLANS = {
  premium: { name: "Premium", price: 29.99, currency: "usd" },
}

router.post('/create-checkout-session' , async(req,res) => {
   let transactionId
   try {
     const payload = req.body
     const id = payload.vendorId || payload.userId

     const clientUrl = (process.env.CLIENT_URL || "").replace(/\/+$/, "")

     if (!clientUrl) {
       return res.status(500).json({ message: "Server configuration error" });
     }

     if (!id || !ObjectId.isValid(id)) {
       return res.status(400).json({ message: "Invalid vendor ID" });
     }

     const vendor = await usersCollection.findOne({ _id: new ObjectId(id) })

     if (!vendor) {
       return res.status(404).json({ message: "Vendor not found" });
     }

     const planKey = payload.plan
     const plan = PLANS[planKey]

     if (!plan) {
       return res.status(400).json({ message: "Invalid plan" });
     }

     const amount = plan.price
     const currency = plan.currency

     const transactionData = {
       vendorId: new ObjectId(id),
       plan: planKey,
       amount: amount,
       currency: currency,
       status: 'pending',
       createdAt: new Date()
    }

    const result = await transactionCollection.insertOne(transactionData)
    transactionId = result.insertedId

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${plan.name} Subscription`,
            },
            // CHANGED: parseInt -> Math.round (convert USD amount to cents correctly)
            unit_amount: Math.round(amount * 100),
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${clientUrl}/payment/success?transactionId=${transactionId.toString()}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
      mode: "subscription",
      metadata: {
        transactionId: transactionId.toString(),
        vendorId: id,
        vendorEmail: vendor.email ?? "",
      },
    });

    await transactionCollection.updateOne(
      { _id: transactionId },
      { $set: { stripeSessionId: session.id} },
    );

    res.status(200).json({
      success: true,
      message: "Checkout session created",
      url: session.url,
    });
   } catch (error) {
     console.error("Create checkout session error:", error);

     // Don't leave an orphaned pending transaction if Stripe failed.
     if (transactionId) {
       await transactionCollection.deleteOne({ _id: transactionId });
     }

     return res.status(500).json({ message: "Failed to create checkout session" });
   }
})

router.get('/' ,async(req,res) => {
  try {
     
  
      const result = await transactionCollection.find().toArray();
  
      if (!result) {
        return res.status(404).send({ message: "Menu item not found" });
      }
      res.status(200).send(result);
    } catch (error) {
      res.status(400).send({ message: "Invalid id", error: error.message });
    }
})




export default router
