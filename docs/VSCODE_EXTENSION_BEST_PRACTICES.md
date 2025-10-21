# VSCode Extension Development: Comprehensive Best Practices Guide

> **Research Date**: January 2025
> **Sources**: Official Microsoft VSCode documentation, security research, performance studies, and community best practices

---

## Table of Contents

1. [Extension Architecture Best Practices](#1-extension-architecture-best-practices)
2. [Security Best Practices](#2-security-best-practices)
3. [Performance Best Practices](#3-performance-best-practices)
4. [Testing Best Practices](#4-testing-best-practices)
5. [TypeScript Best Practices](#5-typescript-best-practices)
6. [Additional Resources](#6-additional-resources)

---

## 1. Extension Architecture Best Practices

### 1.1 Webview Communication Patterns

#### Official Recommendations

**Communication Model**
- Webviews are sandboxed UI panels running in a separate context from the main extension (analogous to an iframe)
- Webviews don't have access to Node.js APIs, preventing direct file system access or shell command execution
- All communication between webview and extension MUST use message passing via `postMessage()` API

**Source**: [VSCode Webview API Documentation](https://code.visualstudio.com/api/extension-guides/webview)

#### Best Practices

```typescript
// Extension side - sending messages to webview
const panel = vscode.window.createWebviewPanel(
  'myWebview',
  'My Webview',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(extensionContext.extensionPath)]
  }
);

panel.webview.postMessage({ command: 'update', data: someData });

// Extension side - receiving messages from webview
panel.webview.onDidReceiveMessage(
  message => {
    switch (message.command) {
      case 'getData':
        // IMPORTANT: Treat all webview messages as untrusted input
        const sanitizedInput = sanitize(message.text);
        handleGetData(sanitizedInput);
        return;
    }
  },
  undefined,
  context.subscriptions // Always add to subscriptions for proper cleanup
);
```

```javascript
// Webview side (inside HTML/JavaScript)
const vscode = acquireVsCodeApi();

// Send message to extension
vscode.postMessage({
  command: 'getData',
  text: userInput
});

// Receive messages from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'update':
      updateUI(message.data);
      break;
  }
});
```

#### Common Pitfalls to Avoid

1. **Trusting webview input**: Always sanitize and validate all data received from webviews
2. **Command injection**: Don't pass webview data directly to command execution
3. **Missing disposal**: Always register message handlers in `context.subscriptions`
4. **Overly permissive localResourceRoots**: Restrict to only necessary directories

**Security Research**: Trail of Bits identified that improperly configured webview message handlers are a primary attack vector for extension escapes.

---

### 1.2 Extension Activation and Lifecycle Management

#### Activation Events

**Official Recommendation**: Use specific activation events rather than `*` to improve startup performance.

**Common Activation Events**:
```json
{
  "activationEvents": [
    "onStartupFinished",          // Recommended for startup hooks (doesn't slow down VSCode)
    "onLanguage:javascript",      // Only activates for specific languages
    "onCommand:myExtension.command", // Activates when command is invoked
    "onView:myExtension.view",    // Activates when custom view is visible
    "workspaceContains:**/*.js"   // Activates when workspace has matching files
  ]
}
```

**Source**: [VSCode Activation Events Reference](https://code.visualstudio.com/api/references/activation-events)

#### onStartupFinished Best Practice

```typescript
// package.json
{
  "activationEvents": [
    "onStartupFinished"  // Fires after VSCode has fully started
  ]
}

// extension.ts
export function activate(context: vscode.ExtensionContext) {
  // This runs after VSCode startup, not blocking initial load
  initializeExtension(context);
}
```

**Key Benefits**:
- Does not slow down VSCode startup
- Fires after all other extensions have had a chance to start
- Similar to `*` activation but performance-friendly
- Emitted when a new workspace is opened

**Source**: [GitHub Issue #110031](https://github.com/microsoft/vscode/issues/110031)

#### Extension Lifecycle

```typescript
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension is now active');

  // Initialize resources
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  // MUST add to subscriptions for cleanup
  context.subscriptions.push(statusBar);

  // Register commands
  const disposable = vscode.commands.registerCommand(
    'myExtension.helloWorld',
    () => {
      vscode.window.showInformationMessage('Hello World!');
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // VSCode automatically calls dispose() on all items in context.subscriptions
  // Manual cleanup only needed for resources not in subscriptions
  console.log('Extension is now deactivated');
}
```

**Critical**: When your extension deactivates, `context.subscriptions` automatically calls `dispose()` on all registered Disposables.

---

### 1.3 Resource Cleanup and Disposal Patterns

#### The Disposable Pattern

**Official Guidance**: VSCode API uses the dispose pattern for resources obtained from VSCode. This applies to:
- Event listening
- Commands
- UI interactions
- Language contributions

**Source**: [VSCode Patterns and Principles](https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/)

#### Proper Disposal Implementation

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Event listeners return Disposables
  const disposable1 = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('myExtension.setting')) {
      reloadConfiguration();
    }
  });

  // Commands return Disposables
  const disposable2 = vscode.commands.registerCommand(
    'myExtension.command',
    () => { /* handler */ }
  );

  // Status bar items are Disposables
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );

  // File system watcher is Disposable
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
  const disposable3 = watcher.onDidChange(uri => {
    console.log('File changed:', uri.toString());
  });

  // CRITICAL: Add ALL disposables to subscriptions
  context.subscriptions.push(
    disposable1,
    disposable2,
    disposable3,
    statusBar,
    watcher
  );
}
```

#### Common Memory Leak Patterns

**Problem: Not Disposing Event Listeners**
```typescript
// BAD - Memory leak
export function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidChangeTextDocument(e => {
    // This listener is never disposed
    handleDocumentChange(e);
  });
}

// GOOD - Proper cleanup
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidChangeTextDocument(e => {
    handleDocumentChange(e);
  });
  context.subscriptions.push(disposable);
}
```

**Problem: Failing to Register Disposables**
```typescript
// BAD - Resource leak
export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem();
  statusBar.text = "My Extension";
  statusBar.show();
  // statusBar is never disposed
}

// GOOD - Proper registration
export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem();
  statusBar.text = "My Extension";
  statusBar.show();
  context.subscriptions.push(statusBar);
}
```

**Real-World Example**: VSCode's own codebase has fixed multiple event listener memory leaks:
- Settings widget memory leak (PR #221518)
- Debug view memory leak (PR #225334)
- Extension features tab memory leak (PR #256887)

**Source**: [Stack Overflow - Purpose for subscribing a command](https://stackoverflow.com/questions/55554018/purpose-for-subscribing-a-command-in-vscode-extension)

#### Manual Disposal for Complex Resources

```typescript
class MyExtension {
  private disposables: vscode.Disposable[] = [];

