import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectState } from '../state/projectState';
import { findXcodeProjects, getSchemes } from '../utils/xcode';

export const COMMAND_ID = 'icode.configureDebug';

/**
 * Launch.json template for iOS debugging.
 * Uses CodeLLDB extension with Xcode's LLDB for Swift support.
 */
function generateLaunchConfigurations(scheme: string): object[] {
    return [
        {
            "name": `Debug ${scheme} (Wait for Process)`,
            "type": "lldb",
            "request": "attach",
            "waitFor": true,
            "program": scheme,
            "sourceLanguages": ["swift", "objective-c", "c", "c++"]
        },
        {
            "name": `Debug ${scheme} (Attach)`,
            "type": "lldb",
            "request": "attach",
            "pid": "${command:pickProcess}",
            "sourceLanguages": ["swift", "objective-c", "c", "c++"]
        }
    ];
}

/**
 * Updates launch.json with new scheme configurations.
 * Only updates if launch.json already exists.
 * @returns true if updated, false if launch.json doesn't exist
 */
export function updateLaunchJsonForScheme(scheme: string): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }
    
    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const launchPath = path.join(vscodeDir, 'launch.json');
    
    // Only update if launch.json exists
    if (!fs.existsSync(launchPath)) {
        return false;
    }
    
    try {
        const content = fs.readFileSync(launchPath, 'utf8');
        const existingLaunch = JSON.parse(content);
        
        // Remove existing Debug configurations
        existingLaunch.configurations = existingLaunch.configurations.filter(
            (c: any) => !c.name?.startsWith('Debug ')
        );
        
        // Add new configurations for the scheme
        existingLaunch.configurations.push(...generateLaunchConfigurations(scheme));
        fs.writeFileSync(launchPath, JSON.stringify(existingLaunch, null, 4));
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Configures debug settings for the iOS project.
 * Creates only .vscode/launch.json - no tasks.json needed since
 * iCode: Debug command handles building and launching.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }
    
    // Get project
    let project = state.project;
    if (!project) {
        const projects = await findXcodeProjects();
        if (projects.length === 0) {
            vscode.window.showWarningMessage('No Xcode project found in workspace.');
            return;
        }
        
        if (projects.length === 1) {
            project = projects[0];
        } else {
            const selected = await vscode.window.showQuickPick(
                projects.map(p => ({
                    label: p.name,
                    description: p.isWorkspace ? 'Workspace' : 'Project',
                    detail: p.path,
                    project: p
                })),
                {
                    placeHolder: 'Select project for debugging',
                    title: 'Select Project'
                }
            );
            
            if (!selected) {
                return;
            }
            project = selected.project;
        }
    }
    
    // Get scheme
    let scheme = state.scheme;
    if (!scheme) {
        const schemes = await getSchemes(project);
        if (schemes.length === 0) {
            vscode.window.showWarningMessage(`No schemes found in ${project.name}.`);
            return;
        }
        
        if (schemes.length === 1) {
            scheme = schemes[0].name;
        } else {
            const selectedScheme = await vscode.window.showQuickPick(
                schemes.map(s => ({ label: s.name })),
                {
                    placeHolder: 'Select scheme for debugging',
                    title: 'Select Scheme'
                }
            );
            
            if (!selectedScheme) {
                return;
            }
            scheme = selectedScheme.label;
        }
    }
    
    // Create .vscode directory if it doesn't exist
    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }
    
    // Generate and write launch.json
    const launchPath = path.join(vscodeDir, 'launch.json');
    let existingLaunch: any = { version: "0.2.0", configurations: [] };
    
    // Merge with existing launch config if file exists
    if (fs.existsSync(launchPath)) {
        try {
            const content = fs.readFileSync(launchPath, 'utf8');
            existingLaunch = JSON.parse(content);
            
            // Remove existing Debug configurations
            existingLaunch.configurations = existingLaunch.configurations.filter(
                (c: any) => !c.name?.startsWith('Debug ')
            );
        } catch {
            // If parsing fails, start fresh
        }
    }
    
    // Add our configurations
    existingLaunch.configurations.push(...generateLaunchConfigurations(scheme));
    fs.writeFileSync(launchPath, JSON.stringify(existingLaunch, null, 4));
    
    // Create/update settings.json with Xcode LLDB path for Swift support
    const settingsPath = path.join(vscodeDir, 'settings.json');
    let existingSettings: any = {};
    
    if (fs.existsSync(settingsPath)) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf8');
            existingSettings = JSON.parse(content);
        } catch {
            // If parsing fails, start fresh
        }
    }
    
    // Set LLDB library path to Xcode's LLDB for Swift type support
    existingSettings['lldb.library'] = '/Applications/Xcode.app/Contents/SharedFrameworks/LLDB.framework/Versions/A/LLDB';
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 4));
    
    // Check if CodeLLDB extension is installed (required as debug adapter)
    const codelldbInstalled = vscode.extensions.getExtension('vadimcn.vscode-lldb');
    
    if (!codelldbInstalled) {
        const install = await vscode.window.showWarningMessage(
            'CodeLLDB extension is required for debugging. It will use LLDB from Xcode for Swift support.',
            'Install',
            'Later'
        );
        
        if (install === 'Install') {
            vscode.commands.executeCommand('workbench.extensions.installExtension', 'vadimcn.vscode-lldb');
        }
    }
    
    vscode.window.showInformationMessage(
        `Debug configured for ${scheme}. Using Xcode LLDB for Swift support. ` +
        `Run "iCode: Build & Run", then F5 to attach.`,
        'Open Debug Panel'
    ).then(selection => {
        if (selection === 'Open Debug Panel') {
            vscode.commands.executeCommand('workbench.view.debug');
        }
    });
    
    // Open launch.json for review
    const doc = await vscode.workspace.openTextDocument(launchPath);
    await vscode.window.showTextDocument(doc);
}
