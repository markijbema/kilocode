import { vscode } from "@src/utils/vscode"
import mermaid from "mermaid"

export interface MermaidFixResult {
	success: boolean
	fixedCode?: string
	error?: string
	attempts?: number
}

export interface MermaidValidationResult {
	isValid: boolean
	error?: string
}

export const MERMAID_THEME = {
	background: "#1e1e1e", // VS Code dark theme background
	textColor: "#ffffff", // Main text color
	mainBkg: "#2d2d2d", // Background for nodes
	nodeBorder: "#888888", // Border color for nodes
	lineColor: "#cccccc", // Lines connecting nodes
	primaryColor: "#3c3c3c", // Primary color for highlights
	primaryTextColor: "#ffffff", // Text in primary colored elements
	primaryBorderColor: "#888888",
	secondaryColor: "#2d2d2d", // Secondary color for alternate elements
	tertiaryColor: "#454545", // Third color for special elements

	// Class diagram specific
	classText: "#ffffff",

	// State diagram specific
	labelColor: "#ffffff",

	// Sequence diagram specific
	actorLineColor: "#cccccc",
	actorBkg: "#2d2d2d",
	actorBorder: "#888888",
	actorTextColor: "#ffffff",

	// Flow diagram specific
	fillType0: "#2d2d2d",
	fillType1: "#3c3c3c",
	fillType2: "#454545",
}

/**
 * Initializes Mermaid with a consistent theme and configuration.
 * This should be called once at application startup or when the theme changes.
 */
export function initializeMermaid() {
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "loose",
		theme: "dark",
		themeVariables: {
			...MERMAID_THEME,
			fontSize: "16px",
			fontFamily: "var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif)",

			// Additional styling
			noteTextColor: "#ffffff",
			noteBkgColor: "#454545",
			noteBorderColor: "#888888",

			// Improve contrast for special elements
			critBorderColor: "#ff9580",
			critBkgColor: "#803d36",

			// Task diagram specific
			taskTextColor: "#ffffff",
			taskTextOutsideColor: "#ffffff",
			taskTextLightColor: "#ffffff",

			// Numbers/sections
			sectionBkgColor: "#2d2d2d",
			sectionBkgColor2: "#3c3c3c",

			// Alt sections in sequence diagrams
			altBackground: "#2d2d2d",

			// Links
			linkColor: "#6cb6ff",

			// Borders and lines
			compositeBackground: "#2d2d2d",
			compositeBorder: "#888888",
			titleColor: "#ffffff",
		},
	})
}

/**
 * Service for validating and fixing Mermaid syntax using LLM assistance
 */
export class MermaidSyntaxFixer {
	private static readonly MAX_FIX_ATTEMPTS = 2
	private static readonly FIX_TIMEOUT = 30000 // 30 seconds

	/**
	 * Applies manual fixes for common LLM errors before validation
	 */
	static applyManualFixes(code: string): string {
		// Fix HTML entity encoding: --&gt; should be -->
		return code.replace(/--&gt;/g, "-->")
	}

	/**
	 * Validates Mermaid syntax using the mermaid library
	 */
	static async validateSyntax(code: string): Promise<MermaidValidationResult> {
		try {
			// Apply manual fixes first
			const fixedCode = this.applyManualFixes(code)

			// Import mermaid dynamically to avoid issues
			const mermaid = (await import("mermaid")).default

			// Try to parse the code
			await mermaid.parse(fixedCode)
			return { isValid: true }
		} catch (error) {
			return {
				isValid: false,
				error: error instanceof Error ? error.message : "Unknown syntax error",
			}
		}
	}

	/**
	 * Attempts to fix invalid Mermaid syntax using LLM assistance
	 */
	static async fixSyntax(originalCode: string, error: string): Promise<MermaidFixResult> {
		let currentCode = originalCode
		let lastError = error

		for (let attempt = 1; attempt <= this.MAX_FIX_ATTEMPTS; attempt++) {
			try {
				// Request LLM to fix the syntax
				const fixedCode = await this.requestLLMFix(currentCode, lastError, attempt)

				if (!fixedCode) {
					return {
						success: false,
						error: "LLM failed to provide a fix",
						attempts: attempt,
					}
				}

				// Validate the fixed code
				const validation = await this.validateSyntax(fixedCode)

				if (validation.isValid) {
					return {
						success: true,
						fixedCode,
						attempts: attempt,
					}
				}

				// If still invalid, try again with the new error
				currentCode = fixedCode
				lastError = validation.error || "Unknown validation error"
			} catch (requestError) {
				return {
					success: false,
					error: requestError instanceof Error ? requestError.message : "Fix request failed",
					attempts: attempt,
				}
			}
		}

		return {
			success: false,
			error: `Failed to fix syntax after ${this.MAX_FIX_ATTEMPTS} attempts. Last error: ${lastError}`,
			attempts: this.MAX_FIX_ATTEMPTS,
		}
	}

	/**
	 * Requests the LLM to fix the Mermaid syntax via the extension
	 */
	private static async requestLLMFix(code: string, error: string, attempt: number): Promise<string | null> {
		return new Promise((resolve, reject) => {
			const requestId = `mermaid-fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

			// Set up timeout
			const timeout = setTimeout(() => {
				cleanup()
				reject(new Error("LLM fix request timed out"))
			}, this.FIX_TIMEOUT)

			// Set up message listener for the response
			const messageListener = (event: MessageEvent) => {
				const message = event.data
				if (message.type === "mermaidFixResponse" && message.requestId === requestId) {
					cleanup()

					if (message.success) {
						resolve(message.fixedCode)
					} else {
						reject(new Error(message.error || "LLM fix failed"))
					}
				}
			}

			const cleanup = () => {
				clearTimeout(timeout)
				window.removeEventListener("message", messageListener)
			}

			// Add message listener
			window.addEventListener("message", messageListener)

			// Send fix request to extension
			vscode.postMessage({
				type: "fixMermaidSyntax",
				requestId,
				text: code,
				values: {
					error,
					attempt,
					maxAttempts: this.MAX_FIX_ATTEMPTS,
				},
			})
		})
	}

	/**
	 * Attempts to fix Mermaid syntax with automatic retry and fallback
	 */
	static async autoFixSyntax(code: string): Promise<MermaidFixResult> {
		// Apply manual fixes first
		const manuallyFixedCode = this.applyManualFixes(code)

		// First validate the manually fixed code
		const validation = await this.validateSyntax(manuallyFixedCode)

		if (validation.isValid) {
			return {
				success: true,
				fixedCode: manuallyFixedCode,
				attempts: 0,
			}
		}

		// If invalid, attempt to fix it with LLM
		return this.fixSyntax(manuallyFixedCode, validation.error || "Unknown syntax error")
	}
}
