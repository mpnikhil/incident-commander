import { Service } from '@liquidmetal-ai/raindrop-framework';

interface Env {
  _raindrop: any;
}

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Hello World from Nightrider SRE Agent!', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}