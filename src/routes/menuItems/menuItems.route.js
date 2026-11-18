import { Router } from "express";
import { db } from "../../config/db.js";
import { ObjectId } from "mongodb";

export const menuItemsCollection = db.collection("MenuItems");

const router = Router();

//getAll menus
router.get("/", async (req, res) => {
  const result = await menuItemsCollection.find().toArray();
  res.status(200).send(result);
});

//get menus by individual vendor by email
router.get("/:email", async (req, res) => {
  const { email } = req.params;
  const result = await menuItemsCollection.find({ userEmail: email }).toArray();
  res.status(200).send(result);
});

//get menus by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("id:", id, "valid:", ObjectId.isValid(id));

    const result = await menuItemsCollection.findOne({ _id: new ObjectId(id) });
    console.log("result:", result);

    if (!result) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    res.status(200).send(result);
  } catch (error) {
    res.status(400).send({ message: "Invalid id", error: error.message });
  }
});

//create menu
router.post("/", async (req, res) => {
  const data = req.body;
  const menuData = {
    ...data,
    status: "pending",
  };
  const result = await menuItemsCollection.insertOne(menuData);
  res.status(201).send(result);
});

export default router;
