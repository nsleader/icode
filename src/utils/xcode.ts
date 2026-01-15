import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from './exec';

export interface XcodeProject {
    path: string;
    name: string;
    isWorkspace: boolean;
}

export interface XcodeScheme {
    name: string;
}

/**
 * Check if xcbeautify is installed.
 */
export async function isXcbeautifyInstalled(): Promise<boolean> {
    try {
        await runCommand('which xcbeautify');
        return true;
    } catch {
        return false;
    }
}

/**
 * Find Xcode projects (.xcodeproj) and workspaces (.xcworkspace) in the workspace.
 */
export async function findXcodeProjects(): Promise<XcodeProject[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return [];
    }

    const projects: XcodeProject[] = [];

    // Find .xcworkspace files (prefer these over .xcodeproj)
    const workspaces = await vscode.workspace.findFiles('**/*.xcworkspace/contents.xcworkspacedata', '**/Pods/**');
    for (const ws of workspaces) {
        const wsPath = path.dirname(ws.fsPath);
        projects.push({
            path: wsPath,
            name: path.basename(wsPath, '.xcworkspace'),
            isWorkspace: true,
        });
    }

    // Find .xcodeproj files
    const xcodeprojs = await vscode.workspace.findFiles('**/*.xcodeproj/project.pbxproj', '**/Pods/**');
    for (const proj of xcodeprojs) {
        const projPath = path.dirname(proj.fsPath);
        // Skip if we already have a workspace for this project
        const hasWorkspace = projects.some(p => p.name === path.basename(projPath, '.xcodeproj'));
        if (!hasWorkspace) {
            projects.push({
                path: projPath,
                name: path.basename(projPath, '.xcodeproj'),
                isWorkspace: false,
            });
        }
    }

    return projects;
}

/**
 * Get list of schemes for an Xcode project/workspace.
 */
export async function getSchemes(project: XcodeProject): Promise<XcodeScheme[]> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const command = `xcodebuild -list ${flag} "${project.path}" -json`;
    
    try {
        const output = await runCommand(command);
        const data = JSON.parse(output);
        
        const schemeNames = project.isWorkspace 
            ? data.workspace?.schemes || []
            : data.project?.schemes || [];
            
        return schemeNames.map((name: string) => ({ name }));
    } catch (error) {
        console.error('Failed to get schemes:', error);
        return [];
    }
}

/**
 * Get list of build configurations for an Xcode project/workspace.
 * Returns configurations like 'Debug', 'Release', or custom ones.
 */
export async function getConfigurations(project: XcodeProject): Promise<string[]> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const command = `xcodebuild -list ${flag} "${project.path}" -json`;
    
    try {
        const output = await runCommand(command);
        const data = JSON.parse(output);
        
        // Configurations are in project.configurations (not in workspace)
        // For workspaces, we need to look at the underlying project
        const configurations = data.project?.configurations || data.workspace?.configurations || [];
        
        // If no configurations found, return defaults
        if (configurations.length === 0) {
            return ['Debug', 'Release'];
        }
        
        return configurations;
    } catch (error) {
        console.error('Failed to get configurations:', error);
        // Return defaults on error
        return ['Debug', 'Release'];
    }
}

/**
 * Build optimization options.
 */
export interface BuildOptions {
    useXcbeautify?: boolean;
    skipMacroValidation?: boolean;
    parallelizeTargets?: boolean;
    disableAutoPackageResolution?: boolean;
}

export interface RunScriptOptions {
    project: XcodeProject;
    scheme: string;
    targetId: string;
    targetType: 'simulator' | 'device';
    configuration?: string;
    useXcbeautify?: boolean;
    options?: BuildOptions;
}

/**
 * Get build optimization flags from VS Code settings.
 */
export function getBuildOptions(): BuildOptions {
    const config = vscode.workspace.getConfiguration('icode.build');
    return {
        skipMacroValidation: config.get<boolean>('skipMacroValidation', true),
        parallelizeTargets: config.get<boolean>('parallelizeTargets', true),
        disableAutoPackageResolution: config.get<boolean>('disableAutoPackageResolution', false),
    };
}

/**
 * Build optimization flags string from options or settings.
 */
export function getBuildFlags(options?: BuildOptions): string {
    const opts = options ?? getBuildOptions();
    const flags: string[] = ['-skipPackageUpdates'];

    if (opts.skipMacroValidation) {
        flags.push('-skipMacroValidation');
    }
    if (opts.parallelizeTargets) {
        flags.push('-parallelizeTargets');
    }
    if (opts.disableAutoPackageResolution) {
        flags.push('-disableAutomaticPackageResolution');
    }

    return flags.join(' ');
}

/**
 * Build the Xcode project.
 * @param targetType - 'simulator' or 'device' to determine correct platform
 * @param options - Build optimization options
 */
