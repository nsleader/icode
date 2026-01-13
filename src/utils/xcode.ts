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
 * Build the Xcode project.
 * @param targetType - 'simulator' or 'device' to determine correct platform
 */
export function getBuildCommand(
    project: XcodeProject,
    scheme: string,
    targetId: string,
    targetType: 'simulator' | 'device',
    configuration: string = 'Debug',
    useXcbeautify: boolean = false
): string {
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const platform = targetType === 'simulator' ? 'iOS Simulator' : 'iOS';
    const destination = `platform=${platform},id=${targetId}`;
    const baseCommand = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration ${configuration} -destination '${destination}' -resultBundlePath .bundle build`;
    
    if (useXcbeautify) {
        return `set -o pipefail && ${baseCommand} 2>&1 | xcbeautify`;
    }
    return baseCommand;
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
    const command = `xcodebuild ${flag} "${project.path}" -scheme "${scheme}" -configuration ${configuration} -destination '${destination}' -showBuildSettings`;
    
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
