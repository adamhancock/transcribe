#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { extractAudio, extractFrames, transcribeAudio, summarizeTranscript } from './lib/processor.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  .option('--model <model>', 'Ollama model name for summarization', 'gemma3')
  .option('--whisper-model <model>', 'Whisper model size', 'base')
  .option('--keep-audio', 'Keep extracted audio file after processing')
  .option('--no-analyze-frames', 'Disable frame extraction and analysis')
  .option('--frame-interval <seconds>', 'Seconds between frame extraction', '3')
  .option('--max-frames <count>', 'Maximum number of frames to extract', '30')
  .option('--keep-frames', 'Keep extracted frames after processing')
  .action(async (input, options) => {
    const spinner = ora('Processing...').start();
    
    try {
      // Check if input file exists
      await fs.access(input);
      
      // Start parallel extraction of audio and frames
      spinner.text = 'Extracting audio and frames from MP4...';
      
      const extractionPromises: Promise<any>[] = [
        extractAudio(input)
      ];
      
      // Add frame extraction if not disabled
      if (options.analyzeFrames !== false && !options.transcribeOnly && !options.audioOnly) {
        extractionPromises.push(
          extractFrames(
            input,
            parseInt(options.frameInterval),
            parseInt(options.maxFrames)
          ).catch(error => {
            console.error(chalk.yellow(`Frame extraction failed: ${error instanceof Error ? error.message : String(error)}`));
            return [];
          })
        );
      }
      
      // Wait for parallel extraction
      const [audioPath, framePaths = []] = await Promise.all(extractionPromises);
      spinner.succeed('Media extraction completed');
      
      if (options.audioOnly) {
        console.log(chalk.green(`Audio saved to: ${audioPath}`));
        return;
      }
      
      // Transcribe audio
      spinner.start('Transcribing audio...');
      const transcript = await transcribeAudio(audioPath, options.whisperModel);
      spinner.succeed('Audio transcribed successfully');
      
      let finalOutput = `Transcript of ${input}:\n\n${transcript}`;
      
      if (framePaths.length > 0) {
        console.log(chalk.gray(`Extracted ${framePaths.length} frames for analysis`));
      }
      
      if (!options.transcribeOnly) {
        // Summarize with Ollama
        spinner.start('Generating summary with Ollama...');
        try {
          const summary = await summarizeTranscript(
            transcript,
            options.host,
            options.model,
            framePaths
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
      
      // Clean up audio file if not keeping it
      if (!options.keepAudio) {
        await fs.unlink(audioPath);
      }
      
      // Clean up frames if not keeping them
      if (framePaths.length > 0 && !options.keepFrames) {
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