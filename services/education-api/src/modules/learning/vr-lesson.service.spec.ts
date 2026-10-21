import { VrLessonService } from "./vr-lesson.service";

const user = { vistaUserId: "student-1", status: "active" } as any;
describe("VrLessonService", () => {
  const learning = { myAttempt: jest.fn() }; const config = { get: jest.fn() };
  let service: VrLessonService; const originalFetch = global.fetch;
  beforeEach(() => { learning.myAttempt.mockResolvedValue({ id: "attempt-1" }); config.get.mockImplementation((key:string)=>key === "ROBOT_RUNTIME_BASE_URL" ? "http://checkik.test" : 100); global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ task: { running: true, processHealth: "ready", operatorUrl: "https://192.168.1.77:8123", lastError: null } }) }) as any; service = new VrLessonService(config as any, learning as any); });
  afterAll(() => { global.fetch = originalFetch; });
  it("starts only an offline/fake lesson session and exposes a sanitized operator URL", async () => { const session = await service.start(user, "attempt-1"); expect(session).toMatchObject({ mode: "offline_fake_follower", state: "WAITING_FOR_HEADSET", operatorUrl: "https://192.168.1.77:8123" }); expect(global.fetch).toHaveBeenCalledWith("http://checkik.test/api/tasks/vr-lekiwi", expect.objectContaining({ method: "POST" })); });
  it("stops through the restricted CHECKIK control-plane operation", async () => { const started = await service.start(user, "attempt-1"); if (!("id" in started)) throw new Error("session was not created"); const stopped = await service.stop(user, started.id); expect(stopped.state).toBe("STOPPED"); expect(global.fetch).toHaveBeenCalledWith("http://checkik.test/api/tasks/stop", expect.objectContaining({ method: "POST" })); });
});