  public activate(context: vscode.ExtensionContext) {
    // Register for automatic cleanup
    context.subscriptions.push(
      vscode.Disposable.from(...this.disposables)
    );
  }

  private registerListener() {
    const disposable = vscode.workspace.onDidSaveTextDocument(doc => {
      this.handleSave(doc);
    });
    this.disposables.push(disposable);
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
```

---

### 1.4 Command Registration and Organization

#### Official Best Practices

**Command Naming Conventions**:
- Use prefix format: `extension-name.command-name`
- Follow existing VSCode patterns
- Use descriptive names that make purpose clear

**Source**: [VSCode Command Guide](https://code.visualstudio.com/api/extension-guides/command)

#### Command Registration

```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Register command with proper disposal
  const disposable = vscode.commands.registerCommand(
    'myExtension.helloWorld',
    async () => {
      await vscode.window.showInformationMessage('Hello World!');
    }
  );

  context.subscriptions.push(disposable);
}
```

```json
// package.json - Command Contribution
{
  "contributes": {
    "commands": [
      {
        "command": "myExtension.helloWorld",
        "title": "Hello World",
        "category": "My Extension",
        "icon": "$(heart)",
        "enablement": "editorIsOpen"
      }
    ]
  }
}
```

#### Command Organization with Categories

**UX Guidelines**: Use categories to group related commands in the Command Palette.

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myExtension.create",
        "title": "Create New Item",
        "category": "My Extension"
      },
      {
        "command": "myExtension.delete",
        "title": "Delete Item",
        "category": "My Extension"
      }
    ]
  }
}
```

**Result**: Commands appear as "My Extension: Create New Item" and "My Extension: Delete Item" in Command Palette.

**Source**: [VSCode Command Palette Guidelines](https://code.visualstudio.com/api/ux-guidelines/command-palette)

#### Controlling Command Visibility

```json
{
  "contributes": {
    "menus": {
      "commandPalette": [
        {
          "command": "myExtension.internalCommand",
          "when": "false"  // Never show in Command Palette
        },
        {
          "command": "myExtension.pythonCommand",
          "when": "editorLangId == python"  // Only show for Python files
        }
      ]
    }
  }
}
```

#### Context Menu Integration

```json
{
  "contributes": {
    "menus": {
      "editor/context": [
        {
          "when": "editorHasSelection",
          "command": "myExtension.processSelection",
          "group": "navigation@1"
        }
      ],
      "explorer/context": [
        {
          "when": "resourceExtname == .js",
          "command": "myExtension.processJsFile",
          "group": "2_workspace"
        }
      ]
    }
  }
}
```

**Menu Groups**:
- `navigation` - Always sorted to top (special group)
- Groups are sorted: `1_group` appears before `2_group`
- Use `@` for ordering within group: `navigation@1` appears before `navigation@2`

**Source**: [VSCode Context Menus Guidelines](https://code.visualstudio.com/api/ux-guidelines/context-menus)

---

## 2. Security Best Practices

### 2.1 Content Security Policy (CSP) Configuration

#### Critical Security Requirement

**Official Guidance**: ALL webviews (even simple ones) MUST set a Content Security Policy to mitigate XSS vulnerabilities.

**Source**: [GitHub Issue #79248](https://github.com/microsoft/vscode/issues/79248)

#### Recommended CSP Configuration

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src ${webview.cspSource};
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource};
    connect-src ${webview.cspSource};
  ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Webview</title>
</head>
<body>
  <!-- Content -->
</body>
</html>
```

#### CSP Directives Explained

- `default-src 'none'` - Block everything by default (most restrictive)
- `style-src ${webview.cspSource}` - Only allow styles from extension
- `script-src ${webview.cspSource}` - Only allow scripts from extension
- `img-src ${webview.cspSource} https: data:` - Allow images from extension, HTTPS, and data URIs
- `connect-src ${webview.cspSource}` - Only allow connections to extension resources

**Security Research**: Trail of Bits found that attackers can leak file contents even with restrictive CSP using DNS prefetch techniques, highlighting the importance of defense-in-depth.

**Source**: [Trail of Bits - Escaping misconfigured VSCode extensions](https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/)

#### Known Issue (2025)

As of VSCode 1.104, there's an active issue where CSP is not being applied correctly. Monitor [Issue #267023](https://github.com/microsoft/vscode/issues/267023) for updates.

---

### 2.2 Webview Security

#### Defense-in-Depth Protection

**Security Model**: An XSS vulnerability inside a webview should NOT lead to system compromise if:

1. `localResourceRoots` is correctly configured
2. CSP correctly limits content sources
3. `postMessage` handlers are not vulnerable to command injection

**Source**: [Trail of Bits Security Research](https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/)

#### Secure Webview Configuration

```typescript
const panel = vscode.window.createWebviewPanel(
  'secureWebview',
  'Secure Webview',
  vscode.ViewColumn.One,
  {
    // CRITICAL: Only enable scripts if absolutely necessary
    enableScripts: true,

    // CRITICAL: Restrict to minimum required directories
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'media'),
      vscode.Uri.joinPath(context.extensionUri, 'out')
    ],

    // Enable command URIs (use with caution)
    enableCommandUris: false,

    // Retain context when hidden
    retainContextWhenHidden: false  // Set to true only if needed
  }
);
```

#### localResourceRoots Security

**Purpose**: Prevents webviews from accessing files outside specified directories.

**Default**: Current workspace directory + extension folder

**Best Practice**: Restrict to minimum required paths

```typescript
// BAD - Too permissive
localResourceRoots: [vscode.Uri.file(os.homedir())]

// GOOD - Minimal permissions
localResourceRoots: [
  vscode.Uri.joinPath(context.extensionUri, 'media')
]

// BETTER - No local resources if not needed
localResourceRoots: []
```

#### Sanitizing Input from Webviews

```typescript
import * as DOMPurify from 'isomorphic-dompurify';

panel.webview.onDidReceiveMessage(
  message => {
    // ALWAYS treat webview input as untrusted
    const sanitizedHtml = DOMPurify.sanitize(message.html);
    const sanitizedText = escapeHtml(message.text);

    // Validate command names against allowlist
    if (!isValidCommand(message.command)) {
      console.error('Invalid command from webview:', message.command);
      return;
    }

    handleMessage(sanitizedText);
  },
  undefined,
  context.subscriptions
);

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidCommand(command: string): boolean {
  const allowedCommands = ['getData', 'saveData', 'refresh'];
  return allowedCommands.includes(command);
}
```

#### Script Execution Security

```typescript
// BAD - Arbitrary code execution vulnerability
panel.webview.onDidReceiveMessage(message => {
  if (message.command === 'eval') {
    eval(message.code); // NEVER DO THIS
  }
});

// GOOD - Controlled execution with validation
panel.webview.onDidReceiveMessage(message => {
  if (message.command === 'execute') {
    const allowedActions = {
      'refresh': () => refreshData(),
      'save': () => saveData(sanitize(message.data))
    };

    const action = allowedActions[message.action];
    if (action) {
      action();
    }
  }
});
```

---

### 2.3 Secret Management (Keychain Integration)

#### Official SecretStorage API

**Recommendation**: Use VSCode's SecretStorage API for sensitive data like API keys.

**Platform Storage**:
- **macOS**: Keychain (via "Code Safe Storage" entry)
- **Linux**: Secret Service API/libsecret
- **Windows**: Credential Vault

**Implementation**: VSCode switched from Keytar to Electron's safeStorage API for better security and maintainability (transparent to extension developers).

**Source**: [GitHub Discussion #748](https://github.com/microsoft/vscode-discussions/discussions/748)

#### Using SecretStorage API

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // Store a secret
  await context.secrets.store('myExtension.apiKey', 'secret-api-key-value');

  // Retrieve a secret
  const apiKey = await context.secrets.get('myExtension.apiKey');

  // Delete a secret
  await context.secrets.delete('myExtension.apiKey');

  // Listen for secret changes
  context.secrets.onDidChange(e => {
    if (e.key === 'myExtension.apiKey') {
      console.log('API key was changed');
    }
  });
}
```

#### Security Implementation

**Encryption Process**:
1. VSCode creates an encryption key stored in Keychain Access (macOS)
2. Secrets are encrypted before storage
3. Encrypted secrets stored in SQLite database in user data directory
4. Other extensions cannot read secrets even with keyring access

**Source**: [VSCode SecretStorage Security](https://cycode.com/blog/exposing-vscode-secrets/)

#### Critical Security Limitations

**NO SANDBOXING**: VSCode does not implement extension sandboxing. Extensions run with the same privileges as the VSCode process itself.

**Risk**: Malicious extensions can:
- Read/write files on disk
- Make network requests
- Call libsecret/sqlite3 directly to access other extensions' secrets
- Execute arbitrary code

**Security Researchers** (Cycode, Control-Plane) have demonstrated that malicious extensions can steal tokens from other extensions even when using SecretStorage API.

**Source**: [Cycode - VSCode Token Security Research](https://cycode.com/blog/exposing-vscode-secrets/)

#### Best Practices for Secret Management

1. **Use SecretStorage API** - Don't store secrets in:
   - `WorkspaceConfiguration` (settings.json)
   - `ExtensionContext.globalState`
   - Plain files on disk

2. **Verify Publisher** - Only install extensions from verified publishers (blue checkmark)

3. **Review Extensions** - Check ratings, reviews, and Q&A before installing

4. **Minimize Secret Scope** - Store only essential secrets

5. **Secret Detection** - VSCode Marketplace automatically scans published extensions for hardcoded secrets (API keys, credentials)

```typescript
// BAD - Never hardcode secrets
const API_KEY = 'sk-1234567890abcdef';

// BAD - Don't store in settings
await vscode.workspace.getConfiguration().update(
  'myExtension.apiKey',
  apiKey,
  vscode.ConfigurationTarget.Global
);

// GOOD - Use SecretStorage
await context.secrets.store('myExtension.apiKey', apiKey);
```

---

### 2.4 Safe Command Execution

#### Command Injection Prevention

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// BAD - Command injection vulnerability
async function runBadCommand(userInput: string) {
  await execAsync(`git commit -m "${userInput}"`);
}

// GOOD - Use parameterized execution
async function runSafeCommand(userInput: string) {
  // Validate input
  if (!isValidCommitMessage(userInput)) {
    throw new Error('Invalid commit message');
  }

  // Use spawn instead of exec for better control
  const { spawn } = require('child_process');
  const git = spawn('git', ['commit', '-m', userInput]);

  return new Promise((resolve, reject) => {
    git.on('close', code => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`Git command failed with code ${code}`));
      }
    });
  });
}

