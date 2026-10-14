FROM node:22-bookworm-slim

# Install system dependencies for Python, FFmpeg, yt-dlp, and Build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    sox \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install the same pinned processing dependencies used in local development.
COPY requirements-processing.txt /tmp/requirements-processing.txt
RUN pip install --no-cache-dir -r /tmp/requirements-processing.txt yt-dlp==2026.8.19

# Set the Python path for the Node app
ENV PYTHON_BIN_PATH="/opt/venv/bin/python3"

# Qwen requires modern Torch/Transformers; keep Demucs's pinned runtime intact.
COPY requirements-asr.txt /tmp/requirements-asr.txt
RUN python3 -m venv /opt/asr-venv && \
    /opt/asr-venv/bin/pip install --no-cache-dir -r /tmp/requirements-asr.txt
ENV ASR_PYTHON_BIN_PATH="/opt/asr-venv/bin/python3"
ENV LYRICS_ASR_PROVIDER="qwen"

# Set writable directories for PyTorch and HuggingFace models
ENV TORCH_HOME=/app/models
ENV HF_HOME=/app/models

# Create a non-root user for security (M4)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set working directory for Node app
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install Node dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the Next.js application
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Create uploads and models directories with correct permissions
RUN mkdir -p /app/uploads /app/models && chown -R nextjs:nodejs /app/uploads /app/models

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
