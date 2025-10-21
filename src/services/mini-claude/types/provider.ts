/**
 * OpenAI Responses API provider types
 *
 * These types define the interfaces for the OpenAI Responses API integration
 * Based on mini-claude-code implementation with adaptations for Cline
 */

/**
 * Message roles
 */
export type MessageRole = "system" | "user" | "assistant"

/**
 * Content block types
 */
export type ContentBlockType = "text" | "image" | "tool_use" | "tool_result"

/**
 * Text content block
 */
export interface TextBlock {
	type: "text"
	text: string
}

/**
 * Image content block
 */
export interface ImageBlock {
	type: "image"
	source: {
		type: "base64" | "url"
		media_type: string
		data?: string
		url?: string
	}
}

/**
 * Tool use block
 */
export interface ToolUseBlock {
	type: "tool_use"
	id: string
	name: string
	input: Record<string, any>
}

/**
 * Tool result block
 */
export interface ToolResultBlock {
	type: "tool_result"
	tool_use_id: string
	content: string | any[]
	is_error?: boolean
}

/**
 * Content block union type
 */
export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock

/**
 * Message interface (Cline format)
 */
export interface Message {
	role: MessageRole
	content: string | ContentBlock[]
}

/**
 * Tool interface
 */
export interface Tool {
	name: string
	description?: string
	input_schema: Record<string, any>
}

/**
 * OpenAI Responses API input item types
 */
export type ResponsesAPIInputType = "message" | "function_call" | "function_call_output"

/**
 * OpenAI Responses API message item
 */
export interface ResponsesAPIMessageItem {
	type: "message"
	role: "user" | "assistant"
	content: string
}

/**
 * OpenAI Responses API function call item
 */
export interface ResponsesAPIFunctionCallItem {
	type: "function_call"
	call_id: string
	name: string
	arguments: string
}

/**
 * OpenAI Responses API function call output item
 */
export interface ResponsesAPIFunctionCallOutputItem {
	type: "function_call_output"
	call_id: string
	output: string
}

/**
 * OpenAI Responses API input item union type
 */
export type ResponsesAPIInputItem = ResponsesAPIMessageItem | ResponsesAPIFunctionCallItem | ResponsesAPIFunctionCallOutputItem

/**
 * OpenAI Responses API tool format (FLAT structure)
 */
export interface ResponsesAPITool {
	type: "function"
	name: string
	description: string
	parameters: Record<string, any>
}

/**
 * OpenAI Responses API reasoning configuration
 */
export interface ResponsesAPIReasoning {
	effort: "low" | "medium" | "high"
}

/**
 * OpenAI Responses API request parameters
 */
export interface ResponsesAPIRequestParams {
	model: string
	input: ResponsesAPIInputItem[]
	instructions?: string
	max_output_tokens?: number
	tools?: ResponsesAPITool[]
	previous_response_id?: string
	reasoning?: ResponsesAPIReasoning
	temperature?: number
	stream?: boolean
}

/**
 * OpenAI Responses API response status
 */
export type ResponsesAPIStatus = "queued" | "in_progress" | "completed" | "failed" | "cancelled"

/**
 * OpenAI Responses API usage statistics
 */
export interface ResponsesAPIUsage {
	input_tokens: number
	output_tokens: number
	total_tokens: number
}

/**
 * OpenAI Responses API output item
 */
export interface ResponsesAPIOutputItem {
	type: "message" | "function_call"
	role?: "assistant"
	content?: string
	call_id?: string
	name?: string
	arguments?: string
}

/**
 * OpenAI Responses API response
 */
export interface ResponsesAPIResponse {
	id: string
	object: "response"
	created: number
	model: string
	status: ResponsesAPIStatus
	output: ResponsesAPIOutputItem[]
	usage?: ResponsesAPIUsage
	error?: {
		code: string
		message: string
	}
}

/**
 * Provider response (normalized format for Cline)
 */
export interface ProviderResponse {
	content: ContentBlock[]
	stopReason: "stop" | "tool_use" | "end_turn" | "max_tokens"
	usage?: {
		inputTokens: number
		outputTokens: number
	}
}

/**
 * Provider message parameters
 */
export interface MessageParams {
	system?: string
	messages: Message[]
	tools?: Tool[]
	maxTokens?: number
	temperature?: number
	toolChoice?: string
}

/**
 * Model limits configuration
 */
export interface ModelLimits {
	contextWindow: number
	maxOutputTokens: number
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
	apiKey: string
	baseURL?: string
	model: string
	enableStatefulChaining?: boolean
	maxOutputTokens?: number
	temperature?: number
}