function isValidCommitMessage(msg: string): boolean {
  // Implement validation logic
  return msg.length > 0 && msg.length < 500 && !msg.includes('\n');
}
```

#### File System Access Security

```typescript
import * as vscode from 'vscode';

// GOOD - Use VSCode file system API
async function readFileSafely(filePath: string) {
  // Validate path is within workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error('No workspace folder open');
  }

  const fileUri = vscode.Uri.file(filePath);
  const workspaceUri = workspaceFolders[0].uri;

  // Check if file is within workspace
  if (!fileUri.fsPath.startsWith(workspaceUri.fsPath)) {
    throw new Error('File is outside workspace');
  }

  // Use VSCode API instead of Node.js fs
  const content = await vscode.workspace.fs.readFile(fileUri);
  return new TextDecoder().decode(content);
}
```

**Official Recommendation**: Always use `vscode.workspace.fs` API instead of Node.js `fs` module to ensure compatibility with virtual file systems and remote resources.

**Source**: [VSCode Documentation](https://code.visualstudio.com/api)

---

## 3. Performance Best Practices

### 3.1 Extension Startup Time Optimization

#### Performance Profiling Tools

**Built-in Profiling**:
```
Command Palette > Developer: Startup Performance
Command Palette > Developer: Show Running Extensions
```

**Performance Targets**:
- Good: 100-200ms activation time
- Review needed: > 500ms activation time
- Bundling recommended if above targets

**Source**: [Jason Williams - Speeding up VSCode extensions](https://jason-williams.co.uk/posts/speeding-up-vscode-extensions-in-2022/)

#### Activation Event Optimization

```json
// BAD - Always active, slows startup
{
  "activationEvents": ["*"]
}

