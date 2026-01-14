import { McpTool, ToolHandler } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * MCP Tool definition for listing Xcode projects
 */
export const listProjectsTool: McpTool = {
    name: "list_projects",
    description: "Lists all Xcode projects (.xcodeproj) and workspaces (.xcworkspace) found in the current workspace",
    inputSchema: {
        type: "object",
        properties: {
            directory: {
                type: "string",
                description: "Optional: Directory to search in. Defaults to current working directory."
            }
        },
        required: []
    }
};

/**
 * Find Xcode projects in a directory
 */
async function findXcodeProjects(dir: string): Promise<any[]> {
    const projects: any[] = [];
    
    try {
        // Find .xcworkspace files
        const { stdout: workspaces } = await exec(
            `find "${dir}" -name "*.xcworkspace" -not -path "*/Pods/*" -type d`,
            { maxBuffer: 1024 * 1024 * 10 }
        );
        
        if (workspaces) {
            workspaces.trim().split('\n').filter(Boolean).forEach(wsPath => {
                const name = path.basename(wsPath, '.xcworkspace');
                projects.push({
                    name,
                    path: wsPath,
                    type: 'workspace'
                });
            });
        }
        
        // Find .xcodeproj files
        const { stdout: projs } = await exec(
            `find "${dir}" -name "*.xcodeproj" -not -path "*/Pods/*" -type d`,
            { maxBuffer: 1024 * 1024 * 10 }
        );
        
        if (projs) {
            projs.trim().split('\n').filter(Boolean).forEach(projPath => {
                const name = path.basename(projPath, '.xcodeproj');
                // Skip if we already have a workspace with this name
                const hasWorkspace = projects.some(p => p.name === name);
                if (!hasWorkspace) {
                    projects.push({
                        name,
                        path: projPath,
                        type: 'project'
                    });
                }
            });
        }
    } catch (error) {
        throw new Error(`Failed to find projects: ${error}`);
    }
    
    return projects;
}

/**
 * Handler for list_projects tool
 */
export const handleListProjects: ToolHandler = async (params) => {
    try {
        const dir = params?.directory || process.cwd();
        const projects = await findXcodeProjects(dir);
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        projects,
                        count: projects.length,
                        searchDirectory: dir
                    }, null, 2)
                }
            ]
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to list projects: ${message}`);
    }
};
