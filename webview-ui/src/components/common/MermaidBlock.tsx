import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import styled from "styled-components"
import { useDebounceEffect } from "@src/utils/useDebounceEffect"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useCopyToClipboard } from "@src/utils/clipboard"
import { MermaidSyntaxFixer } from "@src/services/mermaidSyntaxFixer"
import CodeBlock from "./CodeBlock"
import { MermaidButton } from "@src/components/common/MermaidButton"

// Removed previous attempts at static imports for individual diagram types
// as the paths were incorrect for Mermaid v11.4.1 and caused errors.
// The primary strategy will now rely on Vite's bundling configuration.
const MERMAID_THEME = {
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

// Initialize mermaid once at the module level
// This ensures consistent configuration across the application
// The configuration above is used by all Mermaid diagrams in the application
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

interface MermaidBlockProps {
	code: string
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isErrorExpanded, setIsErrorExpanded] = useState(false)
	const [isFixing, setIsFixing] = useState(false)
	const [fixAttempts, setFixAttempts] = useState(0)
	const [currentCode, setCurrentCode] = useState(code)
	const [hasAutoFixed, setHasAutoFixed] = useState(false)
	const { showCopyFeedback, copyWithFeedback } = useCopyToClipboard()
	const { t } = useAppTranslation()

	// 1) Whenever `code` changes, mark that we need to re-render a new chart
	useEffect(() => {
		setIsLoading(true)
		setError(null)
		setCurrentCode(code)
		setHasAutoFixed(false)
		setFixAttempts(0)
	}, [code])

	// 2) Debounce the actual parse/render with LLM-powered fixing
	useDebounceEffect(
		() => {
			const renderMermaid = async () => {
				if (containerRef.current) {
					containerRef.current.innerHTML = ""
				}

				try {
					// First try to parse and render the current code
					await mermaid.parse(currentCode)
					const id = `mermaid-${Math.random().toString(36).substring(2)}`
					const { svg } = await mermaid.render(id, currentCode)

					if (containerRef.current) {
						containerRef.current.innerHTML = svg
					}

					// Clear any previous errors
					setError(null)
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : "Failed to render Mermaid diagram"
					console.warn("Mermaid parse/render failed:", err)

					// If we haven't tried auto-fixing yet and this is the original code, attempt LLM fix
					if (!hasAutoFixed && currentCode === code && !isFixing) {
						setIsFixing(true)

						try {
							const fixResult = await MermaidSyntaxFixer.autoFixSyntax(currentCode, MERMAID_THEME)

							if (fixResult.success && fixResult.fixedCode && fixResult.fixedCode !== currentCode) {
								setCurrentCode(fixResult.fixedCode)
								setHasAutoFixed(true)
								setFixAttempts(fixResult.attempts || 0)
								// The useEffect will trigger re-render with fixed code
								return
							} else {
								// LLM couldn't fix it, show the original error
								setError(errorMessage)
							}
						} catch (fixError) {
							console.warn("LLM fix failed:", fixError)
							setError(errorMessage)
						} finally {
							setIsFixing(false)
						}
					} else {
						// Either already tried fixing or this is a manual retry
						setError(errorMessage)
					}
				} finally {
					if (!isFixing) {
						setIsLoading(false)
					}
				}
			}

			renderMermaid()
		},
		500, // Delay 500ms
		[currentCode], // Dependencies for scheduling
	)

	/**
	 * Called when user clicks the rendered diagram.
	 * Converts the <svg> to a PNG and sends it to the extension.
	 */
	const handleClick = async () => {
		if (!containerRef.current) return
		const svgEl = containerRef.current.querySelector("svg")
		if (!svgEl) return

		try {
			const pngDataUrl = await svgToPng(svgEl, MERMAID_THEME.background)
			vscode.postMessage({
				type: "openImage",
				text: pngDataUrl,
			})
		} catch (err) {
			console.error("Error converting SVG to PNG:", err)
		}
	}

	// Manual fix function
	const handleManualFix = async () => {
		if (isFixing) return

		setIsFixing(true)
		setError(null)

		try {
			const fixResult = await MermaidSyntaxFixer.autoFixSyntax(code, MERMAID_THEME)

			if (fixResult.success && fixResult.fixedCode) {
				setCurrentCode(fixResult.fixedCode)
				setHasAutoFixed(true)
				setFixAttempts(fixResult.attempts || 0)
			} else {
				setError(fixResult.error || "Failed to fix Mermaid syntax")
			}
		} catch (fixError) {
			console.warn("Manual fix failed:", fixError)
			setError(fixError instanceof Error ? fixError.message : "Fix request failed")
		} finally {
			setIsFixing(false)
		}
	}

	// Copy functionality handled directly through the copyWithFeedback utility

	return (
		<MermaidBlockContainer>
			{(isLoading || isFixing) && (
				<LoadingMessage>{isFixing ? "Fixing Mermaid syntax..." : t("common:mermaid.loading")}</LoadingMessage>
			)}

			{error ? (
				<div style={{ marginTop: "0px", overflow: "hidden", marginBottom: "8px" }}>
					<div
						style={{
							borderBottom: isErrorExpanded ? "1px solid var(--vscode-editorGroup-border)" : "none",
							fontWeight: "normal",
							fontSize: "var(--vscode-font-size)",
							color: "var(--vscode-editor-foreground)",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							cursor: "pointer",
						}}
						onClick={() => setIsErrorExpanded(!isErrorExpanded)}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "10px",
								flexGrow: 1,
							}}>
							<span
								className="codicon codicon-warning"
								style={{
									color: "var(--vscode-editorWarning-foreground)",
									opacity: 0.8,
									fontSize: 16,
									marginBottom: "-1.5px",
								}}></span>
							<span style={{ fontWeight: "bold" }}>
								{t("common:mermaid.render_error")}
								{hasAutoFixed && ` (Auto-fixed after ${fixAttempts} attempts)`}
							</span>
						</div>
						<div style={{ display: "flex", alignItems: "center" }}>
							{!hasAutoFixed && (
								<FixButton
									onClick={(e) => {
										e.stopPropagation()
										handleManualFix()
									}}
									disabled={isFixing}
									title="Fix syntax with AI">
									<span className={`codicon codicon-${isFixing ? "loading" : "wand"}`}></span>
								</FixButton>
							)}
							<CopyButton
								onClick={(e) => {
									e.stopPropagation()
									const codeToUse = hasAutoFixed ? currentCode : code
									const combinedContent = `Error: ${error}\n\n\`\`\`mermaid\n${codeToUse}\n\`\`\``
									copyWithFeedback(combinedContent, e)
								}}>
								<span className={`codicon codicon-${showCopyFeedback ? "check" : "copy"}`}></span>
							</CopyButton>
							<span className={`codicon codicon-chevron-${isErrorExpanded ? "up" : "down"}`}></span>
						</div>
					</div>
					{isErrorExpanded && (
						<div
							style={{
								padding: "8px",
								backgroundColor: "var(--vscode-editor-background)",
								borderTop: "none",
							}}>
							<div style={{ marginBottom: "8px", color: "var(--vscode-descriptionForeground)" }}>
								{error}
								{hasAutoFixed && (
									<div style={{ marginTop: "4px", fontSize: "0.9em", fontStyle: "italic" }}>
										Note: This diagram was automatically fixed from the original syntax.
									</div>
								)}
							</div>
							<CodeBlock language="mermaid" source={hasAutoFixed ? currentCode : code} />
							{hasAutoFixed && currentCode !== code && (
								<div style={{ marginTop: "8px" }}>
									<div style={{ marginBottom: "4px", fontSize: "0.9em", fontWeight: "bold" }}>
										Original code:
									</div>
									<CodeBlock language="mermaid" source={code} />
								</div>
							)}
						</div>
					)}
				</div>
			) : (
				<MermaidButton
					containerRef={containerRef}
					code={code}
					isLoading={isLoading || isFixing}
					svgToPng={(svgEl) => svgToPng(svgEl, MERMAID_THEME.background)}>
					<SvgContainer
						onClick={handleClick}
						ref={containerRef}
						$isLoading={isLoading || isFixing}></SvgContainer>
				</MermaidButton>
			)}
		</MermaidBlockContainer>
	)
}

