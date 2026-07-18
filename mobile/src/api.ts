import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "./config";

// Thin client over the /api/mobile endpoints. The device bearer token is kept in
// the OS secure store (Keychain / Keystore), never in plain AsyncStorage.

const TOKEN_KEY = "sb_device_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

// --- Types (mirror the API responses) --------------------------------------

export interface HomeStats {
  callsAnswered: number;
  jobsBooked: number;
  revenueBooked: number;
  afterHours: number;
  hotJobs: number;
  recovered: number;
  messages: number;
}
export interface HomeShop {
  id: string;
  businessName: string;
  status: string;
  paused: boolean;
  agentNumber: string | null;
  a2pStatus: string | null;
  subStatus: string | null;
}
export interface HomeResponse {
  owner: { email: string; name: string | null };
  shop: HomeShop | null;
  stats: HomeStats | null;
  planPrice: number | null;
}
export interface CallRow {
  id: string;
  timestamp: string;
  callerPhone: string | null;
  intent: string | null;
  outcome: string | null;
  booked: boolean;
  service: string | null;
  apptTime: string | null;
  estJobValue: number;
  hotJob: boolean;
  durationSec: number;
  recordingUrl: string | null;
  summary: string | null;
  handledAt: string | null;
}
export interface CallDetail extends CallRow {
  transcript: string | null;
}

/** A call the owner should act on: unbooked or an emergency, not yet marked
 *  handled. The needs-attention queue and badges all use this one rule. */
export function needsAttention(c: Pick<CallRow, "booked" | "hotJob" | "handledAt">): boolean {
  return (!c.booked || c.hotJob) && !c.handledAt;
}
export interface Appointment {
  id: string;
  startUtc: string;
  endUtc: string;
  service: string | null;
  customerName: string | null;
  customerPhone: string | null;
  source: string;
}

// --- Endpoints -------------------------------------------------------------

export const api = {
  requestCode: (email: string) =>
    request("/api/mobile/auth/request", { method: "POST", body: JSON.stringify({ email }) }),

  verifyCode: (email: string, code: string, platform?: string, pushToken?: string) =>
    request<{ token: string }>("/api/mobile/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, code, platform, pushToken }),
    }),

  home: () => request<HomeResponse>("/api/mobile/home"),
  calls: () => request<{ calls: CallRow[] }>("/api/mobile/calls"),
  callDetail: (id: string) => request<{ call: CallDetail }>(`/api/mobile/calls/${id}`),
  markHandled: (id: string, handled: boolean) =>
    request<{ ok: boolean; handledAt: string | null }>(`/api/mobile/calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ handled }),
    }),
  appointments: () => request<{ appointments: Appointment[] }>("/api/mobile/appointments"),
  cancelAppointment: (id: string) =>
    request<{ ok: boolean; status: string }>(`/api/mobile/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    }),
  createBlock: (startUtc: string, endUtc: string, note?: string) =>
    request<{ ok: boolean }>("/api/mobile/appointments/block", {
      method: "POST",
      body: JSON.stringify({ startUtc, endUtc, note }),
    }),
  setPaused: (paused: boolean) =>
    request<{ status: string; paused: boolean }>("/api/mobile/pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),
  registerPush: (pushToken: string, platform: string) =>
    request("/api/mobile/push/register", { method: "POST", body: JSON.stringify({ pushToken, platform }) }),
};
