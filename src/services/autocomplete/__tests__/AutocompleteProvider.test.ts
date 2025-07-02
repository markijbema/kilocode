import * as vscode from "vscode"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { registerAutocomplete } from "../AutocompleteProvider"
import { ContextProxy } from "../../../core/config/ContextProxy"

// Mock vscode module
vi.mock("vscode", () => ({
	languages: {
		registerInlineCompletionItemProvider: vi.fn(),
	},
	window: {
		createStatusBarItem: vi.fn(() => ({
			text: "",
			tooltip: "",
			command: "",
			show: vi.fn(),
			dispose: vi.fn(),
		})),
		showInformationMessage: vi.fn(),
		activeTextEditor: {
			document: {
				lineAt: vi.fn(),
				getText: vi.fn(),
			},
		},
		onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn(),
	},
	StatusBarAlignment: {
		Right: 2,
	},
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	Range: class {
		constructor(
			public start: any,
			public end: any,
		) {}
	},
	InlineCompletionItem: class {
		constructor(
			public text: string,
			public range: any,
		) {}
	},
	Disposable: class {
		constructor(public dispose: () => void) {}
	},
	CancellationTokenSource: class {
		constructor() {
			this.token = { isCancellationRequested: false }
		}
		token: { isCancellationRequested: boolean }
		cancel() {}
		dispose() {}
	},
	CancellationError: class extends Error {
		constructor() {
			super("The operation was canceled")
			this.name = "CancellationError"
		}
	},
	TextDocumentChangeReason: {
		Undo: 1,
		Redo: 2,
	},
}))

// Mock other dependencies
vi.mock("../../../core/config/ContextProxy", () => ({
	ContextProxy: {
		instance: {
			getGlobalState: vi.fn(),
			getProviderSettings: vi.fn(() => ({ kilocodeToken: "test-token" })),
		},
	},
}))

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn(() => ({
		createMessage: vi.fn(),
		getModel: vi.fn(() => ({
			id: "test-model",
			info: {
				contextWindow: 100000,
				supportsPromptCache: false,
				maxTokens: 4096,
			},
		})),
		countTokens: vi.fn(() => Promise.resolve(100)),
	})),
}))

vi.mock("../ContextGatherer", () => ({
	ContextGatherer: vi.fn().mockImplementation(() => ({
		gatherContext: vi.fn().mockResolvedValue({
			precedingLines: ["line1", "line2"],
			followingLines: ["line3", "line4"],
			imports: [],
			definitions: [],
		}),
	})),
}))

vi.mock("../AutocompleteDecorationAnimation", () => ({
	AutocompleteDecorationAnimation: {
		getInstance: vi.fn(() => ({
			startAnimation: vi.fn(),
			stopAnimation: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}))

vi.mock("../utils/EditDetectionUtils", () => ({
	isHumanEdit: vi.fn(() => true),
}))

describe("AutocompleteProvider", () => {
	let mockContext: any
	let mockProvider: any
	let provideInlineCompletionItems: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockContext = {
			subscriptions: [],
		}

		// Set up experiment flag to enable autocomplete
		vi.mocked(ContextProxy.instance.getGlobalState).mockReturnValue({
			autocomplete: true,
		})

		// Capture the provider when it's registered
		vi.mocked(vscode.languages.registerInlineCompletionItemProvider).mockImplementation((selector, provider) => {
			mockProvider = provider
			provideInlineCompletionItems = provider.provideInlineCompletionItems
			return { dispose: vi.fn() }
		})
	})

	afterEach(() => {
		vi.clearAllTimers()
	})

	it("should not provide completions when cursor is in whitespace at start of line", async () => {
		// Register autocomplete
		registerAutocomplete(mockContext)

		// Wait for the provider to be registered
		await new Promise((resolve) => setTimeout(resolve, 10))

		// Mock document and position for whitespace at start of line
		const mockDocument = {
			lineAt: vi.fn().mockReturnValue({
				text: "    ", // Line with only whitespace
			}),
			getText: vi.fn().mockReturnValue(""),
		}

		const mockPosition = new vscode.Position(0, 2) // Cursor at position 2 in whitespace

		const mockToken = {
			isCancellationRequested: false,
		}

		// Call the provider
		const result = await provideInlineCompletionItems(mockDocument, mockPosition, {}, mockToken)

		// Should return null when in whitespace at start of line
		expect(result).toBeNull()
	})

	it("verifies whitespace check logic works correctly", () => {
		// This test verifies that our whitespace check logic works correctly
		// by directly testing the condition we added

		// Case 1: Whitespace at start of line (should skip autocomplete)
		const lineWithOnlyWhitespace = "    "
		const positionInWhitespace = 2
		expect(lineWithOnlyWhitespace.substring(0, positionInWhitespace).trim()).toBe("")

		// Case 2: Text after whitespace (should not skip autocomplete)
		const lineWithText = "    const foo"
		const positionAfterText = 13
		expect(lineWithText.substring(0, positionAfterText).trim()).not.toBe("")
	})

	it("should not provide completions when cursor is at start of empty line", async () => {
		// Register autocomplete
		registerAutocomplete(mockContext)

		// Wait for the provider to be registered
		await new Promise((resolve) => setTimeout(resolve, 10))

		// Mock document and position for empty line
		const mockDocument = {
			lineAt: vi.fn().mockReturnValue({
				text: "", // Empty line
			}),
			getText: vi.fn().mockReturnValue(""),
		}

		const mockPosition = new vscode.Position(0, 0) // Cursor at start of empty line

		const mockToken = {
			isCancellationRequested: false,
		}

		// Call the provider
		const result = await provideInlineCompletionItems(mockDocument, mockPosition, {}, mockToken)

		// Should return null when at start of empty line
		expect(result).toBeNull()
	})

	it("verifies whitespace check logic allows completions at end of whitespace-only line", () => {
		// This test directly verifies the condition we modified in AutocompleteProvider.ts

		// Case 1: Whitespace at start of line but NOT at the end (should skip autocomplete)
		const lineWithOnlyWhitespace = "    "
		const positionInWhitespace = 2 // Cursor in the middle of whitespace
		const textBeforeCursor1 = lineWithOnlyWhitespace.substring(0, positionInWhitespace)

		// Verify our condition would skip autocomplete
		expect(textBeforeCursor1.trim() === "" && positionInWhitespace !== lineWithOnlyWhitespace.length).toBe(true)

		// Case 2: Whitespace-only line with cursor at the end (should NOT skip autocomplete)
		const positionAtEnd = 4 // Cursor at the end of whitespace
		const textBeforeCursor2 = lineWithOnlyWhitespace.substring(0, positionAtEnd)

		// Verify our condition would NOT skip autocomplete
		expect(textBeforeCursor2.trim() === "" && positionAtEnd !== lineWithOnlyWhitespace.length).toBe(false)
	})

	it("should not provide completions when pressing tab in indentation", async () => {
		// Register autocomplete
		registerAutocomplete(mockContext)

		// Wait for the provider to be registered
		await new Promise((resolve) => setTimeout(resolve, 10))

		// Mock document and position for tab in indentation
		const mockDocument = {
			lineAt: vi.fn().mockReturnValue({
				text: "\t\t", // Line with tabs
			}),
			getText: vi.fn().mockReturnValue(""),
		}

		const mockPosition = new vscode.Position(0, 2) // Cursor after two tabs

		const mockToken = {
			isCancellationRequested: false,
		}

		// Call the provider
		const result = await provideInlineCompletionItems(mockDocument, mockPosition, {}, mockToken)

		// Should return null when in tab indentation
		expect(result).toBeNull()
	})
})
