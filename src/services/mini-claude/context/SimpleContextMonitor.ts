/**
 * Simple Context Monitor - Single Threshold Approach
 *
 * Monitors context window usage and triggers compression when approaching limit.
 * Uses one clear threshold (95%) instead of complex multi-tier system.
 */

import { countTotalTokens } from "../utils/tokens"

export interface ContextStats {
	/** Current token count */
	tokens: number

	/** Context window size */
	limit: number

	/** Percentage used (0-100) */
	percentage: number

	/** Tokens remaining */
	remaining: number

	/** Current zone */
	zone: "safe" | "warning" | "critical"

	/** Should compress now */
	shouldCompress: boolean
}

export interface ContextMonitorConfig {
	/** Context window size */
	contextWindow: number

	/** Compression threshold (default: 0.95 = 95%) */
	compressionThreshold?: number

	/** Warning threshold for UI indicator (default: 0.80 = 80%) */
	warningThreshold?: number
}

/**
 * Simple context monitor with single threshold
 */
export class SimpleContextMonitor {
	private contextWindow: number
	private compressionThreshold: number
	private warningThreshold: number

	constructor(config: ContextMonitorConfig) {
		this.contextWindow = config.contextWindow
		this.compressionThreshold = config.compressionThreshold ?? 0.95
		this.warningThreshold = config.warningThreshold ?? 0.80
	}

	/**
	 * Get current context statistics
	 */
	getStats(messages: any[]): ContextStats {
		const tokens = countTotalTokens(messages)
		const percentage = (tokens / this.contextWindow) * 100
		const remaining = this.contextWindow - tokens
		const ratio = tokens / this.contextWindow

		// Determine zone
		let zone: "safe" | "warning" | "critical"
		if (ratio >= this.compressionThreshold) {
			zone = "critical"
		} else if (ratio >= this.warningThreshold) {
			zone = "warning"
		} else {
			zone = "safe"
		}

		return {
			tokens,
			limit: this.contextWindow,
			percentage,
			remaining,
			zone,
			shouldCompress: ratio >= this.compressionThreshold,
		}
	}

	/**
	 * Check if compression should be triggered
	 */
	shouldCompress(messages: any[]): boolean {
		const stats = this.getStats(messages)
		return stats.shouldCompress
	}

	/**
	 * Update context window size (for model changes)
	 */
	updateContextWindow(newSize: number): void {
		this.contextWindow = newSize
	}

	/**
	 * Get context window size
	 */
	getContextWindow(): number {
		return this.contextWindow
	}

	/**
	 * Get compression threshold
	 */
	getCompressionThreshold(): number {
		return this.compressionThreshold
	}

	/**
	 * Set compression threshold (for user customization)
	 */
	setCompressionThreshold(threshold: number): void {
		if (threshold < 0.5 || threshold > 0.99) {
			throw new Error("Compression threshold must be between 0.5 and 0.99")
		}
		this.compressionThreshold = threshold
	}
}