// BETTER - Only for specific languages
{
  "activationEvents": [
    "onLanguage:javascript",
    "onLanguage:typescript"
  ]
}

// BEST - Delayed startup
{
  "activationEvents": [
    "onStartupFinished"  // Activates after VSCode fully loaded
  ]
}
```

**Impact**: Using `onStartupFinished` instead of `*` prevents blocking VSCode's initial startup.

**Source**: [VSCode Activation Events](https://code.visualstudio.com/api/references/activation-events)

#### Extension Bundling

**Why Bundle**:
1. **Web Support**: Only bundled extensions work in github.dev/vscode.dev
2. **Performance**: Loading 1 large file is faster than 100 small files
3. **Size Reduction**: Bundling + minification significantly reduces extension size

**Real-World Results**:
- **Azure Account Extension**: 50% faster activation, size reduced from 6.2MB to 840KB
- **Docker Extension**: Activation time from 3.5s to <2s, cold activation from 20s to 2s

**Source**: [Jason Williams - Speeding up VSCode extensions](https://jason-williams.co.uk/posts/speeding-up-vscode-extensions-in-2022/)

#### esbuild Configuration (Recommended)

**Why esbuild**: 10-100x faster than webpack, written in Go, simple configuration.

```json
// package.json
{
  "scripts": {
    "esbuild-base": "esbuild ./src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "dev": "npm run esbuild-base -- --sourcemap --watch",
    "vscode:prepublish": "npm run esbuild-base -- --minify",
    "package": "vsce package"
  },
  "main": "./dist/extension.js"
}
```

**Configuration Explained**:
- `--bundle`: Combine all dependencies into single file
- `--external:vscode`: Exclude vscode module (provided by VSCode runtime)
- `--format=cjs`: CommonJS format for Node.js
- `--platform=node`: Target Node.js environment
- `--sourcemap`: Enable debugging (development only)
- `--minify`: Compress code (production only)

**Source**: [roboleary.net - VSCode Extension esbuild](https://www.roboleary.net/2024/02/16/vscode-ext-esbuild)

#### webpack Configuration (Alternative)

```javascript
// webpack.config.js
const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'  // Don't bundle vscode module
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  optimization: {
    minimize: true  // Enable in production
  }
};
```

#### .vscodeignore Optimization

```
# .vscodeignore
.vscode/**
.vscode-test/**
src/**           # Exclude source (bundled code is in dist/)
node_modules/**  # Exclude dependencies (bundled)
.gitignore
.yarnrc
webpack.config.js
tsconfig.json
**/*.ts          # Exclude TypeScript source files
**/*.map         # Exclude source maps in production
**/.eslintrc.json
**/test/**
```

**Impact**: Excluding bundled dependencies reduces VSIX package size significantly.

---

### 3.2 Webview Performance

#### Minimize retainContextWhenHidden

```typescript
// BAD - High memory usage
const panel = vscode.window.createWebviewPanel(
  'myWebview',
  'My Webview',
  vscode.ViewColumn.One,
  {
    retainContextWhenHidden: true  // Keeps webview in memory when hidden
  }
);

// GOOD - Better memory management
const panel = vscode.window.createWebviewPanel(
  'myWebview',
  'My Webview',
  vscode.ViewColumn.One,
  {
    retainContextWhenHidden: false  // Webview recreated when shown
  }
);

// If you need to retain state, use getState/setState instead
```

#### Webview State Management

```javascript
// Inside webview JavaScript
const vscode = acquireVsCodeApi();

// Save state before webview is hidden
const state = { data: myData };
vscode.setState(state);

// Restore state when webview is shown
const previousState = vscode.getState();
if (previousState) {
  myData = previousState.data;
}
```

#### Lazy Loading Content

```typescript
// Instead of loading everything upfront
panel.webview.html = getHtmlWithAllData(largeDataset);

// Load incrementally
panel.webview.html = getBaseHtml();
panel.webview.postMessage({
  command: 'loadData',
  data: getInitialData()
});

// Load more data on demand
panel.webview.onDidReceiveMessage(message => {
  if (message.command === 'loadMore') {
    panel.webview.postMessage({
      command: 'appendData',
      data: getNextBatch()
    });
  }
});
```

---

### 3.3 Memory Management

#### Common Memory Leak Patterns

**Pattern 1: Undisposed Event Listeners**

```typescript
// MEMORY LEAK
export function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidChangeTextDocument(e => {
    // This listener accumulates with each activation
    handleChange(e);
  });
}

// CORRECT
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidChangeTextDocument(e => {
    handleChange(e);
  });
  context.subscriptions.push(disposable);
}
```

**Pattern 2: Status Bar Messages**

```typescript
// MEMORY LEAK - Status bar messages stack
function showStatus() {
  vscode.window.setStatusBarMessage('Processing...');
  // Message is never cleared
}

// CORRECT - Dispose after use
function showStatus() {
  const statusDisposable = vscode.window.setStatusBarMessage(
    'Processing...',
    5000  // Auto-hide after 5 seconds
  );

  // Or manually dispose
  setTimeout(() => statusDisposable.dispose(), 5000);
}
```

**Pattern 3: File System Watchers**

```typescript
// MEMORY LEAK
export function activate(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
  watcher.onDidChange(uri => handleChange(uri));
  // Watcher is never disposed
}

// CORRECT
export function activate(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
  const changeListener = watcher.onDidChange(uri => handleChange(uri));

  context.subscriptions.push(watcher, changeListener);
}
```

#### Debugging Memory Issues

```bash
# VSCode Extension Bisect - Find problematic extensions
Command Palette > Help: Start Extension Bisect

# Profile Extension Performance
Command Palette > Developer: Show Running Extensions

# Check for specific extension performance
Command Palette > Developer: Startup Performance
```

**Source**: [FreeCodeCamp - Optimize VSCode Performance](https://www.freecodecamp.org/news/optimize-vscode-performance-best-extensions/)

---

### 3.4 Background Processing

#### Worker Threads for Heavy Computation

```typescript
import { Worker } from 'worker_threads';
import * as path from 'path';

async function processLargeFile(filePath: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, 'worker.js'),
      { workerData: { filePath } }
    );

    worker.on('message', result => {
      resolve(result);
      worker.terminate();
    });

    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}
```

#### Debouncing and Throttling

```typescript
// Debounce - Wait for user to stop typing
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Usage: Only run after user stops typing for 500ms
const debouncedValidation = debounce(validateDocument, 500);

vscode.workspace.onDidChangeTextDocument(e => {
  debouncedValidation(e.document);
});
```

```typescript
// Throttle - Limit execution rate
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Usage: Run at most once every 1000ms
const throttledUpdate = throttle(updateDecorations, 1000);

vscode.workspace.onDidChangeTextDocument(e => {
  throttledUpdate(e.document);
});
```

---

## 4. Testing Best Practices

### 4.1 Unit Testing Strategies

#### Testing Without VSCode Instance

**Challenge**: The `vscode` module errors when running unit tests outside VSCode.

**Source**: [VSCode Extension Testing Guide](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

#### Solution 1: Manual Mocking with Jest

```typescript
// __mocks__/vscode.ts
export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  }))
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn()
  })),
  workspaceFolders: []
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn()
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
  parse: (uri: string) => ({ fsPath: uri, path: uri })
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3
}
```

```typescript
// src/utils.test.ts
import * as vscode from 'vscode';
import { showNotification } from './utils';

jest.mock('vscode');

describe('Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show information message', async () => {
    await showNotification('Test message');

    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith('Test message');
  });
});
```

**Source**: [Richard Kotze - Unit test & mock VS Code extension API](https://www.richardkotze.com/coding/unit-test-mock-vs-code-extension-api-jest)

#### Solution 2: Dependency Injection

```typescript
// interfaces.ts
export interface IVSCodeWindow {
  showInformationMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

// extension.ts
export class MyExtension {
  constructor(private window: IVSCodeWindow) {}

  async showMessage(msg: string) {
    await this.window.showInformationMessage(msg);
  }
}

// extension.test.ts
describe('MyExtension', () => {
  it('should show message', async () => {
    const mockWindow: IVSCodeWindow = {
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn()
    };

    const extension = new MyExtension(mockWindow);
    await extension.showMessage('Hello');

    expect(mockWindow.showInformationMessage)
      .toHaveBeenCalledWith('Hello');
  });
});
```

**Source**: [DEV Community - Complete Guide to VS Code Extension Testing](https://dev.to/sourishkrout/a-complete-guide-to-vs-code-extension-testing-268p)

---

### 4.2 Integration Testing

#### Official Test Runner Setup

**Installation**:
```bash
npm install --save-dev @vscode/test-cli @vscode/test-electron
```

**Source**: [VSCode Testing Documentation](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

#### package.json Configuration

```json
{
  "scripts": {
    "test": "vscode-test"
  },
  "devDependencies": {
    "@vscode/test-cli": "^0.0.4",
    "@vscode/test-electron": "^2.3.8",
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.x",
    "mocha": "^10.2.0"
  }
}
```

#### .vscode-test.mjs Configuration

```javascript
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder: './test-workspace',
  mocha: {
    ui: 'bdd',
    timeout: 20000,
    color: true
  }
});
```

#### Integration Test Example

```typescript
// src/test/suite/extension.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('publisher.extension-name'));
  });

  test('Should register commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('myExtension.helloWorld'));
  });

  test('Command should execute successfully', async () => {
    const result = await vscode.commands.executeCommand(
      'myExtension.helloWorld'
    );
    assert.ok(result);
  });

  test('Should handle file operations', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'test content',
      language: 'javascript'
    });

    assert.strictEqual(doc.getText(), 'test content');
    assert.strictEqual(doc.languageId, 'javascript');
  });
});
```

#### Running Integration Tests

```bash
# Run tests
npm test

# Run with debugging
npm test -- --debug
```

**Key Features**:
- Tests have full access to VSCode API
- VSCode instance is downloaded and launched automatically
- Tests run in real VSCode environment
- Uses Mocha test framework

**Source**: [VSCode Testing Extension Documentation](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

---

### 4.3 E2E Testing

#### Official Testing Tool: vscode-extension-tester

**Installation**:
```bash
npm install --save-dev vscode-extension-tester
```

**Source**: [GitHub Discussion #9](https://github.com/microsoft/vscode-discussions/discussions/9)

#### Basic E2E Test

```typescript
// src/ui-test/basic.test.ts
import {
  ActivityBar,
  EditorView,
  TextEditor,
  Workbench
} from 'vscode-extension-tester';

describe('Extension E2E Tests', () => {
  let workbench: Workbench;

  before(async function() {
    this.timeout(30000);
    workbench = new Workbench();
  });

  it('Should open command palette and execute command', async function() {
    this.timeout(10000);

    const inputBox = await workbench.openCommandPrompt();
    await inputBox.setText('>My Extension: Hello World');
    await inputBox.confirm();

    // Verify notification appears
    const notifications = await workbench.getNotifications();
    assert.ok(notifications.length > 0);
  });

  it('Should interact with editor', async function() {
    this.timeout(10000);

    const editorView = new EditorView();
    await editorView.openEditor('test.js');

    const editor = await new TextEditor().wait();
    await editor.typeText('console.log("test");');

    const text = await editor.getText();
    assert.ok(text.includes('console.log'));
  });
});
```

#### Alternative: WebdriverIO

**Advantages**:
- Supports complex user flows
- Can test webview interactions
- Integrates with CI/CD pipelines

```typescript
// wdio.conf.ts
import { VSCodeWorkbench } from '@vscode/test-web';

export const config = {
  specs: ['./test/e2e/**/*.test.ts'],
  capabilities: [{
    browserName: 'vscode',
    'vscode:options': {
      extensionDevelopmentPath: __dirname,
      extensionTestsPath: path.join(__dirname, 'out/test/e2e')
    }
  }]
};
```

**Source**: [Stateful - Complete Guide to VS Code Extension Testing](https://stateful.com/blog/a-complete-guide-to-vs-code-extension-testing)

---

### 4.4 Testing Strategy Recommendations

**From Official Documentation and Community**:

1. **Unit Tests**: Test pure logic, utilities, and data transformations
   - No VSCode API calls
   - Fast execution
   - High coverage

2. **Integration Tests**: Test extension activation, commands, and API interactions
   - Uses real VSCode instance
   - Tests command registration
   - Validates extension contributions

3. **E2E Tests**: Test critical user workflows
   - Simulates actual user interactions
   - Tests UI components
   - Validates end-to-end functionality

**Recommended Split**:
- 70% Unit Tests
- 25% Integration Tests
- 5% E2E Tests

**Source**: [DEV Community - A Complete Guide to VS Code Extension Testing](https://dev.to/sourishkrout/a-complete-guide-to-vs-code-extension-testing-268p)

---

## 5. TypeScript Best Practices

### 5.1 Type Safety Patterns

#### Strict TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,                     // Enable all strict checks
    "noImplicitAny": true,              // Error on 'any' type
    "strictNullChecks": true,           // Strict null checking
    "strictFunctionTypes": true,        // Strict function types
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,             // Error on unused variables
    "noUnusedParameters": true,         // Error on unused parameters
    "noImplicitReturns": true,          // Error on missing returns
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

**Official Recommendation**: Microsoft recommends TypeScript for VSCode extension development for the best developer experience.

**Source**: [VSCode Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)

#### VSCode API Type Imports

```typescript
import * as vscode from 'vscode';

