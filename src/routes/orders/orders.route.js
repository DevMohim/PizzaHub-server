import { Router } from "express";
import { db } from "../../config/db.js";



export const ordersCollection = db.collection("Orders");

const router = Router();


router.post('/' , async(req,res) => {
   const data = req.body
   const orderData = {
      ...data,
      status:'pending',
      requestedAt: new Date()
   }
   const result = await ordersCollection.insertOne(orderData)
   res.status(201).send(result)
})

//getAll order
router.get("/", async (req, res) => {

  const {email, status} = req.query
  let filter = {}
  if(status){
    filter.status = status
  }
  if(email){
    filter.userEmail = email
  }
  const result = await ordersCollection.find(filter).toArray();
  res.status(200).send(result);
});

// get order by vendor email
router.get('/:email' , async(req,res) => {
   const {email} = req.params
   const result = await ordersCollection.find({vendorEmail: email}).toArray()
   res.send(result)
})


router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await ordersCollection.updateOne(
      { itemId: id},
      { $set: { status: "approved"} },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await ordersCollection.updateOne(
      {itemId: id},
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


router.delete('/:id' , async(req,res) => {
   const {id} = req.params
   const result = await ordersCollection.deleteOne({itemId: id})
   res.send(result)
})


export default router