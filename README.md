# Transcribe CLI

A powerful TypeScript CLI tool for transcribing and summarizing MP4 recordings using local models with synchronized audio and visual analysis.

## Key Features

- 🎙️ **Timestamped Transcription**: Full audio transcription with precise timestamps using Whisper
- 🧠 **Intelligent Frame Selection**: AI analyzes transcript to extract frames at meaningful moments with reasoning
- 🖼️ **Context-Aware Frame Analysis**: Each frame is analyzed with awareness of previous frames
- 🔄 **Synchronized Analysis**: Matches frame descriptions with relevant transcript segments
- 📊 **Structured Summaries**: Generates detailed summaries with sections for overview, topics, insights, and action items
- 🎯 **Smart Model Selection**: Uses llava for visual analysis and gemma3 for text summarization
- ⚡ **Optimized Processing**: Parallel audio/frame extraction, sequential frame analysis for context

## Prerequisites

- Node.js 18+
- FFmpeg installed
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt update && sudo apt install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- Python & pip (for Whisper)
  - macOS: `brew install python` (includes pip)
  - Ubuntu/Debian: `sudo apt install python3-pip`
  - Windows: Download from [python.org](https://python.org) (includes pip)
- OpenAI Whisper - runs locally for transcription
  - Install: `pip install openai-whisper`
  - Note: First run may download model files (~140MB for base model)
- **Ollama** - for summarization and frame analysis
  - Install: `curl -fsSL https://ollama.com/install.sh | sh`
  - Runs automatically as a background service (port 11434)
  - Default models (automatically pulled on first use):
    - `llava` - for visual frame analysis (multimodal)
    - `gemma3` - for text summarization

## How it works

1. **Audio Extraction & Transcription**: 
   - Extracts audio and transcribes with Whisper
   - Produces timestamped segments (e.g., `[1:30] Speaker says...`)
   - Captures precise timing for synchronization with frames

2. **Intelligent Frame Selection**: 
   - AI analyzes transcript content to identify key moments
   - Selects frames at meaningful timestamps with reasoning
   - Shows why each moment was selected (e.g., "Introduction", "Key demonstration")
   - Validates timestamps against actual video duration
   - Falls back to content-based distribution if AI fails

3. **Context-Aware Frame Analysis**: 
   - Uses `llava` model for multimodal visual understanding
   - Analyzes frames sequentially to maintain narrative flow
   - Each frame analysis includes:
     - Visual description from the frame
     - Context from previous frame
     - Relevant transcript excerpt from that moment
   
4. **Comprehensive Summarization**: 
   - Uses `gemma3` model for structured text generation
   - Creates detailed summaries including:
     - **Overview**: Brief introduction to the content
     - **Main Topics**: Key subjects covered in order
     - **Key Insights**: Important takeaways and conclusions
     - **Visual Elements**: Notable visual content from frames
     - **Action Items**: Any next steps or recommendations

## Installation

### Using npx (no installation required)
```bash
npx @adamhancock/transcribe-cli video.mp4
```

### Global installation
```bash
npm install -g @adamhancock/transcribe-cli
```

### From source
```bash
git clone https://github.com/adamhancock/transcribe-cli.git
cd transcribe-cli
npm install
npm run build
npm link  # Makes 'transcribe' command available globally
```

## Usage

Basic usage:
```bash
transcribe video.mp4
```

Options:
- `-o, --output <path>` - Output file path (default: input_transcript.txt)
- `-a, --audio-only` - Only extract audio without transcription
- `-t, --transcribe-only` - Only transcribe without summarization
- `--host <host>` - Ollama API host (default: http://localhost:11434)
- `--model <model>` - Ollama model name for both frame and text analysis (overrides defaults)
- `--whisper-model <model>` - Whisper model size (default: base)
- `--keep-audio` - Keep extracted audio file after processing
- `--no-analyze-frames` - Disable frame extraction and analysis (enabled by default)
- `--frame-interval <seconds>` - Seconds between frame extraction (default: 3)
- `--max-frames <count>` - Maximum number of frames to extract (default: 30)
- `--keep-frames` - Keep extracted frames after processing
- `--save-timestamps` - Save timestamped transcript and frame data to JSON file
- `--plain-transcript` - Save transcript without timestamps in output file

## Examples

```bash
# Basic transcription with intelligent frame analysis
transcribe recording.mp4

# Quick transcription without analysis
transcribe recording.mp4 --transcribe-only

# Extract more frames for detailed videos
transcribe recording.mp4 --max-frames 50

# Use a faster Whisper model for quick results
transcribe recording.mp4 --whisper-model tiny

# Use a larger Whisper model for better accuracy
transcribe recording.mp4 --whisper-model large

# Save all artifacts for further processing
transcribe recording.mp4 --keep-audio --keep-frames --save-timestamps

# Get plain transcript without timestamps
transcribe recording.mp4 --plain-transcript

# Use different models
transcribe recording.mp4 --model llama3.2  # Uses llama3.2 for both vision and text

# Process without frame analysis (audio only)
transcribe recording.mp4 --no-analyze-frames

# Custom output location
transcribe recording.mp4 -o ~/Documents/meeting-notes.txt
```

## Performance Tips

- **Faster processing**: Use `--whisper-model tiny` for quick drafts
- **Better accuracy**: Use `--whisper-model medium` or `large` for important content
- **Reduce frames**: Lower `--max-frames` for faster analysis of long videos
- **Vision models**: `llava` is default; try `bakllava` or `llava:13b` for better accuracy

## Output Format

The tool provides multiple outputs:

### Console Output
- Progress indicators for each processing stage
- Frame extraction with reasoning (e.g., `✓ Frame 1 at 0:00 - Introduction`)
- Real-time analysis progress
- Structured final summary

### File Outputs
1. **Main transcript file** (default: `video_transcript.txt`)
   - Timestamped transcript (e.g., `[1:30] Speaker says...`)
   - Comprehensive structured summary with sections
   - Use `--plain-transcript` for transcript without timestamps

2. **Timestamped data file** (optional: `video_timestamped.json`)
   - Complete transcript with precise timestamps
   - Frame analyses with timestamps and descriptions
   - Frame extraction reasoning
   - Useful for creating subtitles, chapters, or navigating content

### Example Output

```
Transcript of presentation.mp4:

[0:00] Welcome everyone to today's presentation on machine learning.
[0:05] I'll be covering three main topics today...
[0:12] First, let's understand what neural networks are...

---

Summary:

## Overview
This video presents an introduction to machine learning concepts...

## Main Topics Covered
1. **Neural Networks Basics**: The speaker explains...
2. **Training Process**: Demonstrates how models learn...
3. **Practical Applications**: Shows real-world examples...

## Key Points & Insights
- Neural networks mimic human brain structure
- Training requires large datasets and computational power
- Applications range from image recognition to natural language

## Visual Elements
- Slide presentations with diagrams
- Live coding demonstration
- Results visualization graphs

## Action Items or Next Steps
- Practice with the provided code examples
- Explore the recommended datasets
- Join the community forum for questions
```


## Development

Run directly with tsx:
```bash
npm run dev -- video.mp4
```

Build:
```bash
npm run build
```

Publish to npm:
```bash
npm version patch  # or minor/major
npm publish
```