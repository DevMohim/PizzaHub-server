import { Router } from "express";
import { db } from "../../config/db.js";
import { ObjectId } from "mongodb";

export const menuItemsCollection = db.collection("MenuItems");

const router = Router();


//create menu
router.post("/", async (req, res) => {
  const data = req.body;
  const menuData = {
    ...data,
    status: "pending",
    active: false,
  };
  const result = await menuItemsCollection.insertOne(menuData);
  res.status(201).send(result);
});


//getAll  menu items
router.get("/", async (req, res) => {

  const {email, status} = req.query
  let filter = {}
  if(status){
    filter.status = status
  }
  if(email){
    filter.userEmail = email
  }
  const result = await menuItemsCollection.find(filter).toArray();
  res.status(200).send(result);
});

//get menu item by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    res.status(200).send(result);
  } catch (error) {
    res.status(400).send({ message: "Invalid id", error: error.message });
  }
});

router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" ,active:true } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  }
});

router.patch("/:id/inactive", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { active:false } }, 
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});
router.patch("/:id/active", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { active:true } }, 
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});
router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
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



export default router;
