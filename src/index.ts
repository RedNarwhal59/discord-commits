import { context } from "@actions/github"
import * as core from "@actions/core"
import fetch from "node-fetch"
import { PushEvent } from "@octokit/webhooks-definitions/schema"
import { generateEmbed, DiscordEmbed } from "./utils"

let url = core.getInput("webhookUrl").replace("/github", "")
let staffUrl = core.getInput("staffWebhookUrl").replace("/github", "")
let testMessage = core.getInput("testMessage")
let testType = core.getInput("testType") || "all"

const WEBHOOK_USERNAME = "Commits"
const WEBHOOK_AVATAR = "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"

type AuthorOverride = { name?: string, icon_url?: string, url?: string }
let authorOverrides: Record<string, AuthorOverride> = {}
try {
	authorOverrides = JSON.parse(core.getInput("authorOverrides") || "{}")
} catch (e) {
	core.warning(`authorOverrides is not valid JSON: ${e}`)
}

function applyOverride(login: string, name: string, authorUrl: string, avatar: string) {
	let o = authorOverrides[login]
	if (!o) return { name, authorUrl, avatar }
	return {
		name: o.name ?? name,
		authorUrl: o.url ?? authorUrl,
		avatar: o.icon_url ?? avatar
	}
}

async function sendEmbeds(embeds: DiscordEmbed[], username: string, avatarUrl?: string, targetUrl?: string): Promise<void> {
	let dest = targetUrl || url
	if (!dest) return

	let res = await fetch(dest, {
		method: "POST",
		body: JSON.stringify({
			username: username,
			avatar_url: avatarUrl,
			embeds: embeds,
			allowed_mentions: { parse: [] }
		}),
		headers: { "Content-Type": "application/json" }
	})

	if (!res.ok) core.warning(`Discord webhook failed: ${await res.text()}`)
}

function fakeId(): string {
	return [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("")
}

async function sendTest(): Promise<void> {
	let fakeRepo = "https://github.com/TestUser/test-repo"
	let avatar = "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"

	// Green - normal commit
	let normalCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: testMessage,
		added: ["src/new-file.ts"],
		modified: ["src/index.ts", "README.md"],
		removed: []
	} as any

	// Yellow - merge commit
	let mergeCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: "Merge branch 'feature/new-weapons' into main",
		added: ["lua/weapons/cw_ak74.lua"],
		modified: ["lua/autorun/init.lua"],
		removed: []
	} as any

	// Red - delete-only commit
	let deleteCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: "Remove deprecated ARC9 weapon files",
		added: [],
		modified: [],
		removed: ["lua/weapons/arc9_ak47.lua", "lua/weapons/arc9_m4a1.lua", "lua/weapons/arc9_mp5.lua"]
	} as any

	// Staff-only commit (!! prefix, sent to staff webhook)
	let staffCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: `!!${testMessage}`,
		added: ["lua/config/staff_settings.lua"],
		modified: ["lua/autorun/init.lua"],
		removed: []
	} as any

	if (testType === "staff") {
		let embeds = [generateEmbed(staffCommit, "TestUser", fakeRepo, avatar, "test-repo", fakeRepo, "main")]
		await sendEmbeds(embeds, "TestUser", undefined, staffUrl)
		return
	}

	let commits: any[] = []
	if (testType === "normal") commits = [normalCommit]
	else if (testType === "merge") commits = [mergeCommit]
	else if (testType === "delete") commits = [deleteCommit]
	else commits = [normalCommit, mergeCommit, deleteCommit]

	let embeds = commits.map(c =>
		generateEmbed(c, "TestUser", fakeRepo, avatar, "test-repo", fakeRepo, "main")
	)

	await sendEmbeds(embeds, "TestUser")
}

let data = context.payload as PushEvent

