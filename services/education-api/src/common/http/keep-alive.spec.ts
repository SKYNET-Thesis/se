import { applyKeepAliveTimeout } from "./keep-alive";

describe("applyKeepAliveTimeout", () => {
  const fresh = () => ({ keepAliveTimeout: 5000, headersTimeout: 60000 });

  it("leaves Node's defaults alone when the setting is absent or blank", () => {
    for (const raw of [undefined, "", "   "]) {
      const server = fresh();
      expect(applyKeepAliveTimeout(server, raw)).toBeNull();
      expect(server).toEqual({ keepAliveTimeout: 5000, headersTimeout: 60000 });
    }
  });

  it("applies a valid value and keeps headersTimeout above it", () => {
    const server = fresh();
    expect(applyKeepAliveTimeout(server, "65000")).toBe(65000);
    expect(server).toEqual({ keepAliveTimeout: 65000, headersTimeout: 66000 });
  });

  it.each(["abc", "12.5", "-1", "0", "999", "600001", "1e9"])("ignores the invalid value %s instead of guessing", (raw) => {
    const server = fresh();
    expect(applyKeepAliveTimeout(server, raw)).toBeNull();
    expect(server).toEqual({ keepAliveTimeout: 5000, headersTimeout: 60000 });
  });
});
