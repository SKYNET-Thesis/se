# OmniArm Mobile

Expo/React Native mobile dashboard for controlling and monitoring OmniArm SE.

## Run locally

```sh
npm install
npm run start
```

## EAS builds

```sh
npm run build:android
npm run build:ios
```

## iOS ARKit build

The ARKit local Expo module is not part of Expo Go. The GitHub Actions workflow `Mobile iOS ARKit unsigned build` runs on macOS for every push to `main` (and can also be started manually), generates the iOS project, verifies that `ExpoPhoneAR` was autolinked, archives it without Apple signing, and uploads an unsigned IPA artifact. Download that artifact and sign/sideload it locally with the iOS Legacy Kit and your Apple account. No Expo account or `EXPO_TOKEN` is needed.

The unsigned IPA is not installable by iOS until your sideload tool signs it. After installing the signed app, JavaScript changes can be developed with `npx expo start`; native Swift changes require running the workflow again. iOS Developer Mode must be enabled on the device.
