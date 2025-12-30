# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-alpha.48] - 2025-12-30

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.47] - 2025-12-30

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.46] - 2025-12-11

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.45] - 2025-11-29

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.44] - 2025-10-11

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.43] - 2025-09-29

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.42] - 2025-09-26

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.41] - 2025-09-17

### 🐛 Bug Fixes

- Solve some minor issues and update dependencies

## [1.0.0-alpha.40] - 2025-09-16

### 🐛 Bug Fixes

- *(utils)* Improve whitespace handling in text processing

### 🧪 Testing

- *(utils)* Add test case for URL splitting in messages

## [1.0.0-alpha.39] - 2025-09-16

### 🚀 Features

- *(handler)* Support multi-chunk message sending

### 🚜 Refactor

- *(index)* Comment out unused `fetch` handler
- *(config)* Comment out unused migrations block
- *(config)* Update `Env` namespace types

## [1.0.0-alpha.38] - 2025-09-16

### ◀️ Revert

- *(handler)* Support multi-chunk message sending

## [1.0.0-alpha.37] - 2025-09-16

### 🚀 Features

- *(utils)* Add `splitMessage` utility for chunking text
- *(handler)* Support multi-chunk message sending

### 🧪 Testing

- *(utils)* Add unit tests for `splitMessage`

## [1.0.0-alpha.36] - 2025-09-16

### 💼 Other

- *(pnpm)* Remove `onlyBuiltDependencies` from `pnpm-workspace.yaml`

### 🚜 Refactor

- *(config)* Update migration to `v2`
- *(config)* Remove `FarcasterStreamWebsocket` binding

## [1.0.0-alpha.35] - 2025-08-06

### 🚜 Refactor

- *(handlers)* Update `handleUnreadConversations` return type
- *(config)* Update message grouping for `deps`

## [1.0.0-alpha.34] - 2025-07-31

### 🚀 Features

- *(config)* Add support for Farcaster Stream toggle

### 🚜 Refactor

- *(config)* Disable Farcaster Stream by default

### ◀️ Revert

- *(config)* Comment out durable objects and migrations

## [1.0.0-alpha.33] - 2025-07-31

### 🚜 Refactor

- *(tools)* Update `aiTools` type definitions
- *(tools)* Standardize descriptions in `aiTools`
- *(ai)* Update type definitions and return types
- *(codebase)* Apply consistent formatting to imports
- *(ai)* Simplify tool call execution logic
- *(config)* Update cron trigger frequency to 5 minutes
- *(config)* Comment out durable objects and migrations

## [1.0.0-alpha.32] - 2025-07-30

### 🚀 Features

- *(handlers)* Integrate `aiTools` support in conversation logic
- *(tools)* Add `getEthPrice` for real-time ETH price fetching
- *(ai)* Integrate `getEthPrice` into tool handling
- *(config)* Add `LOG_LEVEL` variable to environment
- *(config)* Add `LOG_LEVEL` to `Env` interface
- *(config)* Add default `LOG_LEVEL` to environment schema

### 🐛 Bug Fixes

- *(prompts)* Refine `agentSystemMessage` guidelines

### 🚜 Refactor

- *(tools)* Unify function context with `ToolContext`
- *(ai)* Improve function signatures and context handling

### 🎨 Styling

- *(tools)* Fix import formatting and add parameter details

## [1.0.0-alpha.31] - 2025-07-30

### 🐛 Bug Fixes

- *(farcaster-stream)* Rename `heartbeat` to `healthCheck`

## [1.0.0-alpha.30] - 2025-07-30

### 🐛 Bug Fixes

- *(vitest)* Update config path for `wrangler` to `jsonc`

## [1.0.0-alpha.29] - 2025-07-30

### 🎨 Styling

- *(biome)* Remove `yaml` and `yml` from lint-staged patterns

## [1.0.0-alpha.28] - 2025-07-30

### 🐛 Bug Fixes

- *(config)* Disable `workers_dev` in configuration

### 🚜 Refactor

- *(config)* Migrate `wrangler.toml` to `wrangler.jsonc`

### 📚 Documentation

- *(readme)* Update repository setup and infrastructure

### 🎨 Styling

- *(biome)* Update ignored directories for consistency
- *(biome)* Remove `md` from lint-staged patterns
- *(biome)* Update lint-staged patterns for file types

