# FarmVerse working rules

Codex is the Lead. Google Antigravity is the Collaborator. Read the guide for your role before making changes.

- Codex: [Lead guide](docs/agents/lead.md)
- Antigravity: [Collaborator guide](docs/agents/collaborator.md)

## Project decisions

- Read the [MVP contract](docs/FARMVERSE_MVP_CONTRACT.md) for C01–C03, invariants, and acceptance criteria. Changes to locked behavior require an approved amendment.
- Read the [Phaser MVP guide](docs/FARMVERSE_PHASER_MVP_GUIDE.md) for the approved stack, delivery phases, and technical amendments.
- The Node.js/Hono API owns gameplay rules and stores persistent state in PostgreSQL. Phaser renders that state and sends player intents. Keep shared HTTP/JSON schemas independent of the game engine and validate requests on the server.
- Before generating, editing, or integrating art, read the [Art Bible](docs/art/ART_BIBLE.md). Both roles follow the same art approval process.

## Shared working rules

- Agree on the task, file ownership, and acceptance checks before edits. Each shared file has one writer at a time. Raise an out-of-scope change with the Lead before editing.
- Use separate Git worktrees or checkouts when both agents are editing in parallel. Preserve existing user changes and check the diff before handoff.
- Keep signing secrets server-side and outside version control. Keep the NEAR testnet demo separate from gameplay balances and inventory.
