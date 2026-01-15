import { McpTool, ToolHandler } from '../types';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * MCP Tool definition for building iOS project
 */
export const buildTool: McpTool = {
    name: "build",
    description: "Preferred build tool for iCode. Use this instead of running xcodebuild directly. Requires project/workspace path, scheme, and destination.",
    inputSchema: {
        type: "object",
        properties: {
            project: {
                type: "string",
                description: "Path to .xcodeproj or .xcworkspace file"
            },
            scheme: {
                type: "string",
                description: "Build scheme name"
            },
            destination: {
                type: "string",
                description: "Build destination (e.g., 'platform=iOS Simulator,name=iPhone 15 Pro' or simulator UDID)"
            },
            configuration: {
                type: "string",
                description: "Build configuration (Debug or Release)",
                default: "Debug"
            }
        },
        required: ["project", "scheme", "destination"]
    }
};

/**
 * Handler for build tool
 */
export const handleBuild: ToolHandler = async (params) => {
    try {
        if (!params?.project || !params?.scheme || !params?.destination) {
            throw new Error('Missing required parameters: project, scheme, and destination are required. Use list_projects to find available projects.');
        }
        
        const project = params.project;
        const scheme = params.scheme;
        const destination = params.destination;
        const configuration = params.configuration || 'Debug';
        
        // Determine if it's a workspace or project
        const isWorkspace = project.endsWith('.xcworkspace');
        const flag = isWorkspace ? '-workspace' : '-project';
        
        // Format destination
        let dest = destination;
        if (!destination.startsWith('platform=')) {
            // Assume it's a UDID
            dest = `platform=iOS Simulator,id=${destination}`;
        }
        
        // Build command
        const command = `xcodebuild ${flag} "${project}" -scheme "${scheme}" -configuration ${configuration} -destination '${dest}' -skipPackageUpdates build`;
        
        console.error(`[MCP] Executing build command: ${command}`);
        
        // Execute build (this will take time)
        const { stdout, stderr } = await exec(command, {
            maxBuffer: 1024 * 1024 * 50, // 50MB buffer for build output
            timeout: 600000 // 10 minute timeout
        });
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        project: project,
                        scheme: scheme,
                        configuration: configuration,
                        message: 'Build completed successfully',
                        output: stdout.split('\n').slice(-10).join('\n') // Last 10 lines
                    }, null, 2)
                }
            ]
        };
    } catch (error: any) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const stderr = error.stderr || '';
        
        throw new Error(`Build failed: ${message}\n${stderr.split('\n').slice(-20).join('\n')}`);
    }
};
