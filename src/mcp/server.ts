import * as readline from 'readline';
import {
    McpRequest,
    McpResponse,
    McpTool,
    McpResource,
    ToolHandler,
    ResourceHandler,
    InitializeResult,
    JsonRpcErrorCode
} from './types';

// Import all standalone tools (don't require vscode module)
import { listProjectsTool, handleListProjects } from './standaloneTools/listProjects';
import { buildTool, handleBuild } from './standaloneTools/build';
import { runTool, handleRun } from './standaloneTools/run';
import { 
    configureDebugTool, 
    handleConfigureDebug,
    configureIndexTool,
    handleConfigureIndex,
    resolvePackagesTool,
    handleResolvePackages
} from './standaloneTools/configureCommands';
import { getStateTool, handleGetState } from './standaloneTools/getState';

/**
 * MCP Server for iCode extension
 * Implements JSON-RPC 2.0 over STDIO
 */
export class ICodeMcpServer {
    private tools: Map<string, McpTool> = new Map();
    private toolHandlers: Map<string, ToolHandler> = new Map();
    private resources: Map<string, McpResource> = new Map();
    private resourceHandlers: Map<string, ResourceHandler> = new Map();
    private running: boolean = false;

    constructor() {
        this.registerTools();
        this.registerResources();
    }

    /**
     * Register all available tools
     */
    private registerTools(): void {
        this.registerTool(listProjectsTool, handleListProjects);
        this.registerTool(buildTool, handleBuild);
        this.registerTool(runTool, handleRun);
        this.registerTool(configureDebugTool, handleConfigureDebug);
        this.registerTool(configureIndexTool, handleConfigureIndex);
        this.registerTool(resolvePackagesTool, handleResolvePackages);
    }

    /**
     * Register all available resources
     */
    private registerResources(): void {
        // Register state as a tool instead of resource for easier access
        this.registerTool(getStateTool, handleGetState);
    }

    /**
     * Register a tool with its handler
     */
    private registerTool(tool: McpTool, handler: ToolHandler): void {
        this.tools.set(tool.name, tool);
        this.toolHandlers.set(tool.name, handler);
    }

    /**
     * Register a resource with its handler
     */
    private registerResource(resource: McpResource, handler: ResourceHandler): void {
        this.resources.set(resource.uri, resource);
        this.resourceHandlers.set(resource.uri, handler);
    }

    /**
     * Start the MCP server
     */
    public async start(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;
        this.log('info', 'iCode MCP Server starting...');

        // Create readline interface for stdin/stdout
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        // Process each line as a JSON-RPC request or notification
        rl.on('line', async (line: string) => {
            try {
                const message = JSON.parse(line);
                
                // Check if this is a notification (no id field) or a request (has id field)
                if (!message.hasOwnProperty('id')) {
                    // This is a notification, just handle it without sending response
                    this.log('debug', `Received notification: ${message.method}`);
                    await this.handleNotification(message);
                    return;
                }
                
                // This is a request, handle it and send response
                const request: McpRequest = message;
                const response = await this.handleRequest(request);
                this.sendResponse(response);
            } catch (error) {
                this.log('error', `Failed to process message: ${error}`);
                // Send error response if we can extract an id
                try {
                    const partialRequest = JSON.parse(line);
                    if (partialRequest.id) {
                        this.sendResponse(this.createErrorResponse(
                            partialRequest.id,
                            JsonRpcErrorCode.ParseError,
                            'Failed to parse request'
                        ));
                    }
                } catch {
                    // Can't send error response without an id
                }
            }
        });

        rl.on('close', () => {
            this.log('info', 'iCode MCP Server stopped');
            this.running = false;
        });
    }

    /**
     * Stop the MCP server
     */
    public stop(): void {
        this.running = false;
        this.log('info', 'Stopping iCode MCP Server...');
    }

    /**
     * Handle an incoming JSON-RPC notification (no response needed)
     */
    private async handleNotification(message: any): Promise<void> {
        // Notifications are fire-and-forget, we just log them
        // Common notifications: notifications/initialized, notifications/cancelled, etc.
        switch (message.method) {
            case 'notifications/initialized':
                this.log('info', 'Client initialized');
                break;
            case 'notifications/cancelled':
                this.log('info', 'Request cancelled');
                break;
            default:
                this.log('debug', `Unknown notification: ${message.method}`);
        }
    }

