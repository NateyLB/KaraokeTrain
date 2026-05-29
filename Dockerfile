FROM node:20-slim

# Install system dependencies for Python, FFmpeg, yt-dlp, and Build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 1. Install PyTorch CPU first (Pinned to 2.2.2 to prevent ABI bugs in newer torchaudio versions)
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu torchvision==0.17.2+cpu torchaudio==2.2.2+cpu --index-url https://download.pytorch.org/whl/cpu

# 2. Install everything else (from default PyPI)
# We must pin numpy < 2.0.0 because PyTorch 2.2.2 is not compatible with Numpy 2.x
RUN pip install --no-cache-dir \
    "numpy<2.0.0" \
    demucs \
    faster-whisper \
    yt-dlp

# Set the Python path for the Node app
ENV PYTHON_BIN_PATH="/opt/venv/bin/python3"

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
RUN npm run build

# Create uploads and models directories with correct permissions
RUN mkdir -p /app/uploads /app/models && chown -R nextjs:nodejs /app/uploads /app/models

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
