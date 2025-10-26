import React, { useState, useRef, useEffect } from 'react'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import styled from 'styled-components'
import type { ApiProvider } from '../../../../src/shared/api'

interface ModelSwitcherDropdownProps {
	currentModel: string
	conversationHistoryIndex?: number
	onRegenerate: (modelId: string, conversationHistoryIndex: number) => void
	provider: ApiProvider
	isLastApiResponse?: boolean
	isResponseComplete?: boolean
}

const DropdownContainer = styled.div`
	position: relative;
	display: inline-flex;
	align-items: center;
	margin-left: 8px;
	flex-shrink: 0;
	min-width: fit-content;
`

const DropdownButton = styled(VSCodeButton)`
	font-size: 11px !important;
	padding: 4px 8px !important;
	height: auto !important;
	min-height: 22px;
	opacity: 0.7;
	transition: opacity 0.2s;
	display: inline-flex !important;
	flex-direction: row !important;
	align-items: center !important;
	white-space: nowrap !important;
	flex-shrink: 0;
	gap: 4px;
	width: auto !important;
	min-width: fit-content;

	& > span {
		display: inline-block;
		writing-mode: horizontal-tb !important;
		text-orientation: mixed !important;
	}

	&:hover {
		opacity: 1;
	}
`

const DropdownMenu = styled.div<{ isOpen: boolean }>`
	display: ${props => props.isOpen ? 'block' : 'none'};
	position: absolute;
	bottom: 100%;
	left: 0;
	margin-bottom: 4px;
	background-color: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-dropdown-border);
	border-radius: 3px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	z-index: 1000;
	min-width: 250px;
	max-height: 300px;
	overflow-y: auto;
`

const ModelGroup = styled.div`
	padding: 4px 0;
	border-bottom: 1px solid var(--vscode-dropdown-border);

	&:last-child {
		border-bottom: none;
	}
`

const ModelGroupLabel = styled.div`
	padding: 4px 12px;
	font-size: 11px;
	font-weight: bold;
	color: var(--vscode-descriptionForeground);
	text-transform: uppercase;
`

const ModelOption = styled.div<{ isSelected?: boolean }>`
	padding: 6px 12px;
	cursor: pointer;
	font-size: 12px;
	color: var(--vscode-dropdown-foreground);
	background-color: ${props => props.isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};

	&:hover {
		background-color: var(--vscode-list-hoverBackground);
	}
`

// Get available models based on provider
const getModelsForProvider = (provider: ApiProvider) => {
	if (provider === 'openai-responses') {
		// OpenAI Responses API models only (GPT-5, o3/o4 series)
		return {
			'GPT-5 Series': [
				{ id: 'gpt-5-codex', label: 'GPT-5 Codex (Best for coding)' },
				{ id: 'gpt-5-pro', label: 'GPT-5 Pro (Advanced reasoning)' },
				{ id: 'gpt-5', label: 'GPT-5 (General purpose)' },
				{ id: 'gpt-5-mini', label: 'GPT-5 Mini (Faster, cheaper)' },
			],
			'o-Series': [
				{ id: 'o4-mini', label: 'o4-mini (Fast reasoning)' },
				{ id: 'o3-pro', label: 'o3 Pro (Maximum capability)' },
				{ id: 'o3', label: 'o3 (Balanced performance)' },
				{ id: 'o3-mini', label: 'o3 Mini (Quick tasks)' },
			],
		}
	} else if (provider === 'openai') {
		// Regular OpenAI Chat Completions API models
		return {
			'GPT-4 Series': [
				{ id: 'gpt-4o', label: 'GPT-4o (Latest)' },
				{ id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
				{ id: 'gpt-4', label: 'GPT-4' },
			],
			'o1 Series': [
				{ id: 'o1', label: 'o1' },
				{ id: 'o1-preview', label: 'o1 Preview' },
				{ id: 'o1-mini', label: 'o1 Mini' },
			],
		}
	}
	return {}
}

export const ModelSwitcherDropdown: React.FC<ModelSwitcherDropdownProps> = ({
	currentModel,
	conversationHistoryIndex,
	onRegenerate,
	provider,
	isLastApiResponse = false,
	isResponseComplete = false,
}) => {
	const [isOpen, setIsOpen] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)

	// Get models for current provider
	const availableModels = getModelsForProvider(provider)

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false)
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	// Show for both complete and streaming responses (removed overly restrictive gate)
	if (conversationHistoryIndex === undefined) {
		return null
	}

	const handleModelSelect = (modelId: string) => {
		if (modelId !== currentModel) {
			onRegenerate(modelId, conversationHistoryIndex)
		}
		setIsOpen(false)
	}

	const getCurrentModelLabel = () => {
		for (const group of Object.values(availableModels)) {
			const model = group.find((m: { id: string; label: string }) => m.id === currentModel)
			if (model) return model.label
		}
		return currentModel
	}

	const handleButtonClick = (e: React.MouseEvent) => {
		e.stopPropagation() // Prevent click from bubbling to parent (API request bar)
		setIsOpen(!isOpen)
	}

	return (
		<DropdownContainer ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
			<DropdownButton
				appearance="icon"
				onClick={handleButtonClick}
				title={`当前模型: ${getCurrentModelLabel()}. 点击切换模型重新生成`}
			>
				<span className="codicon codicon-arrow-swap" style={{ marginRight: '4px', display: 'inline-block' }} />
				<span style={{ fontSize: '11px', display: 'inline-block', whiteSpace: 'nowrap' }}>
					重新生成
				</span>
			</DropdownButton>

			<DropdownMenu isOpen={isOpen}>
				{Object.entries(availableModels).map(([groupName, models]) => (
					<ModelGroup key={groupName}>
						<ModelGroupLabel>{groupName}</ModelGroupLabel>
						{models.map((model: { id: string; label: string }) => (
							<ModelOption
								key={model.id}
								isSelected={model.id === currentModel}
								onClick={() => handleModelSelect(model.id)}
							>
								{model.label}
								{model.id === currentModel && ' ✓'}
							</ModelOption>
						))}
					</ModelGroup>
				))}
			</DropdownMenu>
		</DropdownContainer>
	)
}

export default ModelSwitcherDropdown