    /**
     * Handle an incoming JSON-RPC request
     */
    private async handleRequest(request: McpRequest): Promise<McpResponse> {
        this.log('debug', `Received request: ${request.method}`);

        try {
            switch (request.method) {
                case 'initialize':
                    return this.handleInitialize(request.id);

                case 'tools/list':
                    return this.handleToolsList(request.id);

                case 'tools/call':
                    return await this.handleToolCall(request.id, request.params);

                case 'resources/list':
                    return this.handleResourcesList(request.id);

                case 'resources/read':
                    return await this.handleResourceRead(request.id, request.params);

                default:
                    return this.createErrorResponse(
                        request.id,
                        JsonRpcErrorCode.MethodNotFound,
                        `Method not found: ${request.method}`
                    );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(
                request.id,
                JsonRpcErrorCode.InternalError,
                message
            );
        }
    }

    /**
     * Handle initialize request
     */
    private handleInitialize(id: string | number): McpResponse {
        const result: InitializeResult = {
            protocolVersion: "2024-11-05",
            capabilities: {
                tools: {},
                resources: {}
            },
            serverInfo: {
                name: "icode-mcp-server",
                version: "1.0.0"
            }
        };

        return this.createSuccessResponse(id, result);
    }

    /**
     * Handle tools/list request
     */
    private handleToolsList(id: string | number): McpResponse {
        const tools = Array.from(this.tools.values());
        return this.createSuccessResponse(id, { tools });
    }

    /**
     * Handle tools/call request
     */
    private async handleToolCall(id: string | number, params: any): Promise<McpResponse> {
        if (!params || !params.name) {
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.InvalidParams,
                'Tool name is required'
            );
        }

        const handler = this.toolHandlers.get(params.name);
        if (!handler) {
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.MethodNotFound,
                `Tool not found: ${params.name}`
            );
        }

        try {
            const result = await handler(params.arguments);
            return this.createSuccessResponse(id, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.InternalError,
                `Tool execution failed: ${message}`
            );
        }
    }

    /**
     * Handle resources/list request
     */
    private handleResourcesList(id: string | number): McpResponse {
        const resources = Array.from(this.resources.values());
        return this.createSuccessResponse(id, { resources });
    }

    /**
     * Handle resources/read request
     */
    private async handleResourceRead(id: string | number, params: any): Promise<McpResponse> {
        if (!params || !params.uri) {
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.InvalidParams,
                'Resource URI is required'
            );
        }

        const handler = this.resourceHandlers.get(params.uri);
        if (!handler) {
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.MethodNotFound,
                `Resource not found: ${params.uri}`
            );
        }

        try {
            const content = await handler();
            const resource = this.resources.get(params.uri);
            return this.createSuccessResponse(id, {
                contents: [
                    {
                        uri: params.uri,
                        mimeType: resource?.mimeType || 'text/plain',
                        text: content
                    }
                ]
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorResponse(
                id,
                JsonRpcErrorCode.InternalError,
                `Resource read failed: ${message}`
            );
        }
    }

    /**
     * Create a success response
     */
    private createSuccessResponse(id: string | number, result: any): McpResponse {
        return {
            jsonrpc: "2.0",
            id,
            result
        };
    }

    /**
     * Create an error response
     */
    private createErrorResponse(
        id: string | number,
        code: number,
        message: string,
        data?: any
    ): McpResponse {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code,
                message,
                data
            }
        };
    }

    /**
     * Send a response to stdout
     */
    private sendResponse(response: McpResponse): void {
        console.log(JSON.stringify(response));
    }

    /**
     * Log a message to stderr
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
}

/**
 * Entry point when run as standalone script
 */
if (require.main === module) {
    const server = new ICodeMcpServer();
    server.start().catch(error => {
        console.error('Failed to start MCP server:', error);
        process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        server.stop();
        process.exit(0);
    });
}
