import { vscode } from "@src/utils/vscode"

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

/**
 * Service for validating and fixing Mermaid syntax using LLM assistance
 */
export class MermaidSyntaxFixer {
	private static readonly MAX_FIX_ATTEMPTS = 2
	private static readonly FIX_TIMEOUT = 30000 // 30 seconds

	/**
	 * Applies deterministic fixes for common LLM errors before validation
	 */
	static applyDeterministicFixes(code: string): string {
		// Fix HTML entity encoding: --&gt; should be -->
		return code
		return code.replace(/--&gt;/g, "-->")
	}

	/**
	 * Validates Mermaid syntax using the mermaid library
	 */
	static async validateSyntax(code: string): Promise<MermaidValidationResult> {
		try {
			const mermaid = (await import("mermaid")).default
			await mermaid.parse(code)
			return { isValid: true }
		} catch (error) {
			return {
				isValid: false,
				error: error instanceof Error ? error.message : "Unknown syntax error",
			}
		}
	}

	/**
	 * Requests the LLM to fix the Mermaid syntax via the extension
	 */
	private static requestLLMFix(code: string, error: string): Promise<string | null> {
		return new Promise((resolve, reject) => {
			const requestId = `mermaid-fix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

			const timeout = setTimeout(() => {
				cleanup()
				reject(new Error("LLM fix request timed out"))
			}, this.FIX_TIMEOUT)

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

			window.addEventListener("message", messageListener)

			vscode.postMessage({
				type: "fixMermaidSyntax",
				requestId,
				text: code,
				values: { error },
			})
		})
	}

	/**
	 * Attempts to fix Mermaid syntax with automatic retry and fallback
	 * Always returns the best attempt at fixing the code, even if not completely successful
	 */
	static async autoFixSyntax(code: string): Promise<MermaidFixResult> {
		let currentCode = code
		let llmAttempts = 0
		let finalError: string | undefined

		while (true) {
			currentCode = this.applyDeterministicFixes(currentCode)

			// Validate the current code
			const validation = await this.validateSyntax(currentCode)
			if (validation.isValid) {
				return {
					success: true,
					fixedCode: currentCode,
					attempts: llmAttempts,
				}
			}

			const lastError = validation.error || "Unknown syntax error"

			// break in the middle so we start and finish the loop with a deterministic fix
			if (llmAttempts >= this.MAX_FIX_ATTEMPTS) {
				finalError = `Failed to fix syntax after ${this.MAX_FIX_ATTEMPTS} attempts. Last error: ${lastError}`
				break
			}

			try {
				llmAttempts++
				const fixedCode = await this.requestLLMFix(currentCode, lastError)

				if (!fixedCode) {
					finalError = "LLM failed to provide a fix"
					break
				}

				currentCode = fixedCode
			} catch (requestError) {
				finalError = requestError instanceof Error ? requestError.message : "Fix request failed"
				break
			}
		}

		return {
			success: false,
			fixedCode: currentCode,
			error: finalError,
			attempts: llmAttempts,
		}
	}
}
