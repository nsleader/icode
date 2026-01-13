import * as vscode from 'vscode';
import { ProjectState } from './state/projectState';

/**
 * Manages StatusBar items for displaying current project state.
 */
export class StatusBarManager {
    private schemeItem: vscode.StatusBarItem;
    private targetItem: vscode.StatusBarItem;
    private buildItem: vscode.StatusBarItem;
    private runItem: vscode.StatusBarItem;

    constructor() {
        // Scheme selector (leftmost)
        this.schemeItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.schemeItem.command = 'icode.selectScheme';
        this.schemeItem.tooltip = 'Select Xcode Scheme';

        // Target selector
        this.targetItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.targetItem.command = 'icode.selectSimulator';
        this.targetItem.tooltip = 'Select Simulator/Device';

        // Build button
        this.buildItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            98
        );
        this.buildItem.command = 'icode.build';
        this.buildItem.text = '$(tools) Build';
        this.buildItem.tooltip = 'Build Project';

        // Run button
        this.runItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            97
        );
        this.runItem.command = 'icode.run';
        this.runItem.text = '$(play) Run';
        this.runItem.tooltip = 'Build & Run';

        // Initial update
        this.updateScheme();
        this.updateTarget();
    }

    /**
     * Initialize StatusBar with state listeners.
     */
    initialize(context: vscode.ExtensionContext): void {
        const state = ProjectState.getInstance();

        // Subscribe to state changes
        context.subscriptions.push(
            state.onDidChangeScheme(() => this.updateScheme()),
            state.onDidChangeTarget(() => this.updateTarget()),
            state.onDidChangeProject(() => this.updateScheme())
        );

        // Show all items
        this.schemeItem.show();
        this.targetItem.show();
        this.buildItem.show();
        this.runItem.show();

        // Add to disposables
        context.subscriptions.push(
            this.schemeItem,
            this.targetItem,
            this.buildItem,
            this.runItem
        );
    }

    private updateScheme(): void {
        const state = ProjectState.getInstance();
        
        if (state.scheme) {
            this.schemeItem.text = `$(file-code) ${state.scheme}`;
        } else {
            this.schemeItem.text = '$(file-code) Select Scheme';
        }
    }

    private updateTarget(): void {
        const state = ProjectState.getInstance();
        
        if (state.target) {
            const icon = state.target.type === 'device' ? 'device-mobile' : 'vm';
            const runtime = state.target.runtime ? ` (${state.target.runtime})` : '';
            this.targetItem.text = `$(${icon}) ${state.target.name}${runtime}`;
        } else {
            this.targetItem.text = '$(vm) Select Target';
        }
    }

    dispose(): void {
        this.schemeItem.dispose();
        this.targetItem.dispose();
        this.buildItem.dispose();
        this.runItem.dispose();
    }
}