export function getBuildCommand(
    project: XcodeProject,
    scheme: string,
    targetId: string,
    targetType: 'simulator' | 'device',
    configuration: string = 'Debug',
    useXcbeautify: boolean = false,
    options?: BuildOptions
): string {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const platform = targetType === 'simulator' ? 'iOS Simulator' : 'iOS';
    const destination = `platform=${platform},id=${targetId}`;
    
    const optFlagsStr = getBuildFlags(options);
    const baseCommand = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration ${configuration} -destination '${destination}' ${optFlagsStr} -resultBundlePath .bundle build`;
    
    if (useXcbeautify) {
        return `set -o pipefail && ${baseCommand} 2>&1 | xcbeautify`;
    }
    return baseCommand;
}

/**
 * Escape a string for safe inclusion in a bash single-quoted string.
 */
function shellEscape(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Build a run script that uses the same build flags as getBuildCommand.
 */
export function getRunScriptContent({
    project,
    scheme,
    targetId,
    targetType,
    configuration = 'Debug',
    useXcbeautify = false,
    options,
}: RunScriptOptions): string {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const platform = targetType === 'simulator' ? 'iOS Simulator' : 'iOS';
    const destination = `platform=${platform},id=${targetId}`;
    const optFlagsStr = getBuildFlags(options);

    const safeProject = shellEscape(project.path);
    const safeScheme = shellEscape(scheme);
    const safeConfig = shellEscape(configuration);
    const safeDest = shellEscape(destination);
    const safeTargetId = shellEscape(targetId);

    const baseBuild = `rm -rf .bundle && xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" ${optFlagsStr} -resultBundlePath .bundle build`;
    const buildCmd = useXcbeautify
        ? `set -o pipefail && ${baseBuild} 2>&1 | xcbeautify`
        : baseBuild;

    const buildSettingsCmd = `xcodebuild ${flag} "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" -destination "$DEST" ${optFlagsStr} -showBuildSettings 2>/dev/null`;

    if (targetType === 'simulator') {
        return `#!/bin/bash
set -e

PROJECT=${safeProject}
SCHEME=${safeScheme}
CONFIG=${safeConfig}
DEST=${safeDest}
SIM_ID=${safeTargetId}

# Build
${buildCmd} || exit 1

# Boot simulator
echo "[iCode] Starting simulator..."
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -a Simulator

# Get app path (single xcodebuild call for both values)
echo "[iCode] Getting build settings..."
BUILD_SETTINGS=$(${buildSettingsCmd})
PRODUCTS_DIR=$(echo "$BUILD_SETTINGS" | awk -F' = ' '/BUILT_PRODUCTS_DIR/{print $2; exit}')
PRODUCT_NAME=$(echo "$BUILD_SETTINGS" | awk -F' = ' '/FULL_PRODUCT_NAME/{print $2; exit}')
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
    }

    return `#!/bin/bash
set -e

PROJECT=${safeProject}
SCHEME=${safeScheme}
CONFIG=${safeConfig}
DEST=${safeDest}
DEVICE_ID=${safeTargetId}

# Build
${buildCmd} || exit 1

# Get app path (single xcodebuild call for both values)
echo "[iCode] Getting build settings..."
BUILD_SETTINGS=$(${buildSettingsCmd})
PRODUCTS_DIR=$(echo "$BUILD_SETTINGS" | awk -F' = ' '/BUILT_PRODUCTS_DIR/{print $2; exit}')
PRODUCT_NAME=$(echo "$BUILD_SETTINGS" | awk -F' = ' '/FULL_PRODUCT_NAME/{print $2; exit}')
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
}

/**
 * Get the path to the built app bundle.
 * @param targetType - 'simulator' or 'device' to determine correct platform
 */
export async function getAppBundlePath(
    project: XcodeProject,
    scheme: string,
    targetId: string,
    targetType: 'simulator' | 'device',
    configuration: string = 'Debug'
): Promise<string | undefined> {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const platform = targetType === 'simulator' ? 'iOS Simulator' : 'iOS';
    const destination = `platform=${platform},id=${targetId}`;
    // Include destination to get correct build settings
    const command = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration ${configuration} -destination '${destination}' -skipPackageUpdates -showBuildSettings`;
    
    try {
        const output = await runCommand(command);
        
        // Parse build settings output (not JSON format when destination is specified)
        let builtProductsDir: string | undefined;
        let fullProductName: string | undefined;
        
        const lines = output.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('BUILT_PRODUCTS_DIR = ')) {
                builtProductsDir = trimmed.replace('BUILT_PRODUCTS_DIR = ', '');
            } else if (trimmed.startsWith('FULL_PRODUCT_NAME = ')) {
                fullProductName = trimmed.replace('FULL_PRODUCT_NAME = ', '');
            }
        }
        
        if (builtProductsDir && fullProductName) {
            return path.join(builtProductsDir, fullProductName);
        }
    } catch (error) {
        console.error('Failed to get app bundle path:', error);
    }
    return undefined;
}