## [1.0.0-alpha.27] - 2025-07-30

### 🚀 Features

- *(handlers)* Refactor conversation processing

### 🐛 Bug Fixes

- *(services)* Implement conversation processing deduplication
- *(handlers)* Refine group conversations processing
- *(config)* Standardize error message formatting

### 🎨 Styling

- *(codebase)* Standardize import formatting
- *(biome)* Enhance linter with stricter style rules
- *(biome)* Enforce `trailingCommas` on all multiline elements

## [1.0.0-alpha.26] - 2025-07-30

### 🐛 Bug Fixes

- *(config)* Increase `maxTokens` limit to 256
- *(config)* Disable `handleGroupConversations` feature
- *(services)* Add configuration checks for conversations

## [1.0.0-alpha.25] - 2025-07-30

### 🐛 Bug Fixes

- *(scheduled)* Add comment to clarify group conversation processing
- *(scheduled)* Skip senders without new messages

## [1.0.0-alpha.23] - 2025-07-29

### 🚀 Features

- *(services)* Improve heartbeat alarm initialization

## [1.0.0-alpha.22] - 2025-07-29

### 🚀 Features

- *(services)* Schedule heartbeat in stream initialization

## [1.0.0-alpha.21] - 2025-07-29

### 🚀 Features

- *(stream)* Add HTTP entrypoint for WebSocket connection
- *(handlers)* Mark conversations as read after processing
- *(services)* Add `fetchLilNounsUnreadConversation` method
- *(services)* Handle one-to-one conversations in stream
- *(services)* Add group conversation processing in stream
- *(config)* Enable direct messages in group conversations

### 🐛 Bug Fixes

- *(stream)* Ensure safe WebSocket method invocation

### 🚜 Refactor

- *(handlers)* Extract one-to-one conversation logic
- *(handlers)* Introduce `ConversationContext` interface
- *(services)* Use `FarcasterContext` in API methods
- *(handlers)* Extract group conversation logic
- *(services)* Enhance unseen and refresh payload handling
- *(handlers)* Remove `lastFetchTime` parameter usage

### 🎨 Styling

- *(stream)* Fix comment style in reconnection logic

## [1.0.0-alpha.20] - 2025-07-29

### 🚀 Features

- *(config)* Add migration for durable objects

## [1.0.0-alpha.19] - 2025-07-29

### 🚀 Features

- *(stream)* Add durable object for WebSocket connection
- *(config)* Add durable object binding for WebSocket
- *(config)* Update `Env` type with durable object binding
- *(stream)* Move `FarcasterStreamWebsocket` to services

## [1.0.0-alpha.18] - 2025-07-29

### 🚀 Features

- *(config)* Add feature flags for conversations
- *(scheduled)* Add feature flag checks for conversation handling
- *(config)* Add feature flags for direct messaging
- *(scheduled)* Add feature flag checks for message routing
- *(config)* Add logger configuration validation

### 🐛 Bug Fixes

- *(scheduled)* Filter stale conversations older than a week

### 🚜 Refactor

- *(scheduled)* Remove redundant dev mode checks
- *(logger)* Use `config.logger` for log level and formatting
- *(config)* Update logger level to `debug`
- *(scheduled)* Reorder dev mode logging logic
- *(scheduled)* Update dev mode log messages for clarity
- *(scheduled)* Mark conversations as read post-processing
- *(scheduled)* Fix timestamp comparison logic

### ◀️ Revert

- *(scheduled)* Remove redundant dev mode checks

## [1.0.0-alpha.17] - 2025-07-29

### 🐛 Bug Fixes

- *(farcaster)* Refactor WebSocket read message handling

## [1.0.0-alpha.16] - 2025-07-29

### 🐛 Bug Fixes

- *(wrangler)* Update cron trigger frequency to every 5 mins
- *(farcaster)* Handle delayed authentication response

## [1.0.0-alpha.15] - 2025-07-29

### 🚀 Features

- *(farcaster)* Add `fetchLilNounsOneToOneConversations` function
- *(handlers)* Add handler for processing one-to-one messages
- *(farcaster)* Add fetch for unread Lil Nouns conversations
- *(worker-configuration)* Add `FARCASTER_API_KEY` to `Env`
- *(config)* Add `FARCASTER_API_KEY` to configuration
- *(logger)* Add `createLogger` with environment-based config
- *(farcaster)* Add function to fetch conversation participants
- *(handlers)* Update recipient handling in conversation
- *(farcaster)* Add filter to text message processing
- *(farcaster)* Add `markLilNounsConversationAsRead`

