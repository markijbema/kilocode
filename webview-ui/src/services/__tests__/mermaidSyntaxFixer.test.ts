import { MermaidSyntaxFixer } from "../mermaidSyntaxFixer"

describe("MermaidSyntaxFixer", () => {
	describe("applyManualFixes", () => {
		it("should replace --&gt; with -->", () => {
			const input = "A --&gt; B"
			const expected = "A --> B"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})

		it("should replace multiple instances of --&gt; with -->", () => {
			const input = "A --&gt; B\nB --&gt; C\nC --&gt; D"
			const expected = "A --> B\nB --> C\nC --> D"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
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
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})

		it("should not modify code that does not contain --&gt;", () => {
			const input = "A --> B\nB --> C"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(input)
		})

		it("should handle empty string", () => {
			const input = ""
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe("")
		})

		it("should handle string with only --&gt;", () => {
			const input = "--&gt;"
			const expected = "-->"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})

		it("should preserve other HTML entities that are not --&gt;", () => {
			const input = "A --&gt; B &amp; C &lt; D"
			const expected = "A --> B &amp; C &lt; D"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
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
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle --&gt; at the beginning and end of lines", () => {
			const input = "--&gt; start\nmiddle --&gt; middle\nend --&gt;"
			const expected = "--> start\nmiddle --> middle\nend -->"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})

		it("should handle --&gt; with surrounding whitespace", () => {
			const input = "A   --&gt;   B"
			const expected = "A   -->   B"
			const result = MermaidSyntaxFixer.applyManualFixes(input)
			expect(result).toBe(expected)
		})
	})
})
