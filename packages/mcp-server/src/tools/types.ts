/**
 * Shared types for tool handlers.
 */

/**
 * Content item types for tool responses.
 */
export type TextContent = {
  type: 'text';
  text: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type ImageContent = {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

/**
 * Tool response type compatible with MCP SDK's CallToolResult.
 * The index signature allows additional properties as required by the SDK.
 */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export type ToolHandler<TParams = unknown> = (params: TParams) => Promise<ToolResponse>;
