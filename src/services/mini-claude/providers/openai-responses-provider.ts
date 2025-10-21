/**
 * OpenAI Responses API Provider
 *
 * Ported from mini-claude-code with adaptations for Cline VSCode extension
 *
 * This provider implements the OpenAI Responses API (NOT Chat Completions API)
 * Key features:
 * - Stateful conversation chaining with previous_response_id
 * - Support for reasoning models (o-series, GPT-5)
 * - Async response polling for long-running requests
 * - Message translation between Cline and Responses API formats
 * - Flat tool structure (not nested)
 */

import OpenAI from "openai"
import {
	Message,
	Tool,
	ProviderResponse,
	MessageParams,
	ResponsesAPIInputItem,
	ResponsesAPITool,
	ResponsesAPIResponse,
	ResponsesAPIRequestParams,
	ProviderConfig,
	ModelLimits,
	ContentBlock,
	TextBlock,
	ToolUseBlock,
	ToolResultBlock,
} from "../types/provider"
import { SecureLogger } from "../security/security-utils"

/**
 * OpenAI Responses API Provider
 */
export class OpenAIResponsesProvider {
	private client: OpenAI
	private model: string
	private enableStatefulChaining: boolean
	private lastResponseId?: string
	private maxOutputTokens?: number
	private temperature?: number

	/**
	 * Model limits mapping
	 */
	private static readonly MODEL_LIMITS: Record<string, ModelLimits> = {
		"gpt-5-codex": { contextWindow: 400000, maxOutputTokens: 128000 },
		"gpt-5-pro": { contextWindow: 400000, maxOutputTokens: 128000 },
		"gpt-5-thinking": { contextWindow: 400000, maxOutputTokens: 128000 },
		"gpt-5": { contextWindow: 400000, maxOutputTokens: 128000 },
		"gpt-5-mini": { contextWindow: 200000, maxOutputTokens: 64000 },
		"o4-mini": { contextWindow: 200000, maxOutputTokens: 100000 },
		"o3-pro": { contextWindow: 200000, maxOutputTokens: 100000 },
		o3: { contextWindow: 200000, maxOutputTokens: 100000 },
		"o3-mini": { contextWindow: 200000, maxOutputTokens: 100000 },
		o1: { contextWindow: 200000, maxOutputTokens: 100000 },
		"o1-mini": { contextWindow: 128000, maxOutputTokens: 65536 },
		"gpt-4.1": { contextWindow: 1000000, maxOutputTokens: 16384 },
		"gpt-4o": { contextWindow: 128000, maxOutputTokens: 16384 },
		"gpt-4-turbo": { contextWindow: 128000, maxOutputTokens: 4096 },
	}

	/**
	 * Reasoning models set
	 */
	private static readonly REASONING_MODELS = new Set([
		"o3-pro",
		"o3",
		"o3-mini",
		"o4-mini",
		"o1",
		"o1-mini",
		"gpt-5",
		"gpt-5-codex",
		"gpt-5-thinking",
		"gpt-5-pro",
		"gpt-5-mini",
	])

