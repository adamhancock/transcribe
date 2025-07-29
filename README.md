# Transcribe CLI

A TypeScript CLI tool for transcribing and summarizing MP4 recordings using local models.

## Prerequisites

- Node.js 18+
- FFmpeg installed (`brew install ffmpeg` on macOS)
- OpenAI Whisper (`pip install openai-whisper`) - runs locally for transcription
- **Ollama** - `ollama serve` (port 11434) for summarization
  - Install: `curl -fsSL https://ollama.com/install.sh | sh`
  - Models are automatically pulled if not available locally

## How it works

1. **Audio Extraction**: Uses FFmpeg to extract audio from MP4
2. **Transcription**: Uses Whisper (runs locally on your machine) to convert speech to text
3. **Frame Analysis**: Extracts video frames at regular intervals for visual context (enabled by default)
4. **Summarization**: Uses Ollama to summarize the transcript and analyze frames
   - Summary is displayed in the console before saving to file
   - Default model: gemma3 (text-only)
   - For multimodal analysis, use models like `llava` or `bakllava`
   - The tool automatically falls back to text-only if the model doesn't support images

## Installation

### From npm (recommended)
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
- `--model <model>` - Ollama model name for summarization (default: gemma3)
- `--whisper-model <model>` - Whisper model size (default: base)
- `--keep-audio` - Keep extracted audio file after processing
- `--no-analyze-frames` - Disable frame extraction and analysis (enabled by default)
- `--frame-interval <seconds>` - Seconds between frame extraction (default: 3)
- `--max-frames <count>` - Maximum number of frames to extract (default: 30)
- `--keep-frames` - Keep extracted frames after processing

## Examples

```bash
# Basic transcription and summary (uses Ollama with gemma3)
transcribe recording.mp4

# Only extract audio
transcribe recording.mp4 --audio-only

# Only transcribe (no summary)
transcribe recording.mp4 --transcribe-only

# Use a specific Whisper model
transcribe recording.mp4 --whisper-model medium

# Specify output file
transcribe recording.mp4 -o my-transcript.txt

# Use a different Ollama model
transcribe recording.mp4 --model llama3.2

# Use a multimodal model for visual analysis
transcribe recording.mp4 --model llava

# Use custom Ollama host
transcribe recording.mp4 --host http://remote-server:11434

# Disable frame analysis
transcribe recording.mp4 --no-analyze-frames

# Customize frame extraction
transcribe recording.mp4 --frame-interval 5 --max-frames 50

# Keep extracted frames for manual review
transcribe recording.mp4 --keep-frames
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