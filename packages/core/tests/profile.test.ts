import { describe, expect, it } from "vitest";
import {
  ProfileValuesSchema,
  isProfileKey,
  profileValuesFromStore,
  requiredProfileKeys,
  serializeProfileValue,
} from "../src/profile.ts";

describe("ProfileValuesSchema", () => {
  it("accepts a valid identity + auth profile", () => {
    const parsed = ProfileValuesSchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
      country: "US",
      authorizedToWork: "yes",
      needsSponsorship: "no",
      eeoFillMode: "decline",
      skills: ["python", "math"],
      workHistory: [
        {
          company: "Analytical Engines",
          title: "Mathematician",
          startDate: "1842-01",
        },
      ],
    });
    expect(parsed.firstName).toBe("Ada");
    expect(parsed.skills).toEqual(["python", "math"]);
  });

  it("rejects an invalid email and an invented key is stripped by the object schema", () => {
    expect(() => ProfileValuesSchema.parse({ email: "not-an-email" })).toThrow();
  });
});

describe("profile store round-trip", () => {
  it("serializes JSON keys and rehydrates them", () => {
    const skills = serializeProfileValue("skills", ["sql", "rust"]);
    const values = profileValuesFromStore([
      { key: "firstName", value: "Ada" },
      { key: "skills", value: skills },
      { key: "unknownFutureKey", value: "ignore" },
    ]);
    expect(values.firstName).toBe("Ada");
    expect(values.skills).toEqual(["sql", "rust"]);
    expect(isProfileKey("unknownFutureKey")).toBe(false);
  });

  it("lists required keys used by the completeness check", () => {
    expect(requiredProfileKeys()).toContain("email");
    expect(requiredProfileKeys()).toContain("authorizedToWork");
  });
});
