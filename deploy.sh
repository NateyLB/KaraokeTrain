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

# (No longer exporting .env.local to the shell to protect secrets)

echo "🔐 Granting Secret Manager permissions to Cloud Run service account..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding YOUTUBE_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding DOWNLOADER_SECRET \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 16Gi \
  --cpu 4 \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --set-env-vars="STORAGE_MODE=gcs,GCS_BUCKET_NAME=$BUCKET_NAME,DOWNLOADER_API_URL=https://downloader.karaoketrain.com" \
  --update-secrets="YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,DOWNLOADER_SECRET=DOWNLOADER_SECRET:latest"

echo "✅ Deployment complete!"
