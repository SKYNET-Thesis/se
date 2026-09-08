# Phone Teleop reference notes

## Sources

- [giacomoran/teleop-android](https://github.com/giacomoran/teleop-android)
- [LeRobot phone teleoperation](https://huggingface.co/docs/lerobot/main/en/phone_teleop)
- [LeRobot source](https://github.com/huggingface/lerobot)
- [SO-ARM100 repository](https://github.com/TheRobotStudio/SO-ARM100)
- [HEBI Mobile I/O](https://docs.hebi.us/tools.html#mobile-io)

## Findings used by the mobile screen

- The Android reference uses ARCore pose tracking and a WebSocket connection to a Python server. Phone XYZ controls Cartesian motion, while pitch and roll control wrist motion.
- Motion uses a dead-man control: the operator holds the Move/control pad, and releasing it stops producing motion targets.
- The reference control pad uses its left side for finer movement and a dead zone between fine and normal areas. Vertical finger movement controls gripper opening/closing.
- LeRobot captures a phone reference pose when control is enabled again. This prevents a phone reposition while disabled from causing a jump in the robot target.
- LeRobot maps phone input into an end-effector delta, then applies a latched reference, workspace/step safety, gripper velocity conversion, and IK. Raw phone pose must not become servo commands directly.
- The official LeRobot path currently uses WebXR on Android and HEBI Mobile I/O on iOS. This app normalizes both its Expo DeviceMotion fallback and the local iOS ARKit module before entering the same backend adapter.

## Decisions for this repository

- `se/apps/mobile` now has a versioned WebSocket phone protocol and a local `expo-phone-ar` module. On a development build running on iPhone, ARKit world tracking provides camera-backed 6DoF; Expo Go/Android falls back to DeviceMotion and is suitable for UI/protocol testing, not precision hardware.
- `PhoneTeleopScreen` exposes two input modes: a control pad and a motion/camera surface. Both use hold-to-control and clear inactive/connected/tracking states.
- Recenter clears the local reference and requires a new hold before control resumes. E-STOP, disconnect, and tracking loss clear the active control state.
- The screen locks to landscape while mounted. The app-level orientation is `default` so existing screens can continue using portrait.
- The LeKiwi relay accepts an exclusive phone owner and feeds phone poses through the existing `ControllerState` → clutch/deadman → workspace/IK → follower adapter seam. Dashboard-launched relay processes bind `0.0.0.0` so a phone on the LAN can connect; standalone process defaults remain localhost.

## Next integration boundary

The implemented boundary is a versioned WebSocket message containing platform, session ID, monotonic sequence, tracking state, enabled/fine mode, position, quaternion, and gripper velocity. The backend validates bounded finite values, rejects stale sequences, enforces one mode owner, applies the existing IK/safety pipeline, and disables on timeout or disconnect.

## iPhone build requirement

The ARKit module is a local native Expo module, so Expo Go cannot load it. From macOS with Xcode and a physical iPhone, run `npx expo prebuild` and `npx expo run:ios` (or create an equivalent EAS development build). The app will still launch in Expo Go using the DeviceMotion fallback, but it will not have stable camera-backed translation.
