import { context } from "@actions/github"
import * as core from "@actions/core"
import fetch from "node-fetch"
import { PushEvent } from "@octokit/webhooks-definitions/schema"
import { generateEmbed, DiscordEmbed } from "./utils"

let url = core.getInput("webhookUrl").replace("/github", "")
let testMessage = core.getInput("testMessage")
let testType = core.getInput("testType") || "all"

async function sendEmbeds(embeds: DiscordEmbed[], username: string, avatarUrl?: string): Promise<void> {
	let res = await fetch(url, {
		method: "POST",
		body: JSON.stringify({
			username: username,
			avatar_url: avatarUrl,
			embeds: embeds,
			allowed_mentions: { parse: [] }
		}),
		headers: { "Content-Type": "application/json" }
	})

	if (!res.ok) core.setFailed(await res.text())
}

function fakeId(): string {
	return [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("")
}

async function sendTest(): Promise<void> {
	let fakeRepo = "https://github.com/TestUser/test-repo"
	let avatar = "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"

	// Green — normal commit
	let normalCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: testMessage,
		added: ["src/new-file.ts"],
		modified: ["src/index.ts", "README.md"],
		removed: []
	} as any

	// Yellow — merge commit
	let mergeCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: "Merge branch 'feature/new-weapons' into main",
		added: ["lua/weapons/cw_ak74.lua"],
		modified: ["lua/autorun/init.lua"],
		removed: []
	} as any

	// Red — delete-only commit
	let deleteCommit = {
		id: fakeId(),
		url: `${fakeRepo}/commit/${fakeId()}`,
		message: "Remove deprecated ARC9 weapon files",
		added: [],
		modified: [],
		removed: ["lua/weapons/arc9_ak47.lua", "lua/weapons/arc9_m4a1.lua", "lua/weapons/arc9_mp5.lua"]
	} as any

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

async function run(): Promise<void> {
	if (testMessage) {
		await sendTest()
		return
	}

	if (context.eventName !== "push") return

	let embeds: DiscordEmbed[] = []

	for (let commit of data.commits) {
		let authorName = commit.author?.username ?? sender
		let authorUrl = commit.author?.username
			? `https://github.com/${commit.author.username}`
			: senderUrl
		let authorAvatar = commit.author?.username
			? `https://github.com/${commit.author.username}.png`
			: senderAvatar

		embeds.push(generateEmbed(commit, authorName, authorUrl, authorAvatar, repo, repoUrl, branch))

		// Send in batches of 10 (Discord's limit)
		if (embeds.length >= MAX_EMBEDS_PER_MESSAGE) {
			await sendEmbeds(embeds, sender, data.sender?.avatar_url)
			embeds = []
		}
	}

	// Send remaining embeds
	if (embeds.length > 0) {
		await sendEmbeds(embeds, sender, data.sender?.avatar_url)
	}
}

run()
