import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const COMMAND_ID = 'icode.registerMcpServer';

/**
 * Gets the path to the MCP server entry point
 */
function getMcpServerPath(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'out', 'mcp', 'server.js');
}

/**
 * Gets the path to Cursor's MCP config file
 */
function getCursorMcpConfigPath(): string {
    return path.join(os.homedir(), '.cursor', 'mcp.json');
}

/**
 * Checks if MCP server is already registered
 */
function isMcpServerRegistered(): boolean {
    const configPath = getCursorMcpConfigPath();
    
    if (!fs.existsSync(configPath)) {
        return false;
    }
    
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(content);
        return !!config.mcpServers?.icode;
    } catch {
        return false;
    }
}

/**
 * Registers the MCP server in Cursor's config
 */
async function registerMcpServer(context: vscode.ExtensionContext): Promise<void> {
    const configPath = getCursorMcpConfigPath();
    const serverPath = getMcpServerPath(context);
    
    // Verify server file exists
    if (!fs.existsSync(serverPath)) {
        throw new Error(`MCP server file not found at: ${serverPath}`);
    }
    
    // Create .cursor directory if it doesn't exist
    const cursorDir = path.dirname(configPath);
    if (!fs.existsSync(cursorDir)) {
        fs.mkdirSync(cursorDir, { recursive: true });
    }
    
    // Read existing config or create new one
    let config: any = { mcpServers: {} };
    
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(content);
            if (!config.mcpServers) {
                config.mcpServers = {};
            }
        } catch (error) {
            // If config is corrupted, create backup and start fresh
            const backupPath = `${configPath}.backup`;
            fs.copyFileSync(configPath, backupPath);
            vscode.window.showWarningMessage(
                `Existing MCP config was corrupted. Backup saved to: ${backupPath}`
            );
        }
    }
    
    // Add iCode MCP server configuration
    config.mcpServers.icode = {
        command: "node",
        args: [serverPath],
        disabled: false
    };
    
    // Write updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Command to register MCP server in Cursor
 */
export async function execute(context?: vscode.ExtensionContext): Promise<void> {
    if (!context) {
        throw new Error('Extension context is required');
    }
    
    try {
        // Check if already registered
        if (isMcpServerRegistered()) {
            const action = await vscode.window.showInformationMessage(
                'iCode MCP Server is already registered in Cursor.',
                'Re-register',
                'Cancel'
            );
            
            if (action !== 'Re-register') {
                return;
            }
        }
        
        // Register the server
        await registerMcpServer(context);
        
        // Show success message with options
        const action = await vscode.window.showInformationMessage(
            'iCode MCP Server registered successfully! Restart Cursor to activate the MCP server.',
            'Restart Cursor',
            'Show Config',
            'Later'
        );
        
        if (action === 'Restart Cursor') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        } else if (action === 'Show Config') {
            const configPath = getCursorMcpConfigPath();
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
        }
        
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to register MCP server: ${message}`);
    }
}

/**
 * Check if MCP server should be auto-registered on first activation
 */
export async function checkAutoRegister(context?: vscode.ExtensionContext): Promise<void> {
    if (!context) {
        return;
    }
    // Check if we've already shown the registration prompt
    const hasShownPrompt = context.globalState.get('icode.mcpRegistrationPromptShown');
    
    if (hasShownPrompt) {
        return;
    }
    
    // Check if already registered
    if (isMcpServerRegistered()) {
        context.globalState.update('icode.mcpRegistrationPromptShown', true);
        return;
    }
    
    // Show prompt to register
    const action = await vscode.window.showInformationMessage(
        'Enable iCode MCP Server for AI integration in Cursor? This allows AI to build and run your iOS projects.',
        'Enable',
        'Later',
        "Don't Ask Again"
    );
    
    if (action === 'Enable') {
        await execute(context);
    } else if (action === "Don't Ask Again") {
        context.globalState.update('icode.mcpRegistrationPromptShown', true);
    }
}
