import express from "express";
import db from "../db/conn.mjs";
import { ObjectId } from "mongodb";

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const collection = db.collection("records");
    const results = await collection.find({}).toArray();
    res.status(200).json(results);
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const collection = db.collection("records");
    const result = await collection.findOne({ _id: new ObjectId(req.params.id) });

    if (!result) return res.status(404).json({ message: "Not found" });
    res.status(200).json(result);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const newDocument = {
      name: req.body.name,
      position: req.body.position,
      level: req.body.level,
    };
    const collection = db.collection("records");
    const result = await collection.insertOne(newDocument);
    res.status(201).json(result);
  })
);

router.patch(
  "/:id",
  wrap(async (req, res) => {
    const updates = {
      $set: {
        name: req.body.name,
        position: req.body.position,
        level: req.body.level,
      },
    };
    const collection = db.collection("records");
    const result = await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      updates
    );
    res.status(200).json(result);
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const collection = db.collection("records");
    const result = await collection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(200).json(result);
  })
);

export default router;
