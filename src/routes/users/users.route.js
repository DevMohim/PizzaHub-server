import { Router } from "express";
import { db } from "../../config/db.js";
import { ObjectId } from "mongodb";

export const usersCollection = db.collection('user')

export const router = Router();

router.get('/' ,async (req,res)=>{
   const result = await usersCollection
     .find({ role: { $in: ["customer", "vendor"] } })
     .toArray();
   res.send(result)
})

router.patch("/:id/block", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isBlocked: true,status: 'BLOCKED' } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User blocked" });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({ message: "Failed to block user" });
  }
});

router.patch("/:id/unBlock", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isBlocked: false , status: "ACTIVE" } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});


export default router