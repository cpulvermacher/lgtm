# LGTM - AI Code Review

[![Latest Release](https://flat.badgen.net/github/release/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/releases)
![Installs](https://vsmarketplacebadges.dev/installs-short/cpulvermacher.lgtm.svg)
[![Status](https://flat.badgen.net/github/checks/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/actions/workflows/node.js.yml)
[![License](https://flat.badgen.net/github/license/cpulvermacher/lgtm)](./LICENSE)

Review source code changes in Git using GitHub Copilot Chat.

To start, open Copilot Chat and send one of the following messages:
- `@lgtm /review` to review changes between two branches, commits, or tags. You can specify git refs using e.g. `/review develop main`, or omit the second or both arguments to select refs interactively.
- `@lgtm /branch` to review changes between two branches.
- `@lgtm /commit` to review changes in a single commit.

You'll receive review comments grouped by file after selecting the desired revisions in the quick select.

![Demo](./images/demo.gif)

## Features
- Uses Copilot Chat for reviewing changes, so only a GitHub Copilot subscription is required. Source code data is sent only to Copilot, which you presumably trust already.
- Allows adding custom instructions via the Lgtm: Custom Prompt setting to e.g. change the language of review comments.
- Allows choosing other language models via Lgtm: Chat model setting (default: GPT-4o). Some models need to be enabled in the Copilot settings first.
- Review content remains in chat history, so you can ask follow-up questions to Copilot (without `@lgtm`).

## Limitations
- Since this project is still work in progress, quality of comments may be mixed. This should improve in future versions.
- For now, only language models provided by GitHub Copilot Chat can be used via the `vscode.lm` API.
- For larger change sets you may encounter rate-limiting errors from Copilot. Please wait for the indicated time before retrying.

## Data Usage
Source code checked into Git and selected for review and commit messages will be sent to GitHub Copilot.
Avoid using it on repositories where you would not use Copilot.


