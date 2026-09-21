# Applied from Podfile post_install — Xcode 16+ simulators require iOS ≥ 15.0.
MIN_IOS_DEPLOYMENT = '15.0'

def apply_ios_deployment_target!(project, minimum)
  project.build_configurations.each do |config|
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum
  end
  project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum
    end
  end
end

def patch_all_pod_deployment_targets(installer, minimum = MIN_IOS_DEPLOYMENT)
  projects = [installer.pods_project]
  projects.concat(installer.generated_projects) if installer.respond_to?(:generated_projects)
  projects.compact.each do |project|
    apply_ios_deployment_target!(project, minimum)
  end
end
