#!/bin/bash

# Exit on error
set -e

# Configuration
PROJECT_ID="karaoketrain"
REGION="us-central1"
SERVICE_NAME="karaoketrain"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
BUCKET_NAME="stems-lyrics"

echo "🚀 Building and pushing Docker image using Google Cloud Build..."
gcloud builds submit --tag $IMAGE_NAME .

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --set-env-vars="STORAGE_MODE=gcs,GCS_BUCKET_NAME=$BUCKET_NAME,YOUTUBE_API_KEY=$YOUTUBE_API_KEY"

echo "✅ Deployment complete!"
