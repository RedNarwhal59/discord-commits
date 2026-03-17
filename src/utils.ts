import { Commit } from "@octokit/webhooks-definitions/schema"

let blocks = ["▂", "▄", "▆", "█"]

export function obfuscate(input: string): string {
	let output = String()

	for (let char of input) {
		if (char === " ") {
			output += " "
			continue
		}

		output += blocks[Math.floor(Math.random() * blocks.length)]
	}

	return output
}

export interface EmbedAuthor {
	name: string
	url?: string
	icon_url?: string
}

export interface EmbedFooter {
	text: string
	icon_url?: string
}

export interface EmbedField {
	name: string
	value: string
	inline?: boolean
}

export interface DiscordEmbed {
	color?: number
	author?: EmbedAuthor
	title?: string
	url?: string
	description?: string
	fields?: EmbedField[]
	footer?: EmbedFooter
	timestamp?: string
}

// Colors by commit type
const COLOR_DEFAULT = 0x57F287  // Green — normal commits
const COLOR_DELETE  = 0xED4245  // Red — delete-only commits
const COLOR_MERGE   = 0xFEE75C  // Yellow — merge commits

function getCommitColor(commit: Commit): number {
	// Merge commits typically start with "Merge"
	if (commit.message.startsWith("Merge")) return COLOR_MERGE

	// Delete-only: files were removed but nothing added or modified
	let hasAdded = (commit.added?.length ?? 0) > 0
	let hasModified = (commit.modified?.length ?? 0) > 0
	let hasRemoved = (commit.removed?.length ?? 0) > 0
	if (hasRemoved && !hasAdded && !hasModified) return COLOR_DELETE

	return COLOR_DEFAULT
}

export function generateEmbed(
	commit: Commit,
	senderName: string,
	senderUrl: string,
	senderAvatar: string,
	repoName: string,
	repoUrl: string,
	branch: string
): DiscordEmbed {
	let shortId = commit.id.substring(0, 7)
	let message = commit.message

	// Handle private/obfuscated commits
	if (message.startsWith("!") || message.startsWith("$")) {
		message = obfuscate(message.substring(1).trim())
	}

	// Split multi-line commit messages: first line is title, rest is extra detail
	let lines = message.split("\n")
	let title = lines[0]
	let extraLines = lines.slice(1).join("\n").trim()

	let description = title
	if (extraLines) {
		description += `\n\n${extraLines}`
	}

	// Metadata line: commit ID • repo/branch
	let branchUrl = `${repoUrl}/tree/${branch}`
	let metaLine = `[\`${shortId}\`](${repoUrl}/commit/${commit.id}) • [${repoName}/${branch}](${branchUrl})`

	// Count files changed
	let filesAdded = commit.added?.length ?? 0
	let filesModified = commit.modified?.length ?? 0
	let filesRemoved = commit.removed?.length ?? 0
	let totalFiles = filesAdded + filesModified + filesRemoved

	let fileSummary = []
	if (filesAdded > 0) fileSummary.push(`${filesAdded} added`)
	if (filesModified > 0) fileSummary.push(`${filesModified} modified`)
	if (filesRemoved > 0) fileSummary.push(`${filesRemoved} removed`)

	// Small text line: repo/branch • commit ID — file counts (all on one line)
	let smallLine = `-# ${metaLine}`
	if (totalFiles > 0) {
		smallLine += ` — ${fileSummary.join(", ")}`
	}
	description += `\n${smallLine}`

	let embed: DiscordEmbed = {
		color: getCommitColor(commit),
		author: {
			name: senderName,
			url: senderUrl,
			icon_url: senderAvatar
		},
		description: description
	}

	return embed
}

// Legacy plain-text generator (kept for reference)
export function generateText(commit: Commit): string {
	let id = commit.id.substring(0, 8)
	let repo = commit.url.split("/commit")[0]

	let text = `[\`${id}\`](<${repo}/commit/${id}>) `
	let message = commit.message

	if (message.startsWith("!") || message.startsWith("$")) {
		text += `${obfuscate(message.substring(1).trim())}`
	} else {
		text += `${message}`
	}

	text += "\n"
	return text
}
