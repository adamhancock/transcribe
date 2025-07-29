#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { extractAudio, extractFrames, extractFramesAtTimestamps, transcribeAudio, summarizeTranscript, summarizeFrame, getRelevantTranscriptForFrame, identifyKeyMoments } from './lib/processor.js';
import type { FrameInfo, TimestampedTranscript, KeyMoment } from './lib/processor.js';
import fs from 'fs/promises';
import { $ } from 'zx';

// Configure zx to be quiet
$.verbose = false;
$.quiet = true;

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

const program = new Command();

program
  .name('transcribe')
  .description('Transcribe and summarize MP4 recordings using local models')
  .version('1.0.0')
  .argument('<input>', 'Path to MP4 file')
  .option('-o, --output <path>', 'Output file path (default: input_transcript.txt)')
  .option('-a, --audio-only', 'Only extract audio without transcription')
  .option('-t, --transcribe-only', 'Only transcribe without summarization')
  .option('--host <host>', 'Ollama API host', 'http://localhost:11434')
  .option('--model <model>', 'Ollama model name for summarization', 'llava')
  .option('--whisper-model <model>', 'Whisper model size', 'base')
  .option('--keep-audio', 'Keep extracted audio file after processing')
  .option('--no-analyze-frames', 'Disable frame extraction and analysis')
  .option('--frame-interval <seconds>', 'Seconds between frame extraction', '3')
  .option('--max-frames <count>', 'Maximum number of frames to extract', '30')
  .option('--keep-frames', 'Keep extracted frames after processing')
  .option('--save-timestamps', 'Save timestamped transcript segments to separate file')
  .option('--plain-transcript', 'Save transcript without timestamps in output file')
  .action(async (input, options) => {
    const spinner = ora('Processing...').start();
    
    try {
      // Check if input file exists
      await fs.access(input);
      
      // Start audio extraction
      spinner.text = 'Extracting audio from MP4...';
      const audioPath = await extractAudio(input);
      spinner.succeed('Audio extraction completed');
      
      if (options.audioOnly) {
        console.log(chalk.green(`Audio saved to: ${audioPath}`));
        return;
      }
      
      // Transcribe audio
      spinner.start('Transcribing audio...');
      const timestampedTranscript = await transcribeAudio(audioPath, options.whisperModel);
      spinner.succeed('Audio transcription completed');
      
      // Extract and analyze frames if not disabled
      let frameSummaries: string[] = [];
      let frameInfos: FrameInfo[] = [];
      
      if (options.analyzeFrames !== false && !options.transcribeOnly) {
        // Get video duration first
        const durationResult = await $`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${input}`;
        const videoDuration = parseFloat(durationResult.stdout.trim());
        
        // Identify key moments from transcript
        spinner.start('Analyzing transcript to identify key moments...');
        try {
          const keyMoments = await identifyKeyMoments(
            timestampedTranscript.segments,
            parseInt(options.maxFrames),
            options.host,
            'gemma3', // Use text model for analyzing transcript
            videoDuration
          );
          spinner.succeed(`Identified ${keyMoments.length} key moments for frame extraction`);
          
          // Extract frames at key moments
          frameInfos = await extractFramesAtTimestamps(input, keyMoments);
          console.log(chalk.green(`✓ Extracted ${frameInfos.length} frames at key moments`));
        } catch (error) {
          // Fall back to fixed interval extraction
          console.error(chalk.yellow('Intelligent frame extraction failed, using fixed intervals'));
          spinner.start('Extracting frames at fixed intervals...');
          frameInfos = await extractFrames(
            input,
            parseInt(options.frameInterval),
            parseInt(options.maxFrames)
          );
          spinner.succeed(`Extracted ${frameInfos.length} frames`);
        }
        
        // Analyze frames
        if (frameInfos.length > 0) {
          spinner.start(`Analyzing ${frameInfos.length} frames sequentially...`);
          
          let completedCount = 0;
          const totalFrames = frameInfos.length;
          
          // Process frames sequentially to maintain order and allow for context
          let previousFrameDescription: string | undefined;
          
          for (const frameInfo of frameInfos) {
            try {
              spinner.text = `Analyzing frame ${frameInfo.frameNumber}/${totalFrames}...`;
              
              const frameSummary = await summarizeFrame(frameInfo, options.host, options.model, previousFrameDescription);
              
              // Extract just the description part for context (without timestamp and frame number)
              const descriptionMatch = frameSummary.match(/Frame \d+: (.+)$/);
              if (descriptionMatch) {
                previousFrameDescription = descriptionMatch[1].trim();
              }
              
              // Add relevant transcript context to the frame summary
              const relevantTranscript = getRelevantTranscriptForFrame(
                frameInfo.timestamp,
                timestampedTranscript.segments
              );
              
              completedCount++;
              console.log(chalk.gray(`  ✓ Frame ${frameInfo.frameNumber} analyzed (${completedCount}/${totalFrames})`));
              
              frameSummaries.push(`${frameSummary}\n    Transcript context: "${relevantTranscript}"`);
            } catch (error) {
              completedCount++;
              console.error(chalk.yellow(`  ✗ Frame ${frameInfo.frameNumber} failed: ${error instanceof Error ? error.message : String(error)}`));
              frameSummaries.push(`[${frameInfo.timestamp}s] Frame ${frameInfo.frameNumber}: [Analysis failed]`);
              previousFrameDescription = undefined; // Reset context on failure
            }
          }
          
          spinner.succeed(`Analyzed ${frameSummaries.filter(s => !s.includes('[Analysis failed]')).length}/${totalFrames} frames`);
        }
      }
      
      // Format transcript based on user preference
      const transcriptText = options.plainTranscript 
        ? timestampedTranscript.fullText
        : timestampedTranscript.segments
            .map(segment => `[${formatTimestamp(segment.start)}] ${segment.text}`)
            .join('\n');
      
      let finalOutput = `Transcript of ${input}:\n\n${transcriptText}`;
      
      if (!options.transcribeOnly) {
        // Summarize with Ollama
        spinner.start('Generating final summary...');
        try {
          const summary = await summarizeTranscript(
            timestampedTranscript.fullText,
            options.host,
            options.model,
            frameSummaries
          );
          spinner.succeed('Summary generated successfully');
          console.log(chalk.cyan('\nSummary:'));
          console.log(chalk.white(summary));
          finalOutput += `\n\n---\n\nSummary:\n\n${summary}`;
        } catch (error) {
          spinner.warn('Failed to generate summary (is Ollama running?)');
          console.error(chalk.yellow(error instanceof Error ? error.message : String(error)));
        }
      }
      
      // Save output
      const outputPath = options.output || input.replace(/\.[^/.]+$/, '_transcript.txt');
      await fs.writeFile(outputPath, finalOutput, 'utf-8');
      console.log(chalk.green(`\nOutput saved to: ${outputPath}`));
      
      // Save timestamped segments if requested
      if (options.saveTimestamps) {
        const timestampPath = input.replace(/\.[^/.]+$/, '_timestamped.json');
        const timestampData = {
          video: input,
          transcript: timestampedTranscript,
          frameSummaries: frameSummaries.map((summary, index) => ({
            frameNumber: index + 1,
            timestamp: frameInfos[index]?.timestamp || index * parseInt(options.frameInterval),
            summary
          }))
        };
        await fs.writeFile(timestampPath, JSON.stringify(timestampData, null, 2), 'utf-8');
        console.log(chalk.green(`Timestamped data saved to: ${timestampPath}`));
      }
      
      // Clean up audio file if not keeping it
      if (!options.keepAudio) {
        await fs.unlink(audioPath);
      }
      
      // Clean up frames if not keeping them
      if (frameInfos.length > 0 && !options.keepFrames) {
        const frameDir = input.replace(/\.[^/.]+$/, '_frames');
        await fs.rm(frameDir, { recursive: true, force: true });
      }
      
    } catch (error) {
      spinner.fail('Error processing file');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program.parse();