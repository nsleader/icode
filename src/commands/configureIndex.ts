import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectState } from '../state/projectState';
import { findXcodeProjects, getSchemes, XcodeProject } from '../utils/xcode';
import { runCommand } from '../utils/exec';

export const COMMAND_ID = 'icode.configureIndex';

/**
 * Check if xcode-build-server is installed.
 */
async function isXcodeBuildServerInstalled(): Promise<boolean> {
    try {
        await runCommand('which xcode-build-server');
        return true;
    } catch {
        return false;
    }
}

/**
 * Configures SourceKit-LSP using xcode-build-server.
 * This generates a buildServer.json that SourceKit-LSP automatically detects.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();
    
    // Check if xcode-build-server is installed
    const isInstalled = await isXcodeBuildServerInstalled();
    if (!isInstalled) {
        const action = await vscode.window.showWarningMessage(
            'xcode-build-server is required for Swift indexing. Install it?',
            'Install with Homebrew',
            'Cancel'
        );
        
        if (action === 'Install with Homebrew') {
            const terminal = vscode.window.createTerminal('Install xcode-build-server');
            terminal.show();
            terminal.sendText('brew install xcode-build-server');
            vscode.window.showInformationMessage(
                'After installation completes, run "iCode: Configure Swift Index" again.'
            );
        }
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
                    placeHolder: 'Select project to configure indexing for',
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
            vscode.window.showWarningMessage('No schemes found in project.');
            return;
        }
        
        if (schemes.length === 1) {
            scheme = schemes[0].name;
        } else {
            const selected = await vscode.window.showQuickPick(
                schemes.map(s => ({
                    label: s.name,
                })),
                {
                    placeHolder: 'Select scheme for indexing',
                }
            );
            
            if (!selected) {
                return;
            }
            scheme = selected.label;
        }
    }
    
    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    
    // Generate buildServer.json using xcode-build-server
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Configuring Swift indexing...',
            cancellable: false,
        },
        async (progress) => {
            try {
                progress.report({ message: 'Running xcode-build-server config...' });
                
                const projectFlag = project!.isWorkspace ? '-workspace' : '-project';
                const command = `xcode-build-server config ${projectFlag} "${project!.path}" -scheme "${scheme}"`;
                
                await runCommand(command, workspaceFolder.uri.fsPath);
                
                // Check if buildServer.json was created
                const buildServerPath = path.join(workspaceFolder.uri.fsPath, 'buildServer.json');
                if (fs.existsSync(buildServerPath)) {
                    const action = await vscode.window.showInformationMessage(
                        `Swift indexing configured for "${scheme}". Reload window to activate.`,
                        'Reload Window'
                    );
                    
                    if (action === 'Reload Window') {
                        await vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                } else {
                    vscode.window.showErrorMessage('Failed to create buildServer.json');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to configure indexing: ${message}`);
            }
        }
    );
}

/**
 * Check if xcode-build-server is already configured for the current workspace.
 */
export function isConfigured(): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }
    
    const buildServerPath = path.join(workspaceFolder.uri.fsPath, 'buildServer.json');
    return fs.existsSync(buildServerPath);
}
