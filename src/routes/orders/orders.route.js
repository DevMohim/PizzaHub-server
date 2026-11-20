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
  const result = await ordersCollection.find(filter).toArray();
  res.status(200).send(result);
});

router.delete('/:id' , async(req,res) => {
   const {id} = req.params
   const result = await ordersCollection.deleteOne({itemId: id})
   res.send(result)
})


export default router