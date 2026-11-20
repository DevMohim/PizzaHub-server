import { Router } from "express";
import { db } from "../../config/db.js";

export const ordersCollection = db.collection("Orders");

const router = Router();


router.post('/' , async(req,res) => {
   const data = req.body
   const result = await ordersCollection.insertOne(data)
   res.status(201).send(result)
})


export default router