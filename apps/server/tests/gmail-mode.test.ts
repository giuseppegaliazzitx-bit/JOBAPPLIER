import { describe, expect, it } from "vitest";
import { gmailMode } from "../src/gmail.ts";
import { tempSqlite } from "./helper.ts";

describe("gmail mode", () => {
  it("treats an email + app password as IMAP, not OAuth", () => {
    const { config } = tempSqlite();
    expect(gmailMode({ ...config, gmailClientId: "user@gmail.com", gmailClientSecret: "abcd efgh ijkl mnop" })).toBe(
      "imap",
    );
    expect(gmailMode({ ...config, gmailClientId: "123.apps.googleusercontent.com", gmailClientSecret: "GOCSPX-x" })).toBe(
      "oauth",
    );
    expect(gmailMode(config)).toBe("none");
  });
});
