import { context } from "@actions/github"
import * as core from "@actions/core"
import fetch from "node-fetch"
import { PushEvent } from "@octokit/webhooks-definitions/schema"
import { generateText, obfuscate } from "./utils"

let url = core.getInput("webhookUrl").replace("/github", "")
let testMessage = core.getInput("testMessage")

async function sendTest(): Promise<void> {
	let fakeId = [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("")
	let fakeRepo = "https://github.com/TestUser/test-repo"
	let fakeCommit = {
		id: fakeId,
		url: `${fakeRepo}/commit/${fakeId}`,
		message: testMessage
	} as any

	let text = generateText(fakeCommit)
	let fakeBranch = "main"
	let fakeFooter = `- [TestUser](<${fakeRepo}>) on [test-repo](<${fakeRepo}>)/[${fakeBranch}](<${fakeRepo}/tree/${fakeBranch}>)`
	let content = text + fakeFooter

	let res = await fetch(url, {
		method: "POST",
		body: JSON.stringify({
			username: "TestUser",
			content: content,
			allowed_mentions: { parse: [] }
		}),
		headers: { "Content-Type": "application/json" }
	})

	if (!res.ok) core.setFailed(await res.text())
}

let data = context.payload as PushEvent

let [sender, repo, branch, senderUrl, repoUrl] = [
	data.sender?.login ?? "unknown",
	data.repository?.name ?? "unknown",
	context.ref.replace("refs/heads/", ""),
	data.sender?.html_url ?? "",
	data.repository?.html_url ?? ""
]

let branchUrl = `${repoUrl}/tree/${branch}`
let originalFooter = `[${repo}](<${repoUrl}>)/[${branch}](<${branchUrl}>)`

let isPrivate = false
let footer = `- [${sender}](<${senderUrl}>) on ${originalFooter}`

let buffer = String()

async function send(): Promise<void> {
	let content = buffer + footer
	let res = await fetch(url, {
		method: "POST",
		body: JSON.stringify({
			username: sender,
			avatar_url: data.sender?.avatar_url,
			content: content,
			allowed_mentions: { parse: [] }
		}),
		headers: { "Content-Type": "application/json" }
	})

	if (!res.ok) core.setFailed(await res.text())

	buffer = String()
}

async function run(): Promise<void> {
	if (testMessage) {
		await sendTest()
		return
	}

	if (context.eventName !== "push") return

	for (let commit of data.commits) {
		let text = generateText(commit)
		let sendLength = text.length + buffer.length + footer.length

		if (sendLength >= 2000) {
			await send()
		}

		buffer += text
	}

	if (buffer.length > 0) await send()
}

run()
