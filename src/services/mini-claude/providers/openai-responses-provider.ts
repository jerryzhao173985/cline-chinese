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
import { SimpleContextMonitor } from "../context/SimpleContextMonitor"
import { ConversationCompressor } from "../context/ConversationCompressor"
import { countTotalTokens } from "../utils/tokens"

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
	private contextMonitor: SimpleContextMonitor
	private compressor: ConversationCompressor
	private autoCompactEnabled: boolean
	private isGeneratingSummary: boolean = false

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
		this.autoCompactEnabled = config.autoCompactEnabled ?? true // Enable by default

		// Initialize simple context monitor with model's context window
		const modelLimits = this.getModelLimits()
		this.contextMonitor = new SimpleContextMonitor({
			contextWindow: modelLimits.contextWindow,
			compressionThreshold: 0.95, // 95%
			warningThreshold: 0.80, // 80% for UI warning
		})

		// Initialize conversation compressor
		this.compressor = new ConversationCompressor()

		SecureLogger.log("info", "OpenAI Responses Provider initialized with simple context management", {
			model: this.model,
			contextWindow: modelLimits.contextWindow,
			compressionThreshold: "95%",
			autoCompactEnabled: this.autoCompactEnabled,
		})
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
	 * IMPORTANT: For Cline's XML tool system, we should NOT translate to function_call format
	 * Instead, we keep everything as message items with clear context markers
	 *
	 * Key approach:
	 * - All content stays as 'message' items
	 * - Tool results are clearly marked in text
	 * - XML tools remain embedded in assistant messages
	 */
	private translateMessagesToResponsesAPI(messages: Message[]): ResponsesAPIInputItem[] {
		const inputMessages: ResponsesAPIInputItem[] = []

		for (const msg of messages) {
			// Convert all messages to simple message items with clear context
			// This preserves Cline's XML tool format
			const content = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }]

			let messageText = ""

			for (const block of content) {
				if (block.type === "text" && "text" in block) {
					messageText += block.text
				} else if (block.type === "tool_use") {
					// Tool use: Keep as XML in text (Cline's format)
					// This should already be in XML format from the assistant
					const toolBlock = block as ToolUseBlock
					messageText += `\n<${toolBlock.name}>\n`
					for (const [key, value] of Object.entries(toolBlock.input || {})) {
						messageText += `<${key}>${value}</${key}>\n`
					}
					messageText += `</${toolBlock.name}>\n`
				} else if (block.type === "tool_result") {
					// Tool result: Add with clear markers
					const resultBlock = block as ToolResultBlock
					const outputContent =
						typeof resultBlock.content === "string" ? resultBlock.content : JSON.stringify(resultBlock.content)

					// Add clear context so model understands this is a tool result
					messageText += `\n[Tool Result]\n${outputContent}\n`
				}
			}

			// Add as simple message item
			if (messageText.trim()) {
				inputMessages.push({
					type: "message",
					role: msg.role === "assistant" ? "assistant" : "user",
					content: messageText.trim(),
				})
			}
		}

		return inputMessages
	}

	/**
	 * Translate Responses API output to Cline format
	 *
	 * Since we're using prompt-based XML tools, the response will contain
	 * text with embedded XML tool calls that Cline will parse
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

		// Import the actual tool names from Cline's definitions
		// These are the exact tool names that parseAssistantMessageV2 looks for
		const clineToolNames = [
			"execute_command",
			"read_file",
			"write_to_file",
			"replace_in_file",
			"search_files",
			"list_files",
			"list_code_definition_names",
			"browser_action",
			"use_mcp_tool",
			"access_mcp_resource",
			"ask_followup_question",
			"plan_mode_respond",
			"load_mcp_documentation",
			"attempt_completion",
			"new_task",
			"condense",
			"summarize_task",
			"report_bug",
			"new_rule",
			"web_fetch",
		]

		for (const item of response.output) {
			if (item.type === "message" && item.content) {
				// Text output (which may contain XML tools)
				// Check if the text contains any actual Cline tool opening tags
				// We check for opening tags like <execute_command>, <read_file>, etc.
				const containsToolUse = clineToolNames.some(toolName =>
					item.content?.includes(`<${toolName}>`) ?? false
				)

				if (containsToolUse) {
					// Contains actual Cline tool calls - parseAssistantMessageV2 will handle them
					stopReason = "tool_use"
					SecureLogger.log("info", "Detected tool use in response", {
						detectedTools: clineToolNames.filter(name => item.content?.includes(`<${name}>`))
					})
				}

				content.push({
					type: "text",
					text: item.content,
				})
			} else if (item.type === "function_call") {
				// We shouldn't get this since we're not using API function calling
				// But handle it just in case
				SecureLogger.log("warn", "Unexpected function_call in response - converting to text", {
					item: JSON.stringify(item),
				})

				// Convert to text representation
				let toolText = `<${item.name || "unknown"}>\n`
				if (item.arguments) {
					try {
						const args = JSON.parse(item.arguments)
						for (const [key, value] of Object.entries(args)) {
							toolText += `<${key}>${value}</${key}>\n`
						}
					} catch (error) {
						console.error("Failed to parse tool arguments:", error)
					}
				}
				toolText += `</${item.name || "unknown"}>`

				content.push({
					type: "text",
					text: toolText,
				})
				stopReason = "tool_use"
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
			// 1. CONTEXT MONITORING: Check current context usage
			const stats = this.contextMonitor.getStats(params.messages)

			SecureLogger.log("info", "Context window status", {
				zone: stats.zone,
				percentage: `${stats.percentage.toFixed(1)}%`,
				tokens: stats.tokens,
				limit: stats.limit,
				remaining: stats.remaining,
				messageCount: params.messages.length,
			})

			// 2. AUTO-COMPACT: Compress if approaching limit (95%)
			// Skip if already generating summary (prevent infinite recursion)
			let managedMessages = params.messages
			if (this.autoCompactEnabled && stats.shouldCompress && !this.isGeneratingSummary) {
				SecureLogger.log("info", "🗜️ Auto-compact triggered", {
					percentage: `${stats.percentage.toFixed(1)}%`,
					tokens: stats.tokens,
					threshold: `${this.contextMonitor.getCompressionThreshold() * 100}%`,
				})

				// Generate compression prompt
				const compressionPrompt = this.compressor.generateCompressionPrompt(params.messages)

				// Call LLM to generate summary (with protection flag)
				SecureLogger.log("info", "Generating conversation summary...")
				const summaryMessages = [...params.messages, compressionPrompt]

				// Set flag to prevent re-compression during summary generation
				this.isGeneratingSummary = true
				try {
					const summaryResponse = await this.createMessageInternal({
						...params,
						messages: summaryMessages,
						tools: undefined, // No tools for summary generation
					})

					// Extract summary text from response
					const summaryText = summaryResponse.content
						.filter((block) => block.type === "text")
						.map((block) => (block as any).text)
						.join("\n")

					// Get token counts
					const tokensBefore = countTotalTokens(params.messages)

					// Create compressed messages
					const compressionResult = this.compressor.createCompressedMessages(
						params.messages,
						summaryText,
						tokensBefore,
						0, // Will calculate after
					)

					// Calculate actual tokens after compression
					const tokensAfter = countTotalTokens(compressionResult.messages)
					compressionResult.stats.tokensAfter = tokensAfter
					compressionResult.stats.tokensSaved = tokensBefore - tokensAfter

					managedMessages = compressionResult.messages

					// Reset stateful chaining (new conversation context)
					this.lastResponseId = undefined

					SecureLogger.log("info", "✅ Auto-compact complete", {
						messagesBefore: compressionResult.stats.messagesBefore,
						messagesAfter: compressionResult.stats.messagesAfter,
						tokensBefore: compressionResult.stats.tokensBefore,
						tokensAfter: compressionResult.stats.tokensAfter,
						tokensSaved: compressionResult.stats.tokensSaved,
						percentSaved: `${Math.round((compressionResult.stats.tokensSaved / tokensBefore) * 100)}%`,
					})
				} finally {
					// Always reset flag, even if compression fails
					this.isGeneratingSummary = false
				}
			}

			// 3. Create actual message with managed context
			return await this.createMessageInternal({
				...params,
				messages: managedMessages,
			})
		} catch (error: any) {
			SecureLogger.log("error", "Failed to create message with Responses API", {
				error: error.message,
				model: this.model,
			})
			throw error
		}
	}

	/**
	 * Internal message creation (extracted to support compression)
	 */
	private async createMessageInternal(params: MessageParams): Promise<ProviderResponse> {
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
				let errorCode: string | undefined

				try {
					const errorJson = JSON.parse(errorText)
					errorMessage = errorJson.error?.message || errorJson.message || errorMessage
					errorCode = errorJson.error?.code
					fullError = JSON.stringify(errorJson, null, 2)
				} catch (e) {
					// Error text is not JSON
				}

				SecureLogger.log("error", "OpenAI Responses API HTTP error", {
					status: initialResponse.status,
					statusText: initialResponse.statusText,
					error: fullError,
				})

				// Handle context_length_exceeded specifically
				if (errorCode === "context_length_exceeded") {
					// Reset stateful chaining to start fresh
					this.lastResponseId = undefined

					SecureLogger.log("error", "Context window exceeded - resetting stateful chaining", {
						previousResponseId: this.lastResponseId,
						messagesCount: requestParams.input.length,
					})

					throw new Error(
						`Context window exceeded! The conversation is too long.\n\n` +
							`What happened: Your conversation + tool results exceeded the model's context limit.\n\n` +
							`What to do:\n` +
							`1. Start a new task (conversation will be reset)\n` +
							`2. Use more specific prompts to reduce context\n` +
							`3. Avoid large file searches - use targeted file reads instead\n\n` +
							`Technical details: ${errorMessage}`,
					)
				}

				throw new Error(`OpenAI Responses API error: ${errorMessage}\n\nFull error: ${fullError}`)
			}

			let response: any = await initialResponse.json()

			// 9. Validate response structure
			if (response.error) {
				throw new Error(`OpenAI Responses API error: ${response.error.message || JSON.stringify(response.error)}`)
			}

			// 10. Store response ID for stateful chaining
			if (this.enableStatefulChaining && response.id) {
				this.lastResponseId = response.id
			}

			// 11. Poll for async responses
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

			// 12. Handle failed responses
			if (response.status === "failed") {
				const errorMessage = response.error?.message || "Response generation failed"
				throw new Error(`OpenAI Responses API error: ${errorMessage}`)
			}

			// 13. Validate response before translation
			if (!response.output || !Array.isArray(response.output)) {
				SecureLogger.log("error", "Invalid response structure from OpenAI Responses API", {
					response: JSON.stringify(response),
				})
				throw new Error(
					`Invalid response structure: expected 'output' array, got ${typeof response.output}. Response: ${JSON.stringify(response)}`,
				)
			}

			// 13.5. Check for empty output (common with stateful chaining errors)
			if (response.output.length === 0) {
				SecureLogger.log("error", "Empty output from OpenAI Responses API", {
					response: JSON.stringify(response),
					previousResponseId: this.lastResponseId,
				})
				throw new Error(
					`Empty output from API. This may indicate context window overflow or stateful chaining error. Previous response ID: ${this.lastResponseId}`,
				)
			}

			// 14. Translate response back to Cline format
			const translated = this.translateResponseFromResponsesAPI(response as ResponsesAPIResponse)

			// 14.5. Validate translated content is not empty
			if (
				translated.content.length === 0 ||
				(translated.content.length === 1 && translated.content[0].type === "text" && !translated.content[0].text)
			) {
				SecureLogger.log("error", "Translated response has empty content", {
					response: JSON.stringify(response),
					translated: JSON.stringify(translated),
					previousResponseId: this.lastResponseId,
					messagesCount: requestParams.input.length,
				})

				// Detailed diagnostic logging
				SecureLogger.log("error", "Empty response diagnostics", {
					possibleCauses: [
						"Model confused by conversation flow",
						"Stateful chaining chain break",
						"Model doesn't understand prompt/tools",
						"Context window issue (check stats)",
						"Model reasoning mode incompatibility",
					],
					modelUsed: this.model,
					statefulChainingEnabled: this.enableStatefulChaining,
					wasUsingChaining: !!this.lastResponseId,
				})

				// Reset stateful chaining on empty response (auto-recovery)
				const hadStatefulChaining = !!this.lastResponseId
				this.lastResponseId = undefined

				const errorMessage = hadStatefulChaining
					? `Empty response from model. Stateful chaining has been automatically reset for recovery.\n\n` +
						`Possible causes:\n` +
						`1. Model confused by stateful conversation chain\n` +
						`2. Model doesn't understand tool format (expecting XML)\n` +
						`3. Model reasoning mode incompatibility\n\n` +
						`The next request will start fresh without chaining. Please try again.`
					: `Empty response from model. This may indicate:\n` +
						`1. Context window limit (check stats)\n` +
						`2. Model doesn't understand prompt/tools\n` +
						`3. API error or model malfunction\n\n` +
						`Please try again or consider using a different model.`

				throw new Error(errorMessage)
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
	 * Count tokens in messages
	 */
	countTokens(messages: Message[]): number {
		return countTotalTokens(messages)
	}

	/**
	 * Get current context statistics
	 */
	getContextStats(messages: Message[]) {
		return this.contextMonitor.getStats(messages)
	}

	/**
	 * Enable or disable auto-compact
	 */
	setAutoCompact(enabled: boolean): void {
		this.autoCompactEnabled = enabled
		SecureLogger.log("info", `Auto-compact ${enabled ? "enabled" : "disabled"}`)
	}

	/**
	 * Get auto-compact status
	 */
	isAutoCompactEnabled(): boolean {
		return this.autoCompactEnabled
	}

	/**
	 * Manually trigger compression (for user-initiated compact)
	 */
	async manualCompact(messages: Message[], params: MessageParams): Promise<Message[]> {
		SecureLogger.log("info", "🗜️ Manual compact triggered by user")

		// Set protection flag to prevent re-compression
		this.isGeneratingSummary = true

		try {
			// Generate compression prompt
			const compressionPrompt = this.compressor.generateCompressionPrompt(messages)

			// Call LLM to generate summary
			const summaryMessages = [...messages, compressionPrompt]
			const summaryResponse = await this.createMessageInternal({
				...params,
				messages: summaryMessages,
				tools: undefined,
			})

			// Extract summary
			const summaryText = summaryResponse.content
				.filter((block) => block.type === "text")
				.map((block) => (block as any).text)
				.join("\n")

			// Create compressed messages
			const tokensBefore = countTotalTokens(messages)
			const compressionResult = this.compressor.createCompressedMessages(messages, summaryText, tokensBefore, 0)

			// Calculate actual tokens
			const tokensAfter = countTotalTokens(compressionResult.messages)
			compressionResult.stats.tokensAfter = tokensAfter
			compressionResult.stats.tokensSaved = tokensBefore - tokensAfter

			// Reset stateful chaining
			this.lastResponseId = undefined

			SecureLogger.log("info", "✅ Manual compact complete", {
				tokensSaved: compressionResult.stats.tokensSaved,
				percentSaved: `${Math.round((compressionResult.stats.tokensSaved / tokensBefore) * 100)}%`,
			})

			return compressionResult.messages
		} finally {
			// Always reset flag, even if compression fails
			this.isGeneratingSummary = false
		}
	}
}
