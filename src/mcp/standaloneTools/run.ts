import { McpTool, ToolHandler } from '../types';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

/**
 * MCP Tool definition for running iOS project
 */
export const runTool: McpTool = {
    name: "run",
    description: "Launches the app via iCode: Build & Run (through the editor command).",
    inputSchema: {
        type: "object",
        properties: {},
        required: []
    }
};

/**
 * Handler for run tool
 */
export const handleRun: ToolHandler = async () => {
    const commandId = 'icode.run';
    const cursorUri = `cursor://command/${commandId}`;
    const vscodeUri = `vscode://command/${commandId}`;

    // Try to invoke the command via the editor URL scheme.
    const opener = getOpenCommand(cursorUri, vscodeUri);
    if (!opener) {
        throw new Error('Unsupported platform for launching editor command');
    }

    try {
        const { stdout, stderr } = await exec(opener);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        command: commandId,
                        message: 'Build & Run command triggered in the editor',
                        attemptedUris: [cursorUri, vscodeUri],
                        stdout: stdout?.trim() || '',
                        stderr: stderr?.trim() || '',
                        note: 'If nothing happens, ensure Cursor/VS Code is open with your iOS workspace and the iCode extension is activated.'
                    }, null, 2)
                }
            ]
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        command: commandId,
                        error: message,
                        attemptedUris: [cursorUri, vscodeUri],
                        instructions: [
                            'Open Cursor or VS Code with your iOS workspace',
                            'Run: Cmd+Shift+P → iCode: Build & Run',
                            'Ensure scheme and target are selected (status bar)',
                            'Then retry MCP tool: run'
                        ]
                    }, null, 2)
                }
            ]
        };
    }
};

function getOpenCommand(cursorUri: string, vscodeUri: string): string | null {
    if (process.platform === 'darwin') {
        return [
            `open -a "Cursor" "${cursorUri}"`,
            `open -a "Cursor" "${vscodeUri}"`,
            `open -a "Visual Studio Code" "${vscodeUri}"`,
            `open "${cursorUri}"`,
            `open "${vscodeUri}"`
        ].join(' || ');
    }
    if (process.platform === 'win32') {
        return `start "" "${cursorUri}" || start "" "${vscodeUri}"`;
    }
    if (process.platform === 'linux') {
        return `xdg-open "${cursorUri}" || xdg-open "${vscodeUri}"`;
    }
    return null;
}
