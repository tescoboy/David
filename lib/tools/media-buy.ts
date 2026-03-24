import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Response shape — exactly what the evaluator validates
// ---------------------------------------------------------------------------

export interface AdcpPackage {
  package_id: string;
  product_id: string;
  pricing_option_id?: string;
  budget: number;
  status: "pending_activation" | "active" | "paused" | "completed" | "rejected" | "canceled";
}

export interface AdcpMediaBuy {
  media_buy_id: string;
  status: "pending_activation" | "active" | "paused" | "completed" | "rejected" | "canceled";
  promoted_offering: string;
  total_budget: number;
  packages: AdcpPackage[];
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const store = new Map<string, AdcpMediaBuy>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBudgetNumber(budget: unknown): number {
  if (typeof budget === "number") return budget;
  if (budget && typeof budget === "object") {
    const b = budget as Record<string, unknown>;
    if (typeof b.amount === "number") return b.amount;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export interface CreateRequest {
  buyer_ref: string;
  brand?: { domain?: string };
  packages: Array<{
    product_id: string;
    pricing_option_id?: string;
    budget?: number | { amount: number; currency: string };
    impressions?: number;
  }>;
  start_time?: string;
  end_time?: string;
  budget?: { amount: number; currency: string };
  po_number?: string;
}

export function createMediaBuy(req: CreateRequest): AdcpMediaBuy {
  if (!req.buyer_ref) throw new Error("buyer_ref is required");
  if (!req.packages?.length) throw new Error("packages is required");

  const mediaBuyId = `mb-${uuidv4()}`;

  const packages: AdcpPackage[] = req.packages.map((p) => ({
    package_id: uuidv4(),
    product_id: p.product_id,
    ...(p.pricing_option_id ? { pricing_option_id: p.pricing_option_id } : {}),
    budget: resolveBudgetNumber(p.budget),
    status: "pending_activation",
  }));

  // total_budget: top-level budget takes precedence, else sum packages
  const topBudget = req.budget?.amount;
  const pkgSum = packages.reduce((s, p) => s + p.budget, 0);
  const totalBudget = topBudget ?? pkgSum;

  // promoted_offering: brand domain + buyer_ref, or just buyer_ref
  const promotedOffering = req.brand?.domain
    ? `${req.brand.domain} — ${req.buyer_ref}`
    : req.buyer_ref;

  const mediaBuy: AdcpMediaBuy = {
    media_buy_id: mediaBuyId,
    status: "pending_activation",
    promoted_offering: promotedOffering,
    total_budget: totalBudget,
    packages,
  };

  store.set(mediaBuyId, mediaBuy);
  return mediaBuy;
}

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

export function getMediaBuy(mediaBuyId: string): AdcpMediaBuy {
  const buy = store.get(mediaBuyId);
  if (!buy) throw new Error(`Media buy '${mediaBuyId}' not found`);
  return buy;
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

const VALID_STATUSES = [
  "pending_activation",
  "active",
  "paused",
  "completed",
  "rejected",
  "canceled",
] as const;

type MediaBuyStatus = (typeof VALID_STATUSES)[number];

export interface UpdateRequest {
  status?: string;
  paused?: boolean;
  canceled?: boolean;
}

export function updateMediaBuy(
  mediaBuyId: string,
  req: UpdateRequest
): AdcpMediaBuy | null {
  const buy = store.get(mediaBuyId);
  if (!buy) return null;

  // Resolve new status
  let newStatus: MediaBuyStatus | undefined;
  if (req.canceled === true) {
    newStatus = "canceled";
  } else if (req.paused === true) {
    newStatus = "paused";
  } else if (req.paused === false) {
    newStatus = "active";
  } else if (req.status) {
    if (!VALID_STATUSES.includes(req.status as MediaBuyStatus)) {
      throw new Error(`Invalid status: ${req.status}`);
    }
    newStatus = req.status as MediaBuyStatus;
  }

  if (newStatus) {
    buy.status = newStatus;
    // Propagate status to packages too
    buy.packages = buy.packages.map((p) => ({ ...p, status: newStatus as MediaBuyStatus }));
    store.set(mediaBuyId, buy);
  }

  return buy;
}
