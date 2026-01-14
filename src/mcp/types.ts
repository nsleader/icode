/**
 * TypeScript types for MCP (Model Context Protocol) implementation.
 * Based on JSON-RPC 2.0 specification.
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface McpRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: any;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface McpResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: any;
    error?: McpError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface McpError {
    code: number;
    message: string;
    data?: any;
}

/**
 * MCP Tool definition (follows JSON Schema)
 */
export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * MCP Resource definition
 */
export interface McpResource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (params?: any) => Promise<any>;

/**
 * Resource handler function type
 */
export type ResourceHandler = () => Promise<string>;

/**
 * MCP Server initialization result
 */
export interface InitializeResult {
    protocolVersion: string;
    capabilities: {
        tools?: {};
        resources?: {};
    };
    serverInfo: {
        name: string;
        version: string;
    };
}

/**
 * Standard JSON-RPC error codes
 */
export enum JsonRpcErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
}
