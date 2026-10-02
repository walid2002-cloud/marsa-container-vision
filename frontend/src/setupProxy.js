const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Dev local : proxy /ai → service FastAPI (port 5082 par défaut).
 * En production Docker, nginx fait le même routage.
 */
module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_AI_PROXY_TARGET || 'http://localhost:5082';
  app.use(
    '/ai',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { '^/ai': '' },
    })
  );
};
