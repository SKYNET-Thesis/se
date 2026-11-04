import mqtt from "mqtt";
import { StatusRepository } from "./status.repository";

jest.mock("mqtt", () => ({ __esModule: true, default: { connect: jest.fn() } }));

describe("StatusRepository deployment configuration", () => {
  it("does not connect to a broker when MQTT is disabled", () => {
    const config = { get: jest.fn((name: string) => name === "MQTT_ENABLED" ? "false" : undefined) };
    new StatusRepository(config as never).onModuleInit();
    expect(mqtt.connect).not.toHaveBeenCalled();
  });
});
