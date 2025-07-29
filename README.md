# Lil Nouns Agent

[![GitHub release (latest SemVer including pre-releases)](https://img.shields.io/github/v/release/lilnouns/lilnouns-agent?include_prereleases)](https://github.com/lilnouns/lilnouns-agent/releases)
[![GitHub Workflow Status (branch)](https://img.shields.io/github/actions/workflow/status/lilnouns/lilnouns-agent/build.yml)](https://github.com/lilnouns/lilnouns-agent/actions/workflows/build.yml)
[![GitHub](https://img.shields.io/github/license/lilnouns/lilnouns-agent)](https://github.com/lilnouns/lilnouns-agent/blob/master/LICENSE)
[![X (formerly Twitter) Follow](https://img.shields.io/badge/follow-%40nekofar-ffffff?logo=x&style=flat)](https://x.com/nekofar)
[![Farcaster (Warpcast) Follow](https://img.shields.io/badge/follow-%40nekofar-855DCD.svg?logo=farcaster&logoColor=f5f5f5&style=flat)](https://warpcast.com/nekofar)
[![Donate](https://img.shields.io/badge/donate-nekofar.crypto-a2b9bc?logo=ethereum&logoColor=f5f5f5)](https://ud.me/nekofar.crypto)

> [!WARNING]
> Please note that the project is currently in an experimental phase, and it is subject to significant changes as it
> progresses.

An intelligent Lil Nouns DAO agent on the Farcaster social network.
The agent listens for direct messages, uses AI to understand user intent, and can fetch real-time information about 
Lil Nouns governance, proposals, auctions, and more.

## Features

- **Automated Response System**: Responds to direct messages on Farcaster
- **AI-Powered Understanding**: Uses Cloudflare AI to understand user queries and generate contextual responses
- **Real-Time Data Access**: Fetches live data about Lil Nouns proposals, auctions, and governance
- **Context-Aware Responses**: Uses RAG for enhanced context generation
- **Scheduled Processing**: Runs on configurable intervals to process unread conversations


## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd lilnouns-agent
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up environment variables**:
   Create a `.dev.vars` file in the root directory with the required environment variables (see the Environment Variables section).

4. **Generate TypeScript types**:
   ```bash
   pnpm cf-typegen
   ```

## Environment Variables

The following environment variables are required for the agent to function correctly:

- `NODE_ENV`: The environment (`development`, `staging`, or `production`)
- `FARCASTER_AUTH_TOKEN`: Authentication token for the Farcaster API
- `LILNOUNS_SUBGRAPH_URL`: The URL for the Lil Nouns GraphQL subgraph
- `ETHEREUM_RPC_URL`: The URL for an Ethereum RPC endpoint

## Available Scripts

- `pnpm dev`: Starts the development server with local testing
- `pnpm start`: Starts the development server
- `pnpm build`: Builds the worker for production
- `pnpm deploy`: Deploys the worker to Cloudflare
- `pnpm test`: Runs the test suite
- `pnpm test:run`: Runs tests once without watch mode
- `pnpm format`: Formats the code using Biome
- `pnpm lint`: Lints the code using Biome
- `pnpm check`: Runs both formatting and linting checks
- `pnpm cf-typegen`: Generates TypeScript types for Cloudflare Workers

## How It Works

1. **Scheduled Execution**: The agent runs on a schedule defined in `wrangler.toml`
2. **Fetch Unread Messages**: It fetches unread mentions in Farcaster chats and direct messages
3. **Process Conversations**: For each conversation, it processes the message thread and determines context
4. **AI-Powered Responses**: It uses Cloudflare's AI to understand the user's message and generate appropriate responses
5. **Tool Integration**: If the user's message requires real-time data, the AI can use functions defined in `src/lib/tools.ts` to fetch information about proposals, auctions, token supply, etc.
6. **Context Generation**: Uses RAG to generate relevant context based on the user's query
7. **Send Response**: The agent sends the generated response back to the Farcaster conversation

## Development Guidelines

### Code Style

- Use TypeScript with strict type checking
- Follow the existing JSDoc comment patterns for all exported functions
- Use structured logging with appropriate log levels (debug, info, error)
- Organize imports consistently
- Use functional programming patterns with Remeda where appropriate

### Testing

- Write unit tests for all new functions
- Use Vitest for testing with Cloudflare Workers testing utilities
- Test both success and error scenarios

### Documentation

- Add JSDoc comments to all exported functions
- Include parameter types and descriptions
- Document return types and any thrown errors
- Keep inline comments concise but informative

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the development guidelines
4. Add tests for new functionality
5. Run `pnpm check` to ensure code quality
6. Submit a pull request

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for details.
