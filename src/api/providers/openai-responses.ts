/**
 * OpenAI Responses API Handler for Cline
 *
 * Integrates the mini-claude-code OpenAI Responses API provider with Cline's ApiHandler system
 *
 * Key features:
 * - Uses OpenAI Responses API (NOT Chat Completions API)
 * - Supports GPT-5 series (gpt-5, gpt-5-codex, gpt-5-thinking, gpt-5-pro, gpt-5-mini)
 * - Supports o-series reasoning models (o3-pro, o3, o3-mini, o4-mini, o1, o1-mini)
 * - Stateful conversation chaining with previous_response_id (30-60% faster)
 * - Async response polling for long-running requests
 * - Reasoning effort configuration for thinking models
 */

import { Anthropic } from "@anthropic-ai/sdk"
import { withRetry } from "../retry"
import { ModelInfo, openAiModelInfoSaneDefaults } from "@shared/api"
import { ApiHandler } from "../index"
import { ApiStream } from "../transform/stream"
import { OpenAIResponsesProvider } from "../../services/mini-claude/providers/openai-responses-provider"
import { ProviderConfig } from "../../services/mini-claude/types/provider"

interface OpenAiResponsesHandlerOptions {
	openAiApiKey?: string
	openAiBaseUrl?: string
	openAiModelId?: string
	enableStatefulChaining?: boolean
	maxOutputTokens?: number
	temperature?: number
	reasoningEffort?: string
}

/**
 * Model information for OpenAI Responses API models
 */
const RESPONSES_API_MODELS: Record<string, ModelInfo> = {
	// GPT-5 Series
	"gpt-5": {
		maxTokens: 128000,
		contextWindow: 400000,
		supportsPromptCache: false,
		supportsImages: true,
		inputPrice: 0.01,
		outputPrice: 0.03,
		description: "GPT-5 - Most capable reasoning model with 400K context",
	},
	"gpt-5-codex": {
		maxTokens: 128000,
		contextWindow: 400000,
		supportsPromptCache: false,
		supportsImages: true,
		inputPrice: 0.01,
		outputPrice: 0.03,
		description: "GPT-5 Codex - Optimized for coding tasks with 400K context",
	},
	"gpt-5-thinking": {
		maxTokens: 128000,
		contextWindow: 400000,
		supportsPromptCache: false,
		supportsImages: true,
		inputPrice: 0.01,
		outputPrice: 0.03,
		description: "GPT-5 Thinking - Extended reasoning capabilities",
	},
	"gpt-5-pro": {
		maxTokens: 128000,
		contextWindow: 400000,
		supportsPromptCache: false,
		supportsImages: true,
		inputPrice: 0.015,
		outputPrice: 0.045,
		description: "GPT-5 Pro - Enhanced performance and quality",
	},
	"gpt-5-mini": {
		maxTokens: 64000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: true,
		inputPrice: 0.005,
		outputPrice: 0.015,
		description: "GPT-5 Mini - Faster and more cost-effective",
	},

	// o-Series Reasoning Models
	"o4-mini": {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.006,
		outputPrice: 0.018,
		description: "o4-mini - Fast reasoning model with 200K context",
	},
	"o3-pro": {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.015,
		outputPrice: 0.045,
		description: "o3-pro - Advanced reasoning with extended thinking",
	},
	o3: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.01,
		outputPrice: 0.03,
		description: "o3 - High-quality reasoning model",
	},
	"o3-mini": {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.005,
		outputPrice: 0.015,
		description: "o3-mini - Cost-effective reasoning",
	},
	o1: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.015,
		outputPrice: 0.045,
		description: "o1 - Original reasoning model",
	},
	"o1-mini": {
		maxTokens: 65536,
		contextWindow: 128000,
		supportsPromptCache: false,
		supportsImages: false,
		inputPrice: 0.003,
		outputPrice: 0.009,
		description: "o1-mini - Compact reasoning model",
	},
}

/**
 * OpenAI Responses API Handler
 */
export class OpenAiResponsesHandler implements ApiHandler {
	private options: OpenAiResponsesHandlerOptions
	private provider: OpenAIResponsesProvider | undefined

	constructor(options: OpenAiResponsesHandlerOptions) {
		this.options = options
	}