// Use explicit types for all VSCode API interactions
export function activate(context: vscode.ExtensionContext): void {
  const disposable: vscode.Disposable = vscode.commands.registerCommand(
    'myExtension.command',
    async (uri: vscode.Uri) => {
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(uri);
      const editor: vscode.TextEditor | undefined =
        await vscode.window.showTextDocument(doc);

      if (editor) {
        const selection: vscode.Selection = editor.selection;
        const text: string = editor.document.getText(selection);
        return text;
      }
    }
  );

  context.subscriptions.push(disposable);
}
```

#### Type Guards and Validation

```typescript
// Type guard for TextEditor
function isTextEditor(editor: any): editor is vscode.TextEditor {
  return editor &&
         'document' in editor &&
         'selection' in editor;
}

// Usage
const activeEditor = vscode.window.activeTextEditor;
if (isTextEditor(activeEditor)) {
  // TypeScript knows activeEditor is TextEditor
  const position: vscode.Position = activeEditor.selection.active;
}

// Type guard for configuration values
function getStringConfig(
  config: vscode.WorkspaceConfiguration,
  key: string,
  defaultValue: string
): string {
  const value = config.get<string>(key);
  return typeof value === 'string' ? value : defaultValue;
}
```

---

### 5.2 API Handler Patterns

#### Command Handler Pattern

```typescript
// Define command handler types
type CommandHandler = (...args: any[]) => Promise<void> | void;

