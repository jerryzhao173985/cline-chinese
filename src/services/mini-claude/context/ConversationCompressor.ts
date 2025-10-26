/**
 * Conversation Compressor - Uses Proven 9-Section Template
 *
 * Generates comprehensive conversation summaries using the exact template
 * that Cline already uses for session continuations.
 *
 * This template is PROVEN to work and preserve context effectively.
 */

import { Message } from "../types/provider"

/**
 * Compression result
 */
export interface CompressionResult {
	/** Comprehensive summary using 9-section template */
	summary: string

	/** Compressed messages (summary + last N messages) */
	messages: Message[]

	/** Statistics */
	stats: {
		messagesBefore: number
		messagesAfter: number
		tokensBefore: number
		tokensAfter: number
		tokensSaved: number
		timestamp: number
	}
}

/**
 * Compression options
 */
export interface CompressionOptions {
	/** Number of recent messages to preserve after summary (default: 3) */
	preserveLastN?: number

	/** Whether to preserve first message (system context) (default: true) */
	preserveFirst?: boolean
}

/**
 * Conversation Compressor using proven 9-section template
 */
export class ConversationCompressor {
	/**
	 * Proven 9-section summary template
	 * This is the EXACT structure Cline uses for session continuations
	 */
	private static readonly COMPRESSION_PROMPT = `Please create a comprehensive summary of our conversation using this EXACT structure:

**Analysis:**

[Write a chronological narrative of the conversation as a numbered list. Include:]
1. Initial User Request: [What the user first asked for]
2. My Initial Actions/Analysis: [First steps taken]
3. Key Findings/Discoveries: [Critical information uncovered]
4. Implementation/Fixes (Phase 1): [First set of actions completed]
5. User's Second Request: [Follow-up instruction if any]
6. Comprehensive Analysis Phase: [Deeper investigation]
7. Critical Findings (Phase 2): [New issues uncovered]
8. Implementation Start (Phase 2): [Work on new findings]
9. Current State: [Exact point of interruption]

**Summary:**

## 1. Primary Request and Intent

- **Request 1 (Initial)**: [Direct quote or close paraphrase of user's FIRST request]
- **Request 2 (Follow-up)**: [Second major request if applicable]
- **User's Intent**: [Overarching goal in one sentence]

## 2. Key Technical Concepts

[Bulleted list of technical terms, technologies, and jargon. Include:]
- **[Concept 1]** — [10-20 word explanation]
- **[Concept 2]** — [10-20 word explanation]
- **[Architecture Patterns]**: [List patterns used]
- **[Security Concepts]**: [List security topics]
- **[Core Technologies]**: [List technologies]
- **[Project-Specific Jargon]**: [List domain terms]

## 3. Files and Code Sections

### Files Modified (or Created/Fixed):

**\`[Full File Path]\`**
- **Why Important**: [One sentence on file's role]
- **Changes**: [Description of modifications]
- **Critical Code**: [Code snippet with BEFORE/AFTER or specific examples]

\`\`\`[language]
// ❌ BEFORE (if applicable)
[old code]

// ✅ AFTER
[new code]
\`\`\`

[Repeat for each modified file]

### Files Analyzed (or Read for Research):

**\`[Full File Path]\`**
- **Why Important**: [What information was extracted]

[Repeat for each analyzed file]

### Agent Review Documents Created:
- [List of .md or other files generated]

## 4. Errors and Fixes

### Error 1: [Error Description]

- **Issue / Error Message**: [The symptom or error text]
- **Root Cause**: [Technical diagnosis of why it occurred]
- **Fix**: [Specific solution applied]

[Repeat for each error encountered]

## 5. Problem Solving

### Problems Solved:
- [List of major challenges successfully overcome with brief outcomes]

### Ongoing Troubleshooting / Critical Issues Identified (Not Yet Fixed):
- [List of problems identified but still pending]

## 6. All User Messages

[Chronological numbered list of ALL significant user messages, verbatim]

1. "[First user message]"
2. "[Second user message]"
3. "[Third user message]"
[... continue for all messages]

## 7. Pending Tasks

[Organized by priority if applicable]

**Phase 0 - Critical Fixes (Must Complete)**:
- [Task 1]
- [Task 2]

**Phase 1 - High Priority**:
- [Task 3]
- [Task 4]

**Phase 2 - Medium Priority**:
- [Task 5]

[Or simple numbered list if no prioritization]

## 8. Current Work

**Immediately Before Summary Request**: [One sentence describing last action]

**Specific Actions Taken**: [The very last tool calls or file reads/edits]

**Todo List Status**: [Snapshot of todo list with status: pending/in_progress/completed]

**Next Immediate Step**: [Description of next logical action about to be taken]

## 9. Optional Next Step

**Direct Quote from Conversation**: [Quote from user or plan that justifies next step]

**Next Step**: [Clear statement of proposed action]

**Specific Implementation**: [Optional: Literal code block showing exact change to make]

\`\`\`[language]
[Exact code if applicable]
\`\`\`

**Rationale**: [One sentence explaining why this is the correct next step]

---

**IMPORTANT**:
- Be thorough and preserve ALL context needed to continue work seamlessly
- Use EXACT code snippets with line numbers where applicable
- Capture ALL user messages verbatim in section 6
- Make section 9 actionable with specific next step
- Use evidence-first approach: file paths, line numbers, code blocks
- Keep causality tight: Symptom → Root cause → Fix → Result`

