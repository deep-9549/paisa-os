import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "../../security";

describe("PIN hashing fallback (insecure contexts, e.g. phone over LAN http)", () => {
  it("matches the platform SHA-256 for short and multi-block inputs", () => {
    for (const s of ["", "abc", "paisa-os:00000000-0000-4000-8000-000000000001:1234", "x".repeat(55), "y".repeat(64), "z".repeat(200)]) {
      const hex = [...sha256(new TextEncoder().encode(s))].map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(hex).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
});
