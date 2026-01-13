import * as vscode from 'vscode';
import { findXcodeProjects, getSchemes, XcodeProject } from '../utils/xcode';
import { ProjectState } from '../state/projectState';

export const COMMAND_ID = 'icode.selectScheme';

interface ProjectQuickPickItem extends vscode.QuickPickItem {
    project: XcodeProject;
}

interface SchemeQuickPickItem extends vscode.QuickPickItem {
    schemeName: string;
}

/**
 * Shows a QuickPick to select an Xcode project and scheme.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();
    
    // Show progress while loading projects
    const projects = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Finding Xcode projects...',
            cancellable: false,
        },
        async () => findXcodeProjects()
    );

    if (projects.length === 0) {
        vscode.window.showWarningMessage('No Xcode projects found in workspace');
        return;
    }

    // If multiple projects, let user select one
    let selectedProject: XcodeProject;
    
    if (projects.length === 1) {
        selectedProject = projects[0];
    } else {
        const projectItems: ProjectQuickPickItem[] = projects.map(p => ({
            label: p.name,
            description: p.isWorkspace ? 'Workspace' : 'Project',
            detail: p.path,
            project: p,
        }));

        const selected = await vscode.window.showQuickPick(projectItems, {
            placeHolder: 'Select Xcode project or workspace',
            title: 'Select Project',
        });

        if (!selected) {
            return;
        }
        selectedProject = selected.project;
    }

    // Get schemes for selected project
    const schemes = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Loading schemes for ${selectedProject.name}...`,
            cancellable: false,
        },
        async () => getSchemes(selectedProject)
    );

    if (schemes.length === 0) {
        vscode.window.showWarningMessage(`No schemes found in ${selectedProject.name}`);
        return;
    }

    // Let user select a scheme
    const schemeItems: SchemeQuickPickItem[] = schemes.map(s => ({
        label: s.name,
        schemeName: s.name,
    }));

    const selectedScheme = await vscode.window.showQuickPick(schemeItems, {
        placeHolder: 'Select scheme',
        title: 'Select Scheme',
    });

    if (!selectedScheme) {
        return;
    }

    // Update state
    state.setProject(selectedProject);
    state.setScheme(selectedScheme.schemeName);

    vscode.window.showInformationMessage(`Selected: ${selectedProject.name} → ${selectedScheme.schemeName}`);
}
