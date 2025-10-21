# IMPLEMENTATION PLAN - MINI-CLAUDE-CODE + CLINE INTEGRATION

## OBJECTIVE
Integrate mini-claude-code into Cline VSCode extension:
- OpenAI Responses API (primary goal - most important)
- Agentic capabilities
- Context compression
- Todo management
- Enhanced MCP

## ARCHITECTURE DECISION
**USE MINI-CLAUDE-CODE AS BACKEND SERVICE**
- NOT a fork
- Mini-claude-code = provider layer + agent orchestration
- Cline = VSCode UI + extension services
- Clean interface between them

---

## STAGE 1: COPY CORE FILES (Day 1-2)

### 1.1 Create directory structure
```bash
mkdir -p src/services/mini-claude-code/providers
mkdir -p src/services/mini-claude-code/core
mkdir -p src/services/mini-claude-code/utils
mkdir -p src/services/mini-claude-code/security
mkdir -p src/services/mini-claude-code/types
```

### 1.2 Copy files from mini-claude-code
```bash
# Types
cp ~/mini-claude-code/src/providers/types.ts src/services/mini-claude-code/types/

# OpenAI Provider (MOST IMPORTANT)
cp ~/mini-claude-code/src/providers/openai-provider.ts src/services/mini-claude-code/providers/

# Security
cp ~/mini-claude-code/src/security/security-utils.ts src/services/mini-claude-code/security/

# Utils
cp ~/mini-claude-code/src/utils/tokens.ts src/services/mini-claude-code/utils/
cp ~/mini-claude-code/src/utils/tokens-optimized.ts src/services/mini-claude-code/utils/
cp ~/mini-claude-code/src/utils/context-compression.ts src/services/mini-claude-code/utils/

# Core
cp ~/mini-claude-code/src/core/agent.ts src/services/mini-claude-code/core/
cp ~/mini-claude-code/src/core/todo-manager.ts src/services/mini-claude-code/core/
cp ~/mini-claude-code/src/core/todo-reminder.ts src/services/mini-claude-code/core/
cp ~/mini-claude-code/src/core/mcp-client.ts src/services/mini-claude-code/core/

# Provider factory
cp ~/mini-claude-code/src/providers/factory.ts src/services/mini-claude-code/providers/
cp ~/mini-claude-code/src/providers/anthropic-provider.ts src/services/mini-claude-code/providers/
```

### 1.3 Install dependencies
```bash
cd /Users/jerry/cline-chinese
npm install openai tiktoken
```

---

## STAGE 2: FIX IMPORTS (Day 2-3)

### 2.1 Update imports in copied files
All copied files will have broken imports. Need to fix:

**In providers/openai-provider.ts:**
```typescript
// OLD
import { SafeJSON } from '../security/security-utils';
import { encoding_for_model } from 'tiktoken';

// NEW
import { SafeJSON } from '../security/security-utils';
import { encoding_for_model } from 'tiktoken';
// (already correct relative paths)
```

**In core/agent.ts:**
```typescript
// OLD
import { getTools } from '../tools/tools';
import { dispatchTool } from '../tools/dispatcher';

// NEW - point to Cline's tools
import { getTools } from '@/core/task/tools';  // Use Cline's existing tools
import { dispatchTool } from '@/core/task/ToolExecutor';  // Use Cline's dispatcher
```

**In utils/context-compression.ts:**
```typescript
// OLD
import { getProvider } from '../core/agent';

// NEW
import { LLMProvider } from '../types';
// Pass provider as parameter instead of importing
```

### 2.2 Create barrel exports
```typescript
// src/services/mini-claude-code/index.ts
export * from './providers/openai-provider';
export * from './providers/factory';
export * from './core/agent';
export * from './utils/context-compression';
export * from './security/security-utils';
export * from './types';
```

---

## STAGE 3: INTEGRATE OPENAI RESPONSES PROVIDER (Day 3-5)

