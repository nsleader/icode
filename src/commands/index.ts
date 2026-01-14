import * as vscode from 'vscode';
import * as selectScheme from './selectScheme';
import * as selectSimulator from './selectSimulator';
import * as selectConfiguration from './selectConfiguration';
import * as build from './build';
import * as run from './run';
import * as configureIndex from './configureIndex';
import * as resolvePackages from './resolvePackages';
import * as configureDebug from './configureDebug';
import * as registerMcpServer from './registerMcpServer';

/**
 * Interface for a command module.
 * Each command module must export COMMAND_ID and execute function.
 */
interface CommandModule {
    COMMAND_ID: string;
    execute: (context?: vscode.ExtensionContext) => void | Promise<void> | Promise<boolean>;
}

/**
 * List of all command modules.
 * Add new commands here to register them automatically.
 */
const commands: CommandModule[] = [
    selectScheme,
    selectSimulator,
    selectConfiguration,
    build,
    run,
    configureIndex,
    resolvePackages,
    configureDebug,
];

/**
 * List of commands that require ExtensionContext
 */
const contextCommands: CommandModule[] = [
    registerMcpServer,
];

/**
 * Registers all commands and returns their disposables.
 * Call this function from the extension's activate function.
 */
export function registerAll(context: vscode.ExtensionContext): void {
    // Register regular commands
    for (const command of commands) {
        const disposable = vscode.commands.registerCommand(
            command.COMMAND_ID,
            command.execute
        );
        context.subscriptions.push(disposable);
    }
    
    // Register commands that need context
    for (const command of contextCommands) {
        const disposable = vscode.commands.registerCommand(
            command.COMMAND_ID,
            () => command.execute(context)
        );
        context.subscriptions.push(disposable);
    }
}

// Re-export checkAutoRegister for use in extension.ts
export { checkAutoRegister } from './registerMcpServer';
