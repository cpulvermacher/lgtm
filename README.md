# LGTM

[![Latest Release](https://flat.badgen.net/github/tag/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/tags)
![Installs](https://vsmarketplacebadges.dev/installs-short/cpulvermacher.lgtm.svg)
[![Status](https://flat.badgen.net/github/checks/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/actions/workflows/node.js.yml)
[![License](https://flat.badgen.net/github/license/cpulvermacher/lgtm)](./LICENSE)


Use GitHub Copilot Chat to review your code.

To start, open Copilot Chat and send one of the following messages:
- `@lgtm /branch` to review changes on a branch (compared to a reference branch)
- `@lgtm /commit` to review changes in a commit

## Features
- Uses the GPT-4o version of Copilot Chat, no separate subscription or API key required.
- 4000 token context window. As a result, you will get mostly comments about local issues, rather than architecture-level comments looking at how multiple files work together.
- Review content remains in chat history, so you can ask follow-up questions to Copilot (without `@lgtm`).

## Data Usage
Source code checked into Git and selected for review will be sent to GitHub Copilot. Avoid using it on repositories where you would not use Copilot.