### 3.1 Create adapter for Cline's ApiHandler interface
```typescript
// src/api/providers/openai-responses.ts
import { OpenAIProvider } from '@/services/mini-claude-code';
import type { ApiHandler, ApiStream } from '../index';

export class OpenAIResponsesHandler implements ApiHandler {
    private openaiProvider: OpenAIProvider;

    constructor(options: OpenAIHandlerOptions) {
        // Adapt Cline's options to mini-claude-code format
        this.openaiProvider = new OpenAIProvider({
            apiKey: options.openAiApiKey,
            baseURL: options.openAiBaseUrl,
            model: options.openAiModelId || 'gpt-5-codex',
            enableStatefulChaining: options.openAiEnableStateful ?? false
        });
    }

    async *createMessage(systemPrompt: string, messages: any[]): ApiStream {
        // Call mini-claude-code's OpenAI provider
        const response = await this.openaiProvider.createMessage({
            system: systemPrompt,
            messages: this.translateMessages(messages),
            tools: this.getTools()
        });

        // Translate response back to Cline format
        yield this.translateResponse(response);
    }

    // Translation methods
    private translateMessages(clineMessages: any[]) {
        // Convert Cline message format to mini-claude-code format
    }

    private translateResponse(miniClaudeResponse: any) {
        // Convert mini-claude-code response to Cline format
    }

    getModel() {
        return {
            id: this.openaiProvider.model,
            info: {
                maxTokens: this.openaiProvider.maxTokens,
                contextWindow: this.openaiProvider.maxTokens,
                supportsPromptCache: false
            }
        };
    }
}
```

### 3.2 Add to provider factory
```typescript
// src/api/index.ts
function createHandlerForProvider(
    apiProvider: string | undefined,
    options: Omit<ApiConfiguration, "apiProvider">,
    mode: Mode,
): ApiHandler {
    switch (apiProvider) {
        case "openai":
            // Use Responses API by default
            return new OpenAIResponsesHandler(options, mode);

        case "openai-legacy":
            // Keep old Chat Completions API for backwards compatibility
            return new OpenAIHandler(options, mode);

        case "anthropic":
            return new AnthropicHandler(options, mode);

        // ... other providers
    }
}
```

### 3.3 Add settings UI
```typescript
// webview-ui/src/components/settings/ApiOptions.tsx
<div className="provider-option">
    <label>OpenAI Provider</label>
    <select value={apiProvider} onChange={handleProviderChange}>
        <option value="openai">OpenAI Responses API (GPT-5, o-series)</option>
        <option value="openai-legacy">OpenAI Legacy (GPT-4 only)</option>
    </select>
</div>

<div className="model-option">
    <label>Model</label>
    <select value={model} onChange={handleModelChange}>
        <optgroup label="GPT-5 Series">
            <option value="gpt-5-codex">gpt-5-codex (Recommended)</option>
            <option value="gpt-5">gpt-5</option>
            <option value="gpt-5-pro">gpt-5-pro</option>
        </optgroup>
        <optgroup label="o-Series Reasoning">
            <option value="o4-mini">o4-mini</option>
            <option value="o3">o3</option>
            <option value="o3-mini">o3-mini</option>
        </optgroup>
        <optgroup label="GPT-4 Series">
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4">gpt-4</option>
        </optgroup>
    </select>
</div>

<div className="stateful-option">
    <label>
        <input
            type="checkbox"
            checked={enableStateful}
            onChange={handleStatefulChange}
        />
        Enable stateful conversation chaining
    </label>
    <p className="help-text">
        Uses previous_response_id for multi-turn reasoning.
        Best for o-series models.
    </p>
</div>
```

---

## STAGE 4: INTEGRATE CONTEXT COMPRESSION (Day 5-6)

### 4.1 Create context compression service
```typescript
// src/services/context-compression/index.ts
import {
    shouldAutoCompact,
    executeAutoCompact,
    executeManualCompact,
    getContextStats
} from '@/services/mini-claude-code/utils/context-compression';

export class ContextCompressionService {
    constructor(private provider: ApiHandler) {}

    shouldCompress(messages: any[]): boolean {
        return shouldAutoCompact(messages);
    }

    async autoCompress(messages: any[]): Promise<any[]> {
        return await executeAutoCompact(messages);
    }

    async manualCompress(messages: any[]): Promise<any[]> {
        return await executeManualCompact(messages);
    }

    getStats(messages: any[]) {
        return getContextStats(messages);
    }
}
```

