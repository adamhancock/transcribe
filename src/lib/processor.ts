import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import { $ } from 'zx';

$.verbose = false;

export async function extractAudio(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^/.]+$/, '.wav');
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function extractFrames(
  inputPath: string, 
  interval: number = 3,
  maxFrames: number = 30
): Promise<string[]> {
  const frameDir = inputPath.replace(/\.[^/.]+$/, '_frames');
  
  // Create frames directory
  await fs.mkdir(frameDir, { recursive: true });
  
  // Get video duration
  const durationResult = await $`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${inputPath}`;
  const duration = parseFloat(durationResult.stdout.trim());
  
  // Calculate how many frames we should extract based on interval
  const totalPossibleFrames = Math.floor(duration / interval);
  const frameCount = Math.min(maxFrames, totalPossibleFrames);
  
  // Extract frames at the specified interval
  await $`ffmpeg -i ${inputPath} -vf "fps=1/${interval}" -frames:v ${frameCount} ${frameDir}/frame_%04d.jpg -y`;
  
  // Get list of extracted frames
  const files = await fs.readdir(frameDir);
  const framePaths = files
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .slice(0, maxFrames)
    .map(f => path.join(frameDir, f));
  
  return framePaths;
}

export async function encodeImageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString('base64');
}

export async function transcribeAudio(audioPath: string, model: string = 'base'): Promise<string> {
  // Check if whisper is installed
  const whisperInstalled = await checkWhisperInstalled();
  
  if (!whisperInstalled) {
    throw new Error('Whisper is not installed. Please install it with: pip install openai-whisper');
  }
  
  return new Promise((resolve, reject) => {
    const whisperProcess = spawn('whisper', [
      audioPath,
      '--model', model,
      '--output_format', 'txt',
      '--output_dir', path.dirname(audioPath),
      '--language', 'en',
      '--fp16', 'False'
    ]);
    
    let stderr = '';
    
    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    whisperProcess.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
        return;
      }
      
      // Read the generated transcript
      const txtPath = audioPath.replace(/\.[^/.]+$/, '.txt');
      try {
        const transcript = await fs.readFile(txtPath, 'utf-8');
        // Clean up whisper output files
        await fs.unlink(txtPath).catch(() => {});
        resolve(transcript.trim());
      } catch (error) {
        reject(new Error('Failed to read transcript file'));
      }
    });
    
    whisperProcess.on('error', reject);
  });
}

async function checkWhisperInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const checkProcess = spawn('which', ['whisper']);
    checkProcess.on('close', (code) => {
      resolve(code === 0);
    });
    checkProcess.on('error', () => {
      resolve(false);
    });
  });
}

export async function summarizeTranscript(
  transcript: string,
  host: string = 'http://localhost:11434',
  model: string = 'gemma3',
  frames?: string[]
): Promise<string> {
  return summarizeWithOllama(transcript, host, model, frames);
}


async function summarizeWithOllama(
  transcript: string,
  host: string,
  model: string,
  frames?: string[]
): Promise<string> {
  try {
    let prompt = `You are a helpful assistant that creates concise summaries of transcripts. Focus on the key points, main topics discussed, and any important conclusions or action items.\n\nPlease provide a comprehensive summary of the following transcript:\n\n${transcript}`;
    
    // If frames are provided, use the chat API with multimodal support
    if (frames && frames.length > 0) {
      const imageData = await Promise.all(
        frames.map(async (framePath) => {
          const base64 = await encodeImageToBase64(framePath);
          return base64;
        })
      );
      
      const response = await axios.post(`${host}/api/chat`, {
        model: model,
        messages: [
          {
            role: 'user',
            content: `You are a helpful assistant that creates concise summaries of video content. Analyze these video frames along with the transcript to provide a comprehensive summary. The frames are extracted at regular intervals throughout the video.\n\nTranscript:\n${transcript}`,
            images: imageData
          }
        ],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1000
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.data.message.content;
    } else {
      // Use the regular generate API for text-only
      const response = await axios.post(`${host}/api/generate`, {
        model: model,
        prompt: `${prompt}\n\nSummary:`,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1000
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.data.response;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Ollama. Make sure it is running on ' + host);
      }
      
      // If multimodal fails, retry with text-only
      if (frames && frames.length > 0 && error.response?.status === 400) {
        console.log('Model may not support images, retrying with text-only summary...');
        return summarizeWithOllama(transcript, host, model, undefined);
      }
      
      throw new Error(`Ollama API error: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

