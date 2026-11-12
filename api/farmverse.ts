import app from '../backend/src/app.ts';

export default {
  fetch(request: Request) {
    if (!process.env.DATABASE_URL) {
      return Response.json({ error: 'Máy chủ chưa kết nối PostgreSQL.' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    const url = new URL(request.url);
    const route = url.pathname === '/api/farmverse'
      ? url.searchParams.get('__farm_route') ?? ''
      : url.pathname.replace(/^\/api\//, '');
    url.pathname = `/${route}`;
    url.searchParams.delete('__farm_route');
    return app.fetch(new Request(url, request));
  },
};
