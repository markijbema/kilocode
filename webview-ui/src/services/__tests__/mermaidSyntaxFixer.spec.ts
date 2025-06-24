import { MermaidSyntaxFixer } from "../mermaidSyntaxFixer"
import { vi, beforeEach, afterEach } from "vitest"

// Mock the mermaid library
vi.mock("mermaid", () => ({
	default: {
		parse: vi.fn(),
	},
}))

describe("MermaidSyntaxFixer", () => {
	// Add tests for fixSyntax method
	describe("fixSyntax", () => {
		// Mock the private requestLLMFix method
		let requestLLMFixSpy: any
		let validateSyntaxSpy: any

		beforeEach(() => {
			// Create spies for the private methods
			requestLLMFixSpy = vi.spyOn(MermaidSyntaxFixer as any, "requestLLMFix")
			validateSyntaxSpy = vi.spyOn(MermaidSyntaxFixer, "validateSyntax")
		})

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it("should return success and fixed code when validation succeeds", async () => {
			const applyDeterministicFixesSpy = vi.spyOn(MermaidSyntaxFixer, "applyDeterministicFixes")
			applyDeterministicFixesSpy.mockReturnValue("deterministically fixed code")

			validateSyntaxSpy.mockResolvedValue({ isValid: true })
			requestLLMFixSpy.mockResolvedValue("fixed code")

			const result = await MermaidSyntaxFixer.fixSyntax("original code", "error")

			expect(result.success).toBe(true)
			expect(result.fixedCode).toBe("deterministically fixed code")
			expect(result.attempts).toBe(1)
			expect(applyDeterministicFixesSpy).toHaveBeenCalledWith("fixed code")
		})

		it("should return the best attempt even when fix is not successful", async () => {
			// Mock failed validation for both attempts
			validateSyntaxSpy.mockResolvedValueOnce({ isValid: false, error: "error 1" })
			validateSyntaxSpy.mockResolvedValueOnce({ isValid: false, error: "error 2" })

			// Mock LLM fix attempts
			requestLLMFixSpy.mockResolvedValueOnce("first attempt")
			requestLLMFixSpy.mockResolvedValueOnce("second attempt")

			// Mock applyDeterministicFixes
			const applyDeterministicFixesSpy = vi.spyOn(MermaidSyntaxFixer, "applyDeterministicFixes")
			applyDeterministicFixesSpy.mockReturnValueOnce("deterministically fixed first attempt")
			applyDeterministicFixesSpy.mockReturnValueOnce("deterministically fixed second attempt")

			const result = await MermaidSyntaxFixer.fixSyntax("original code", "initial error")

			expect(result.success).toBe(false)
			expect(result.fixedCode).toBe("deterministically fixed second attempt") // Should return the deterministically fixed last attempt
			expect(result.attempts).toBe(2)
			expect(result.error).toContain("Failed to fix syntax after 2 attempts")

			expect(applyDeterministicFixesSpy).toHaveBeenCalledTimes(2)
			expect(applyDeterministicFixesSpy).toHaveBeenNthCalledWith(1, "first attempt")
			expect(applyDeterministicFixesSpy).toHaveBeenNthCalledWith(2, "second attempt")
		})

		it("should return the best attempt when LLM request fails", async () => {
			// Mock successful first attempt but failed second attempt
			requestLLMFixSpy.mockResolvedValueOnce("first attempt")
			requestLLMFixSpy.mockRejectedValueOnce(new Error("LLM request failed"))

			// Mock failed validation for first attempt
			validateSyntaxSpy.mockResolvedValueOnce({ isValid: false, error: "still invalid" })

			// Mock applyDeterministicFixes
			const applyDeterministicFixesSpy = vi.spyOn(MermaidSyntaxFixer, "applyDeterministicFixes")
			applyDeterministicFixesSpy.mockReturnValue("deterministically fixed first attempt")

			const result = await MermaidSyntaxFixer.fixSyntax("original code", "error")

			expect(result.success).toBe(false)
			expect(result.fixedCode).toBe("deterministically fixed first attempt") // Should return the deterministically fixed best attempt
			expect(result.error).toContain("LLM request failed")
			expect(applyDeterministicFixesSpy).toHaveBeenCalledWith("first attempt")
		})

		it("should return the original code when LLM fails to provide a fix", async () => {
			// Mock LLM returning null (no fix provided)
			requestLLMFixSpy.mockResolvedValueOnce(null)

			const result = await MermaidSyntaxFixer.fixSyntax("original code", "error")

			expect(result.success).toBe(false)
			expect(result.fixedCode).toBe("original code") // Should return the original code
			expect(result.error).toBe("LLM failed to provide a fix")
		})
	})

	describe("applyDeterministicFixes", () => {
		it("should replace --&gt; with -->", () => {
			const input = "A --&gt; B"
			const expected = "A --> B"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should replace multiple instances of --&gt; with -->", () => {
			const input = "A --&gt; B\nB --&gt; C\nC --&gt; D"
			const expected = "A --> B\nB --> C\nC --> D"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle complex mermaid diagrams with --&gt; errors", () => {
			const input = `graph TD
    A[Start] --&gt; B{Decision}
    B --&gt; C[Option 1]
    B --&gt; D[Option 2]
    C --&gt; E[End]
    D --&gt; E`
			const expected = `graph TD
    A[Start] --> B{Decision}
    B --> C[Option 1]
    B --> D[Option 2]
    C --> E[End]
    D --> E`
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should not modify code that does not contain --&gt;", () => {
			const input = "A --> B\nB --> C"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(input)
		})

		it("should handle empty string", () => {
			const input = ""
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe("")
		})

		it("should handle string with only --&gt;", () => {
			const input = "--&gt;"
			const expected = "-->"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should preserve other HTML entities that are not --&gt;", () => {
			const input = "A --&gt; B &amp; C &lt; D"
			const expected = "A --> B &amp; C &lt; D"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle mixed content with --&gt; in different contexts", () => {
			const input = `flowchart LR
    A[User Input] --&gt; B[Process]
    B --&gt; C{Valid?}
    C --&gt;|Yes| D[Success]
    C --&gt;|No| E[Error]`
			const expected = `flowchart LR
    A[User Input] --> B[Process]
    B --> C{Valid?}
    C -->|Yes| D[Success]
    C -->|No| E[Error]`
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle --&gt; at the beginning and end of lines", () => {
			const input = "--&gt; start\nmiddle --&gt; middle\nend --&gt;"
			const expected = "--> start\nmiddle --> middle\nend -->"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle --&gt; with surrounding whitespace", () => {
			const input = "A   --&gt;   B"
			const expected = "A   -->   B"
			const result = MermaidSyntaxFixer.applyDeterministicFixes(input)
			expect(result).toBe(expected)
		})

		describe("autoFixSyntax", () => {
			let validateSyntaxSpy: any
			let fixSyntaxSpy: any

			beforeEach(() => {
				validateSyntaxSpy = vi.spyOn(MermaidSyntaxFixer, "validateSyntax")
				fixSyntaxSpy = vi.spyOn(MermaidSyntaxFixer, "fixSyntax")
			})

			afterEach(() => {
				vi.restoreAllMocks()
			})

			it("should return success when deterministic fixes are sufficient", async () => {
				// Mock successful validation after deterministic fixes
				validateSyntaxSpy.mockResolvedValue({ isValid: true })

				const result = await MermaidSyntaxFixer.autoFixSyntax("A --&gt; B")

				expect(result.success).toBe(true)
				expect(result.fixedCode).toBe("A --> B")
				expect(result.attempts).toBe(0)
				// fixSyntax should NOT be called when validation passes after deterministic fixes
				expect(fixSyntaxSpy).not.toHaveBeenCalled()
			})

			it("should call fixSyntax when deterministic fixes are not sufficient", async () => {
				// Mock failed validation after deterministic fixes
				validateSyntaxSpy.mockResolvedValue({ isValid: false, error: "Syntax error" })

				// Mock fixSyntax to return a successful result
				fixSyntaxSpy.mockResolvedValue({
					success: true,
					fixedCode: "fixed code",
					attempts: 1,
				})

				const result = await MermaidSyntaxFixer.autoFixSyntax("invalid code")

				expect(fixSyntaxSpy).toHaveBeenCalled()
				expect(result.success).toBe(true)
				expect(result.fixedCode).toBe("fixed code")
				expect(result.attempts).toBe(1)
			})

			it("should pass through fixedCode even when fix is not successful", async () => {
				// Mock failed validation after deterministic fixes
				validateSyntaxSpy.mockResolvedValue({ isValid: false, error: "Syntax error" })

				// Mock fixSyntax to return an unsuccessful result but with improved code
				fixSyntaxSpy.mockResolvedValue({
					success: false,
					fixedCode: "improved but still invalid code",
					error: "Could not fully fix syntax",
					attempts: 2,
				})

				const result = await MermaidSyntaxFixer.autoFixSyntax("very invalid code")

				expect(result.success).toBe(false)
				expect(result.fixedCode).toBe("improved but still invalid code")
				expect(result.error).toBe("Could not fully fix syntax")
				expect(result.attempts).toBe(2)
			})
		})
	})
})
