import * as vscode from 'vscode';
import { getBuildCommand, isXcbeautifyInstalled } from '../utils/xcode';
import { ProjectState } from '../state/projectState';
import { isConfigured } from './configureIndex';

export const COMMAND_ID = 'icode.build';

// Cache xcbeautify availability
let xcbeautifyAvailable: boolean | undefined;
// Track if we've already suggested configuring index
let indexSuggestionShown = false;

async function checkXcbeautify(): Promise<boolean> {
    if (xcbeautifyAvailable === undefined) {
        xcbeautifyAvailable = await isXcbeautifyInstalled();
        if (!xcbeautifyAvailable) {
            const action = await vscode.window.showWarningMessage(
                'xcbeautify not found. Install it for prettier build output.',
                'Install with Homebrew',
                'Continue without'
            );
            if (action === 'Install with Homebrew') {
                const terminal = vscode.window.createTerminal('Install xcbeautify');
                terminal.show();
                terminal.sendText('brew install xcbeautify');
                return false; // Don't build now, let user install first
            }
        }
    }
    return true;
}

/**
 * Builds the iOS project using xcodebuild.
 */
export async function execute(): Promise<boolean> {
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
        return false;
    }

    if (!state.scheme) {
        const action = await vscode.window.showWarningMessage(
            'No scheme selected.',
            'Select Scheme'
        );
        if (action === 'Select Scheme') {
            await vscode.commands.executeCommand('icode.selectScheme');
        }
        return false;
    }

    if (!state.target) {
        const action = await vscode.window.showWarningMessage(
            'No simulator/device selected.',
            'Select Target'
        );
        if (action === 'Select Target') {
            await vscode.commands.executeCommand('icode.selectSimulator');
        }
        return false;
    }

    // Check xcbeautify
    const shouldContinue = await checkXcbeautify();
    if (!shouldContinue) {
        return false;
    }

    // Build command with xcbeautify if available
    const buildCommand = getBuildCommand(
        state.project,
        state.scheme,
        state.target.udid,
        state.target.type,
        state.configuration,
        xcbeautifyAvailable ?? false
    );

    // Create or reuse terminal
    let terminal = vscode.window.terminals.find(t => t.name === 'iCode Build');
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: 'iCode Build',
            iconPath: new vscode.ThemeIcon('tools'),
        });
    }

    terminal.show();
    // Remove old result bundle before building (xcodebuild fails if it exists)
    terminal.sendText(`rm -rf .bundle && ${buildCommand}`);

    vscode.window.showInformationMessage(`Building ${state.scheme}...`);

    // Suggest configuring index if not already configured
    if (!indexSuggestionShown && !isConfigured()) {
        indexSuggestionShown = true;
        // Show after a delay to not interrupt the build notification
        setTimeout(async () => {
            const action = await vscode.window.showInformationMessage(
                'Tip: Configure Swift indexing for autocomplete and go-to-definition support.',
                'Configure Now',
                'Later'
            );
            if (action === 'Configure Now') {
                await vscode.commands.executeCommand('icode.configureIndex');
            }
        }, 3000);
    }

    return true;
}
