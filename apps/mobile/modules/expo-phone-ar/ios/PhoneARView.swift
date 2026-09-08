import ARKit
import ExpoModulesCore
import SceneKit
import simd

final class PhoneARView: ExpoView, ARSessionDelegate {
  private let sceneView = ARSCNView(frame: .zero)
  private let onPose = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    sceneView.scene = SCNScene()
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = false
    addSubview(sceneView)

    guard ARWorldTrackingConfiguration.isSupported else {
      onPose(["trackingState": "lost", "position": ["x": 0, "y": 0, "z": 0], "quaternion": ["x": 0, "y": 0, "z": 0, "w": 1]])
      return
    }

    let configuration = ARWorldTrackingConfiguration()
    configuration.worldAlignment = .gravity
    sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
  }

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    let transform = frame.camera.transform
    let position = transform.columns.3
    let orientation = simd_quatf(transform)
    let state: String
    switch frame.camera.trackingState {
    case .normal: state = "tracking"
    case .limited: state = "limited"
    case .notAvailable: state = "lost"
    }

    onPose([
      "trackingState": state,
      "position": ["x": position.x, "y": position.y, "z": position.z],
      "quaternion": [
        "x": orientation.imag.x,
        "y": orientation.imag.y,
        "z": orientation.imag.z,
        "w": orientation.real
      ]
    ])
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    onPose(["trackingState": "lost", "position": ["x": 0, "y": 0, "z": 0], "quaternion": ["x": 0, "y": 0, "z": 0, "w": 1]])
  }
}
