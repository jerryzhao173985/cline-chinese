import { openAiResponsesModels } from "@shared/api"
import { ApiKeyField } from "../common/ApiKeyField"
import { ModelSelector } from "../common/ModelSelector"
import { ModelInfoView } from "../common/ModelInfoView"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"
import { Mode } from "@shared/storage/types"
import { VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

/**
 * Props for the OpenAIResponsesProvider component
 */
interface OpenAIResponsesProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The OpenAI Responses API provider configuration component
 *
 * Supports GPT-5 series and o-series reasoning models with features like:
 * - Stateful conversation chaining (30-60% faster)
 * - Async response polling for long-running requests
 * - Reasoning effort configuration for thinking models
 */
export const OpenAIResponsesProvider = ({ showModelOptions, isPopup, currentMode }: OpenAIResponsesProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.openAiApiKey || ""}
				onChange={(value) => handleFieldChange("openAiApiKey", value)}
				providerName="OpenAI Responses API"
				signupUrl="https://platform.openai.com/api-keys"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						models={openAiResponsesModels}
						selectedModelId={selectedModelId}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						label="模型"
					/>

					<ModelInfoView selectedModelId={selectedModelId} modelInfo={selectedModelInfo} isPopup={isPopup} />

					{/* Stateful Chaining Option */}
					<div style={{ marginTop: 10 }}>
						<VSCodeCheckbox
							checked={apiConfiguration?.openAiResponsesEnableStatefulChaining ?? false}
							onChange={(e: any) => handleFieldChange("openAiResponsesEnableStatefulChaining", e.target.checked)}>
							<span style={{ fontWeight: "500" }}>启用状态链 (可选)</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							使用 previous_response_id 在多轮对话中保持推理状态。启用后可提速 30-60%。
						</p>
					</div>

					{/* Temperature Option */}
					<div style={{ marginTop: 10 }}>
						<VSCodeTextField
							value={String(apiConfiguration?.openAiResponsesTemperature ?? 1.0)}
							onInput={(e: any) => {
								const value = parseFloat(e.target.value)
								if (!isNaN(value) && value >= 0 && value <= 2) {
									handleFieldChange("openAiResponsesTemperature", value)
								}
							}}
							style={{ width: "100%" }}>
							<span slot="label" style={{ fontWeight: "500" }}>
								温度 (0.0 - 2.0)
							</span>
						</VSCodeTextField>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							控制输出的随机性。较低的值使输出更具确定性，较高的值使输出更有创意。默认值: 1.0
						</p>
					</div>

					{/* Max Output Tokens - Plan Mode */}
					{currentMode === "plan" && (
						<div style={{ marginTop: 10 }}>
							<VSCodeTextField
								value={String(apiConfiguration?.planModeOpenAiResponsesMaxOutputTokens ?? 128000)}
								onInput={(e: any) => {
									const value = parseInt(e.target.value)
									if (!isNaN(value) && value > 0) {
										handleFieldChange("planModeOpenAiResponsesMaxOutputTokens", value)
									}
								}}
								style={{ width: "100%" }}>
								<span slot="label" style={{ fontWeight: "500" }}>
									计划模式最大输出 Token
								</span>
							</VSCodeTextField>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								计划模式下模型可以生成的最大 token 数。GPT-5: 128K, o-series: 100K
							</p>
						</div>
					)}

					{/* Max Output Tokens - Act Mode */}
					{currentMode === "act" && (
						<div style={{ marginTop: 10 }}>
							<VSCodeTextField
								value={String(apiConfiguration?.actModeOpenAiResponsesMaxOutputTokens ?? 128000)}
								onInput={(e: any) => {
									const value = parseInt(e.target.value)
									if (!isNaN(value) && value > 0) {
										handleFieldChange("actModeOpenAiResponsesMaxOutputTokens", value)
									}
								}}
								style={{ width: "100%" }}>
								<span slot="label" style={{ fontWeight: "500" }}>
									执行模式最大输出 Token
								</span>
							</VSCodeTextField>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								执行模式下模型可以生成的最大 token 数。GPT-5: 128K, o-series: 100K
							</p>
						</div>
					)}

					{/* Info Banner */}
					<div
						style={{
							marginTop: 15,
							padding: "10px",
							backgroundColor: "var(--vscode-textBlockQuote-background)",
							borderLeft: "3px solid var(--vscode-textLink-foreground)",
							fontSize: "12px",
						}}>
						<p style={{ margin: 0, fontWeight: "500" }}>💡 OpenAI Responses API 特性</p>
						<ul style={{ margin: "5px 0 0 0", paddingLeft: "20px" }}>
							<li>支持 GPT-5 系列 (400K 上下文)</li>
							<li>支持 o-series 推理模型 (高级推理)</li>
							<li>状态链使多轮对话提速 30-60%</li>
							<li>异步响应轮询处理长时间请求</li>
						</ul>
					</div>
				</>
			)}
		</div>
	)
}
