import { Router } from "express";
import { db } from "../../config/db.js";

export const menuItemsCollection = db.collection('MenuItems')

 const router = Router()

//getAll menus
router.get('/' ,async(req,res)=> {
   const result = await menuItemsCollection.find().toArray()
   res.status(201).send(result)
})

//create menu
router.post('/', async(req,res)=>{
   const data = req.body 
   const menuData = {
      ...data,
      status: 'pending'
   }
   const result = await menuItemsCollection.insertOne(menuData)
   res.status(201).send(result)
})


export default router