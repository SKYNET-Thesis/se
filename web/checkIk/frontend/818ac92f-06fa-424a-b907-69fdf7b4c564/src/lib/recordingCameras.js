const wristRoles = new Set(['left-wrist', 'right-wrist']);
const headRoles = new Set(['front', 'overhead']);

export function selectRequiredRecordingCameras(cameras) {
  const wristCamera = cameras.find((camera) => wristRoles.has(camera.role)) ?? null;
  const headCamera = cameras.find((camera) => headRoles.has(camera.role)) ?? null;


  const onlineCount = [wristCamera, headCamera].filter((camera) => camera?.connection === 'connected').length;
  return {
    wristCamera,
    headCamera,
    onlineCount,
    ready: onlineCount === 2,
  };
}
