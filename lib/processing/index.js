import { TaskScheduler } from './TaskScheduler.js';
import { SongProcessingService } from './SongProcessingService.js';
import { processSong } from './songPipeline.js';
import { checkCache } from '../storage/index.js';
import { jobQueue } from './jobQueue.js';

const configuredConcurrency = Number(process.env.MAX_PROCESSING_JOBS || 1);
if (!global.karaokeProcessingScheduler) {
  global.karaokeProcessingScheduler = new TaskScheduler({
    concurrency: Number.isInteger(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : 1,
  });
}
export const processingScheduler = global.karaokeProcessingScheduler;

if (!global.karaokeProcessingService) {
  global.karaokeProcessingService = new SongProcessingService({ scheduler: processingScheduler, checkCache, processSong, jobs: jobQueue });
}
export const songProcessing = global.karaokeProcessingService;
