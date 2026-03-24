import { v4 as uuidv4 } from "uuid";
import { MediaBuy, CreateMediaBuyRequest, MediaBuyPackage } from "../types";
import { saveMediaBuy, getMediaBuy, updateMediaBuy } from "../store";
import { getProductById } from "../products";

export function createMediaBuy(req: CreateMediaBuyRequest): {
  media_buy_id: string;
  buyer_ref: string;
  status: string;
  packages: MediaBuyPackage[];
  message: string;
} {
  // Validate buyer_ref
  if (!req.buyer_ref) {
    throw new Error("buyer_ref is required");
  }

  // Validate packages
  if (!req.packages || req.packages.length === 0) {
    throw new Error("At least one package is required");
  }

  // Build packages — validate each product exists
  const packages: MediaBuyPackage[] = req.packages.map((pkg, i) => {
    if (!pkg.product_id) {
      throw new Error(`Package ${i}: product_id is required`);
    }
    const product = getProductById(pkg.product_id);
    if (!product) {
      throw new Error(`Package ${i}: product '${pkg.product_id}' not found`);
    }
    return {
      package_id: uuidv4(),
      product_id: pkg.product_id,
      budget: pkg.budget,
      impressions: pkg.impressions,
      targeting: pkg.targeting,
    };
  });

  const mediaBuyId = `mb-${uuidv4()}`;
  const now = new Date().toISOString();

  const mediaBuy: MediaBuy = {
    media_buy_id: mediaBuyId,
    buyer_ref: req.buyer_ref,
    status: "pending",
    packages,
    start_time: req.start_time,
    end_time: req.end_time,
    budget: req.budget,
    brand: req.brand,
    created_at: now,
    updated_at: now,
  };

  saveMediaBuy(mediaBuy);

  return {
    media_buy_id: mediaBuyId,
    buyer_ref: req.buyer_ref,
    status: "pending",
    packages,
    message: `Media buy created successfully. Your order is pending review. Media buy ID: ${mediaBuyId}`,
  };
}

export function fetchMediaBuy(mediaBuyId: string): MediaBuy {
  const buy = getMediaBuy(mediaBuyId);
  if (!buy) {
    throw new Error(`Media buy '${mediaBuyId}' not found`);
  }
  return buy;
}

export function patchMediaBuy(
  mediaBuyId: string,
  updates: {
    status?: string;
    start_time?: string;
    end_time?: string;
    budget?: { amount: number; currency: string };
  }
): MediaBuy {
  const buy = getMediaBuy(mediaBuyId);
  if (!buy) {
    throw new Error(`Media buy '${mediaBuyId}' not found`);
  }

  const validStatuses = ["pending", "approved", "rejected", "active", "paused", "completed", "cancelled"];
  if (updates.status && !validStatuses.includes(updates.status)) {
    throw new Error(`Invalid status: ${updates.status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  const updated = updateMediaBuy(mediaBuyId, updates as Partial<MediaBuy>);
  if (!updated) {
    throw new Error("Failed to update media buy");
  }
  return updated;
}
