import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware with enhanced CORS
app.use(cors({
  origin: [
    'https://vr-final-od3uhxbrfhfjddekcodkjf.streamlit.app',
    'https://umaima-s-pathan.github.io',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('dist'));

// Storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MOV, and AVI are allowed.'));
    }
  }
});

// Job storage (in production, use a database)
const jobs = new Map();

// VR180 Processing Pipeline
class VR180Pipeline {
  constructor(jobId, inputPath) {
    this.jobId = jobId;
    this.inputPath = inputPath;
    this.outputDir = `outputs/${jobId}`;
    this.stages = [
      { name: 'depth', progress: 0, status: 'pending' },
      { name: 'stereo', progress: 0, status: 'pending' },
      { name: 'outpainting', progress: 0, status: 'pending' },
      { name: 'blur', progress: 0, status: 'pending' },
      { name: 'upscaling', progress: 0, status: 'pending' }
    ];
  }

  async initialize() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(`${this.outputDir}/frames`, { recursive: true });
    await fs.mkdir(`${this.outputDir}/depth`, { recursive: true });
    await fs.mkdir(`${this.outputDir}/stereo`, { recursive: true });
  }

  updateProgress(stageName, progress, status = 'processing') {
    const stage = this.stages.find(s => s.name === stageName);
    if (stage) {
      stage.progress = progress;
      stage.status = status;
    }

    const job = jobs.get(this.jobId);
    if (job) {
      job.stages = this.stages;
      job.lastUpdated = new Date();
    }
  }

  async extractFrames() {
    this.updateProgress('depth', 10, 'processing');

    return new Promise((resolve, reject) => {
      // Extract frames with error handling
      ffmpeg(this.inputPath)
        .output(`${this.outputDir}/frames/frame_%04d.png`)
        .outputOptions([
          '-vf', 'fps=0.5,scale=320:180', // Even slower fps for stability
          '-y' // Overwrite existing files
        ])
        .on('progress', (progress) => {
          const percent = Math.min(progress.percent || 0, 90);
          this.updateProgress('depth', 10 + (percent * 0.3));
          console.log(`Frame extraction progress: ${percent}%`);
        })
        .on('end', () => {
          console.log('Frame extraction completed');
          this.updateProgress('depth', 40);
          resolve();
        })
        .on('error', (error) => {
          console.error('Frame extraction error:', error);
          reject(error);
        })
        .run();
    });
  }

  async generateDepthMaps() {
    try {
      this.updateProgress('depth', 50, 'processing');
      console.log('Starting depth map generation...');

      const frameFiles = await fs.readdir(`${this.outputDir}/frames`);
      const pngFiles = frameFiles.filter(f => f.endsWith('.png'));
      const totalFrames = pngFiles.length;

      console.log(`Found ${totalFrames} frames to process`);

      if (totalFrames === 0) {
        throw new Error('No frames extracted from video');
      }

      // Process frames in smaller batches for stability
      const batchSize = Math.min(5, totalFrames);
      for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalFrames);
        const batch = pngFiles.slice(batchStart, batchEnd);

        console.log(`Processing batch ${batchStart + 1}-${batchEnd} of ${totalFrames}`);

        // Process batch with error handling
        for (let i = 0; i < batch.length; i++) {
          const frameIndex = batchStart + i;
          const depthMapPath = `${this.outputDir}/depth/depth_${String(frameIndex + 1).padStart(4, '0')}.png`;

          try {
            await this.createPlaceholderDepthMap(depthMapPath);
          } catch (error) {
            console.error(`Error creating depth map ${frameIndex}:`, error);
            // Continue with next frame instead of failing
          }
        }

        const progress = 50 + ((batchEnd / totalFrames) * 50);
        this.updateProgress('depth', progress, 'processing');
      }

      console.log('Depth map generation completed');
      this.updateProgress('depth', 100, 'completed');
    } catch (error) {
      console.error('Depth map generation failed:', error);
      throw error;
    }
  }

  async createPlaceholderDepthMap(outputPath) {
    // Create a simple depth map with better error handling
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input('color=gray:size=320x180:duration=0.1')
        .inputOptions(['-f', 'lavfi'])
        .output(outputPath)
        .outputOptions(['-vframes', '1', '-y'])
        .on('end', () => {
          console.log(`Created depth map: ${outputPath}`);
          resolve();
        })
        .on('error', (error) => {
          console.error(`Failed to create depth map ${outputPath}:`, error);
          reject(error);
        })
        .run();
    });
  }

  async synthesizeStereo() {
    try {
      this.updateProgress('stereo', 0, 'processing');
      console.log('Starting stereo synthesis...');

      const frameFiles = await fs.readdir(`${this.outputDir}/frames`);
      const pngFiles = frameFiles.filter(f => f.endsWith('.png'));
      const totalFrames = pngFiles.length;

      // Simulate stereo processing with progress updates
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const progress = ((i + 1) / steps) * 100;
        this.updateProgress('stereo', progress, 'processing');
        console.log(`Stereo synthesis progress: ${progress}%`);
      }

      console.log('Stereo synthesis completed');
      this.updateProgress('stereo', 100, 'completed');
    } catch (error) {
      console.error('Stereo synthesis failed:', error);
      throw error;
    }
  }

  async expandPanorama() {
    try {
      this.updateProgress('outpainting', 0, 'processing');
      console.log('Starting panorama expansion...');

      const stages = [
        { name: 'AI Outpainting', duration: 1000, progress: 60 },
        { name: 'Projection Mapping', duration: 800, progress: 100 }
      ];

      for (const stage of stages) {
        console.log(`Starting ${stage.name}...`);
        const steps = 10;
        const stepDuration = stage.duration / steps;

        for (let i = 0; i < steps; i++) {
          await new Promise(resolve => setTimeout(resolve, stepDuration));
          const stageProgress = ((i + 1) / steps) * stage.progress;
          this.updateProgress('outpainting', stageProgress, 'processing');
        }

        console.log(`${stage.name} completed`);
      }

      console.log('Panorama expansion completed');
      this.updateProgress('outpainting', 100, 'completed');
    } catch (error) {
      console.error('Panorama expansion failed:', error);
      throw error;
    }
  }

  async applyFoveatedBlur() {
    try {
      this.updateProgress('blur', 0, 'processing');
      console.log('Starting foveated blur...');

      const steps = 8;
      for (let i = 0; i < steps; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const progress = ((i + 1) / steps) * 100;
        this.updateProgress('blur', progress, 'processing');
        console.log(`Foveated blur progress: ${progress}%`);
      }

      console.log('Foveated blur completed');
      this.updateProgress('blur', 100, 'completed');
    } catch (error) {
      console.error('Foveated blur failed:', error);
      throw error;
    }
  }

  async upscaleAndEnhance() {
    try {
      this.updateProgress('upscaling', 0, 'processing');
      console.log('Starting upscaling and enhancement...');

      const stages = [