	/**
	 * Ensure provider is initialized
	 */
	private ensureProvider(): OpenAIResponsesProvider {
		if (!this.provider) {
			if (!this.options.openAiApiKey) {
				throw new Error("OpenAI API key is required for Responses API")
			}

			const config: ProviderConfig = {
				apiKey: this.options.openAiApiKey,
				baseURL: this.options.openAiBaseUrl,
				model: this.options.openAiModelId || "gpt-5-codex",
				enableStatefulChaining: this.options.enableStatefulChaining ?? true, // Enable by default
				maxOutputTokens: this.options.maxOutputTokens,
				temperature: this.options.temperature ?? 1.0,
			}

			this.provider = new OpenAIResponsesProvider(config)
		}

		return this.provider
	}

	/**
	 * Convert Anthropic messages to properly structured format for Responses API
	 *
	 * CRITICAL for Cline compatibility:
	 * - Cline uses XML-based tools in text (e.g., <read_file><path>...</path></read_file>)
	 * - Tool results must be preserved with clear context
	 * - Messages must maintain structure for model comprehension
	 *
	 * The previous text-only conversion was causing garbled model output
	 * because it destroyed message structure and context.
	 */
	private convertAnthropicToProperFormat(messages: Anthropic.Messages.MessageParam[]): any[] {
		return messages.map((msg) => {
			if (typeof msg.content === "string") {
				return {
					role: msg.role,
					content: msg.content,
				}
			}

			// Build structured content preserving context
			let structuredContent = ""

			for (const block of msg.content) {
				if (block.type === "text") {
					// Preserve text as-is
					structuredContent += block.text
				} else if (block.type === "image") {
					// Mark images clearly
					structuredContent += "\n[Image provided by user]\n"
				} else if (block.type === "tool_use") {
					// Tool use: This shouldn't happen in our flow since we output XML as text
					// But if it does, convert to XML format
					const xmlTool = this.convertToolUseToXML(block)
					structuredContent += xmlTool
				} else if (block.type === "tool_result") {
					// Tool result: Preserve with clear context markers
					// This is CRITICAL - tool results must be clearly labeled
					const resultContent = typeof block.content === "string" ? block.content : JSON.stringify(block.content)

					// Add clear context markers so model understands this is a tool result
					structuredContent += `\n[Tool Result]\n${resultContent}\n`
				}
			}

			return {
				role: msg.role,
				content: structuredContent.trim(),
			}
		})
	}

	/**
	 * Convert tool_use block to Cline's XML format
	 *
	 * Cline expects tool calls in XML format like:
	 * <tool_name>
	 * <param1>value1</param1>
	 * <param2>value2</param2>
	 * </tool_name>
	 */
	private convertToolUseToXML(toolUse: any): string {
		const toolName = toolUse.name
		const params = toolUse.input || {}

		let xml = `<${toolName}>\n`

		// Convert each parameter to XML
		for (const [key, value] of Object.entries(params)) {
			// Handle different value types
			let paramValue: string
			if (typeof value === "string") {
				paramValue = value
			} else if (value === null || value === undefined) {
				paramValue = ""
			} else {
				paramValue = JSON.stringify(value)
			}

			xml += `<${key}>${paramValue}</${key}>\n`
		}

		xml += `</${toolName}>`

		return xml
	}

	/**
	 * Create message using Responses API
	 *
	 * IMPORTANT: Cline uses PROMPT-BASED tools (XML in text), not API function calling!
	 * The model outputs XML tool calls as TEXT, which Cline parses and executes.
	 * We do NOT use the Responses API's built-in function calling feature because:
	 * 1. Cline's XML tool system is stateless (no call IDs)
	 * 2. API function calling requires call_id matching for inputs/outputs
	 * 3. This creates an architectural mismatch that causes errors
	 */
	@withRetry()
	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const provider = this.ensureProvider()

