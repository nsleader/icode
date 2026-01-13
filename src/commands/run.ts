import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isXcbeautifyInstalled } from '../utils/xcode';
import { ProjectState } from '../state/projectState';

export const COMMAND_ID = 'icode.run';

// Cache xcbeautify availability
let xcbeautifyAvailable: boolean | undefined;

/**
 * Escape a string for safe inclusion in a bash single-quoted string.
 * Single quotes in bash don't interpret any special characters,
 * but to include a single quote itself, we use: '\''
 * (end quote, escaped quote, start quote)
 */
function shellEscape(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'";
}

async function checkXcbeautify(): Promise<void> {
    if (xcbeautifyAvailable === undefined) {
        xcbeautifyAvailable = await isXcbeautifyInstalled();
    }
}

/**
 * Builds and runs the iOS project on the selected simulator/device.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();

    // Validate state
    if (!state.project) {
        const action = await vscode.window.showWarningMessage(
            'No project selected. Select a scheme first.',
            'Select Scheme'
        );
        if (action === 'Select Scheme') {
            await vscode.commands.executeCommand('icode.selectScheme');
        }
        return;
    }

    if (!state.scheme) {
        const action = await vscode.window.showWarningMessage(
            'No scheme selected.',
            'Select Scheme'
        );
        if (action === 'Select Scheme') {
            await vscode.commands.executeCommand('icode.selectScheme');
        }
        return;
    }

    if (!state.target) {
        const action = await vscode.window.showWarningMessage(
            'No simulator/device selected.',
            'Select Target'
        );
        if (action === 'Select Target') {
            await vscode.commands.executeCommand('icode.selectSimulator');
        }
        return;
    }

    // Check xcbeautify availability
    await checkXcbeautify();

    const { project, scheme, target, configuration } = state;

    // For simulators, we can build + install + launch
    if (target.type === 'simulator') {
        await runOnSimulator(project, scheme, target.udid, configuration);
    } else {
        // For physical devices, just build (user needs to install via Xcode)
        await runOnDevice(project, scheme, target.udid, configuration);
    }
}

async function runOnSimulator(
    project: NonNullable<ReturnType<typeof ProjectState.getInstance>['project']>,
    scheme: string,
    simulatorUdid: string,
    configuration: string
): Promise<void> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const useXcbeautify = xcbeautifyAvailable ?? false;
    const destination = `platform=iOS Simulator,id=${simulatorUdid}`;
    
    // Escape all user-controlled values for safe shell embedding
    const safeProject = shellEscape(project.path);
    const safeScheme = shellEscape(scheme);
    const safeConfig = shellEscape(configuration);
    const safeDest = shellEscape(destination);
    const safeSimId = shellEscape(simulatorUdid);
    
    // Build command
    let buildCmd: string;
    if (useXcbeautify) {
        buildCmd = `set -o pipefail && rm -rf .bundle && xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -resultBundlePath .bundle build 2>&1 | xcbeautify`;
    } else {
        buildCmd = `rm -rf .bundle && xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -resultBundlePath .bundle build`;
    }

    // Create shell script content with safely escaped variables
    const scriptContent = `#!/bin/bash
set -e

PROJECT=${safeProject}
SCHEME=${safeScheme}
CONFIG=${safeConfig}
DEST=${safeDest}
SIM_ID=${safeSimId}

# Build
${buildCmd} || exit 1

# Boot simulator
echo "[iCode] Starting simulator..."
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -a Simulator

# Get app path
PRODUCTS_DIR=$(xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -showBuildSettings 2>/dev/null | awk -F' = ' '/BUILT_PRODUCTS_DIR/{print $2; exit}')
PRODUCT_NAME=$(xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -showBuildSettings 2>/dev/null | awk -F' = ' '/FULL_PRODUCT_NAME/{print $2; exit}')
APP="$PRODUCTS_DIR/$PRODUCT_NAME"
echo "[iCode] App: $APP"

# Get bundle ID
BID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Info.plist")
echo "[iCode] Bundle ID: $BID"

# Install and launch
xcrun simctl install "$SIM_ID" "$APP"
echo "[iCode] Launching (close terminal to stop)..."
xcrun simctl launch --console-pty "$SIM_ID" "$BID"
`;

    // Write script to temp file
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `icode_run_${Date.now()}.sh`);
    fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

    // Create new terminal for this run session
    const terminal = vscode.window.createTerminal({
        name: `iCode: ${scheme}`,
        iconPath: new vscode.ThemeIcon('play'),
    });

    terminal.show();
    terminal.sendText(`"${scriptPath}"`);

    vscode.window.showInformationMessage(
        `Building and running ${scheme}... Close terminal to stop the app.`
    );
}

async function runOnDevice(
    project: NonNullable<ReturnType<typeof ProjectState.getInstance>['project']>,
    scheme: string,
    deviceUdid: string,
    configuration: string
): Promise<void> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const useXcbeautify = xcbeautifyAvailable ?? false;
    const destination = `platform=iOS,id=${deviceUdid}`;
    
    // Escape all user-controlled values for safe shell embedding
    const safeProject = shellEscape(project.path);
    const safeScheme = shellEscape(scheme);
    const safeConfig = shellEscape(configuration);
    const safeDest = shellEscape(destination);
    const safeDeviceId = shellEscape(deviceUdid);
    
    // Build command
    let buildCmd: string;
    if (useXcbeautify) {
        buildCmd = `set -o pipefail && rm -rf .bundle && xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -resultBundlePath .bundle build 2>&1 | xcbeautify`;
    } else {
        buildCmd = `rm -rf .bundle && xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -resultBundlePath .bundle build`;
    }

    // Create shell script content with safely escaped variables
    const scriptContent = `#!/bin/bash
set -e

PROJECT=${safeProject}
SCHEME=${safeScheme}
CONFIG=${safeConfig}
DEST=${safeDest}
DEVICE_ID=${safeDeviceId}

# Build
${buildCmd} || exit 1

# Get app path
PRODUCTS_DIR=$(xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -showBuildSettings 2>/dev/null | awk -F' = ' '/BUILT_PRODUCTS_DIR/{print $2; exit}')
PRODUCT_NAME=$(xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" -showBuildSettings 2>/dev/null | awk -F' = ' '/FULL_PRODUCT_NAME/{print $2; exit}')
APP="$PRODUCTS_DIR/$PRODUCT_NAME"
echo "[iCode] App: $APP"

# Get bundle ID
BID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Info.plist")
echo "[iCode] Bundle ID: $BID"

# Install and launch using devicectl (Xcode 15+)
echo "[iCode] Installing on device..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"

echo "[iCode] Launching (close terminal to stop)..."
xcrun devicectl device process launch --device "$DEVICE_ID" --console "$BID"
`;

    // Write script to temp file
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `icode_device_${Date.now()}.sh`);
    fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

    // Create new terminal for this run session
    const terminal = vscode.window.createTerminal({
        name: `iCode: ${scheme} (Device)`,
        iconPath: new vscode.ThemeIcon('device-mobile'),
    });

    terminal.show();
    terminal.sendText(`"${scriptPath}"`);

    vscode.window.showInformationMessage(
        `Building ${scheme} for device...`
    );
}
