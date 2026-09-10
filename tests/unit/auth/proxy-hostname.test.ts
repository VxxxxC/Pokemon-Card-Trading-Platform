import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy hostname handling", () => {
  it("does not loop when dev bind is 0.0.0.0 but browser uses 127.0.0.1", async () => {
    const request = new NextRequest("http://0.0.0.0:3000/", {
      headers: { host: "127.0.0.1:3000" },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects when the browser hostname is 0.0.0.0", async () => {
    const request = new NextRequest("http://0.0.0.0:3000/", {
      headers: { host: "0.0.0.0:3000" },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/");
  });
});
