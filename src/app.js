import express from 'express'
import cors from 'cors'
import menuItemsRoute from './routes/menuItems/menuItems.route.js'
import ordersRoute from './routes/orders/orders.route.js'
import usersRoute from './routes/users/users.route.js'
import transactionRoute from './routes/transaction/transaction.route.js'


const app = express()


app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
  res.json({ message: "Server running successfully" });
});


//All route import here
app.use('/users' , usersRoute)
app.use('/menuItems' , menuItemsRoute)
app.use('/orders' , ordersRoute)
app.use('/transactions' , transactionRoute)


// সব route এর পরে
app.use((req, res) => {
  res.status(404).json({ message: "Route পাওয়া যায়নি" });
});

// Error handler সবার শেষে, ৪টা parameter সহ
app.use((err, req, res, next) => {
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

export default app