import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);

export const db = client.db(process.env.DB_NAME);

export const connectDB = async () => {
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  console.log("MongoDB connected");
};
