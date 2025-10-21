/**
 * Context compression and token management types
 *
 * These types support the context compression and token utilities
 * ported from mini-claude-code
 */

/**
 * Threshold information for context compression
 */
export interface ThresholdInfo {
	isAboveAutoCompactThreshold: boolean
	percentUsed: number
	tokensRemaining: number
	contextLimit: number
	autoCompactThreshold: number
}

/**
 * Context usage statistics
 */
export interface ContextStats {
	messageCount: number
	tokenCount: number
	isAboveAutoCompactThreshold: boolean
	percentUsed: number
	tokensRemaining: number
	contextLimit: number
	autoCompactThreshold: number
}

/**
 * Context compression options
 */
export interface CompressionOptions {
	contextLimit?: number
	preserveLastN?: number
}

/**
 * Compression result
 */
export interface CompressionResult {
	messages: any[]
	oldCount: number
	newCount: number
	oldTokens: number
	newTokens: number
	tokensSaved: number
}