let [sender, repo, branch, senderUrl, senderAvatar, repoUrl] = [
	data.sender?.login ?? "unknown",
	data.repository?.name ?? "unknown",
	context.ref.replace("refs/heads/", ""),
	data.sender?.html_url ?? "",
	data.sender?.avatar_url ?? "",
	data.repository?.html_url ?? ""
]

// Discord allows max 10 embeds per message
const MAX_EMBEDS_PER_MESSAGE = 10

// Fetch file changes from GitHub API when the push payload doesn't include them
async function fetchCommitFiles(sha: string): Promise<{ added: string[], modified: string[], removed: string[] }> {
	let owner = data.repository?.owner?.login ?? data.repository?.owner?.name ?? ""
	let repoName = data.repository?.name ?? ""
	let token = process.env.GITHUB_TOKEN || ""

	if (!owner || !repoName || !token) {
		return { added: [], modified: [], removed: [] }
	}

	try {
		let res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/commits/${sha}`, {
			headers: {
				"Authorization": `Bearer ${token}`,
				"Accept": "application/vnd.github.v3+json",
				"User-Agent": "discord-commits-action"
			}
		})

		if (!res.ok) return { added: [], modified: [], removed: [] }

		let commit = await res.json() as any
		let added: string[] = []
		let modified: string[] = []
		let removed: string[] = []

		for (let file of (commit.files ?? [])) {
			if (file.status === "added") added.push(file.filename)
			else if (file.status === "modified") modified.push(file.filename)
			else if (file.status === "removed") removed.push(file.filename)
			else if (file.status === "renamed") modified.push(file.filename)
		}

		return { added, modified, removed }
	} catch {
		return { added: [], modified: [], removed: [] }
	}
}

function hasFileData(commit: any): boolean {
	return (commit.added?.length > 0) || (commit.modified?.length > 0) || (commit.removed?.length > 0)
}

async function run(): Promise<void> {
	if (testMessage) {
		await sendTest()
		return
	}

	if (context.eventName !== "push") return

	let embeds: DiscordEmbed[] = []
	let staffEmbeds: DiscordEmbed[] = []

	for (let commit of data.commits) {
		// If the push payload doesn't include file data, fetch it from the API
		if (!hasFileData(commit)) {
			let files = await fetchCommitFiles(commit.id)
			;(commit as any).added = files.added
			;(commit as any).modified = files.modified
			;(commit as any).removed = files.removed
		}

		let login = commit.author?.username ?? sender
		let baseName = commit.author?.username ?? sender
		let baseUrl = commit.author?.username
			? `https://github.com/${commit.author.username}`
			: senderUrl
		let baseAvatar = commit.author?.username
			? `https://github.com/${commit.author.username}.png`
			: senderAvatar

		let overridden = applyOverride(login, baseName, baseUrl, baseAvatar)
		let embed = generateEmbed(commit, overridden.name, overridden.authorUrl, overridden.avatar, repo, repoUrl, branch)
		let isStaffOnly = commit.message.startsWith("!!") && staffUrl

		if (isStaffOnly) {
			staffEmbeds.push(embed)

			if (staffEmbeds.length >= MAX_EMBEDS_PER_MESSAGE) {
				await sendEmbeds(staffEmbeds, WEBHOOK_USERNAME, WEBHOOK_AVATAR, staffUrl)
				staffEmbeds = []
			}
		} else {
			embeds.push(embed)

			if (embeds.length >= MAX_EMBEDS_PER_MESSAGE) {
				await sendEmbeds(embeds, WEBHOOK_USERNAME, WEBHOOK_AVATAR)
				embeds = []
			}
		}
	}

	if (embeds.length > 0) {
		await sendEmbeds(embeds, WEBHOOK_USERNAME, WEBHOOK_AVATAR)
	}
	if (staffEmbeds.length > 0) {
		await sendEmbeds(staffEmbeds, WEBHOOK_USERNAME, WEBHOOK_AVATAR, staffUrl)
	}
}

run()
