const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'],
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
  async rewrites() {
    const backendUrl = (process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
    return [
      {
        source: '/auth/:path*',
        destination: `${backendUrl}/auth/:path*`,
      },
      {
        source: '/emails/:path*',
        destination: `${backendUrl}/emails/:path*`,
      },
      {
        source: '/senders/:path*',
        destination: `${backendUrl}/senders/:path*`,
      },
      {
        source: '/admin/queues',
        destination: `${backendUrl}/admin/queues`,
      },
      {
        source: '/admin/queues/:path*',
        destination: `${backendUrl}/admin/queues/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