async function svgToPng(svgEl: SVGElement, backgroundColor: string): Promise<string> {
	// Clone the SVG to avoid modifying the original
	const svgClone = svgEl.cloneNode(true) as SVGElement

	// Get the original viewBox
	const viewBox = svgClone.getAttribute("viewBox")?.split(" ").map(Number) || []
	const originalWidth = viewBox[2] || svgClone.clientWidth
	const originalHeight = viewBox[3] || svgClone.clientHeight

	// Calculate the scale factor to fit editor width while maintaining aspect ratio

	// Unless we can find a way to get the actual editor window dimensions through the VS Code API (which might be possible but would require changes to the extension side),
	// the fixed width seems like a reliable approach.
	const editorWidth = 3_600

	const scale = editorWidth / originalWidth
	const scaledHeight = originalHeight * scale

	// Update SVG dimensions
	svgClone.setAttribute("width", `${editorWidth}`)
	svgClone.setAttribute("height", `${scaledHeight}`)

	const serializer = new XMLSerializer()
	const svgString = serializer.serializeToString(svgClone)

	// Create a data URL directly
	// First, ensure the SVG string is properly encoded
	const encodedSvg = encodeURIComponent(svgString).replace(/'/g, "%27").replace(/"/g, "%22")

	const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`

	return new Promise((resolve, reject) => {
		const img = new Image()

		img.onload = () => {
			const canvas = document.createElement("canvas")
			canvas.width = editorWidth
			canvas.height = scaledHeight

			const ctx = canvas.getContext("2d")
			if (!ctx) return reject("Canvas context not available")

			// Fill background with the provided background color
			ctx.fillStyle = backgroundColor
			ctx.fillRect(0, 0, canvas.width, canvas.height)

			ctx.imageSmoothingEnabled = true
			ctx.imageSmoothingQuality = "high"

			ctx.drawImage(img, 0, 0, editorWidth, scaledHeight)
			resolve(canvas.toDataURL("image/png", 1.0))
		}
		img.onerror = reject
		img.src = svgDataUrl
	})
}

const MermaidBlockContainer = styled.div`
	position: relative;
	margin: 8px 0;
`

const LoadingMessage = styled.div`
	padding: 8px 0;
	color: var(--vscode-descriptionForeground);
	font-style: italic;
	font-size: 0.9em;
`

const CopyButton = styled.button`
	padding: 3px;
	height: 24px;
	margin-right: 4px;
	color: var(--vscode-editor-foreground);
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	cursor: pointer;

	&:hover {
		opacity: 0.8;
	}
`

const FixButton = styled.button`
	padding: 3px;
	height: 24px;
	margin-right: 4px;
	color: var(--vscode-editor-foreground);
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	cursor: pointer;

	&:hover {
		opacity: 0.8;
		color: var(--vscode-button-foreground);
		background: var(--vscode-button-hoverBackground);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.codicon-loading {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
`

interface SvgContainerProps {
	$isLoading: boolean
}

const SvgContainer = styled.div<SvgContainerProps>`
	opacity: ${(props) => (props.$isLoading ? 0.3 : 1)};
	min-height: 20px;
	transition: opacity 0.2s ease;
	cursor: pointer;
	display: flex;
	justify-content: center;
	max-height: 400px;

	/* Ensure the SVG scales within the container */
	& > svg {
		display: block; /* Ensure block layout */
		width: 100%;
		max-height: 100%; /* Respect container's max-height */
	}
`
