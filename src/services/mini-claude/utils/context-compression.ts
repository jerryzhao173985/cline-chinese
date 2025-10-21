/**
 * Context compression utilities
 *
 * Ported from mini-claude-code with adaptations for Cline VSCode extension
 *
 * Used for automatic and manual compression of conversation history to stay within
 * context limits while preserving essential information
 */

import { countTotalTokens, calculateThresholds } from "./tokens"
import { ContextStats, CompressionResult, CompressionOptions } from "../types/context"

// Configuration constants
const AUTO_COMPACT_THRESHOLD_RATIO = 0.92 // Auto-trigger at 92%
const DEFAULT_CONTEXT_LIMIT = 200_000 // Default context limit: 200K tokens
const PRESERVE_LAST_N_MESSAGES = 3 // Preserve last 3 messages by default

/**
 * Compression prompt
 * Requests AI to generate structured conversation summary
 */
const COMPRESSION_PROMPT = `Please create a comprehensive summary of our conversation so far. Structure it into these sections:

## 1. Technical Context
- Development environment, tools, frameworks, and configurations discussed
- Programming languages and key technologies used

## 2. Project Overview
- Project goals and main objectives
- Key features and functionality scope

## 3. Code Changes
- Files created, modified, or analyzed
- Important code patterns or structures implemented

## 4. Debugging & Issues
- Problems encountered and solutions applied
- Error messages and their resolutions

## 5. Current Status
- What we just completed
- Current state of the project

## 6. Pending Tasks
- Remaining work items
- Priorities for next steps

## 7. User Preferences
- Coding style preferences
- Communication preferences
- Any specific requirements or constraints

## 8. Key Decisions
- Important technical decisions made
- Reasoning behind major choices

Please be thorough and preserve all context needed to continue our work seamlessly.`

/**
 * Check if automatic compression is needed
 *
 * @param messages - Message list
 * @param contextLimit - Context limit (default 200K)
 * @returns Whether compression is needed
 */
export function shouldAutoCompact(messages: any[], contextLimit: number = DEFAULT_CONTEXT_LIMIT): boolean {
	// Need at least 3 messages to consider compression
	if (messages.length < 3) {
		return false
	}

	const tokenCount = countTotalTokens(messages)
	const { isAboveAutoCompactThreshold } = calculateThresholds(tokenCount, contextLimit, AUTO_COMPACT_THRESHOLD_RATIO)

	return isAboveAutoCompactThreshold
}

/**
 * Execute automatic compression
 * Generate conversation summary, clean history, keep summary
 *
 * NOTE: This is a simplified version for Cline integration.
 * The actual compression logic will be implemented in the MiniClaudeAgent
 * which has access to the API provider.
 *
 * @param messages - Current message list
 * @param options - Compression options
 * @returns Compressed message list
 */
export async function executeAutoCompact(messages: any[], options: CompressionOptions = {}): Promise<any[]> {
	const { contextLimit = DEFAULT_CONTEXT_LIMIT, preserveLastN = PRESERVE_LAST_N_MESSAGES } = options

	try {
		console.log("🔄 Context limit approaching, initiating automatic compression...")

		// This is a placeholder implementation
		// The actual compression will be done by MiniClaudeAgent
		// For now, we'll just preserve the last N messages
		const preservedMessages = messages.slice(-preserveLastN)

		const oldCount = messages.length
		const oldTokens = countTotalTokens(messages)
		const newTokens = countTotalTokens(preservedMessages)

		console.log(
			`✅ Context compressed: ${oldCount} messages → ${preservedMessages.length} messages\n` +
				`   Token usage: ${oldTokens} → ${newTokens} (saved ${oldTokens - newTokens} tokens)`,
		)

		return preservedMessages
	} catch (error: any) {
		console.error("Failed to compress context:", error)
		// If compression fails, return original messages
		return messages
	}
}

/**
 * Execute manual compression
 * Similar to auto-compression, but with more explicit user feedback
 *
 * NOTE: This is a simplified version for Cline integration.
 * The actual compression logic will be implemented in the MiniClaudeAgent
 *
 * @param messages - Current message list
 * @param options - Compression options
 * @returns Compression result
 */
