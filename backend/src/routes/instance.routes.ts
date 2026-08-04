import { Router } from "express";

import { InstanceModel } from "../models/instance.model.js";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";

export const instanceRouter = Router();

instanceRouter.post("/", async (req, res) => {
  const { instanceId } = req.body as { instanceId?: string };

  if (!instanceId || typeof instanceId !== "string") {
    res.status(400).json({ error: "instanceId is required" });
    return;
  }

  const existing = await InstanceModel.findOne({ instanceId });
  if (existing) {
    res.status(409).json({ error: "Instance already registered" });
    return;
  }

  const apiKey = generateApiKey();
  await InstanceModel.create({ instanceId, apiKeyHash: hashApiKey(apiKey) });

  res.status(201).json({ instanceId, apiKey });
});