### 4.2 Integrate into Task class
```typescript
// src/core/task/index.ts
import { ContextCompressionService } from '@/services/context-compression';

export class Task {
    private compressionService: ContextCompressionService;

    constructor(...) {
        this.compressionService = new ContextCompressionService(this.api);
    }

    async startTask(...) {
        // Before each API call, check compression
        if (this.compressionService.shouldCompress(this.apiConversationHistory)) {
            console.log('🗜️  Auto-compressing context...');
            this.apiConversationHistory = await this.compressionService.autoCompress(
                this.apiConversationHistory
            );

            // Update UI
            await this.say('context_compressed', {
                stats: this.compressionService.getStats(this.apiConversationHistory)
            });
        }

        // Continue with API call
        const response = await this.api.createMessage(...);
    }
}
```

### 4.3 Add manual compression command
```typescript
// src/core/task/index.ts
async handleUserMessage(text: string) {
    // Handle /compact command
    if (text.trim() === '/compact') {
        const stats = this.compressionService.getStats(this.apiConversationHistory);

        await this.say('text', {
            text: `Current context: ${stats.messageCount} messages, ${stats.tokenCount} tokens (${stats.percentUsed}%)`
        });

        this.apiConversationHistory = await this.compressionService.manualCompress(
            this.apiConversationHistory
        );

        const newStats = this.compressionService.getStats(this.apiConversationHistory);

        await this.say('text', {
            text: `Compressed to: ${newStats.messageCount} messages, ${newStats.tokenCount} tokens (${newStats.percentUsed}%)`
        });

        return;
    }

    // Normal message handling
    // ...
}
```

### 4.4 Add UI indicator
```typescript
// webview-ui/src/components/ChatRow.tsx
{message.type === 'context_compressed' && (
    <div className="context-compressed-notice">
        <span className="icon">🗜️</span>
        <span className="text">Context automatically compressed</span>
        <span className="stats">
            {message.stats.messageCount} messages,
            {message.stats.percentUsed}% used
        </span>
    </div>
)}
```

---

## STAGE 5: INTEGRATE TODO MANAGEMENT (Day 6-7)

### 5.1 Create todo service
```typescript
// src/services/todo/index.ts
import { TODO_BOARD } from '@/services/mini-claude-code/core/todo-manager';
import {
    initializeReminder,
    incrementRound,
    checkAndRemind,
    consumePendingContextBlocks
} from '@/services/mini-claude-code/core/todo-reminder';

export class TodoService {
    private initialized = false;

    initialize() {
        if (!this.initialized) {
            initializeReminder();
            this.initialized = true;
        }
    }

    incrementRound() {
        incrementRound();
    }

    getReminders() {
        checkAndRemind();
        return consumePendingContextBlocks();
    }

    getItems() {
        return TODO_BOARD.getItems();
    }

    stats() {
        return TODO_BOARD.stats();
    }

    add(todo: any) {
        TODO_BOARD.add(todo);
    }

    update(id: string, updates: any) {
        TODO_BOARD.update(id, updates);
    }

    remove(id: string) {
        TODO_BOARD.remove(id);
    }
}
```

### 5.2 Integrate into Task class
```typescript
// src/core/task/index.ts
import { TodoService } from '@/services/todo';

export class Task {
    private todoService: TodoService;

    constructor(...) {
        this.todoService = new TodoService();
        this.todoService.initialize();
    }

    async startTask(...) {
        // Increment round
        this.todoService.incrementRound();

        // Get reminders
        const reminders = this.todoService.getReminders();

        // Add reminders to last user message
        if (reminders.length > 0) {
            const lastMsg = this.apiConversationHistory[this.apiConversationHistory.length - 1];
            lastMsg.content.push(...reminders);
        }

        // Continue with API call
        // ...
    }
}
```

### 5.3 Add todo tool
```typescript
// src/core/task/tools.ts
{
    name: "todo_write",
    description: "Manage todo list for multi-step tasks",
    input_schema: {
        type: "object",
        properties: {
            todos: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        content: { type: "string" },
                        status: {
                            type: "string",
                            enum: ["pending", "in_progress", "completed"]
                        },
                        activeForm: { type: "string" }
                    },
                    required: ["content", "status", "activeForm"]
                }
            }
        },
        required: ["todos"]
    }
}
```

