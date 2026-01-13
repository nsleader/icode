import * as vscode from 'vscode';
import { getSimulators, getDevices } from '../utils/simulator';
import { ProjectState } from '../state/projectState';

export const COMMAND_ID = 'icode.selectSimulator';

interface TargetQuickPickItem extends vscode.QuickPickItem {
    targetType: 'simulator' | 'device' | 'separator';
    udid: string;
    runtime?: string;
}

/**
 * Shows a QuickPick to select a simulator or physical device.
 */
export async function execute(): Promise<void> {
    const state = ProjectState.getInstance();

    // Load simulators and devices in parallel
    const [simulators, devices] = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading simulators and devices...',
            cancellable: false,
        },
        async () => Promise.all([getSimulators(), getDevices()])
    );

    const items: TargetQuickPickItem[] = [];

    // Add devices section
    if (devices.length > 0) {
        items.push({
            label: 'Physical Devices',
            kind: vscode.QuickPickItemKind.Separator,
            targetType: 'separator',
            udid: '',
        });

        for (const device of devices) {
            items.push({
                label: `$(device-mobile) ${device.name}`,
                description: device.connectionType,
                targetType: 'device',
                udid: device.udid,
            });
        }
    }

    // Add simulators section
    if (simulators.length > 0) {
        items.push({
            label: 'Simulators',
            kind: vscode.QuickPickItemKind.Separator,
            targetType: 'separator',
            udid: '',
        });

        for (const sim of simulators) {
            const isBooted = sim.state === 'Booted';
            items.push({
                label: `$(vm) ${sim.name}`,
                description: `${sim.runtime}${isBooted ? ' (Running)' : ''}`,
                targetType: 'simulator',
                udid: sim.udid,
                runtime: sim.runtime,
            });
        }
    }

    if (items.length === 0) {
        vscode.window.showWarningMessage('No simulators or devices found');
        return;
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select simulator or device',
        title: 'Select Target',
    });

    if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) {
        return;
    }

    // Update state
    state.setTarget({
        type: selected.targetType as 'simulator' | 'device',
        udid: selected.udid,
        name: selected.label.replace(/^\$\([^)]+\)\s*/, ''), // Remove icon
        runtime: selected.runtime,
    });

    vscode.window.showInformationMessage(`Selected target: ${selected.label.replace(/^\$\([^)]+\)\s*/, '')}`);
}
