/**
 * PM2 ecosystem configuration for QRClaw Gateway
 *
 * Production: cluster mode with CPU-count instances, log rotation, memory limits.
 * Development: single fork instance for debugging.
 */
module.exports = {
  apps: [
    {
      name: 'qrclaw-gateway',
      script: 'dist/gateway/src/server.js',
      node_args: '--max-old-space-size=512',

      // Production: cluster mode scales across CPU cores
      // Note: WebSocket sticky sessions required at LB level when instances > 1
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',

      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // Graceful shutdown — allow in-flight WS messages to drain
      kill_timeout: 8000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
      },

      // Logging
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Log rotation (requires pm2-logrotate module)
      // pm2 install pm2-logrotate
      // pm2 set pm2-logrotate:max_size 50M
      // pm2 set pm2-logrotate:retain 14
      // pm2 set pm2-logrotate:compress true

      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
      max_restarts: 15,
      min_uptime: '5s',
    },
  ],
};