### 5.4 Add todo UI component
```typescript
// webview-ui/src/components/todo/TodoBoard.tsx
export const TodoBoard: React.FC = () => {
    const todos = useTodos();

    return (
        <div className="todo-board">
            <h3>Current Tasks</h3>
            {todos.map(todo => (
                <div key={todo.id} className={`todo-item ${todo.status}`}>
                    <span className="status-icon">
                        {todo.status === 'completed' && '✓'}
                        {todo.status === 'in_progress' && '⏳'}
                        {todo.status === 'pending' && '○'}
                    </span>
                    <span className="content">{todo.content}</span>
                </div>
            ))}
        </div>
    );
};

// Add to ChatView.tsx
<div className="chat-container">
    <TodoBoard />
    <ChatMessages />
</div>
```

---

## STAGE 6: ENHANCE STATUS BAR (Day 7-8)

### 6.1 Update status bar to show all stats
```typescript
// webview-ui/src/components/status/StatusBar.tsx
export const StatusBar: React.FC = () => {
    const { mcpStatus, contextStats, todoStats } = useStatus();

    const getContextColor = (percent: number) => {
        if (percent < 75) return 'green';
        if (percent < 92) return 'yellow';
        return 'red';
    };

    return (
        <div className="status-bar">
            {/* MCP Status */}
            <div className="status-item">
                <span className="icon">🔌</span>
                <span className="label">MCP:</span>
                <span className="value">{mcpStatus.connected}</span>
            </div>

            {/* Context Usage */}
            <div className="status-item">
                <span
                    className="icon"
                    style={{ color: getContextColor(contextStats.percentUsed) }}
                >
                    ●
                </span>
                <span className="label">Context:</span>
                <span className="value">{contextStats.percentUsed}%</span>
            </div>

            {/* Messages */}
            <div className="status-item">
                <span className="icon">💬</span>
                <span className="label">Messages:</span>
                <span className="value">{contextStats.messageCount}</span>
            </div>

            {/* Todos */}
            {todoStats.total > 0 && (
                <div className="status-item">
                    <span className="icon">📝</span>
                    <span className="label">Todos:</span>
                    <span className="value">
                        {todoStats.completed}/{todoStats.total}
                    </span>
                </div>
            )}
        </div>
    );
};
```

### 6.2 Update context hook
```typescript
// webview-ui/src/hooks/useStatus.ts
export const useStatus = () => {
    const [stats, setStats] = useState({
        mcpStatus: { connected: 0 },
        contextStats: {
            percentUsed: 0,
            messageCount: 0,
            tokenCount: 0,
            tokensRemaining: 0
        },
        todoStats: {
            total: 0,
            completed: 0,
            in_progress: 0
        }
    });

    useEffect(() => {
        // Subscribe to status updates from extension
        vscode.postMessage({ type: 'requestStatus' });

        const listener = (event: MessageEvent) => {
            if (event.data.type === 'statusUpdate') {
                setStats(event.data.stats);
            }
        };

        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, []);

    return stats;
};
```

---

## STAGE 7: ENHANCE MCP INTEGRATION (Day 8-9)

### 7.1 Use mini-claude-code's MCP client
```typescript
// src/services/mcp/McpHub.ts
import { mcpClientManager } from '@/services/mini-claude-code/core/mcp-client';
import { loadMCPConfig } from '@/services/mini-claude-code/config/mcp-config';

export class McpHub {
    async initialize() {
        // Load MCP config
        const mcpConfig = await loadMCPConfig();

        // Initialize mini-claude-code's MCP manager
        await mcpClientManager.initialize(mcpConfig);

        // Get available tools
        const tools = await mcpClientManager.listTools();

        return tools;
    }

    async callTool(name: string, args: any) {
        return await mcpClientManager.callTool(name, args);
    }

    async closeAll() {
        await mcpClientManager.closeAll();
    }
}
```