### 🐛 Bug Fixes

- *(handlers)* Correct `recipientFid` extraction logic
- *(handlers)* Add filter to remove agent messages
- *(handlers)* Skip conversations already handled by agent
- *(handlers)* Simplify idempotency key generation
- *(wrangler)* Update cron trigger frequency to every minute

### 🚜 Refactor

- *(wagmi)* Extract `createWagmiConfig` function
- *(farcaster)* Extract fetch functions to new module
- *(index)* Extract and reorder conversation functions
- *(handlers)* Move conversation processing to new module
- *(handlers)* Rename conversation processing functions
- *(handlers)* Extract AI functions to `ai` module
- *(ai)* Rename `processToolCalls` to `handleAiToolCalls`
- *(handlers)* Extract and reuse cache management functions
- *(farcaster)* Simplify error handling in fetch logic
- *(farcaster)* Adjust query `limit` for inbox fetch
- *(cache)* Rename variables for clarity
- *(farcaster)* Remove redundant response destructuring
- *(farcaster)* Simplify message initialization logic
- *(handlers)* Replace unread conversation fetch logic
- *(handlers)* Update conversation filtering logic
- *(handlers)* Apply additional filtering to messages
- *(handlers)* Update `generateContextText` args
- *(handlers)* Update `handleAiToolCalls` args
- *(handlers)* Streamline message processing logic
- *(handlers)* Replace `sendDirectCastMessage` usage
- *(handlers)* Remove redundant comment in `sendDirectCast`
- *(tools)* Improve function descriptions for clarity
- *(handlers)* Simplify filtering pipeline
- *(handlers)* Simplify filtering pipeline
- *(handlers)* Streamline message processing logic
- *(handlers)* Restructure conversation handling logic
- *(handlers)* Simplify `handleNewMentionsInGroups` logic
- *(handlers)* Reorder conversation handling logic
- *(handlers)* Clarify message filtering logic
- *(handlers)* Filter and process only new messages
- *(handlers)* Remove debug logging statements
- *(handlers)* Replace `console.log` with `logger`
- *(logging)* Replace `console.log` with `logger`
- *(logger)* Enhance log formatting and handling
- *(logger)* Extract log formatting into helper functions
- *(farcaster)* Rename and improve conversation methods
- *(handlers)* Streamline message fetching logic
- *(handlers)* Remove redundant message filtering logic
- *(handlers)* Streamline message mapping logic
- *(handlers)* Group and process messages by senders
- *(handlers)* Correct casing in comments for consistency
- *(tools)* Standardize doc comments and simplify logic
- *(wagmi)* Add detailed doc comments for `createWagmiConfig`
- *(handlers)* Add detailed doc comments for processing
- *(tools)* Extract gql query into a separate variable
- *(ai)* Handle empty query in `generateContextText`
- *(handlers)* Replace negation with `isEmpty` utility
- *(handlers)* Add mention and reply filtering logic
- *(ai)* Add error handling for tool calls
- *(tools)* Add `toJSON` method for `BigInt` serialization
- *(handlers)* Replace `messages` with `senderMessages`
- *(handlers)* Simplify message processing loop
- *(prompts)* Update guidelines for Farcaster context
- *(handlers)* Add environment-based message sending logic
- *(tsconfig)* Add path mapping for module resolution
- Rename and reorganize module files for improved structure
- *(logger)* Improve JSON formatting for additional data

### 📚 Documentation

- Add README with project overview and guidelines
- Improve JSDoc annotations across modules

## [1.0.0-alpha.14] - 2025-07-26

### 🚀 Features

- *(junie)* Added .junie workflow
- *(junie)* Added .devcontainer.json

### 🐛 Bug Fixes

- *(utils)* Enhance `stripMarkdown` parsing logic
- *(config)* Adjust `zod` schema validators

### 🚜 Refactor

- *(index)* Extract `generateContextText`
- *(index)* Extract `processToolCalls`

### 🧪 Testing

- *(utils)* Enhance `stripMarkdown` test coverage

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

<!-- generated by git-cliff -->
