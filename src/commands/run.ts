import * as vscode from 'vscode';
import { isXcbeautifyInstalled } from '../utils/xcode';
import { ProjectState } from '../state/projectState';

export const COMMAND_ID = 'icode.run';

// Cache xcbeautify availability
let xcbeautifyAvailable: boolean | undefined;

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

    const { project, scheme, target } = state;

    // For simulators, we can build + install + launch
    if (target.type === 'simulator') {
        await runOnSimulator(project, scheme, target.udid);
    } else {
        // For physical devices, just build (user needs to install via Xcode)
        await runOnDevice(project, scheme, target.udid);
    }
}

async function runOnSimulator(
    project: NonNullable<ReturnType<typeof ProjectState.getInstance>['project']>,
    scheme: string,
    simulatorUdid: string
): Promise<void> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const useXcbeautify = xcbeautifyAvailable ?? false;
    
    // Build base xcodebuild command with platform specified for xcode-build-server
    const destination = `platform=iOS Simulator,id=${simulatorUdid}`;
    const xcodebuildBase = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration Debug -destination '${destination}' -resultBundlePath .bundle`;
    
    // Build command with optional xcbeautify
    let buildPart: string;
    if (useXcbeautify) {
        buildPart = `set -o pipefail && rm -rf .bundle && ${xcodebuildBase} build 2>&1 | xcbeautify`;
    } else {
        buildPart = `rm -rf .bundle && ${xcodebuildBase} build`;
    }
    
    // Command to get app path from build settings
    const getAppPathCmd = `${xcodebuildBase} -showBuildSettings -json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['buildSettings']['BUILT_PRODUCTS_DIR'] + '/' + d[0]['buildSettings']['FULL_PRODUCT_NAME'])"`;
    
    // Create comprehensive run script
    // This script: builds -> boots simulator -> gets app path -> gets bundle ID -> installs -> launches with console-pty
    const runScript = `
${buildPart} && \\
echo "\\n🚀 Starting simulator and app..." && \\
xcrun simctl boot "${simulatorUdid}" 2>/dev/null || true && \\
open -a Simulator && \\
APP_PATH=$(${getAppPathCmd}) && \\
echo "📦 App path: $APP_PATH" && \\
BUNDLE_ID=$(defaults read "$APP_PATH/Info" CFBundleIdentifier) && \\
echo "🔖 Bundle ID: $BUNDLE_ID" && \\
xcrun simctl install "${simulatorUdid}" "$APP_PATH" && \\
echo "✅ Installed. Launching with attached console (close terminal to stop app)...\\n" && \\
xcrun simctl launch --console-pty "${simulatorUdid}" "$BUNDLE_ID"
`.trim();

    // Create new terminal for this run session (always new to have clean state)
    const terminal = vscode.window.createTerminal({
        name: `iCode: ${scheme}`,
        iconPath: new vscode.ThemeIcon('play'),
    });

    terminal.show();
    terminal.sendText(runScript);

    vscode.window.showInformationMessage(
        `Building and running ${scheme}... Close terminal to stop the app.`
    );
}

async function runOnDevice(
    project: NonNullable<ReturnType<typeof ProjectState.getInstance>['project']>,
    scheme: string,
    deviceUdid: string
): Promise<void> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const useXcbeautify = xcbeautifyAvailable ?? false;
    
    // Build base xcodebuild command with platform specified for xcode-build-server
    const destination = `platform=iOS,id=${deviceUdid}`;
    const baseCommand = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration Debug -destination '${destination}' -resultBundlePath .bundle build`;
    
    // Build command with optional xcbeautify
    let buildCommand: string;
    if (useXcbeautify) {
        buildCommand = `set -o pipefail && rm -rf .bundle && ${baseCommand} 2>&1 | xcbeautify`;
    } else {
        buildCommand = `rm -rf .bundle && ${baseCommand}`;
    }

    let terminal = vscode.window.terminals.find(t => t.name === 'iCode Build');
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: 'iCode Build',
            iconPath: new vscode.ThemeIcon('tools'),
        });
    }

    terminal.show();
    terminal.sendText(buildCommand);

    vscode.window.showInformationMessage(
        `Building ${scheme} for device. After build, install via Xcode or use 'ios-deploy'.`
    );
}
