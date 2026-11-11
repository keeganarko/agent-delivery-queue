# agent-delivery-queue: rules for agents

AGENTS.md and CLAUDE.md are the same file. Edit both, byte for byte.

- Zero runtime dependencies and no build step. Plain ESM JavaScript in
  `src/index.js`, hand-written types in `src/index.d.ts`. Keep the two in
  step.
- Tests use `node:test` in `test/`. Run `npm test` and report the real
  summary lines.
- Preserve the core invariant: while a person is typing, incoming agent
  messages wait and never overwrite an unsent human draft.
- No personal paths, emails, private project names or internal ticket
  IDs anywhere in the repo. Commit with the GitHub noreply address.
- The license is FSL-1.1-MIT. Call the project source-available, never
  open source.
