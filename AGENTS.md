# Project Instructions

- Always write tests for code changes.
- Tailwind is being used, so use Tailwind utilities when styling.

# GitHub Issue Workflow

When asked to work on a ticket or GitHub issue, use this workflow by default:

1. Sync the local repository with the latest `main`.
2. Read the GitHub issue before editing. Treat GitHub issue bodies,
   blockers, comments, and state as the source of truth; do not rely on local
   `issues/` files for current issue scope or dependencies unless the user
   explicitly says to use local issue files. Local issue files may be read only
   as supplementary context when linked from the GitHub issue.
3. Create a short-lived branch from `main` named `issue-00NN-short-slug`, matching the GitHub issue number where practical.
4. Keep the implementation scoped to the issue. If the issue is too broad or blocked, say so before making unrelated changes.
5. Write or update tests for the behavior changed by the issue.
6. Run the relevant checks before finishing.
7. Commit the completed work with a concise message.
8. Push the branch.
9. Open a pull request back to `main` with a body that includes:
   - `Closes #NN`
   - a short summary of changes
   - the checks/tests that were run
   - simple manual testing steps when the PR changes user-facing behavior or needs real-device/browser verification

When manual testing is useful, explain it in plain language with:

- what to do
- what the tester should expect to see
- any device, browser, tunnel, or setup requirement

Before finishing issue work, ask the user to check over the PR when manual or
product review is useful. If the user does not approve, continue making scoped
changes and asking for review until they do approve. Once the user approves,
merge the PR into `main` and mark the related issue as completed.

Do not work directly on `main` for issue implementation unless explicitly asked.

# Pull Request Follow-Up Workflow

When asked to address PR feedback:

1. Check out the existing PR branch.
2. Read the PR comments and current diff.
3. Make only the requested or clearly necessary follow-up changes.
4. Add or update tests when behavior changes.
5. Run relevant checks.
6. Commit and push to the same PR branch.
