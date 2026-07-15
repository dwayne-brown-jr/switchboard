import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

// Reuse the real admin guard's contract: requireAdmin resolves for an admin and
// throws (a redirect) otherwise. We stub it to exercise both paths.
const requireAdmin = vi.fn();
vi.mock("@/lib/session", () => ({ requireAdmin: () => requireAdmin() }));

import { GET } from "./route";

describe("GET /admin/pitch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireAdmin.mockReset();
  });

  it("blocks a non-admin: the guard throws and the file is never read", async () => {
    // requireAdmin redirects (throws) for logged-out / non-admin callers.
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const readSpy = vi.spyOn(fs.promises, "readFile");

    await expect(GET()).rejects.toThrow();

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(readSpy).not.toHaveBeenCalled(); // never reached the file
  });

  it("serves the demo HTML to an admin with no-store + noindex headers", async () => {
    requireAdmin.mockResolvedValue({ email: "admin@example.com" });

    const res = await GET();

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");

    const body = await res.text();
    expect(body).toContain("The Missed Call Demo"); // the real file on disk
  });
});
