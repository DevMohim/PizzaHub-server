import { Router } from "express";
import { db } from "../../config/db.js";
import { ObjectId } from "mongodb";


export const menuItemsCollection = db.collection("MenuItems");

const router = Router();

/**
 * Escapes special regex characters so a search term like "p1zza" is matched
 * as plain text instead of being treated as a pattern.
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


//create menu
router.post("/",  async (req, res) => {
  const data = req.body;
  const menuData = {
    ...data,
    status: "pending",
    active: false,
    createAt: new Date(),
  };
  const result = await menuItemsCollection.insertOne(menuData);
  res.status(201).send(result);
});


//get all menu items — with optional search, filters and sorting
router.get("/", async (req, res) => {
  const { email, status, active, search, category, location, sort } = req.query;

  const filter = {};

  // Filter by vendor email (used by the vendor dashboard).
  if (email) {
    filter.userEmail = email;
  }

  // Filter by review status, e.g. "pending" for the admin review queue.
  if (status) {
    filter.status = status;
  }

  // Filter by published state — accepts "true" or "false".
  if (active === "true") {
    filter.active = true;
  } else if (active === "false") {
    filter.active = false;
  }

  // Filter by category, e.g. "classic-pizzas".
  if (category && category !== "all") {
    filter.category = category;
  }

  // Filter by location — case-insensitive exact match.
  if (location && location !== "all") {
    filter.location = { $regex: `^${escapeRegex(location)}$`, $options: "i" };
  }

  // Search by item name, description, category or location.
  // Every field is matched case-insensitively.
  if (search && search.trim()) {
    const safeSearch = escapeRegex(search.trim());

    filter.$or = [
      { itemName: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
      { category: { $regex: safeSearch, $options: "i" } },
      { location: { $regex: safeSearch, $options: "i" } },
    ];
  }

  // Sort by price (low to high / high to low). Default: newest first.
  let sortBy = { createAt: -1 };

  if (sort === "price-asc") {
    sortBy = { price: 1 };
  } else if (sort === "price-desc") {
    sortBy = { price: -1 };
  }

  const result = await menuItemsCollection.find(filter).sort(sortBy).toArray();
  res.status(200).send(result);
});

//get menu item by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).send({ message: "Menu item not found" });
    }
    res.status(200).send(result);
  } catch (error) {
    res.status(400).send({ message: "Invalid id", error: error.message });
  }
});

router.patch('/:id' , async(req,res) => {
  try {
    const { id } = req.params;
    const data = req.body

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  }
})

router.delete('/:id' ,async (req,res)=> {
 try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.deleteOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  } 
})



router.patch("/:id/approve",  async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" ,active:true } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item approved" });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve menu item" });
  }
});

router.patch("/:id/inactive", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { active:false } }, 
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});
router.patch("/:id/active", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { active:true } }, 
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({ message: "Menu item rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject menu item" });
  }
});
router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    const result = await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
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



export default router;
