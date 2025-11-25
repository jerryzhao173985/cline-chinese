import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "@api/index"
import { ClineMessage } from "@/shared/ExtensionMessage"
import { MessageStateHandler } from "./message-state"
import { TaskState } from "./TaskState"

/**
 * Regenerate response from a specific conversation history point with a different model
 */
export interface RegenerateOptions {
	/** The model to use for regeneration */
	modelId: string
	/** The conversation history index to regenerate from */
	conversationHistoryIndex: number
	/** Whether to temporarily switch models just for this request */
	temporarySwitch?: boolean
}

export class RegenerateFromPoint {
	private messageStateHandler: MessageStateHandler
	private taskState: TaskState
	private originalApiHandler: ApiHandler
	// NOTE: We intentionally do NOT store array snapshots here.
	// Always get fresh arrays from messageStateHandler when needed.
	// This ensures we always work with the current state, not stale references.

	constructor(messageStateHandler: MessageStateHandler, taskState: TaskState, apiHandler: ApiHandler) {
		this.messageStateHandler = messageStateHandler
		this.taskState = taskState
		this.originalApiHandler = apiHandler
	}

	/**
	 * Find the ClineMessage that corresponds to a specific API request
	 */
	findApiRequestMessage(conversationHistoryIndex: number): ClineMessage | undefined {
		// Get fresh array from messageStateHandler
		const clineMessages = this.messageStateHandler.getClineMessages()
		// Find the message with matching conversationHistoryIndex and api_req_started
		return clineMessages.find(
			(msg) => msg.conversationHistoryIndex === conversationHistoryIndex && msg.say === "api_req_started",
		)
	}

	/**
	 * Get all messages up to a specific point in conversation history
	 */
	getMessagesUpToPoint(conversationHistoryIndex: number): {
		clineMessages: ClineMessage[]
		apiConversationHistory: Anthropic.MessageParam[]
	} {
		// Get fresh arrays from messageStateHandler
		const clineMessages = this.messageStateHandler.getClineMessages()
		const apiConversationHistory = this.messageStateHandler.getApiConversationHistory()

		// Get all ClineMessages up to this point
		const apiReqMessage = this.findApiRequestMessage(conversationHistoryIndex)
		if (!apiReqMessage) {
			throw new Error(`No API request found at conversation history index ${conversationHistoryIndex}`)
		}

		const messageIndex = clineMessages.indexOf(apiReqMessage)
		const clineMessagesUpToPoint = clineMessages.slice(0, messageIndex + 1)

		// Get API conversation history up to this point
		// Note: conversationHistoryIndex points to the user message,
		// so we need to include it but exclude the assistant response
		const apiConversationUpToPoint = apiConversationHistory.slice(0, conversationHistoryIndex + 1)

		return {
			clineMessages: clineMessagesUpToPoint,
			apiConversationHistory: apiConversationUpToPoint,
		}
	}

	/**
	 * Clear messages after a specific point
	 */
	async clearMessagesAfterPoint(conversationHistoryIndex: number): Promise<void> {
		// Get fresh arrays from messageStateHandler
		const clineMessages = this.messageStateHandler.getClineMessages()
		const apiConversationHistory = this.messageStateHandler.getApiConversationHistory()

		const apiReqMessage = this.findApiRequestMessage(conversationHistoryIndex)
		if (!apiReqMessage) {
			throw new Error(`No API request found at conversation history index ${conversationHistoryIndex}`)
		}

		const messageIndex = clineMessages.indexOf(apiReqMessage)

		// Keep Cline messages BEFORE the api_req_started message (not including it)
		// The regeneration will create a new api_req_started placeholder
		// If we keep the old one, we'll have duplicates in the UI
		const newClineMessages = clineMessages.slice(0, messageIndex)

		// Keep API history BEFORE the regeneration point (not including the user message at that index)
		// because restartTaskFromPoint will call recursivelyMakeClineRequests which adds it again
		const newApiHistory = apiConversationHistory.slice(0, conversationHistoryIndex)

		// Update the message state
		await this.messageStateHandler.overwriteClineMessages(newClineMessages)
		await this.messageStateHandler.overwriteApiConversationHistory(newApiHistory)
	}

