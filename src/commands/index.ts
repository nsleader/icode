import * as vscode from 'vscode';
import * as selectScheme from './selectScheme';
import * as selectSimulator from './selectSimulator';
import * as build from './build';
import * as run from './run';

/**
 * Interface for a command module.
 * Each command module must export COMMAND_ID and execute function.
 */
interface CommandModule {
    COMMAND_ID: string;
    execute: () => void | Promise<void> | Promise<boolean>;
}

/**
 * List of all command modules.
 * Add new commands here to register them automatically.
 */
const commands: CommandModule[] = [
    selectScheme,
    selectSimulator,
    build,
    run,
];

/**
 * Registers all commands and returns their disposables.
 * Call this function from the extension's activate function.
 */
export function registerAll(context: vscode.ExtensionContext): void {
    for (const command of commands) {
        const disposable = vscode.commands.registerCommand(
            command.COMMAND_ID,
            command.execute
        );
        context.subscriptions.push(disposable);
    }
}
