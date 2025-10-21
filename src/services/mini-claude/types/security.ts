/**
 * Security types and interfaces for mini-claude integration
 *
 * These types support the security utilities ported from mini-claude-code
 */

/**
 * Security event types for logging
 */
export enum SecurityEventType {
	DANGEROUS_COMMAND_BLOCKED = "DANGEROUS_COMMAND_BLOCKED",
	COMMAND_INJECTION_ATTEMPT = "COMMAND_INJECTION_ATTEMPT",
	ENV_VAR_FILTERED = "ENV_VAR_FILTERED",
	API_KEY_REDACTED = "API_KEY_REDACTED",
	RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
	PATH_TRAVERSAL_ATTEMPT = "PATH_TRAVERSAL_ATTEMPT",
	INVALID_INPUT = "INVALID_INPUT",
}

/**
 * Result of command danger check
 */
export interface CommandDangerCheck {
	dangerous: boolean
	reason?: string
}

/**
 * Rate limiter usage statistics
 */
export interface RateLimiterUsage {
	used: number
	remaining: number
	resetIn: number
}

/**
 * Options for SafeJSON parsing
 */
export interface SafeJSONOptions {
	maxSize?: number
	customDangerousKeys?: string[]
}

/**
 * Password hash result
 */
export interface PasswordHashResult {
	hash: string
	salt: string
}

/**
 * Spawn options for secure command execution
 */
export interface SecureSpawnOptions {
	cwd?: string
	timeout?: number
	stdio?: "pipe" | "ignore" | "inherit"
	env?: Record<string, string>
}
