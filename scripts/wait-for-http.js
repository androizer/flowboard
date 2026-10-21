const url = process.argv[2];
if (!url) throw new Error('Expected a URL to check.');
(async () => {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) process.exit(0);
    } catch {
      // Retry until the service is ready or the deadline expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
})();
