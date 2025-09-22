# Change Log

## [0.22.0] (pre-release)
- Performance improvements for larger reviews. If multiple model requests are necessary for a review, these are now done in parallel. This can be controlled using the `Lgtm: Max Concurrent Model Requests` setting.

## [0.21.3]
- In `LGTM: Select Chat Model`, move unsupported models to bottom of list.

## [0.21.1]
- Change default model to GPT 4.1. (previous default GPT 4o was deprecated)

## [0.21.0]
- Same as 0.20.1.

## [0.20.1] (pre-release)
- Allow reviewing the initial commit of the repository.

## [0.20.0]
Includes changes from 0.19.1 and 0.19.2.
Highlight: New improved prompt with reasoning step to reduce false positives, validate code changes against the commit description, and find refactoring opportunities.

Note: If you are using the custom prompt setting to change the comment language, a format like "- In the final JSON output, use Spanish for the  `comment` field." works best.

## [0.19.2] (pre-release)
- Change default prompt type to v2think.

## [0.19.1] (pre-release)
- Add experimental support for prompt variations. To enable, set `lgtm.comparePromptTypes` in your VS Code settings.json to a comma-separated list of prompt types. (v1: current default prompt, v2: integrate best practices, more specific instructions, v2think: v2 with added reasoning step)

## [0.19.0]
- Add optional change description argument to #reviewStaged and #reviewUnstaged LM tools. This allows agents to provide additional context and requirements for changes.

## [0.18.0]
- Add #reviewStaged and #reviewUnstaged tools for use in agent mode.

## [0.17.2]
Includes changes from 0.17.0 and 0.17.1.
Highlight: #review tool to allow usage in agent mode.
Other changes:
- Add "Max Input Tokens Fraction" setting to customize how much of the model's token window may be used.

## [0.17.1] (pre-release)
- Avoid potential initialization errors by loading chat model only on demand and offering fallback options. The configured model will no longer be reset without user interaction.
- Make parsing of JSON responses from LLM more robust. Parsing was overly strict, and would silently ignore all review comments in case of a trailing comma or unnecessary escape.

## [0.17.0] (pre-release)
- add #review tool to allow usage in agent mode. E.g. "Use the review tool to review a PR of the current branch against master and fix any severe issues."

## [0.16.1]
- Same as 0.16.0 with minor fixes.

## [0.16.0] (pre-release)
- Allow reviewing staged/unchanged changes.

## [0.15.1]
- Same as 0.15.0
- Many thanks to @dflatline for contributing the 'Select Chat Model' feature!

## [0.15.0] (pre-release)
- Add `LGTM: Select Chat Model` command to interactively choose model.

## [0.14.1]
- Same as 0.14.0

## [0.14.0] (pre-release)
- Avoid repetitive comments about the same type of problem.
- Allow selecting gemini 2.5 pro, o4-mini, gpt-4.1 and gpt-4-turbo models, remove unavailable o1-mini and gemini-1.5-pro options.

## [0.13.5]
- If token window exceedeed, truncate commit messages first. Fixes issues with larger changesets not being reviewable at all.
- Allow choosing Claude 3.7 Sonnet preview models (may not be available to all users).

## [0.13.4]
- Improve error message if no workspace is found
- Handle missing git repository more gracefully

## [0.13.3]
Includes changes from 0.12.0 to 0.13.2.
Highlights:
- Use fewer requests for reviewing changes, providing extra context for the language model and improving performance. This can be disabled via the "Merge File Review Requests" setting.
- Fix handling of deleted and renamed files
- Merge branches with same ref in branch picker
- Move progress indicator back into chat sidebar
- Allow selecting new o3-mini and gemini-2.0-flash models (Note: may not be available to all users)

## [0.13.2] (pre-release)
- Fix error handling when an unavailable chat model is selected

## [0.13.1] (pre-release)
- Move progress indicator back into chat sidebar

## [0.13.0] (pre-release)
- For renamed files, only review changed lines
- Avoid reviewing deleted files

## [0.12.4] (pre-release)
- Avoid exceeding token limit with very large files
- Allow cancelling a review from either the progress indicator or the chat side bar

## [0.12.1] (pre-release)
- Enable "Lgtm: Merge File Review Requests" by default
- Merge branches with same ref in branch picker
- Show initial commit when picking base ref

## [0.12.0] (pre-release)
- Add experimental "Lgtm: Merge File Review Requests" setting to provide more complete context to the model and reduce the number of requests
- Avoid comments with bland positive feedback

## [0.11.1]
- Show more branches/commits/tags in picker if there is enough space

## [0.11.0] (pre-release)
- Allow replacing standard prompt for a single review by adding it after a chat command (e.g. "Check code for typos only.")
- Filter comments referencing removed lines
- Avoid creating multiple output channels

## [0.10.0] (pre-release)
- Improve progress display during review.
- Show partial results when cancelling a larger review.
- The "Enable Debug Output" setting now logs to a separate channel in the output view.

## [0.9.0]
- Highlight: Added /review to compare branches, commits, or tags with a single command.
- Avoid review comments regarding formatting
- Branch sorting: for target branch show current branch first; for base branch show most relevant branches first

## [0.8.3] (pre-release)
- Add experimental Chat Model setting for changing used language model.

## [0.8.2] (pre-release)
- add combined /review command to compare branches, commits, or tags
- /branch command no longer shows tags (use /review instead)
- allow passing refs as arguments to commands, e.g. `/review develop master` or `/commit abc58`

## [0.8.1] (pre-release)
- sort branches and tags by date

## [0.8.0] (pre-release)
- Improve prompt to reduce false positives and increase comment quality

## [0.7.1]
- Same as 0.7.0

## [0.7.0] (pre-release)
- Add "Exclude" setting to define a list of files that should not be included in the review

## [0.6.1]
- same as 0.6.0

## [0.6.0] (pre-release)
- Add "Custom Prompt" setting to allow e.g. changing output language, or preventing particularly silly comments

## [0.5.6]
- Handle stream errors consistently

## [0.5.5]
- Show partial results after encountering errors

## [0.5.4]
- Fix handling of single-line files

## [0.5.3]
- Remove '@lgtm' from chat input after each command

## [0.5.2]
- Fix checking identity of git tags

## [0.5.1] (pre-release)
- Handle runtime changes to chat models more gracefully
- Avoid comments about "no newline at end of file"
- Only link line numbers if target revision is checked out

## [0.5.0] (pre-release)
- Add line numbers for found issues

## [0.4.1]
- Hide files without review comments

## [0.4.0]
- Allow selecting tags with /branch

## [0.3.1]
- Build fixes

## [0.3.0]
- Branch comparison: use changes relative to latest common ancestor
- Improve prompt

## [0.2.2]
- Update Readme

## [0.2.0]
- Make branch/commit selection more user friendly

## [0.1.2]
- Add `lgtm.enableDebugOutput` configuration option

## [0.1.1] (pre-release)

- Add more context to prompt
- Add `lgtm.minSeverity` configuration option
- Make AI response parsing more permissive

## [0.1.0] (pre-release)

- Initial release