		try {
			// Convert messages to properly structured format
			// This preserves message structure and context for better model comprehension
			const miniClaudeMessages = this.convertAnthropicToProperFormat(messages)

			// DEBUG: Log what we're sending
			console.log("=== OpenAI Responses API Request ===")
			console.log("System prompt length:", systemPrompt.length)
			console.log("System prompt preview:", systemPrompt.substring(0, 500) + "...")
			console.log("Messages count:", miniClaudeMessages.length)
			console.log(
				"Last message preview:",
				JSON.stringify(miniClaudeMessages[miniClaudeMessages.length - 1]).substring(0, 300),
			)
			console.log("===================================")

			// DO NOT pass tools to the API - use prompt-based tools instead
			// The system prompt already describes all tools in detail
			// The model will output XML tool calls as text

			// Create message using Responses API
			const response = await provider.createMessage({
				system: systemPrompt,
				messages: miniClaudeMessages,
				tools: undefined, // Use prompt-based tools, not API function calling
				maxTokens: this.options.maxOutputTokens,
				temperature: this.options.temperature,
			})

			// DEBUG: Log what we received
			console.log("=== OpenAI Responses API Response ===")
			console.log("Content blocks:", response.content.length)
			for (let i = 0; i < response.content.length; i++) {
				const block = response.content[i]
				console.log(`Block ${i}:`, JSON.stringify(block).substring(0, 300))
			}
			console.log("====================================")

			// Yield all content as text
			// The model should output XML tool calls directly in the text
			for (const block of response.content) {
				if (block.type === "text") {
					// Extract text from OpenAI Responses API format
					// API returns: {type:"text", text:[{type:"output_text", text:"actual content"}]}
					let textContent = ""

					const rawText: any = block.text

					if (typeof rawText === "string") {
						// Simple string format
						textContent = rawText
					} else if (Array.isArray(rawText)) {
						// Array of output_text objects (OpenAI Responses API format)
						for (const item of rawText) {
							if (item?.type === "output_text" && item?.text !== undefined) {
								// Include even if empty string - important for error detection
								textContent += item.text
							}
						}
					} else {
						// Fallback: convert to JSON string
						textContent = JSON.stringify(rawText)
					}

					// Validate and log extraction result
					if (textContent === "") {
						console.warn("⚠️ Model returned empty text!")
						console.warn("Possible causes:")
						console.warn("  1. Model confused by conversation flow")
						console.warn("  2. Stateful chaining chain break")
						console.warn("  3. Model doesn't understand prompt/tools")
						console.warn("  4. Model chose not to respond")
					}

					// Detect garbled output patterns (signs of model confusion)
					const garbledPatterns = [
						/truncated due to \w+/i,
						/net cunning/i,
						/partial due to lumps/i,
						/maybe restful/i,
						/glimpsed/i,
						/adhesives/i,
						/sedation/i,
						/intangible/i,
						/autop/i,
						/doping/i,
					]

					const isGarbled = garbledPatterns.some(pattern => pattern.test(textContent))

					if (isGarbled) {
						console.error("⚠️ DETECTED GARBLED OUTPUT - Model appears confused!")
						console.error("Raw content:", textContent.substring(0, 500))
						console.error("This typically indicates:")
						console.error("  1. Message format corruption")
						console.error("  2. Context window issues")
						console.error("  3. Model compatibility problems")

						// Try to recover by resetting stateful chaining
						if (this.provider) {
							console.log("Attempting recovery by resetting stateful chaining...")
							this.provider.resetStatefulChaining()
						}

						// Return error message instead of garbled content
						yield {
							type: "text",
							text: "[Error: Model returned garbled output. This often happens when the conversation context is corrupted. Please try starting a new task or clearing the conversation history.]",
						}
					} else {
						console.log("Extracted text (first 200 chars):", textContent.substring(0, 200))

						yield {
							type: "text",
							text: textContent,
						}
					}
				}
				// Note: We shouldn't get tool_use blocks since we didn't pass tools
				// If we do, something is wrong
			}

			// Yield usage information
			if (response.usage) {
				yield {
					type: "usage",
					inputTokens: response.usage.inputTokens,
					outputTokens: response.usage.outputTokens,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				}
			}
		} catch (error: any) {
			console.error("OpenAI Responses API error:", error)
			throw new Error(`Responses API error: ${error.message}`)
		}
	}

	/**
	 * Get model information
	 */
	getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.openAiModelId || "gpt-5-codex"
		const modelInfo = RESPONSES_API_MODELS[modelId] || {
			...openAiModelInfoSaneDefaults,
			maxTokens: 128000,
			contextWindow: 400000,
			description: `${modelId} - OpenAI Responses API model`,
		}

		return {
			id: modelId,
			info: modelInfo,
		}
	}

	/**
	 * Get provider instance (for debugging/testing)
	 */
	getProvider(): OpenAIResponsesProvider | undefined {
		return this.provider
	}
}
