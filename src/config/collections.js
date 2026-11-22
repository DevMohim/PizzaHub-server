import { db } from "./db.js";

export const usersCollection = db.collection("user");
export const menuItemsCollection = db.collection("MenuItems");
export const ordersCollection = db.collection("Orders");
export const transactionCollection = db.collection("Transaction");
