import ExpoModulesCore

public class PhoneARModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPhoneAR")

    View(PhoneARView.self) {
      Events("onPose")
    }
  }
}
