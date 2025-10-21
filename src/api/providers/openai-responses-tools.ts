/**
 * OpenAI Responses API Tool Definitions for Cline
 *
 * These tool definitions match Cline's XML-based tools and are passed to the
 * OpenAI Responses API so it knows what tools are available.
 *
 * The API will return function_call blocks which we convert to XML format
 * that Cline expects.
 */

export interface Tool {
	name: string
	description: string
	input_schema: {
		type: "object"
		properties: Record<string, any>
		required: string[]
	}
}

/**
 * Cline's tool definitions in structured format
 */
export const CLINE_TOOLS: Tool[] = [
	{
		name: "execute_command",
		description:
			"Execute a CLI command on the system. Use when you need to perform system operations or run specific commands.",
		input_schema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "The CLI command to execute",
				},
				requires_approval: {
					type: "string",
					enum: ["true", "false"],
					description:
						"Whether this command requires explicit user approval (true for potentially impactful operations, false for safe operations)",
				},
			},
			required: ["command", "requires_approval"],
		},
	},
	{
		name: "read_file",
		description: "Read the contents of a file at the specified path.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The file path to read (relative to current working directory)",
				},
			},
			required: ["path"],
		},
	},
	{
		name: "write_to_file",
		description:
			"Write content to a file. If the file exists, it will be overwritten. If it doesn't exist, it will be created.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The file path to write to (relative to current working directory)",
				},
				content: {
					type: "string",
					description: "The content to write to the file",
				},
			},
			required: ["path", "content"],
		},
	},
	{
		name: "replace_in_file",
		description: "Replace specific content in a file using SEARCH/REPLACE blocks.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The file path to modify (relative to current working directory)",
				},
				diff: {
					type: "string",
					description: "The SEARCH/REPLACE blocks defining the changes",
				},
			},
			required: ["path", "diff"],
		},
	},
	{
		name: "search_files",
		description: "Search for files matching a regex pattern in a specified directory.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The directory path to search in",
				},
				regex: {
					type: "string",
					description: "The regex pattern to search for",
				},
				file_pattern: {
					type: "string",
					description: "Optional glob pattern to filter files",
				},
			},
			required: ["path", "regex"],
		},
	},
	{
		name: "list_files",
		description: "List files and directories in a specified directory.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The directory path to list",
				},
				recursive: {
					type: "string",
					enum: ["true", "false"],
					description: "Whether to list files recursively",
				},
			},
			required: ["path"],
		},
	},
	{
		name: "list_code_definition_names",
		description: "List definition names (classes, functions, etc.) in a directory or file.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The file or directory path to analyze",
				},
			},
			required: ["path"],
		},
	},
	{
		name: "browser_action",
		description: "Perform an action in the browser (launch, click, type, etc.).",
		input_schema: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "The browser action to perform",
				},
				url: {
					type: "string",
					description: "The URL (for launch action)",
				},
				coordinate: {
					type: "string",
					description: "The coordinate for click action",
				},
				text: {
					type: "string",
					description: "The text for type action",
				},
			},
			required: ["action"],
		},
	},
	{
		name: "use_mcp_tool",
		description: "Use an MCP (Model Context Protocol) tool.",
		input_schema: {
			type: "object",
			properties: {
				server_name: {
					type: "string",
					description: "The name of the MCP server",
				},
				tool_name: {
					type: "string",
					description: "The name of the tool to use",
				},
				arguments: {
					type: "string",
					description: "JSON string of arguments for the tool",
				},
			},
			required: ["server_name", "tool_name", "arguments"],
		},
	},
	{
		name: "access_mcp_resource",
		description: "Access an MCP (Model Context Protocol) resource.",
		input_schema: {
			type: "object",
			properties: {
				server_name: {
					type: "string",
					description: "The name of the MCP server",
				},
				uri: {
					type: "string",
					description: "The URI of the resource to access",
				},
			},
			required: ["server_name", "uri"],
		},
	},
	{
		name: "ask_followup_question",
		description: "Ask the user a followup question to gather more information.",
		input_schema: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description: "The question to ask the user",
				},
			},
			required: ["question"],
		},
	},
	{
		name: "attempt_completion",
		description: "Attempt to complete the task and present the result to the user.",
		input_schema: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description: "The result of the task to present to the user",
				},
			},
			required: ["result"],
		},
	},
]