	constructor(config: ProviderConfig) {
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		})

		this.model = config.model
		this.enableStatefulChaining = config.enableStatefulChaining ?? false
		this.maxOutputTokens = config.maxOutputTokens
		this.temperature = config.temperature ?? 1.0
	}

	/**
	 * Check if model is a reasoning model
	 */
	private isReasoningModel(): boolean {
		return OpenAIResponsesProvider.REASONING_MODELS.has(this.model)
	}

	/**
	 * Get model limits
	 */
	private getModelLimits(): ModelLimits {
		return (
			OpenAIResponsesProvider.MODEL_LIMITS[this.model] || {
				contextWindow: 128000,
				maxOutputTokens: 16384,
			}
		)
	}

	/**
	 * Get max output tokens for current model
	 */
	private getMaxOutputTokens(): number {
		if (this.maxOutputTokens) {
			return this.maxOutputTokens
		}
		const limits = this.getModelLimits()
		return limits.maxOutputTokens
	}

	/**
	 * Translate Cline messages to Responses API format
	 *
	 * Key differences:
	 * - Responses API uses 'input' array (not 'messages')
	 * - Assistant text becomes 'message' items with role='assistant'
	 * - Tool uses become 'function_call' items
	 * - Tool results become 'function_call_output' items
	 */
	private translateMessagesToResponsesAPI(messages: Message[]): ResponsesAPIInputItem[] {
		const inputMessages: ResponsesAPIInputItem[] = []

		for (const msg of messages) {
			if (msg.role === "assistant") {
				// Extract text content and tool uses from assistant message
				const content = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }]

				let textContent = ""
				const toolUseBlocks: ToolUseBlock[] = []

				for (const block of content) {
					if (block.type === "text" && "text" in block) {
						textContent += block.text
					} else if (block.type === "tool_use") {
						toolUseBlocks.push(block as ToolUseBlock)
					}
				}

				// Add text as message item
				if (textContent.trim()) {
					inputMessages.push({
						type: "message",
						role: "assistant",
						content: textContent.trim(),
					})
				}

				// Add tool calls as function_call items
				for (const toolUse of toolUseBlocks) {
					inputMessages.push({
						type: "function_call",
						call_id: toolUse.id,
						name: toolUse.name,
						arguments: JSON.stringify(toolUse.input),
					})
				}
			} else if (msg.role === "user") {
				// Extract text content and tool results from user message
				const content = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }]

				let textContent = ""
				const toolResultBlocks: ToolResultBlock[] = []

				for (const block of content) {
					if (block.type === "text" && "text" in block) {
						textContent += block.text
					} else if (block.type === "tool_result") {
						toolResultBlocks.push(block as ToolResultBlock)
					}
				}

				// Add text as message item
				if (textContent.trim()) {
					inputMessages.push({
						type: "message",
						role: "user",
						content: textContent.trim(),
					})
				}

				// Add tool results as function_call_output items
				for (const toolResult of toolResultBlocks) {
					const outputContent =
						typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content)

					inputMessages.push({
						type: "function_call_output",
						call_id: toolResult.tool_use_id,
						output: outputContent,
					})
				}
			}
		}

		return inputMessages
	}

	/**
	 * Translate Responses API output to Cline format
	 */
	private translateResponseFromResponsesAPI(response: ResponsesAPIResponse): ProviderResponse {
		const content: ContentBlock[] = []
		let stopReason: "stop" | "tool_use" | "end_turn" | "max_tokens" = "stop"

		// Validate response has output array
		if (!response.output || !Array.isArray(response.output)) {
			SecureLogger.log("error", "Invalid response structure from Responses API", {
				response: JSON.stringify(response),
			})
			throw new Error(
				`Invalid response structure: output is ${typeof response.output}. Full response: ${JSON.stringify(response)}`,
			)
		}

		for (const item of response.output) {
			if (item.type === "message" && item.content) {
				// Text output
				content.push({
					type: "text",
					text: item.content,
				})
			} else if (item.type === "function_call") {
				// Tool use
				stopReason = "tool_use"

				let parsedInput: Record<string, any> = {}
				if (item.arguments) {
					try {
						parsedInput = JSON.parse(item.arguments)
					} catch (error) {
						console.error("Failed to parse tool arguments:", error)
					}
				}

				content.push({
					type: "tool_use",
					id: item.call_id || `call_${Date.now()}`,
					name: item.name || "unknown",
					input: parsedInput,
				})
			}
		}

		return {
			content,
			stopReason,
			usage: response.usage
				? {
						inputTokens: response.usage.input_tokens,
						outputTokens: response.usage.output_tokens,
					}
				: undefined,
		}
	}

	/**
	 * Format tools for Responses API (FLAT structure)
	 *
	 * Key difference from Chat Completions API:
	 * - Responses API uses flat structure with direct fields
	 * - NOT nested under 'function' property
	 */
	private formatTools(tools?: Tool[]): ResponsesAPITool[] {
		if (!tools || tools.length === 0) {
			return []
		}

		return tools.map((tool) => ({
			type: "function" as const,
			name: tool.name,
			description: tool.description || "",
			parameters: tool.input_schema,
		}))
	}

	/**
	 * Sleep utility for polling
	 */
	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Create message using Responses API
	 *
	 * Main differences from Chat Completions API:
	 * 1. Uses /v1/responses endpoint (not /v1/chat/completions)
	 * 2. Uses 'input' parameter (not 'messages')
	 * 3. Uses 'instructions' for system prompt (not in messages)
	 * 4. Uses 'max_output_tokens' (not 'max_tokens')
	 * 5. Supports 'previous_response_id' for stateful chaining
	 * 6. Supports 'reasoning' parameter for reasoning models
	 * 7. Async responses with polling for long-running requests
	 */
	async createMessage(params: MessageParams): Promise<ProviderResponse> {
		try {
			// 1. Translate messages to Responses API format
			const inputMessages = this.translateMessagesToResponsesAPI(params.messages)

			// 2. Format tools (FLAT structure)
			const tools = this.formatTools(params.tools)

			// 3. Build request parameters
			const requestParams: ResponsesAPIRequestParams = {
				model: this.model,
				input: inputMessages,
				instructions: params.system,
				max_output_tokens: params.maxTokens || this.getMaxOutputTokens(),
				temperature: params.temperature ?? this.temperature,
				stream: false,
			}

			// 4. Add tools if provided
			if (tools.length > 0) {
				requestParams.tools = tools
			}

			// 5. Add stateful chaining if enabled
			if (this.enableStatefulChaining && this.lastResponseId) {
				requestParams.previous_response_id = this.lastResponseId
				SecureLogger.log("info", `Using stateful chaining with previous_response_id: ${this.lastResponseId}`)
			}

			// 6. Add reasoning for reasoning models
			if (this.isReasoningModel()) {
				requestParams.reasoning = { effort: "high" }
				SecureLogger.log("info", `Using reasoning model: ${this.model} with high effort`)
			}

			// 7. Create response using direct HTTP call (SDK doesn't support Responses API yet)
			const baseURL = this.client.baseURL || "https://api.openai.com/v1"
			const apiKey = (this.client as any).apiKey

			// Log request for debugging
			SecureLogger.log("info", "Sending request to OpenAI Responses API", {
				url: `${baseURL}/responses`,
				model: requestParams.model,
				toolsCount: requestParams.tools?.length || 0,
				messagesCount: requestParams.input.length,
			})

			// Make initial request
			const initialResponse = await fetch(`${baseURL}/responses`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(requestParams),
			})

			// Check HTTP status
			if (!initialResponse.ok) {
				const errorText = await initialResponse.text()
				let errorMessage = `HTTP ${initialResponse.status}: ${initialResponse.statusText}`
				let fullError = errorText
				try {
					const errorJson = JSON.parse(errorText)
					errorMessage = errorJson.error?.message || errorJson.message || errorMessage
					fullError = JSON.stringify(errorJson, null, 2)
				} catch (e) {
					// Error text is not JSON
				}

				SecureLogger.log("error", "OpenAI Responses API HTTP error", {
					status: initialResponse.status,
					statusText: initialResponse.statusText,
					error: fullError,
				})

				throw new Error(`OpenAI Responses API error: ${errorMessage}\n\nFull error: ${fullError}`)
			}

			let response: any = await initialResponse.json()

			// 8. Validate response structure
			if (response.error) {
				throw new Error(`OpenAI Responses API error: ${response.error.message || JSON.stringify(response.error)}`)
			}

			// 9. Store response ID for stateful chaining
			if (this.enableStatefulChaining && response.id) {
				this.lastResponseId = response.id
			}

			// 10. Poll for async responses
			while (response.status === "queued" || response.status === "in_progress") {
				SecureLogger.log("info", `Response status: ${response.status}, waiting...`)
				await this.sleep(2000)

				const pollResponse = await fetch(`${baseURL}/responses/${response.id}`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				})

				if (!pollResponse.ok) {
					const errorText = await pollResponse.text()
					throw new Error(`Failed to poll response: HTTP ${pollResponse.status} - ${errorText}`)
				}

				response = await pollResponse.json()

				if (response.error) {
					throw new Error(`OpenAI Responses API error: ${response.error.message || JSON.stringify(response.error)}`)
				}
			}

			// 11. Handle failed responses
			if (response.status === "failed") {
				const errorMessage = response.error?.message || "Response generation failed"
				throw new Error(`OpenAI Responses API error: ${errorMessage}`)
			}

			// 12. Validate response before translation
			if (!response.output || !Array.isArray(response.output)) {
				SecureLogger.log("error", "Invalid response structure from OpenAI Responses API", {
					response: JSON.stringify(response),
				})
				throw new Error(
					`Invalid response structure: expected 'output' array, got ${typeof response.output}. Response: ${JSON.stringify(response)}`,
				)
			}

			// 12.5. Check for empty output (common with stateful chaining errors)
			if (response.output.length === 0) {
				SecureLogger.log("error", "Empty output from OpenAI Responses API", {
					response: JSON.stringify(response),
					previousResponseId: this.lastResponseId,
				})
				throw new Error(
					`Empty output from API. This may indicate context window overflow or stateful chaining error. Previous response ID: ${this.lastResponseId}`,
				)
			}

			// 13. Translate response back to Cline format
			const translated = this.translateResponseFromResponsesAPI(response as ResponsesAPIResponse)

			// 13.5. Validate translated content is not empty
			if (
				translated.content.length === 0 ||
				(translated.content.length === 1 && translated.content[0].type === "text" && !translated.content[0].text)
			) {
				SecureLogger.log("error", "Translated response has empty content", {
					response: JSON.stringify(response),
					translated: JSON.stringify(translated),
					previousResponseId: this.lastResponseId,
				})

				// Reset stateful chaining on empty response
				this.lastResponseId = undefined

				throw new Error(
					`Empty response from model. This may indicate context window limit or API error. Stateful chaining has been reset. Please try again.`,
				)
			}

			return translated
		} catch (error: any) {
			SecureLogger.log("error", "Failed to create message with Responses API", {
				error: error.message,
				model: this.model,
			})
			throw error
		}
	}

	/**
	 * Get current model name
	 */
	getModel(): string {
		return this.model
	}

	/**
	 * Check if stateful chaining is enabled
	 */
	isStatefulChainingEnabled(): boolean {
		return this.enableStatefulChaining
	}

	/**
	 * Get last response ID (for debugging)
	 */
	getLastResponseId(): string | undefined {
		return this.lastResponseId
	}

	/**
	 * Reset stateful chaining (clear last response ID)
	 */
	resetStatefulChaining(): void {
		this.lastResponseId = undefined
		SecureLogger.log("info", "Stateful chaining reset")
	}

	/**
	 * Count tokens in messages (simple estimation)
	 */
	countTokens(messages: Message[]): number {
		let total = 0
		for (const message of messages) {
			const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content)
			// Simple estimation: ~4 chars per token
			total += Math.ceil(content.length / 4)
		}
		return total
	}
}
