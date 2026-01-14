import * as vscode from 'vscode';
import * as commands from './commands';
import { ProjectState } from './state/projectState';
import { StatusBarManager } from './statusBar';

let statusBarManager: StatusBarManager;

/**
 * This function is called when the extension is activated.
 * The extension is activated when an Xcode project is found in the workspace.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('iCode extension is now active!');

    // Initialize project state
    const state = ProjectState.initialize(context);

    // Register all commands
    commands.registerAll(context);

    // Initialize StatusBar
    statusBarManager = new StatusBarManager();
    statusBarManager.initialize(context);

    // Restore target name from saved UDID (if target was saved with "Unknown" name)
    state.restoreTargetName().catch(error => {
        console.error('Failed to restore target name:', error);
    });

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('icode.welcomeShown');
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'iCode activated! Use the status bar to select a scheme and simulator.',
            'Select Scheme'
        ).then(action => {
            if (action === 'Select Scheme') {
                vscode.commands.executeCommand('icode.selectScheme');
            }
        });
        context.globalState.update('icode.welcomeShown', true);
    }
}

/**
 * This function is called when the extension is deactivated.
 */
export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
