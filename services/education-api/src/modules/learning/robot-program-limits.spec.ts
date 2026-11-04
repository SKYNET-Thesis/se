import { BadRequestException } from "@nestjs/common";
import { assertRobotProgramBounds } from "./robot-program-limits";

describe("RobotProgram resource bounds", () => {
  const program = (count: number) => ({ kind: "robot_program", schemaVersion: 1, steps: Array.from({ length: count }, () => ({ type: "wait", durationMs: 1 })) });

  it("accepts a normal Course 1 sized program", () => {
    expect(() => assertRobotProgramBounds(program(20))).not.toThrow();
  });

  it("rejects programs above the configured step limit", () => {
    expect(() => assertRobotProgramBounds(program(101), 100)).toThrow(BadRequestException);
  });

  it("rejects oversized persisted programs before symbolic rendering", () => {
    expect(() => assertRobotProgramBounds(program(3), 100, 80)).toThrow(BadRequestException);
  });
});
