/**
 * Todo management types
 *
 * These types support the todo manager and reminder system
 * ported from mini-claude-code
 */

/**
 * Todo status types
 */
export const TODO_STATUSES = ["pending", "in_progress", "completed"] as const
export type TodoStatus = (typeof TODO_STATUSES)[number]

/**
 * Todo item interface
 */
export interface TodoItem {
	id: string
	content: string
	status: TodoStatus
	activeForm?: string
}

/**
 * Todo statistics interface
 */
export interface TodoStats {
	total: number
	completed: number
	in_progress: number
	pending: number
}

/**
 * Agent state interface for reminder system
 */
export interface AgentState {
	roundsWithoutTodo: number
	lastTodoRound: number
	totalRounds: number
}

/**
 * Context block type for reminders
 */
export interface ContextBlock {
	type: "text"
	text: string
}
