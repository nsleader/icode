import * as vscode from 'vscode';
import { ProjectState } from '../state/projectState';
import { findXcodeProjects, getSchemes, XcodeProject } from '../utils/xcode';

export const COMMAND_ID = 'icode.resolvePackages';

/**
 * Resolves SPM dependencies for the current project.
 * This command runs `xcodebuild -resolvePackageDependencies` to download
 * and cache all SPM packages, so subsequent builds can use `-skipPackageUpdates`.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();
    
    let project = state.project;
    let scheme = state.scheme;
    
    // Get project if not selected
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
                    placeHolder: 'Select project to resolve dependencies for',
                    title: 'Select Project'
                }
            );
            
            if (!selected) {
                return;
            }
            project = selected.project;
        }
    }
    
    // Get scheme if not selected
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
                schemes.map(s => ({
                    label: s.name,
                    schemeName: s.name
                })),
                {
                    placeHolder: 'Select scheme for resolving dependencies',
                    title: 'Select Scheme'
                }
            );
            
            if (!selectedScheme) {
                return;
            }
            scheme = selectedScheme.schemeName;
        }
    }
    
    // Build the resolve command
    const flag = project.isWorkspace ? '-workspace' : '-project';
    const resolveCommand = `xcodebuild -resolvePackageDependencies ${flag} "${project.path}" -scheme "${scheme}"`;
    
    // Create or reuse terminal
    let terminal = vscode.window.terminals.find(t => t.name === 'iCode SPM');
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: 'iCode SPM',
            iconPath: new vscode.ThemeIcon('package'),
        });
    }
    
    terminal.show();
    terminal.sendText(resolveCommand);
    
    vscode.window.showInformationMessage(
        `Resolving SPM dependencies for ${scheme}... This may take a while for first run.`
    );
}
