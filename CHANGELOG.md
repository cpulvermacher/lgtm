# Change Log

## [0.11.0] (pre-release)
- Allow replacing standard prompt for a single review by adding it after a chat command (e.g. "Check code for typos only.")

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