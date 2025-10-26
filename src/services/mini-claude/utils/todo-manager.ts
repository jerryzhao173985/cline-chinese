/**
 * Todo Manager
 *
 * Ported from mini-claude-code with adaptations for Cline VSCode extension
 *
 * Manages task list, state, and display for tracking multi-step tasks
 */

import { TodoItem, TodoStatus, TodoStats, TODO_STATUSES } from "../types/todo"

/**
 * TodoManager - Manages task list, state and display
 */
export class TodoManager {
	private items: TodoItem[] = []

	/**
	 * Update task list
	 * @param items - New task list
	 * @returns Rendered task view
	 */
	update(items: TodoItem[]): string {
		// Validate task count limit
		if (items.length > 20) {
			throw new Error("Cannot exceed 20 tasks")
		}

		// Validate task items
		const ids = new Set<string>()
		let inProgressCount = 0

		for (const item of items) {
			// Check required fields
			if (!item.content || item.content.trim() === "") {
				throw new Error("Task content cannot be empty")
			}

			// Check status validity
			if (!TODO_STATUSES.includes(item.status)) {
				throw new Error(`Invalid task status: ${item.status}`)
			}

			// Check ID uniqueness
			if (!item.id) {
				throw new Error("Task ID cannot be empty")
			}
			if (ids.has(item.id)) {
				throw new Error(`Duplicate task ID: ${item.id}`)
			}
			ids.add(item.id)

			// Count in-progress tasks
			if (item.status === "in_progress") {
				inProgressCount++
			}
		}

		// Ensure only one task is in progress
		if (inProgressCount > 1) {
			throw new Error("Only one task can be in progress at a time")
		}

		// Update task list
		this.items = items.map((item) => ({
			id: item.id,
			content: item.content.trim(),
			status: item.status,
			activeForm: item.activeForm,
		}))

		return this.render()
	}

	/**
	 * Render task list
	 * @returns Formatted task list string
	 */
	render(): string {
		if (this.items.length === 0) {
			return "📝 No tasks"
		}

		const lines: string[] = []
		lines.push("📝 Task List:")
		lines.push("")

		for (const item of this.items) {
			const mark = item.status === "completed" ? "☒" : "☐"
			const decoratedLine = this._decorateLine(mark, item)
			lines.push(`  ${decoratedLine}`)
		}

		return lines.join("\n")
	}

	/**
	 * Get task statistics
	 * @returns Task statistics
	 */
	stats(): TodoStats {
		const stats: TodoStats = {
			total: this.items.length,
			completed: 0,
			in_progress: 0,
			pending: 0,
		}

		for (const item of this.items) {
			if (item.status === "completed") {
				stats.completed++
			} else if (item.status === "in_progress") {
				stats.in_progress++
			} else if (item.status === "pending") {
				stats.pending++
			}
		}

		return stats
	}

	/**
	 * Decorate task line (add markers and status indicators)
	 * @param mark - Task mark (☐/☒)
	 * @param todo - Task item
	 * @returns Decorated string
	 */
	private _decorateLine(mark: string, todo: TodoItem): string {
		const text = `${mark} ${todo.content}`

		// Add status indicators
		switch (todo.status) {
			case "completed":
				return `✅ ${text}`
			case "in_progress":
				return `🔄 ${text}`
			case "pending":
			default:
				return `⏸️  ${text}`
		}
	}

	/**
	 * Get current task list
	 */
	getItems(): TodoItem[] {
		return [...this.items]
	}

	/**
	 * Clear task list
	 */
	clear(): void {
		this.items = []
	}

	/**
	 * Get in-progress task
	 * @returns In-progress task or null
	 */
	getInProgressTask(): TodoItem | null {
		return this.items.find((item) => item.status === "in_progress") || null
	}

	/**
	 * Get pending tasks
	 * @returns Array of pending tasks
	 */
	getPendingTasks(): TodoItem[] {
		return this.items.filter((item) => item.status === "pending")
	}

	/**
	 * Get completed tasks
	 * @returns Array of completed tasks
	 */
	getCompletedTasks(): TodoItem[] {
		return this.items.filter((item) => item.status === "completed")
	}

	/**
	 * Check if any tasks exist
	 * @returns Whether tasks exist
	 */
	hasTasks(): boolean {
		return this.items.length > 0
	}

	/**
	 * Check if all tasks are completed
	 * @returns Whether all tasks are completed
	 */
	allCompleted(): boolean {
		return this.items.length > 0 && this.items.every((item) => item.status === "completed")
	}

	/**
	 * Get completion percentage
	 * @returns Percentage of completed tasks (0-100)
	 */
	getCompletionPercentage(): number {
		if (this.items.length === 0) {
			return 0
		}
		const completed = this.items.filter((item) => item.status === "completed").length
		return Math.round((completed / this.items.length) * 100)
	}
}

// Global singleton
export const TODO_BOARD = new TodoManager()
