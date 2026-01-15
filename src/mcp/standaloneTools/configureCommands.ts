import { McpTool, ToolHandler } from '../types';

/**
 * MCP Tool for configure_debug
 */
export const configureDebugTool: McpTool = {
    name: "configure_debug",
    description: "Use this tool to guide the user to configure debugging via the VS Code extension.",
    inputSchema: {
        type: "object",
        properties: {},
        required: []
    }
};

export const handleConfigureDebug: ToolHandler = async () => {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    note: "Debug configuration requires the VS Code extension",
                    instructions: [
                        "1. Open VS Code/Cursor with your iOS project",
                        "2. Run: Cmd+Shift+P → iCode: Configure Debug (LLDB)",
                        "3. This will create .vscode/launch.json with debug configurations",
                        "4. Install CodeLLDB extension if prompted",
                        "5. To debug: Run app, then press F5 and select debug configuration"
                    ]
                }, null, 2)
            }
        ]
    };
};

/**
 * MCP Tool for configure_index
 */
export const configureIndexTool: McpTool = {
    name: "configure_index",
    description: "Use this tool to guide the user to configure Swift indexing via the VS Code extension.",
    inputSchema: {
        type: "object",
        properties: {},
        required: []
    }
};

export const handleConfigureIndex: ToolHandler = async () => {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    note: "Swift indexing configuration requires the VS Code extension",
                    instructions: [
                        "1. Install xcode-build-server: brew install xcode-build-server",
                        "2. Open VS Code/Cursor with your iOS project",
                        "3. Run: Cmd+Shift+P → iCode: Configure Swift Index (SourceKit-LSP)",
                        "4. This will create buildServer.json for SourceKit-LSP",
                        "5. Reload window to activate: Cmd+Shift+P → Reload Window",
                        "6. Build project once to populate index"
                    ]
                }, null, 2)
            }
        ]
    };
};

/**
 * MCP Tool for resolve_packages
 */
export const resolvePackagesTool: McpTool = {
    name: "resolve_packages",
    description: "Use this tool to guide resolving SPM dependencies (via extension or suggested xcodebuild command).",
    inputSchema: {
        type: "object",
        properties: {
            project: {
                type: "string",
                description: "Optional: Path to .xcodeproj or .xcworkspace file"
            },
            scheme: {
                type: "string",
                description: "Optional: Scheme name"
            }
        },
        required: []
    }
};

export const handleResolvePackages: ToolHandler = async (params) => {
    if (params?.project && params?.scheme) {
        const isWorkspace = params.project.endsWith('.xcworkspace');
        const flag = isWorkspace ? '-workspace' : '-project';
        const command = `xcodebuild -resolvePackageDependencies ${flag} "${params.project}" -scheme "${params.scheme}"`;
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        note: "You can resolve packages by running this command in terminal",
                        command: command,
                        instructions: [
                            `cd to your project directory`,
                            `Run: ${command}`,
                            "This will download and cache all SPM dependencies"
                        ]
                    }, null, 2)
                }
            ]
        };
    }
    
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    note: "Resolving SPM dependencies",
                    viaExtension: [
                        "1. Open VS Code/Cursor with your iOS project",
                        "2. Run: Cmd+Shift+P → iCode: Resolve SPM Dependencies",
                        "3. Wait for resolution to complete (may take several minutes)"
                    ],
                    viaTerminal: [
                        "Or run xcodebuild -resolvePackageDependencies manually",
                        "Provide project and scheme parameters to get the exact command"
                    ]
                }, null, 2)
            }
        ]
    };
};
