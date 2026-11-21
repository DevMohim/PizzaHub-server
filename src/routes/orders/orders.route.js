import { Router } from "express";
import { db } from "../../config/db.js";

export const ordersCollection = db.collection("Orders");

const router = Router();


router.post("/", async (req, res) => {
  try {
    const data = req.body;

    // Prevent ordering own products
    if (data.userEmail === data.vendorEmail) {
      return res.status(403).send({
        success: false,
        message: "You cannot order your own products.",
      });
    }

    // Check duplicate active orders
    const existingOrder = await ordersCollection.findOne({
      userEmail: data.userEmail,
      itemId: data.itemId,
      deliveryDate: data.deliveryDate,
      status: {
        $in: ["pending", "confirmed", "processing"],
      },
    });

    if (existingOrder) {
      return res.status(409).send({
        success: false,
        message:
          "You already have an active order for this product on this date.",
      });
    }

    const orderData = {
      ...data,
      status: "pending",
      requestedAt: new Date(),
    };

    const result = await ordersCollection.insertOne(orderData);

    res.status(201).send({
      success: true,
      message: "Order placed successfully!",
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong!",
    });
  }
});


//getAll order
router.get("/",  async (req, res) => {
  const { email, status } = req.query;
  let filter = {};
  if (status) {
    filter.status = status;
  }
  if (email) {
    filter.userEmail = email;
  }
  const result = await ordersCollection.find(filter).toArray();
  res.status(200).send(result);
});

// get order by vendor email
router.get("/:email", async (req, res) => {
  const { email } = req.params;
  const result = await ordersCollection.find({ vendorEmail: email }).toArray();
  res.send(result);
});

router.patch("/:id/accept", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await ordersCollection.updateOne(
      { itemId: id },
      { $set: { status: "accepted" } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  }
});

router.patch("/:id/reject",async (req, res) => {
  try {
    const { id } = req.params;

    const result = await ordersCollection.updateOne(
      { itemId: id },
      { $set: { status: "rejected" } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});

router.delete("/:id",async (req, res) => {
  const { id } = req.params;
  const result = await ordersCollection.deleteOne({ itemId: id });
  res.send(result);
});

export default router;
