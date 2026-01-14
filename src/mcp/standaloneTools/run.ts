import { McpTool, ToolHandler } from '../types';

/**
 * MCP Tool definition for running iOS project
 */
export const runTool: McpTool = {
    name: "run",
    description: "Note: Running apps requires the VS Code extension to be active. This tool provides instructions for running apps through the extension. Use the extension's 'Build & Run' command instead.",
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
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    note: "Running apps with console output requires the VS Code extension",
                    instructions: [
                        "1. Open VS Code/Cursor with your iOS project",
                        "2. Select scheme and simulator using the extension UI",
                        "3. Run command: Cmd+Shift+P → iCode: Build & Run",
                        "4. The app will build, install, and launch with console output in terminal"
                    ],
                    alternative: "Or click the '▶️ Run' button in the status bar",
                    why: "The extension manages simulator lifecycle, app installation, and console output redirection, which requires VS Code APIs"
                }, null, 2)
            }
        ]
    };
};