### 7.2 Add MCP config UI
```typescript
// webview-ui/src/components/settings/McpSettings.tsx
export const McpSettings: React.FC = () => {
    const [servers, setServers] = useState([]);

    return (
        <div className="mcp-settings">
            <h3>MCP Servers</h3>
            {servers.map(server => (
                <div key={server.name} className="mcp-server">
                    <span className="name">{server.name}</span>
                    <span className="status">
                        {server.connected ? '🟢' : '🔴'}
                    </span>
                    <span className="transport">{server.transport}</span>
                </div>
            ))}
            <button onClick={handleAddServer}>Add Server</button>
        </div>
    );
};
```

---

## STAGE 8: ADD SECURITY FEATURES (Day 9-10)

### 8.1 Use SafeJSON everywhere
```typescript
// Replace all JSON.parse calls with SafeJSON.parse
// Find: JSON.parse(
// Replace: SafeJSON.parse(

// src/services/mcp/McpHub.ts
import { SafeJSON } from '@/services/mini-claude-code/security/security-utils';

// Instead of
const config = JSON.parse(inMemoryConfig);

// Use
const config = SafeJSON.parse(inMemoryConfig);
```

### 8.2 Add rate limiting
```typescript
// src/api/index.ts
import { APIRateLimiter } from '@/services/mini-claude-code/security/security-utils';

const rateLimiter = new APIRateLimiter(60000, 60); // 60 requests per minute

export class ApiHandler {
    async createMessage(...) {
        // Check rate limit
        const allowed = await rateLimiter.checkLimit('global');
        if (!allowed) {
            throw new Error('Rate limit exceeded');
        }

        // Continue with API call
        // ...
    }
}
```

---

## STAGE 9: TESTING (Day 10-12)

### 9.1 Test OpenAI Responses API
```bash
# Set env vars
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-5-codex"

# Run Cline
code .

# Test cases:
# 1. Chat with GPT-5
# 2. Use tools (read_file, write_file)
# 3. Verify stateful chaining works
# 4. Test reasoning models (o4-mini)
# 5. Verify context compression at 92%
```

### 9.2 Test context compression
```bash
# 1. Start long conversation (100+ messages)
# 2. Should auto-compress at 92%
# 3. Verify compression message shows
# 4. Test /compact command
# 5. Verify stats update
```

### 9.3 Test todo management
```bash
# 1. Ask AI to create multi-step task
# 2. Verify todo board appears
# 3. Verify todos update as AI works
# 4. Verify reminders appear every 3 rounds
# 5. Test todo UI interactions
```

### 9.4 Write unit tests
```typescript
// src/services/mini-claude-code/__tests__/openai-provider.test.ts
describe('OpenAIProvider', () => {
    it('should use Responses API endpoint', async () => {
        const provider = new OpenAIProvider(config);
        const spy = jest.spyOn(provider.client.responses, 'create');

        await provider.createMessage(params);

        expect(spy).toHaveBeenCalled();
    });

    it('should support stateful chaining', async () => {
        const provider = new OpenAIProvider({
            ...config,
            enableStatefulChaining: true
        });

        // First call
        await provider.createMessage(params1);

        // Second call should include previous_response_id
        const spy = jest.spyOn(provider.client.responses, 'create');
        await provider.createMessage(params2);

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                previous_response_id: expect.any(String)
            })
        );
    });
});
```

---

## STAGE 10: DOCUMENTATION (Day 12-13)

### 10.1 Update README.md
```markdown
# Cline Chinese

Enhanced VSCode extension with OpenAI Responses API support.

## Features

- **OpenAI Responses API**: GPT-5, o-series reasoning models
- **Stateful Conversations**: Preserves reasoning across turns
- **Context Compression**: Auto-compresses at 92% usage
- **Todo Management**: Track multi-step tasks
- **Enhanced MCP**: Full Model Context Protocol support

## Setup

1. Install extension
2. Set API key in settings
3. Choose provider: "openai" (Responses API) or "anthropic"
4. Select model: gpt-5-codex recommended

## Configuration

```json
{
  "cline.provider": "openai",
  "cline.openAiModel": "gpt-5-codex",
  "cline.openAiEnableStateful": true,
  "cline.autoCompression": true
}
```
```

