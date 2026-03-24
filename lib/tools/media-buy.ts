import { v4 as uuidv4 } from "uuid";
import { MediaBuy, CreateMediaBuyRequest, MediaBuyPackage } from "../types";
import { saveMediaBuy, getMediaBuy, updateMediaBuy } from "../store";
import { getProductById } from "../products";

// CreateMediaBuySuccessSchema required fields:
// { media_buy_id, status, promoted_offering, total_budget, packages[{package_id, product_id, status, budget}] }
interface CreateMediaBuySuccess {
  media_buy_id: string;
  status: string;
  promoted_offering: string;
  total_budget: number;
  packages: Array<{
    package_id: string;
    product_id?: string;
    status: string;
    budget?: number;
  }>;
}

export function createMediaBuy(req: CreateMediaBuyRequest): CreateMediaBuySuccess {
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

  // Resolve total_budget from top-level or sum of packages
  const topBudget = req.budget?.amount;
  const pkgBudgetSum = req.packages.reduce((acc, pkg) => {
    const b = pkg.budget;
    const amount = typeof b === "number" ? b : b?.amount ?? 0;
    return acc + amount;
  }, 0);
  const totalBudget = topBudget ?? pkgBudgetSum ?? 0;

  // promoted_offering: brand domain if provided, else buyer_ref
  const promotedOffering = req.brand?.domain
    ? `${req.brand.domain} — ${req.buyer_ref}`
    : req.buyer_ref;

  const mediaBuy: MediaBuy = {
    media_buy_id: mediaBuyId,
    buyer_ref: req.buyer_ref,
    status: "pending_activation",
    packages,
    start_time: req.start_time,
    end_time: req.end_time,
    budget: req.budget,
    brand: req.brand,
    created_at: now,
    updated_at: now,
  };

  saveMediaBuy(mediaBuy);

  // Return flat CreateMediaBuySuccessSchema with all required fields
  return {
    media_buy_id: mediaBuyId,
    status: "pending_activation",
    promoted_offering: promotedOffering,
    total_budget: totalBudget,
    packages: packages.map((p) => {
      const rawBudget = req.packages.find(
        (rp) => rp.product_id === p.product_id
      )?.budget;
      const budgetAmount =
        typeof rawBudget === "number" ? rawBudget : rawBudget?.amount ?? 0;
      return {
        package_id: p.package_id,
        product_id: p.product_id,
        status: "pending_activation",
        budget: budgetAmount,
      };
    }),
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

  const validStatuses = ["pending_activation", "active", "paused", "completed", "rejected", "canceled"];
  if (updates.status && !validStatuses.includes(updates.status)) {
    throw new Error(`Invalid status: ${updates.status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  const updated = updateMediaBuy(mediaBuyId, updates as Partial<MediaBuy>);
  if (!updated) {
    throw new Error("Failed to update media buy");
  }
  return updated;
}
