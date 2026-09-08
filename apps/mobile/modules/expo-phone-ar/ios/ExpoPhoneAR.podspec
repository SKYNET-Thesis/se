require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoPhoneAR'
  s.version        = package['version']
  s.summary        = 'ARKit 6DoF phone teleoperation view'
  s.description    = 'Local Expo module exposing an ARKit world-tracking camera view.'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.static_framework = true
  s.source         = { :path => '.' }
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
