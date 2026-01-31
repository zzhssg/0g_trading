import { describe, expect, it } from "vitest";

describe("storage upload api", () => {
  it("returns 400 when content missing", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/storage-upload", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toMatch(/content/i);
  });
});