interface CommandRegistration {
  command: string;
  handler: CommandHandler;
  thisArg?: any;
}

// Command registry
class CommandRegistry {
  private disposables: vscode.Disposable[] = [];

  register(registration: CommandRegistration): void {
    const disposable = vscode.commands.registerCommand(
      registration.command,
      registration.handler,
      registration.thisArg
    );
    this.disposables.push(disposable);
  }

  registerAll(registrations: CommandRegistration[]): void {
    registrations.forEach(reg => this.register(reg));
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

// Usage
export function activate(context: vscode.ExtensionContext) {
  const registry = new CommandRegistry();

  registry.registerAll([
    {
      command: 'myExtension.command1',
      handler: handleCommand1
    },
    {
      command: 'myExtension.command2',
      handler: handleCommand2
    }
  ]);

  context.subscriptions.push({
    dispose: () => registry.dispose()
  });
}

async function handleCommand1(): Promise<void> {
  await vscode.window.showInformationMessage('Command 1');
}

async function handleCommand2(): Promise<void> {
  await vscode.window.showInformationMessage('Command 2');
}
```

#### Message Handler Pattern for Webviews

```typescript
// Define message types
interface WebviewMessage {
  command: string;
  [key: string]: any;
}

interface GetDataMessage extends WebviewMessage {
  command: 'getData';
  id: string;
}

interface SaveDataMessage extends WebviewMessage {
  command: 'saveData';
  data: unknown;
}

type WebviewMessageType = GetDataMessage | SaveDataMessage;

// Type-safe message handler
class WebviewMessageHandler {
  private handlers = new Map<string, (message: any) => Promise<void>>();

  on<T extends WebviewMessageType>(
    command: T['command'],
    handler: (message: T) => Promise<void>
  ): void {
    this.handlers.set(command, handler);
  }

  async handle(message: WebviewMessageType): Promise<void> {
    const handler = this.handlers.get(message.command);
    if (handler) {
      await handler(message);
    } else {
      console.warn(`No handler for command: ${message.command}`);
    }
  }
}

// Usage
export function setupWebview(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
) {
  const messageHandler = new WebviewMessageHandler();

  messageHandler.on<GetDataMessage>('getData', async (message) => {
    const data = await fetchData(message.id);
    panel.webview.postMessage({ command: 'data', data });
  });

  messageHandler.on<SaveDataMessage>('saveData', async (message) => {
    await saveData(message.data);
    panel.webview.postMessage({ command: 'saved' });
  });

  const disposable = panel.webview.onDidReceiveMessage(
    (message: WebviewMessageType) => messageHandler.handle(message),
    undefined,
    context.subscriptions
  );

  context.subscriptions.push(disposable);
}
```

---

### 5.3 Async/Await Patterns

#### Official VSCode API Async Handling

**Thenable Type**: VSCode API uses `Thenable` type to be independent of specific promise libraries.

```typescript
// VSCode API returns Thenable, compatible with async/await
async function openDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
  const doc: vscode.TextDocument =
    await vscode.workspace.openTextDocument(uri);
  return doc;
}
```

**Source**: [VSCode Patterns and Principles](https://vscode-docs.readthedocs.io/en/latest/extensions/patterns-and-principles/)

#### Async Command Handlers

```typescript
// GOOD - Async command handler with proper error handling
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'myExtension.asyncCommand',
    async () => {
      try {
        const result = await performAsyncOperation();
        await vscode.window.showInformationMessage(
          `Operation completed: ${result}`
        );
      } catch (error) {
        await vscode.window.showErrorMessage(
          `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function performAsyncOperation(): Promise<string> {
  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, 1000));
  return 'Success';
}
```

#### Parallel Async Operations

```typescript
// Execute multiple async operations in parallel
async function processMultipleFiles(uris: vscode.Uri[]): Promise<void> {
  try {
    // Process all files in parallel
    const results = await Promise.all(
      uris.map(uri => processFile(uri))
    );

    await vscode.window.showInformationMessage(
      `Processed ${results.length} files`
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      `Failed to process files: ${error}`
    );
  }
}

async function processFile(uri: vscode.Uri): Promise<void> {
  const content = await vscode.workspace.fs.readFile(uri);
  // Process content
  await vscode.workspace.fs.writeFile(uri, content);
}
```

#### Sequential Async Operations

```typescript
// Execute async operations sequentially
async function processFilesSequentially(uris: vscode.Uri[]): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Processing files',
      cancellable: true
    },
    async (progress, token) => {
      for (let i = 0; i < uris.length; i++) {
        // Check for cancellation
        if (token.isCancellationRequested) {
          break;
        }

        // Update progress
        progress.report({
          increment: (100 / uris.length),
          message: `File ${i + 1} of ${uris.length}`
        });

        // Process file
        await processFile(uris[i]);
      }
    }
  );
}
```

---

### 5.4 Error Handling

#### Error Handling Best Practices

**Detecting Missing Await**: Use `@typescript-eslint/no-floating-promises` rule

```json
// .eslintrc.json
{
  "extends": [
    "@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-floating-promises": "error"
  }
}
```

**Source**: [Stack Overflow - Detect missing await in VSCode](https://stackoverflow.com/questions/67175079/detect-missing-await-in-javascript-methods-in-vscode)

#### Proper Error Handling Patterns

```typescript
// Pattern 1: Try-catch with specific error handling
async function handleCommandWithErrors(): Promise<void> {
  try {
    const result = await riskyOperation();
    await vscode.window.showInformationMessage(`Success: ${result}`);
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      await vscode.window.showErrorMessage('File not found');
    } else if (error instanceof ValidationError) {
      await vscode.window.showWarningMessage(`Validation failed: ${error.message}`);
    } else {
      await vscode.window.showErrorMessage(
        `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
      console.error('Detailed error:', error);
    }
  }
}

// Pattern 2: Result type for explicit error handling
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function safeOperation(): Promise<Result<string>> {
  try {
    const value = await riskyOperation();
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

// Usage
const result = await safeOperation();
if (result.ok) {
  console.log('Success:', result.value);
} else {
  console.error('Error:', result.error.message);
}
```

#### Custom Error Classes

```typescript
// Define custom error types
class ExtensionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ExtensionError';
  }
}

class FileNotFoundError extends ExtensionError {
  constructor(path: string) {
    super(`File not found: ${path}`, 'FILE_NOT_FOUND');
    this.name = 'FileNotFoundError';
  }
}

class ValidationError extends ExtensionError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Usage with type checking
async function processFile(uri: vscode.Uri): Promise<void> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.File) {
      throw new ValidationError('Not a file');
    }

