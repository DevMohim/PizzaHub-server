import { Router } from "express";
import { db } from "../../config/db.js";

export const menuItemsCollection = db.collection('MenuItems')

 const router = Router()

//getAll menus
router.get('/' ,(req,res)=> {
   res.send({message: 'menu items found successfully'})
})

//create menu
router.post('/', async(req,res)=>{
   const menuData = req.body 
   const result = await menuItemsCollection.insertOne(menuData)
   res.send(result)
})


export default router