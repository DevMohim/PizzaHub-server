import { Router } from "express";
import { db } from "../../config/db.js";

export const bookingsCollection = db.collection("Bookings");

const router = Router();


router.post('/' , async(req,res) => {
   const data = req.body
   const result = await bookingsCollection.insertOne(data)
   res.status(201).send(result)
})


export default router