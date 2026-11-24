import { isTwinInternalEndpoint } from "./digital-twin-endpoint";

describe("Digital Twin internal endpoint guard", () => {
  it.each(["http://127.0.0.1:8767", "http://localhost:8767", "http://vista-digital-twin:8767", "http://vista-digital-twin", "https://VISTA-DIGITAL-TWIN:8767"])("accepts %s", (endpoint) => {
    expect(isTwinInternalEndpoint(endpoint)).toBe(true);
  });
  it.each(["http://evil.example:8767", "http://vista-digital-twin.evil.example:8767", "http://vista-digital-twin@evil.example", "http://evil.example/@vista-digital-twin",
    "http://127.0.0.1.evil.example", "http://vista-digital-twin:8767/path", "ftp://vista-digital-twin:8767", "", undefined, null])("refuses %s", (endpoint) => {
    expect(isTwinInternalEndpoint(endpoint as string)).toBe(false);
  });
});