    const content = await vscode.workspace.fs.readFile(uri);
    // Process content
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      await vscode.window.showErrorMessage(error.message);
    } else if (error instanceof ValidationError) {
      await vscode.window.showWarningMessage(error.message);
    } else {
      throw error; // Re-throw unexpected errors
    }
  }
}
```

#### Error Logging

```typescript
// Create output channel for logging
class Logger {
  private outputChannel: vscode.OutputChannel;

  constructor(name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  error(message: string, error?: Error): void {
    this.log('ERROR', message);
    if (error) {
      this.outputChannel.appendLine(`  ${error.stack || error.message}`);
    }
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${level}: ${message}`);
  }

  show(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Usage
export function activate(context: vscode.ExtensionContext) {
  const logger = new Logger('My Extension');
  context.subscriptions.push({ dispose: () => logger.dispose() });

  const disposable = vscode.commands.registerCommand(
    'myExtension.command',
    async () => {
      try {
        logger.info('Command executed');
        await performOperation();
      } catch (error) {
        logger.error(
          'Command failed',
          error instanceof Error ? error : new Error(String(error))
        );
        await vscode.window.showErrorMessage(
          'Operation failed. Check output for details.',
          'Show Output'
        ).then(selection => {
          if (selection === 'Show Output') {
            logger.show();
          }
        });
      }
    }
  );

  context.subscriptions.push(disposable);
}
```

---

## 6. Additional Resources

### 6.1 Official Documentation

1. **VSCode Extension API Overview**
   - URL: https://code.visualstudio.com/api
   - Description: Main entry point for extension development documentation

2. **Extension Guides**
   - URL: https://code.visualstudio.com/api/extension-guides/overview
   - Description: Detailed guides for specific VSCode APIs

3. **UX Guidelines**
   - URL: https://code.visualstudio.com/api/ux-guidelines/overview
   - Description: Best practices for extension UI/UX

4. **Activation Events Reference**
   - URL: https://code.visualstudio.com/api/references/activation-events
   - Description: Complete list of activation events

5. **Contribution Points**
   - URL: https://code.visualstudio.com/api/references/contribution-points
   - Description: Static declarations in package.json

6. **Testing Extensions**
   - URL: https://code.visualstudio.com/api/working-with-extensions/testing-extension
   - Description: Official testing documentation

7. **Bundling Extensions**
   - URL: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
   - Description: Official bundling guide

### 6.2 Sample Code Repositories

1. **Microsoft VSCode Extension Samples**
   - URL: https://github.com/microsoft/vscode-extension-samples
   - Description: Official samples for various extension features

2. **VSCode Webview UI Toolkit Samples**
   - URL: https://github.com/microsoft/vscode-webview-ui-toolkit-samples
   - Description: Samples for webview UI development

### 6.3 Security Research

1. **Trail of Bits - Escaping Misconfigured VSCode Extensions**
   - URL: https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/
   - Description: Security vulnerabilities in webview configurations

2. **Cycode - VSCode Token Security**
   - URL: https://cycode.com/blog/exposing-vscode-secrets/
   - Description: Analysis of secret storage security

3. **Control-Plane - Abusing VSCode Extensions**
   - URL: https://control-plane.io/posts/abusing-vscode-from-malicious-extensions-to-stolen-credentials-part-2/
   - Description: Security risks from malicious extensions

### 6.4 Performance Optimization

1. **Jason Williams - Speeding up VSCode Extensions in 2022**
   - URL: https://jason-williams.co.uk/posts/speeding-up-vscode-extensions-in-2022/
   - Description: Real-world bundling and performance improvements

2. **roboleary.net - Why bundle with esbuild**
   - URL: https://www.roboleary.net/2024/02/16/vscode-ext-esbuild
   - Description: esbuild configuration and benefits

3. **FreeCodeCamp - Optimize VSCode Performance**
   - URL: https://www.freecodecamp.org/news/optimize-vscode-performance-best-extensions/
   - Description: Performance profiling and optimization

### 6.5 Testing Resources

1. **Stateful - Complete Guide to VS Code Extension Testing**
   - URL: https://stateful.com/blog/a-complete-guide-to-vs-code-extension-testing
   - Description: Comprehensive testing strategies

2. **Richard Kotze - Unit test & mock VS Code extension API**
   - URL: https://www.richardkotze.com/coding/unit-test-mock-vs-code-extension-api-jest
   - Description: Mocking VSCode API for unit tests

### 6.6 Modern Development Guides

1. **Snyk - Modern VS Code Extension Development**
   - URL: https://snyk.io/blog/modern-vs-code-extension-development-basics/
   - Description: Current best practices and patterns

2. **Snyk - Building a Secure Extension**
   - URL: https://snyk.io/blog/modern-vs-code-extension-development-tutorial/
   - Description: Security-focused development tutorial

---

## Summary of Key Recommendations

### MUST DO

1. Set Content Security Policy for ALL webviews
2. Add ALL disposables to `context.subscriptions`
3. Use `onStartupFinished` instead of `*` activation event
4. Bundle extensions with esbuild or webpack
5. Use VSCode's SecretStorage API for sensitive data
6. Sanitize ALL input from webviews
7. Configure strict TypeScript compiler options
8. Use `@typescript-eslint/no-floating-promises` rule

### MUST NOT DO

1. Never trust webview input without validation
2. Don't hardcode secrets in extension code
3. Don't use `eval()` or similar unsafe operations
4. Don't enable `retainContextWhenHidden` unless necessary
5. Don't set `localResourceRoots` too permissively
6. Don't forget to dispose event listeners
7. Don't use Node.js `fs` module (use `vscode.workspace.fs`)
8. Don't publish extensions with secrets (scanned by Marketplace)

### RECOMMENDED

1. Use esbuild for bundling (10-100x faster than webpack)
2. Target 100-200ms activation time
3. Implement comprehensive error handling
4. Use dependency injection for testability
5. Follow 70% unit / 25% integration / 5% E2E test split
6. Use TypeScript with strict mode
7. Implement proper logging with output channels
8. Review security research and stay updated on vulnerabilities

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Maintained By**: Research compilation based on official Microsoft documentation, security research, and community best practices
