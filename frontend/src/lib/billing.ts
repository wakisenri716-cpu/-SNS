import { api } from "../api/client";

// Payments happen on Stripe's pages: ask the server for the page and go there.
export async function goToBilling(path: "/billing/checkout" | "/billing/portal", body?: unknown) {
  const { data } = await api.post<{ url: string }>(path, body);
  window.location.assign(data.url);
}
