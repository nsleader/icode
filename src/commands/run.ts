import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getRunScriptContent, isXcbeautifyInstalled } from '../utils/xcode';
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

    const { project, scheme, target, configuration } = state;

    await runOnTarget(project, scheme, target.type, target.udid, configuration);
}

async function runOnTarget(
    project: NonNullable<ReturnType<typeof ProjectState.getInstance>['project']>,
    scheme: string,
    targetType: 'simulator' | 'device',
    targetId: string,
    configuration: string
): Promise<void> {
    const useXcbeautify = xcbeautifyAvailable ?? false;
    const scriptContent = getRunScriptContent({
        project,
        scheme,
        targetType,
        targetId,
        configuration,
        useXcbeautify,
    });

    // Write script to temp file
    const tmpDir = os.tmpdir();
    const scriptName = targetType === 'simulator' ? 'icode_run' : 'icode_device';
    const scriptPath = path.join(tmpDir, `${scriptName}_${Date.now()}.sh`);
    fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

    // Create new terminal for this run session
    const terminalConfig = targetType === 'simulator'
        ? { name: `iCode: ${scheme}`, iconPath: new vscode.ThemeIcon('play') }
        : { name: `iCode: ${scheme} (Device)`, iconPath: new vscode.ThemeIcon('device-mobile') };
    const terminal = vscode.window.createTerminal(terminalConfig);

    terminal.show();
    terminal.sendText(`"${scriptPath}"`);

    if (targetType === 'simulator') {
        vscode.window.showInformationMessage(
            `Building and running ${scheme}... Close terminal to stop the app.`
        );
        return;
    }

    vscode.window.showInformationMessage(
        `Building ${scheme} for device...`
    );
}
