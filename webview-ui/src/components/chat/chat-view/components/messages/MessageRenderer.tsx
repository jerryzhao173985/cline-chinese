import React, { useCallback } from "react"
import BrowserSessionRow from "@/components/chat/BrowserSessionRow"
import ChatRow from "@/components/chat/ChatRow"
import { ClineMessage } from "@shared/ExtensionMessage"
import { MessageHandlers } from "../../types/chatTypes"

interface MessageRendererProps {
	index: number
	messageOrGroup: ClineMessage | ClineMessage[]
	groupedMessages: (ClineMessage | ClineMessage[])[]
	modifiedMessages: ClineMessage[]
	expandedRows: Record<number, boolean>
	onToggleExpand: (ts: number) => void
	onHeightChange: (isTaller: boolean) => void
	onSetQuote: (quote: string | null) => void
	inputValue: string
	messageHandlers: MessageHandlers
}

/**
 * Specialized component for rendering different message types
 * Handles browser sessions, regular messages, and checkpoint logic
 */
export const MessageRenderer: React.FC<MessageRendererProps> = ({
	index,
	messageOrGroup,
	groupedMessages,
	modifiedMessages,
	expandedRows,
	onToggleExpand,
	onHeightChange,
	onSetQuote,
	inputValue,
	messageHandlers,
}) => {
	// Browser session group
	if (Array.isArray(messageOrGroup)) {
		return (
			<BrowserSessionRow
				key={messageOrGroup[0]?.ts}
				messages={messageOrGroup}
				isLast={index === groupedMessages.length - 1}
				lastModifiedMessage={modifiedMessages.at(-1)}
				onHeightChange={onHeightChange}
				expandedRows={expandedRows}
				onToggleExpand={onToggleExpand}
				onSetQuote={onSetQuote}
			/>
		)
	}

	// Determine if this is the last message for status display purposes
	const nextMessage = index < groupedMessages.length - 1 && groupedMessages[index + 1]
	const isNextCheckpoint = !Array.isArray(nextMessage) && nextMessage && nextMessage?.say === "checkpoint_created"
	const isLastMessageGroup = isNextCheckpoint && index === groupedMessages.length - 2
	const isLast = index === groupedMessages.length - 1 || isLastMessageGroup

	// Find the previous message for API response detection
	const messageIndex = modifiedMessages.findIndex(msg => msg.ts === messageOrGroup.ts)
	const previousMessage = messageIndex > 0 ? modifiedMessages[messageIndex - 1] : undefined

	// CRITICAL FIX: Search backwards to find the most recent api_req_started
	// The immediate previousMessage might be checkpoint_created or other intermediate messages
	// We need to skip over those to find the actual API request that triggered this response
	let apiRequestMessage: ClineMessage | undefined = undefined
	if (messageIndex > 0) {
		// Search backwards from current message
		for (let i = messageIndex - 1; i >= 0; i--) {
			const msg = modifiedMessages[i]
			if (msg.say === "api_req_started") {
				apiRequestMessage = msg
				break
			}
			// Stop searching if we hit another text message (means we've gone too far back)
			if (msg.say === "text" && !msg.partial) {
				break
			}
		}
	}

	// Regular message
	return (
		<ChatRow
			key={messageOrGroup.ts}
			message={messageOrGroup}
			isExpanded={expandedRows[messageOrGroup.ts] || false}
			onToggleExpand={onToggleExpand}
			lastModifiedMessage={modifiedMessages.at(-1)}
			isLast={isLast}
			onHeightChange={onHeightChange}
			inputValue={inputValue}
			sendMessageFromChatRow={messageHandlers.handleSendMessage}
			onSetQuote={onSetQuote}
			previousMessage={previousMessage}
			apiRequestMessage={apiRequestMessage}
		/>
	)
}

/**
 * Factory function to create the itemContent callback for Virtuoso
 * This allows us to encapsulate the rendering logic while maintaining performance
 */
export const createMessageRenderer = (
	groupedMessages: (ClineMessage | ClineMessage[])[],
	modifiedMessages: ClineMessage[],
	expandedRows: Record<number, boolean>,
	onToggleExpand: (ts: number) => void,
	onHeightChange: (isTaller: boolean) => void,
	onSetQuote: (quote: string | null) => void,
	inputValue: string,
	messageHandlers: MessageHandlers,
) => {
	return (index: number, messageOrGroup: ClineMessage | ClineMessage[]) => (
		<MessageRenderer
			index={index}
			messageOrGroup={messageOrGroup}
			groupedMessages={groupedMessages}
			modifiedMessages={modifiedMessages}
			expandedRows={expandedRows}
			onToggleExpand={onToggleExpand}
			onHeightChange={onHeightChange}
			onSetQuote={onSetQuote}
			inputValue={inputValue}
			messageHandlers={messageHandlers}
		/>
	)
}
