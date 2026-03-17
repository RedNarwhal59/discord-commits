# discord-commits

A GitHub Action that sends commit notifications to Discord via webhook, using rich embeds with color-coded commit types.

Forked from [itz-coffee/discord-commits](https://github.com/itz-coffee/discord-commits).

## Features

- **Rich embeds** - each commit gets its own Discord embed with the commit message, short SHA, repo/branch link, and file change counts
- **Color-coded commits** - green for normal, yellow for merges, red for delete-only commits
- **Committer avatar** - webhook avatar and author match the GitHub user who pushed
- **Private commits** - prefix a commit message with `!` or `$` to obfuscate it (solid block characters, file counts hidden)
- **Batch support** - pushes with many commits are split into batches of 10 (Discord's embed limit)
- **Test mode** - trigger manually via `workflow_dispatch` to preview all commit types without a real push

## Setup

1. Add your Discord webhook URL as a repository secret named `DISCORD_WEBHOOK`
2. Create a workflow file (e.g. `.github/workflows/discord-commits.yml`):

```yml
name: Discord Commits
on:
  push:
    branches:
      - main
  workflow_dispatch:
    inputs:
      testMessage:
        description: Test message to send to Discord
        required: true
        default: "Test commit notification"
      testType:
        description: Which commit type to test
        required: true
        default: "all"
        type: choice
        options:
          - all
          - normal
          - merge
          - delete
jobs:
  discord:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Discord webhook
        uses: RedNarwhal59/discord-commits@main
        with:
          webhookUrl: ${{ secrets.DISCORD_WEBHOOK }}
          testMessage: ${{ github.event.inputs.testMessage || '' }}
          testType: ${{ github.event.inputs.testType || 'all' }}
```

## Examples

![All three commit types - normal, merge, and delete](https://github.com/user-attachments/assets/6212d1ae-150f-45ff-a55e-b826bcf985d3)

### Private commits

Any commit message starting with `!` or `$` will be obfuscated - the message is replaced with solid blocks and file counts are hidden.

![Obfuscated commit](https://github.com/user-attachments/assets/e33abb7b-342c-45c3-ba76-b17828c4d2b3)

## Remarks

Currently only push events are supported. This fork was mostly for personal use, but pull requests and issues for more ideas are welcome!