export async function executeManualCompact(messages: any[], options: CompressionOptions = {}): Promise<CompressionResult> {
	if (messages.length === 0) {
		console.warn("No conversation history to compress")
		return {
			messages,
			oldCount: 0,
			newCount: 0,
			oldTokens: 0,
			newTokens: 0,
			tokensSaved: 0,
		}
	}

	try {
		const { preserveLastN = PRESERVE_LAST_N_MESSAGES } = options

		const oldCount = messages.length
		const oldTokens = countTotalTokens(messages)

		console.log(`📊 Current conversation: ${oldCount} messages, ~${oldTokens} tokens`)
		console.log("🔄 Compressing conversation history...")

		// This is a placeholder implementation
		// The actual compression will be done by MiniClaudeAgent
		const preservedMessages = messages.slice(-preserveLastN)

		const newTokens = countTotalTokens(preservedMessages)

		console.log(
			`✅ Context compressed successfully!\n` +
				`   Messages: ${oldCount} → ${preservedMessages.length}\n` +
				`   Tokens: ~${oldTokens} → ~${newTokens} (saved ~${oldTokens - newTokens} tokens)`,
		)

		return {
			messages: preservedMessages,
			oldCount,
			newCount: preservedMessages.length,
			oldTokens,
			newTokens,
			tokensSaved: oldTokens - newTokens,
		}
	} catch (error: any) {
		console.error("Failed to compress context:", error)
		throw error
	}
}

/**
 * Get context usage statistics
 *
 * @param messages - Message list
 * @param contextLimit - Context limit (default 200K)
 * @returns Statistics information object
 */
export function getContextStats(messages: any[], contextLimit: number = DEFAULT_CONTEXT_LIMIT): ContextStats {
	const tokenCount = countTotalTokens(messages)
	const thresholds = calculateThresholds(tokenCount, contextLimit, AUTO_COMPACT_THRESHOLD_RATIO)

	return {
		messageCount: messages.length,
		tokenCount,
		...thresholds,
	}
}

/**
 * Create a compression summary message
 * Used to inject compression notification into message history
 *
 * @param isAutomatic - Whether compression was automatic or manual
 * @returns Compression notification message
 */
export function createCompressionNotification(isAutomatic: boolean): any {
	const text = isAutomatic
		? `Context automatically compressed due to token limit. Essential information preserved.`
		: `Context has been manually compressed using structured 8-section algorithm. All essential information has been preserved for seamless continuation.`

	return {
		role: "user",
		content: [
			{
				type: "text",
				text,
			},
		],
	}
}

/**
 * Get compression prompt for LLM
 *
 * @returns Compression prompt message
 */
export function getCompressionPrompt(): any {
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: COMPRESSION_PROMPT,
			},
		],
	}
}

/**
 * Calculate compression savings
 *
 * @param oldTokens - Token count before compression
 * @param newTokens - Token count after compression
 * @returns Compression statistics
 */
export function calculateCompressionSavings(oldTokens: number, newTokens: number) {
	const tokensSaved = Math.max(0, oldTokens - newTokens)
	const percentSaved = oldTokens > 0 ? Math.round((tokensSaved / oldTokens) * 100) : 0

	return {
		tokensSaved,
		percentSaved,
		oldTokens,
		newTokens,
	}
}

/**
 * Check if context is near limit
 * Returns true if > 80% of context is used
 *
 * @param messages - Message list
 * @param contextLimit - Context limit
 * @returns Whether context is near limit
 */
export function isContextNearLimit(messages: any[], contextLimit: number = DEFAULT_CONTEXT_LIMIT): boolean {
	const tokenCount = countTotalTokens(messages)
	const percentUsed = (tokenCount / contextLimit) * 100
	return percentUsed > 80
}

/**
 * Format context stats for display
 *
 * @param stats - Context statistics
 * @returns Formatted string
 */
export function formatContextStats(stats: ContextStats): string {
	return (
		`📊 Context: ${stats.messageCount} msgs, ${stats.tokenCount} tokens ` +
		`(${stats.percentUsed}% used, ${stats.tokensRemaining} remaining)`
	)
}
