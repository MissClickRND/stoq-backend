import { createHash } from "node:crypto";
import { DishState } from "./core";
export interface EventInput {
  tenant: number;
  kind: "stock" | "writeoff" | "expiry" | "status";
  source: string;
  statuses?: DishState[];
}
export function eventInput(
  type: string,
  payload: any,
  message: any,
): EventInput | null {
  const tenant = message?.properties?.headers?.restaurantId;
  if (
    !Number.isSafeInteger(tenant) ||
    tenant < 1 ||
    payload?.restaurantId !== tenant
  )
    return null;
  if (type === "status") {
    if (!Array.isArray(payload.statuses) || payload.statuses.length > 10000)
      return null;
    const statuses: DishState[] = [],
      seen = new Set<number>();
    for (const d of payload.statuses) {
      if (
        !Number.isSafeInteger(d?.dishId) ||
        d.dishId < 1 ||
        seen.has(d.dishId) ||
        !["AVAILABLE", "LOW_STOCK", "STOP_LIST"].includes(d.status)
      )
        return null;
      seen.add(d.dishId);
      statuses.push({
        dishId: d.dishId,
        status: d.status,
        dishName: String(d.dishName ?? d.name ?? `Блюдо №${d.dishId}`).slice(
          0,
          100,
        ),
      });
    }
    statuses.sort((a, b) => a.dishId - b.dishId);
    // Include publisher time so an identical later snapshot can represent recovery after another status.
    const source =
      "status:" +
      createHash("sha256")
        .update(JSON.stringify([payload.updatedAt ?? "", statuses]))
        .digest("hex");
    return { tenant, kind: "status", source, statuses };
  }
  const id = payload.stockEventId ?? payload.eventId;
  if (typeof id !== "string" || !id || id.length > 200) return null;
  if (type === "expiry")
    return { tenant, kind: "expiry", source: "expiry:" + id };
  if (type !== "stock") return null;
  if (["EXPIRATION_WRITE_OFF", "ORDER_DEDUCTION"].includes(payload.reason))
    return null;
  const kind = ["MANUAL_UPDATE", "MANUAL_WRITE_OFF"].includes(payload.reason)
    ? "writeoff"
    : "stock";
  return { tenant, kind, source: "stock:" + id };
}
