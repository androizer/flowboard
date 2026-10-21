const http = require('node:http');

// Browser APIs such as Web Locks require a trustworthy origin. Route the
// isolated Compose web service through localhost inside the test container.
http
  .createServer((incoming, outgoing) => {
    const upstream = http.request(
      {
        host: 'web',
        port: 8080,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: 'web:8080' },
      },
      (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  })
  .listen(8080, '127.0.0.1');
