import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearCache, resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
  it("uses a configured URL without a trailing slash", () => {
    expect(resolveApiBaseUrl("https://api.example.com/", false)).toBe("https://api.example.com");
  });

  it("uses localhost only during local development", () => {
    expect(resolveApiBaseUrl("", true)).toBe("http://localhost:8000");
    expect(resolveApiBaseUrl(undefined, false)).toBe("");
  });
});

describe("API client", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends the user token when requesting projects", async () => {
    localStorage.setItem("token", "test-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ id: 1, name: "Website" }]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getProjects()).resolves.toEqual([{ id: 1, name: "Website" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/projects/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("surfaces an API error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: "Access denied" }),
    }));

    await expect(api.getProjects()).rejects.toThrow("Access denied");
  });
});