### 10.2 Create migration guide
```markdown
# Migration Guide

## From Old Cline to New Cline

Your settings will automatically migrate.

**Old:**
- Uses Chat Completions API
- GPT-4 models only
- No context compression

**New:**
- Uses Responses API
- GPT-5 + o-series models
- Auto context compression
- Todo management

## Recommended Settings

For coding tasks:
- Model: gpt-5-codex
- Stateful: enabled
- Auto-compression: enabled

For reasoning tasks:
- Model: o4-mini
- Stateful: enabled
- Max output tokens: 100000
```

---

## CRITICAL PATH (MINIMUM VIABLE)

If time limited, do these in order:

### Week 1: Core Integration
1. Copy files (Stage 1)
2. Fix imports (Stage 2)
3. Integrate OpenAI Responses provider (Stage 3)
4. Test with GPT-5 models

### Week 2: Essential Features
5. Add context compression (Stage 4)
6. Add basic todo management (Stage 5)
7. Update status bar (Stage 6)
8. Test everything

### Week 3: Polish
9. Add security features (Stage 8)
10. Write documentation (Stage 10)
11. Release

**MCP enhancement (Stage 7) can be done later**

---

## KEY FILES TO MODIFY

```
MUST MODIFY:
src/api/providers/openai-responses.ts          (NEW - adapter)
src/api/index.ts                                (add new provider to factory)
src/core/task/index.ts                          (integrate compression + todos)
webview-ui/src/components/status/StatusBar.tsx (update UI)
webview-ui/src/components/settings/ApiOptions.tsx (add settings)

MUST COPY:
~/mini-claude-code/src/providers/openai-provider.ts → src/services/mini-claude-code/providers/
~/mini-claude-code/src/utils/context-compression.ts → src/services/mini-claude-code/utils/
~/mini-claude-code/src/core/todo-manager.ts → src/services/mini-claude-code/core/
~/mini-claude-code/src/security/security-utils.ts → src/services/mini-claude-code/security/

MUST INSTALL:
npm install openai tiktoken
```

---

## VALIDATION CHECKLIST

After implementation, verify:

- [ ] Can select "openai" provider in settings
- [ ] Can select GPT-5 models in dropdown
- [ ] Chat works with gpt-5-codex
- [ ] Tools work (read_file, write_file, bash)
- [ ] Context compression triggers at 92%
- [ ] /compact command works
- [ ] Status bar shows context %
- [ ] Todo board appears when AI creates tasks
- [ ] Stateful chaining can be toggled
- [ ] Reasoning models use high effort
- [ ] No errors in console
- [ ] All existing features still work (browser, checkpoints, etc)

---

## ESTIMATED TIME

- Stage 1-2: 2 days (setup + imports)
- Stage 3: 3 days (OpenAI provider - CRITICAL)
- Stage 4: 2 days (context compression)
- Stage 5: 2 days (todo management)
- Stage 6: 1 day (status bar)
- Stage 7: 2 days (MCP - optional)
- Stage 8: 2 days (security)
- Stage 9: 3 days (testing)
- Stage 10: 1 day (docs)

**Total: 18 days (3.5 weeks) for full implementation**
**Minimum: 10 days (2 weeks) for critical path**

---

## START NOW

```bash
cd /Users/jerry/cline-chinese

# Stage 1.1
mkdir -p src/services/mini-claude-code/{providers,core,utils,security,types}

# Stage 1.2
cp ~/mini-claude-code/src/providers/openai-provider.ts src/services/mini-claude-code/providers/
cp ~/mini-claude-code/src/providers/types.ts src/services/mini-claude-code/types/
cp ~/mini-claude-code/src/security/security-utils.ts src/services/mini-claude-code/security/
cp ~/mini-claude-code/src/utils/context-compression.ts src/services/mini-claude-code/utils/
cp ~/mini-claude-code/src/core/todo-manager.ts src/services/mini-claude-code/core/

# Stage 1.3
npm install openai tiktoken

# Begin fixing imports (Stage 2)
code src/services/mini-claude-code/providers/openai-provider.ts
```
