import { McpTool, ToolHandler } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * MCP Tool definition for getting current state
 */
export const getStateTool: McpTool = {
    name: "get_state",
    description: "Use this tool to check if scheme/target/configuration are already selected and saved by the extension.",
    inputSchema: {
        type: "object",
        properties: {
            workspacePath: {
                type: "string",
                description: "Optional: Path to workspace directory. If not provided, will use current working directory."
            }
        },
        required: []
    }
};

/**
 * Try to find and read the state file exported by the extension
 */
async function getWorkspaceState(workspacePath?: string): Promise<any> {
    const cwd = workspacePath || process.cwd();
    const stateFile = path.join(cwd, '.icode', 'state.json');
    
    // Check if state file exists
    if (!fs.existsSync(stateFile)) {
        return {
            hasState: false,
            message: "No saved state found. The extension hasn't been used in this workspace yet, or you need to select a scheme and simulator first.",
            instructions: [
                "Open VS Code/Cursor with your iOS project",
                "Use the extension UI or commands to select:",
                "  - Scheme: Cmd+Shift+P → iCode: Select Scheme",
                "  - Simulator: Cmd+Shift+P → iCode: Select Simulator/Device",
                "  - Configuration: Cmd+Shift+P → iCode: Select Configuration (optional, defaults to Debug)",
                "Once configured, the state will be available here."
            ],
            alternative: "Or use the status bar in VS Code to quickly select scheme and simulator."
        };
    }
    
    // Read and parse state file
    try {
        const stateContent = fs.readFileSync(stateFile, 'utf8');
        const state = JSON.parse(stateContent);
        
        // Check if state is configured
        if (!state.project || !state.scheme || !state.target) {
            return {
                hasState: true,
                state: state,
                message: "State file exists but not fully configured. Please select scheme and simulator in VS Code.",
                missingFields: {
                    project: !state.project,
                    scheme: !state.scheme,
                    target: !state.target
                }
            };
        }
        
        return {
            hasState: true,
            state: state,
            message: "State successfully loaded",
            summary: {
                project: state.project?.name || 'Unknown',
                scheme: state.scheme,
                target: state.target?.name || 'Unknown',
                configuration: state.configuration || 'Debug',
                lastUpdated: state.lastUpdated
            }
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to read state file: ${message}`);
    }
}

/**
 * Handler for get_state tool
 */
export const handleGetState: ToolHandler = async (args?: { workspacePath?: string }) => {
    try {
        const state = await getWorkspaceState(args?.workspacePath);
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(state, null, 2)
                }
            ]
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to get state: ${message}`);
    }
};
