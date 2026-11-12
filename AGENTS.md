# Project Workspace Guidelines

## Primary Repository & Workspaces
- **Remote Repository**: `https://github.com/iS-Baseball-Lab/iScoreCloud.git`
- **Primary Workspace — Remote Environment (Linux VM)**: `/home/antigravity/iS-Baseball-Lab/iScoreCloud` (Main development environment)
- **Secondary Workspace — Local PC (Windows)**: `C:\Users\mamor\GitHub\iScoreCloud` (Local SSD, outside OneDrive; run `git pull` first when switching back to local)
- Detect the current OS/environment automatically and execute all development, file edits, builds, type checks (`tsc` / `npm run check`), and `git` operations directly inside the active workspace for that environment.

## Remote-First Workflow & Project Rules
- Because the remote Linux VM is the primary environment and each new conversation starts from a fresh clone of GitHub, commit and push changes (`main` or a working branch as instructed) at good stopping points so all progress persists across conversations.
- Pushing to `main` automatically triggers **Cloudflare Workers Builds** (`npm run build` -> `npx wrangler deploy`) to build the Next.js app and deploy to Cloudflare Workers. Always verify builds/type checks (`npm run check`) pass before pushing code changes to `main` (and note when any new D1 SQL migrations under `drizzle/` need remote application).
- When implementing features or UI/UX updates, always consult and follow `.agent/skills/i-score-dev/SKILL.md`.

## Retired Paths
- The old path `C:\Users\mamor\OneDrive\ドキュメント\GitHub\i-score` has been retired and renamed to `i-score_backup`. Do not modify or sync to it.
