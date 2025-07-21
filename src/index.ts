/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env extends Record<string, unknown> {
  // Add your environment variables here
  // Example: MY_VAR?: string;
}

export default {
  async fetch(
    request: Request,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle different routes
    switch (url.pathname) {
      case '/':
        return new Response('Hello from Lil Nouns Agent! 🎩', {
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });

      case '/health':
        return Response.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          worker: 'lilnouns-agent',
        });

      case '/api/info':
        return Response.json({
          name: 'Lil Nouns Agent',
          version: '1.0.0-alpha.0',
          description: 'A TypeScript Cloudflare Worker for Lil Nouns',
          endpoints: [
            { path: '/', method: 'GET', description: 'Welcome message' },
            { path: '/health', method: 'GET', description: 'Health check' },
            {
              path: '/api/info',
              method: 'GET',
              description: 'API information',
            },
          ],
        });

      default:
        return new Response('Not Found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });
    }
  },
} satisfies ExportedHandler<Env>;
