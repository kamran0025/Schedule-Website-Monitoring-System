import { Schema, model, type InferSchemaType } from "mongoose";

const instanceSchema = new Schema(
  {
    instanceId: { type: String, required: true, unique: true },
    apiKeyHash: { type: String, required: true },
  },
  { timestamps: true },
);

export type Instance = InferSchemaType<typeof instanceSchema>;

export const InstanceModel = model("Instance", instanceSchema);
