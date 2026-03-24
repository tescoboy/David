import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types — exact shape the evaluator validates against
// ---------------------------------------------------------------------------

export type MediaBuyStatus =
  | "pending_activation"
  | "active"
  | "paused"
  | "completed"
  | "rejected"
  | "canceled";

export interface AdcpPackage {
  package_id: string;
  product_id: string;
  pricing_option_id?: string;
  budget: number;
  status: MediaBuyStatus;
}

export interface AdcpMediaBuy {
  media_buy_id: string;
  status: MediaBuyStatus;
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

function resolveBudget(budget: unknown): number {
  if (typeof budget === "number") return Math.max(0, budget);
  if (budget && typeof budget === "object") {
    const b = budget as Record<string, unknown>;
    if (typeof b.amount === "number") return Math.max(0, b.amount);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export interface CreateArgs {
  buyer_ref: string;
  brand?: { domain?: string };
  packages: Array<{
    product_id: string;
    pricing_option_id?: string;
    budget?: unknown;
    impressions?: number;
  }>;
  budget?: { amount: number; currency: string };
}

export function createMediaBuy(args: CreateArgs): AdcpMediaBuy {
  const packages: AdcpPackage[] = args.packages.map((p) => ({
    package_id: uuidv4(),
    product_id: p.product_id,
    ...(p.pricing_option_id ? { pricing_option_id: p.pricing_option_id } : {}),
    budget: resolveBudget(p.budget),
    status: "pending_activation" as const,
  }));

  // top-level budget wins; otherwise sum packages
  const topBudget = args.budget?.amount;
  const totalBudget = topBudget != null ? topBudget : packages.reduce((s, p) => s + p.budget, 0);

  const promotedOffering = args.brand?.domain
    ? `${args.brand.domain} — ${args.buyer_ref}`
    : args.buyer_ref;

  const buy: AdcpMediaBuy = {
    media_buy_id: `mb-${uuidv4()}`,
    status: "pending_activation",
    promoted_offering: promotedOffering,
    total_budget: totalBudget,
    packages,
  };

  store.set(buy.media_buy_id, buy);
  return buy;
}

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

export function getMediaBuy(id: string): AdcpMediaBuy | undefined {
  return store.get(id);
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

const VALID_STATUSES: MediaBuyStatus[] = [
  "pending_activation", "active", "paused", "completed", "rejected", "canceled",
];

export function updateMediaBuy(
  id: string,
  args: { status?: string; paused?: boolean; canceled?: boolean }
): AdcpMediaBuy | null {
  const buy = store.get(id);
  if (!buy) return null;

  // Resolve new status (canceled boolean takes priority over paused)
  let newStatus: MediaBuyStatus | undefined;
  if (args.canceled === true) {
    newStatus = "canceled";
  } else if (args.paused === true) {
    newStatus = "paused";
  } else if (args.paused === false) {
    newStatus = "active";
  } else if (args.status && VALID_STATUSES.includes(args.status as MediaBuyStatus)) {
    newStatus = args.status as MediaBuyStatus;
  }

  if (newStatus) {
    buy.status = newStatus;
    buy.packages = buy.packages.map((p) => ({ ...p, status: newStatus as MediaBuyStatus }));
    store.set(id, buy);
  }

  return buy;
}
