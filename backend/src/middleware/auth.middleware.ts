import type { NextFunction, Request, Response } from "express";

import { InstanceModel } from "../models/instance.model.js";
import { verifyApiKey } from "../utils/apiKey.js";

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const instanceId = req.header("x-instance-id");
  const apiKey = req.header("x-api-key");

  if (!instanceId || !apiKey) {
    res.status(401).json({ error: "Missing x-instance-id or x-api-key header" });
    return;
  }

  const instance = await InstanceModel.findOne({ instanceId });
  if (!instance || !verifyApiKey(apiKey, instance.apiKeyHash)) {
    res.status(401).json({ error: "Invalid instance ID or API key" });
    return;
  }

  req.instanceId = instanceId;
  next();
}
