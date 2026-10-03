"""Validate actual AGP merged manifests; no Android signing credentials needed."""
import pathlib
import sys
import xml.etree.ElementTree as ET

ANDROID = "{http://schemas.android.com/apk/res/android}"
APP = "com.nextleveldigitalmedia.phatbot"
READS = {"STEPS", "ACTIVE_CALORIES_BURNED", "EXERCISE", "DISTANCE", "HEART_RATE", "SLEEP"}

def validate(path):
    root = ET.parse(path).getroot()
    assert root.get("package") == APP, "Application ID changed"
    assert int(root.find("uses-sdk").get(ANDROID + "minSdkVersion")) == 26, "Minimum SDK changed"
    permissions = {node.get(ANDROID + "name") for node in root.findall("uses-permission")}
    actual = {value for value in permissions if value.startswith("android.permission.health.")}
    assert actual == {"android.permission.health.READ_" + name for name in READS}, actual
    assert root.find(f"./queries/package[@{ANDROID}name='com.google.android.apps.healthdata']") is not None, "Missing provider visibility"
    app = root.find("application")
    def component(name, tag):
        node = app.find(f"{tag}[@{ANDROID}name='{APP}.{name}']")
        assert node is not None, name
        assert node.get(ANDROID + "exported") == "true", name
        return node
    def action(node, value):
        assert node.find(f"./intent-filter/action[@{ANDROID}name='{value}']") is not None, value
    rationale = component("HealthConnectPrivacyActivity", "activity")
    action(rationale, "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE")
    usage = component("HealthConnectPermissionUsage", "activity-alias")
    assert usage.get(ANDROID + "targetActivity") == APP + ".HealthConnectPrivacyActivity"
    assert usage.get(ANDROID + "permission") == "android.permission.START_VIEW_PERMISSION_USAGE"
    action(usage, "android.intent.action.VIEW_PERMISSION_USAGE")
    assert usage.find(f"./intent-filter/category[@{ANDROID}name='android.intent.category.HEALTH_PERMISSIONS']") is not None
    onboarding = component("HealthConnectOnboardingActivity", "activity")
    assert onboarding.get(ANDROID + "permission") == "com.google.android.apps.healthdata.permission.START_ONBOARDING"
    action(onboarding, "androidx.health.ACTION_SHOW_ONBOARDING")
    platform = component("HealthConnectPlatformOnboarding", "activity-alias")
    assert platform.get(ANDROID + "targetActivity") == APP + ".HealthConnectOnboardingActivity"
    assert platform.get(ANDROID + "permission") == "android.permission.health.START_ONBOARDING"
    action(platform, "android.health.connect.action.SHOW_ONBOARDING")
    print(f"Validated Health Connect merged manifest: {path}")

if __name__ == "__main__":
    for variant in sys.argv[1:] or ["debug", "release"]:
        paths = list(pathlib.Path("android/app/build/intermediates/merged_manifests").glob(f"{variant}/**/AndroidManifest.xml"))
        assert paths, f"No merged {variant} manifest found"
        for path in paths:
            validate(path)