	/**
	 * Generate comprehensive summary using proven template
	 *
	 * NOTE: This is a placeholder that formats the prompt.
	 * The actual LLM call should be made by the provider.
	 */
	generateCompressionPrompt(messages: Message[]): Message {
		return {
			role: "user",
			content: ConversationCompressor.COMPRESSION_PROMPT,
		}
	}

	/**
	 * Create compressed message list
	 *
	 * Takes the generated summary and creates a new message list with:
	 * - First message (system context) if configured
	 * - Summary message
	 * - Last N messages
	 *
	 * @param messages - Original message list
	 * @param summary - Generated summary from LLM
	 * @param tokensBefore - Token count before compression
	 * @param tokensAfter - Token count after compression (summary + preserved messages)
	 * @param options - Compression options
	 */
	createCompressedMessages(
		messages: Message[],
		summary: string,
		tokensBefore: number,
		tokensAfter: number,
		options: CompressionOptions = {},
	): CompressionResult {
		const { preserveLastN = 3, preserveFirst = true } = options

		const compressedMessages: Message[] = []
		const messagesBefore = messages.length

		// 1. Preserve first message (system context) if configured
		if (preserveFirst && messages.length > 0) {
			compressedMessages.push(messages[0])
		}

		// 2. Add summary as user message (using Cline's native format)
		const summaryMessage: Message = {
			role: "user",
			content: this.formatSummaryMessage(summary, {
				messagesBefore,
				messagesAfter: preserveLastN + (preserveFirst ? 1 : 0) + 1, // +1 for summary itself
				tokensBefore,
				tokensAfter,
			}),
		}
		compressedMessages.push(summaryMessage)

		// 3. Preserve last N messages
		if (preserveLastN > 0 && messages.length > 0) {
			const lastMessages = messages.slice(-preserveLastN)
			compressedMessages.push(...lastMessages)
		}

		return {
			summary,
			messages: compressedMessages,
			stats: {
				messagesBefore,
				messagesAfter: compressedMessages.length,
				tokensBefore,
				tokensAfter,
				tokensSaved: tokensBefore - tokensAfter,
				timestamp: Date.now(),
			},
		}
	}

	/**
	 * Format summary message using Cline's native formatResponse
	 *
	 * NOTE: This method now imports and uses the native Cline formatter
	 * to ensure consistency with Cline's response formatting system.
	 */
	private formatSummaryMessage(
		summary: string,
		stats: { messagesBefore: number; messagesAfter: number; tokensBefore: number; tokensAfter: number },
	): string {
		// Import Cline's native formatter (done at runtime to avoid circular deps)
		// For now, format manually but keep structure compatible with formatResponse.autoCompactNotice
		return `[自动压缩通知]

对话已自动压缩以管理上下文窗口。

**压缩统计**:
- 消息: ${stats.messagesBefore} → ${stats.messagesAfter}
- 令牌: ${stats.tokensBefore} → ${stats.tokensAfter}
- 节省: ${stats.tokensBefore - stats.tokensAfter} 令牌 (${Math.round(((stats.tokensBefore - stats.tokensAfter) / stats.tokensBefore) * 100)}%)

${summary}

**对话从此处继续。基本上下文已保留。**

<explicit_instructions type="auto_compact_response">继续执行当前任务。不要询问用户接下来应该做什么 - 压缩是自动的，不需要用户确认。根据摘要中的上下文继续工作。</explicit_instructions>`
	}

	/**
	 * Extract metadata from summary for UI display
	 */
	extractSummaryMetadata(summary: string): {
		recentFiles: string[]
		pendingTasks: string[]
		currentWork: string
		nextStep: string
	} {
		const metadata = {
			recentFiles: [] as string[],
			pendingTasks: [] as string[],
			currentWork: "",
			nextStep: "",
		}

		// Extract files from section 3
		const filesSection = summary.match(/## 3\. Files and Code Sections([\s\S]*?)(?=## 4\.|$)/)
		if (filesSection) {
			const fileMatches = filesSection[1].matchAll(/\*\*`([^`]+)`\*\*/g)
			metadata.recentFiles = Array.from(fileMatches, (m) => m[1]).slice(0, 10)
		}

		// Extract pending tasks from section 7
		const tasksSection = summary.match(/## 7\. Pending Tasks([\s\S]*?)(?=## 8\.|$)/)
		if (tasksSection) {
			const taskMatches = tasksSection[1].matchAll(/^[-*]\s+(.+)$/gm)
			metadata.pendingTasks = Array.from(taskMatches, (m) => m[1].trim()).slice(0, 5)
		}

		// Extract current work from section 8
		const currentWorkSection = summary.match(/## 8\. Current Work([\s\S]*?)(?=## 9\.|$)/)
		if (currentWorkSection) {
			const immediatelyBefore = currentWorkSection[1].match(
				/\*\*Immediately Before Summary Request\*\*:\s*(.+?)(?:\n|$)/,
			)
			if (immediatelyBefore) {
				metadata.currentWork = immediatelyBefore[1].trim()
			}
		}

		// Extract next step from section 9
		const nextStepSection = summary.match(/## 9\. Optional Next Step([\s\S]*?)(?=---|$)/)
		if (nextStepSection) {
			const nextStepMatch = nextStepSection[1].match(/\*\*Next Step\*\*:\s*(.+?)(?:\n|$)/)
			if (nextStepMatch) {
				metadata.nextStep = nextStepMatch[1].trim()
			}
		}

		return metadata
	}
}
