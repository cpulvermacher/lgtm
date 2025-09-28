# LGTM - AI Code Review

[![Latest Release](https://flat.badgen.net/github/release/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/releases)
![Installs](https://vsmarketplacebadges.dev/installs-short/cpulvermacher.lgtm.svg)
[![Status](https://flat.badgen.net/github/checks/cpulvermacher/lgtm)](https://github.com/cpulvermacher/lgtm/actions/workflows/node.js.yml)
[![License](https://flat.badgen.net/github/license/cpulvermacher/lgtm)](./LICENSE)

LGTM is a Visual Studio Code extension that uses GitHub Copilot Chat to review source code changes in Git. It can help you catch bugs, areas for improvement, and other issues before merging.

## Getting Started

**Start a Review**
Switch to the Chat sidebar.

- Type `/review` to review uncommitted changes or changes between two branches, commits, or tags.
- You can specify git refs explicitly, e.g. `/review develop main`, or omit arguments to select refs interactively.
- Use `/branch` to review changes between two branches.
- Use `/commit` to review a single commit.

**View Results**

LGTM will respond with review comments grouped by file and sorted by severity.

### Use in Agent Mode

LGTM is also available in agent mode, so you can include it as part of your worklflow.
For example, you might ask the agent to `Review the current changes using #reviewStaged and fix any severe issues.`
Assuming you have staged changes, the agent will start a review using LGTM and then act on the review comments. Consider specifying the severity of issues to fix, e.g. `... and fix any issues with severity >= 3.`

![Demo](./images/demo.gif)


## Features

- **Only Copilot Required**: Uses Copilot Chat for reviewing changes.
- **Model Selection**: Choose other language model available to VS Code via the **LGTM: Select Chat Model** command available in the Command Palette (press `Cmd+Shift+P` or `Ctrl+Shift+P`).
- **Custom Instructions**: Add custom instructions via the `Lgtm: Custom Prompt` setting (e.g., change the language of review comments by adding `- In the final JSON output, use Spanish for the  `comment` field.`).
- **Agent Support**: Adds tools to enable automatic reviews in agent mode:
  - `#review`: Reviews changes between two git references (branches, tags, or commits)
  - `#reviewStaged`: Reviews only staged changes in your working directory
  - `#reviewUnstaged`: Reviews only unstaged changes in your working directory
  - Example usage: `After your changes, run all tests and run #reviewUnstaged to check your work.`
- **Chat Integration**: Review content remains in chat history for follow-up questions by omitting `@lgtm`.



## Limitations

- This project is a work in progress; comment quality may vary.
- Large change sets may trigger chat model rate limits. Please wait before retrying.
- Some non-Copilot models require setting a system prompt which is not possible just yet.


## Data Usage

Source code changes and commit messages selected for review are sent to the chat model configured in the extension settings (default: GitHub Copilot GPT-4.1).


## Contributing

Contributions are welcome! If you have ideas, bug reports, or want to help improve LGTM, please open an issue or submit a pull request on [GitHub](https://github.com/cpulvermacher/lgtm).