	/**
	 * Create a temporary API handler with a different model
	 */
	async createTemporaryApiHandler(modelId: string): Promise<ApiHandler> {
		// Import buildApiHandler dynamically to avoid circular dependencies
		const { buildApiHandler } = await import("@api/index")

		// Create a new configuration with OpenAI Responses API provider
		// IMPORTANT: Use "openai-responses" NOT "openai" (regular OpenAI)
		// Model ID field: actModeApiModelId (NOT actModeOpenAiModelId)
		const tempConfig: any = {
			actModeApiProvider: "openai-responses",
			actModeApiModelId: modelId,
		}

		// Create new handler with the selected model
		const tempApiHandler = buildApiHandler(tempConfig, "act")

		return tempApiHandler
	}

	/**
	 * Main method to regenerate from a specific point with a different model
	 */
	async regenerateFromPoint(options: RegenerateOptions): Promise<{
		success: boolean
		error?: string
		messageToRegenerate?: Anthropic.MessageParam
		preservedTimestamp?: number
	}> {
		try {
			const { modelId, conversationHistoryIndex, temporarySwitch = true } = options

			// 1. Validate the regeneration point exists
			const apiReqMessage = this.findApiRequestMessage(conversationHistoryIndex)
			if (!apiReqMessage) {
				return {
					success: false,
					error: `Cannot find API request at index ${conversationHistoryIndex}`,
				}
			}

			// 2. CRITICAL: Preserve the timestamp from the old api_req_started message
			// We'll reuse this timestamp for the new message so React sees it as an update, not a new message
			// This prevents the duplicate spinner bug where both old and new messages appear
			const preservedTimestamp = apiReqMessage.ts

			// 3. CRITICAL: Extract the message to regenerate BEFORE clearing
			// This is the user message at conversationHistoryIndex that we need to resend
			// Get fresh array from messageStateHandler
			const apiConversationHistory = this.messageStateHandler.getApiConversationHistory()
			const messageToRegenerate = apiConversationHistory[conversationHistoryIndex]
			if (!messageToRegenerate || messageToRegenerate.role !== "user") {
				return {
					success: false,
					error: `Expected user message at conversation history index ${conversationHistoryIndex}`,
				}
			}

			// 4. Clear messages after this point (this will delete messageToRegenerate from history)
			await this.clearMessagesAfterPoint(conversationHistoryIndex)

			// 5. Create temporary API handler if needed
			let apiHandlerToUse = this.originalApiHandler
			if (temporarySwitch && modelId !== this.originalApiHandler.getModel().id) {
				apiHandlerToUse = await this.createTemporaryApiHandler(modelId)
			}

			// 6. Update task state to indicate regeneration
			this.taskState.isRegeneratingFromPoint = true
			this.taskState.regenerationPoint = conversationHistoryIndex
			this.taskState.regenerationModel = modelId

			// 7. Return the prepared state with the extracted message and preserved timestamp
			return {
				success: true,
				messageToRegenerate: messageToRegenerate,
				preservedTimestamp: preservedTimestamp,
			}

			// The actual regeneration will be handled by the main task loop
			// which will use the cleared message history and the extracted message
		} catch (error) {
			console.error("Error regenerating from point:", error)
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	/**
	 * Get all regeneration points (API requests) in the conversation
	 */
	getRegenerationPoints(): Array<{
		index: number
		conversationHistoryIndex: number
		timestamp: number
		cost?: number
		model?: string
	}> {
		// Get fresh array from messageStateHandler
		const clineMessages = this.messageStateHandler.getClineMessages()

		const points: Array<{
			index: number
			conversationHistoryIndex: number
			timestamp: number
			cost?: number
			model?: string
		}> = []

		clineMessages.forEach((msg, index) => {
			if (msg.say === "api_req_started" && msg.conversationHistoryIndex !== undefined) {
				let cost: number | undefined
				let model: string | undefined

				if (msg.text) {
					try {
						const info = JSON.parse(msg.text)
						cost = info.cost
						model = info.model
					} catch (e) {
						// Ignore parse errors
					}
				}

				points.push({
					index,
					conversationHistoryIndex: msg.conversationHistoryIndex,
					timestamp: msg.ts,
					cost,
					model,
				})
			}
		})

		return points
	}

	/**
	 * Check if we can regenerate from a specific point
	 */
	canRegenerateFromPoint(conversationHistoryIndex: number): boolean {
		// Check if the point exists
		const apiReqMessage = this.findApiRequestMessage(conversationHistoryIndex)
		if (!apiReqMessage) {
			return false
		}

		// Check if task is in a state where regeneration is allowed
		if (this.taskState.abort) {
			return false
		}

		// Check if we're not already regenerating
		if (this.taskState.isRegeneratingFromPoint) {
			return false
		}

		return true
	}
}
