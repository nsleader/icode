import * as vscode from 'vscode';
import { ProjectState } from '../state/projectState';
import { getConfigurations, findXcodeProjects } from '../utils/xcode';

export const COMMAND_ID = 'icode.selectConfiguration';

/**
 * Shows a QuickPick to select build configuration.
 * Configurations are fetched dynamically from the Xcode project.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();

    // Ensure we have a project selected
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
                { placeHolder: 'Select project first' }
            );
            
            if (!selected) {
                return;
            }
            project = selected.project;
        }
    }

    // Fetch configurations from the project
    const configurations = await getConfigurations(project);
    const currentConfig = state.configuration;

    const items = configurations.map(config => ({
        label: config,
        description: config === currentConfig ? '(current)' : undefined,
        picked: config === currentConfig,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select build configuration',
        title: 'Build Configuration',
    });

    if (selected) {
        state.setConfiguration(selected.label);
        vscode.window.showInformationMessage(`Configuration set to ${selected.label}`);
    }
}
