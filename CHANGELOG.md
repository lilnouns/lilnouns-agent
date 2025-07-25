# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-alpha.13] - 2025-07-25

### 🚀 Features

- *(uttils)* Sanitize AI responses (#2)

## [1.0.0-alpha.12] - 2025-07-25

### 🚀 Features

- *(prompts)* Update response length guideline

### 🐛 Bug Fixes

- *(propmpts)* Clarify plain-text response guideline (#1)

## [1.0.0-alpha.11] - 2025-07-24

### 🚀 Features

- *(tools)* Add `link` properties for auction and proposals

## [1.0.0-alpha.10] - 2025-07-24

### 🚀 Features

- *(agent)* Add `max_tokens` support in AI requests

## [1.0.0-alpha.9] - 2025-07-24

### 🚀 Features

- *(config)* Add `.editorconfig` for consistent formatting
- *(agent)* Improve auction data logging
- *(agent)* Add fetchLilNounsProposalSummary tool
- *(config)* Support multiple AI models for tasks
- *(config)* Add `textEmbedding` AI model support
- *(config)* Add `translation` AI model support
- *(agent)* Add `getCurrentIsoDateTimeUtc` tool
- *(tools)* Add ISO timestamp parsing for proposals
- *(tools)* Add utility methods for Lil Nouns data fetch
- *(tools)* Add return types to utility functions
- *(tools)* Add fetchLilNounsProposalsState function

## [1.0.0-alpha.8] - 2025-07-23

### 🐛 Bug Fixes

- *(agent)* Update `rewrite_query` default to false

## [1.0.0-alpha.7] - 2025-07-23

### 🚀 Features

- *(agent)* Integrate AutoRAG for context-based responses
- *(agent)* Enhance AutoRAG query configuration
- *(agent)* Add fetchLilNounsTokenTotalSupply tool

## [1.0.0-alpha.6] - 2025-07-23

### 🚜 Refactor

- *(config)* Simplify `getConfig` logic
- *(config)* Enhance validation and error handling

### ⚙️ Miscellaneous Tasks

- *(types)* Add `NODE_ENV` to `Env` interface

## [1.0.0-alpha.5] - 2025-07-23

### ⚙️ Miscellaneous Tasks

- *(config)* Add `NODE_ENV` variable to `wrangler.toml`

## [1.0.0-alpha.4] - 2025-07-23

### 🚀 Features

- *(config)* Add `getConfig` utility for env parsing
- *(agent)* Refactor and expand agent configuration

### 🐛 Bug Fixes

- *(config)* Update `aiModel` to specific model identifier

### 🚜 Refactor

- *(index)* Rename functions for clarity and consistency
- *(index)* Simplify `agentSystemMessage` structure

## [1.0.0-alpha.3] - 2025-07-23

### 🚜 Refactor

- *(index)* Enhance `systemMessage` structure and clarity

## [1.0.0-alpha.2] - 2025-07-23

### 🚜 Refactor

- *(index)* Update gateway `id` for improved context

## [1.0.0-alpha.1] - 2025-07-23

### ⚙️ Miscellaneous Tasks

- *(config)* Update `wrangler.toml` settings
- *(config)* Add `placement` configuration to `wrangler.toml`

## [1.0.0-alpha.0] - 2025-07-23

### 🚀 Features

- *(worker)* Add initial Cloudflare Worker implementation
- *(config)* Enable cron triggers in `wrangler.toml`
- *(worker)* Replace fetch handler with scheduled handler
- *(worker)* Implement fetch handler for testing scheduled tasks
- *(worker)* Enhance scheduled task with API fetch
- *(worker)* Integrate `farcasterClient` into scheduled task
- *(config)* Add `FARCASTER_AUTH_TOKEN` to `Env`
- *(worker)* Add auth to `farcasterClient` configuration
- *(worker)* Add message fetching for unread group mentions
- *(worker)* Add sorting and filtering for messages
- *(worker)* Add `sendDirectCastMessage` for replies
- *(worker)* Integrate `runWithTools` for AI responses
- *(worker)* Add Lil Nouns-specific AI assistant guidelines
- *(worker)* Add `viem` public client for mainnet
- *(worker)* Add `fetchLilNounsActiveProposals` tool
- *(worker)* Add KV namespace binding for `AGENT_CACHE`
- *(worker)* Add `AGENT_CACHE` binding to `Env`
- *(index)* Add debug logging for improved tracing
- *(worker)* Add `ETHEREUM_RPC_URL` binding to `Env`
- *(index)* Add current auction fetching with `wagmi`
- *(index)* Enhance system messaging for user guidance

### 🐛 Bug Fixes

- *(worker)* Skip messages sent by Lil Nouns
- *(worker)* Refine Lil Nouns response guidelines

### 🚜 Refactor

- *(config)* Simplify `vite` configuration
- *(worker)* Extract message retrieval into helper functions
- *(worker)* Update message filtering for Lil Nouns
- *(worker)* Replace `runWithTools` with `env.AI.run`
- *(worker)* Remove redundant comments
- *(worker)* Extract `processConversations` function
- *(worker)* Update variable usage for `tool_calls`
- *(worker)* Extract `fetchActiveProposals` function
- *(worker)* Return proposals from `fetchActiveProposals`
- *(worker)* Extract system message and gateway config
- *(worker)* Simplify system message and gateway config usage
- *(worker)* Remove redundant `console.log` statements
- *(worker)* Format proposal timestamps to ISO
- *(index)* Add `sendDirectCastMessage` method usage
- *(index)* Filter conversations by timestamp
- *(index)* Streamline system message content

### 📚 Documentation

- *(worker)* Add inline comments to clarify bot workflow and logicc data.

### 🧪 Testing

- *(worker)* Add unit tests for `scheduled` handler
- *(scheduled)* Refactor tests with Cloudflare testing utilities

### ⚙️ Miscellaneous Tasks

- *(project)* Initialize `lilnouns-agent` project
- *(scripts)* Add `format` and `format:check` scripts
- *(project)* Move `keywords` to correct position
- *(project)* Update `.gitignore` to ignore `node_modules`
- *(project)* Add `.prettierignore` file
- *(project)* Add `.prettierrc` configuration
- *(scripts)* Add `prepare` script for Git hooks setup
- *(lint-staged)* Configure linting for staged files
- *(husky)* Add pre-commit hook to run `lint-staged`
- *(project)* Migrate from `prettier` to `@biomejs/biome`
- *(gitignore)* Expand ignored files and directories
- *(scripts)* Add build, dev, deploy, and start scripts
- *(project)* Add TypeScript configuration
- *(project)* Add `wrangler.toml` for Cloudflare configuration
- *(scripts)* Update `build` script to use `vite`
- *(scripts)* Update `test` scripts to use `vitest`
- *(tsconfig)* Update `types` and disable declarations
- *(config)* Update `wrangler.toml` compatibility settings
- *(config)* Add `vitest.config.ts` for test configuration
- *(config)* Add `vite.config.mts` for build configuration
- *(tsconfig)* Update `types` for Cloudflare worker support
- *(config)* Update `vitest.config.ts` for worker support
- *(config)* Add AI binding to `wrangler.toml`
- *(tsconfig)* Remove `@cloudflare/vitest-pool-workers` type
- *(scripts)* Add `cf-typegen` command to package scripts
- *(types)* Add `worker-configuration.d.ts` for Cloudflare
- *(types)* Add `env.d.ts` for Cloudflare test support
- *(tsconfig)* Add test-specific config for bundler types
- *(scripts)* Update `dev` and `start` scripts with test flag
- *(package)* Mark package as private
- *(scripts)* Update `build` script to use wrangler
- *(config)* Update compatibility flags in `wrangler.toml`
- *(config)* Remove unused `vite` configuration
- *(config)* Update compatibility date in `wrangler.toml`
- *(config)* Update `tsconfig.json` for improved clarity
- *(config)* Add `.editorconfig` for unified coding styles
- *(scripts)* Simplify `test` and `test:run` commands
- *(config)* Remove `.editorconfig` file
- *(config)* Reformat configuration files for consistency
- *(config)* Update pnpm workspace settings
- *(gitignore)* Add `/docs/tasks.md` to ignored files
- *(gitignore)* Add `/docs/requirements.md` to ignored files
- *(gitignore)* Add `/docs/plan.md` to ignored files
- *(worker)* Update `worker-configuration` types
- *(gitignore)* Add `schema.graphql` to `.gitignore`
- *(tsconfig)* Update `moduleResolution` to `bundler`

<!-- generated by git-cliff -->
