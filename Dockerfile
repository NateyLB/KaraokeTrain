FROM node:20-slim

# Install system dependencies for Python, FFmpeg, and Build tools
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

# Install Python dependencies for Demucs and Faster Whisper
RUN pip install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu \
    htdemucs \
    faster-whisper

# Set the Python path for the Node app
ENV PYTHON_BIN_PATH="/opt/venv/bin/python3"

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

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
