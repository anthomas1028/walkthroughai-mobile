Pod::Spec.new do |s|
  s.name = 'WalkthroughUpload'
  s.version = '1.0.0'
  s.summary = 'Persistent iOS walkthrough uploads'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'WalkthroughAI'
  s.homepage = 'https://walkthroughai-api.onrender.com'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
end
