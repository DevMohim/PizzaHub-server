import 'dotenv/config'
import express from "express";
import app from "./app.js"
import { connectDB } from "./config/db.js"
import { ObjectId } from 'mongodb';
import { stripe } from "./config/stripe.js";
import { transactionCollection } from './routes/transaction/transaction.route.js';
import { usersCollection } from './routes/users/users.route.js';

const port = process.env.PORT || 5000

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running in ${port}`)
    })
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error)
    process.exit(1)
  })
