/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google-cloud/storage'],
  // Runtime data and Python dependencies are provisioned outside Next's bundle.
  outputFileTracingExcludes: {
    '/*': ['./venv/**', './venv-asr/**', './.venv/**', './models/**', './uploads/**', './.env*', './**/*.pem'],
  },
};

export default nextConfig;
