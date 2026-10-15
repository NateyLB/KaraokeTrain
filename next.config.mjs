/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.KARAOKE_BUILD_DIR || '.next',
  serverExternalPackages: ['@google-cloud/storage'],
  // Runtime data and Python dependencies are provisioned outside Next's bundle.
  outputFileTracingExcludes: {
    '/*': ['./venv/**', './venv-asr/**', './.venv/**', './models/**', './uploads/**', './.runtime/**', './.env*', './**/*.pem'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ] }];
  },
};

export default nextConfig;
