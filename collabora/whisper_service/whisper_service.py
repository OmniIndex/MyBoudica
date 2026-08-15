#!/usr/bin/env python3

"""
Local Whisper Transcription Microservice — faster-whisper edition

Drop-in replacement for the original openai-whisper-based service. Same
Flask routes, same request format, same response JSON shape — the only
thing that changed internally is the inference engine and model size, so
TranscriptionService.php on the Nextcloud side needs no changes at all;
just point WHISPER_SERVICE_URL at this new server.

Two real improvements over the original, both relevant to problems seen in
production:

1. faster-whisper (CTranslate2) is reported ~3-4x faster than the reference
   openai-whisper implementation for the same model and accuracy — matters
   a lot for CPU-only inference, where a 30-minute call could otherwise take
   a long time to turn into an emailed transcript.

2. VAD (voice-activity detection) filtering, via `vad_filter=True`. This
   actively strips non-speech segments out BEFORE they reach the model,
   rather than feeding long stretches of silence to Whisper and hoping it
   correctly recognizes "no speech" rather than hallucinating repetitive
   filler ("Okay. Okay. Okay...") — exactly the failure mode seen on a real
   30-minute 3-person call, where one participant's mostly-silent solo
   track (see the multi-track mixing fix in JanusTranscriptionCommand.php)
   produced almost nothing but hallucinated repetition after the first
   sentence. VAD filtering is a second, independent layer of defense
   against the same class of problem — worth having even with the mixing
   fix in place, since a genuinely quiet stretch in a real mixed
   conversation can still trigger this without it.
"""

import os
import logging
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from faster_whisper import WhisperModel
import uuid

# Configuration
UPLOAD_FOLDER = '/app/uploads'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'webm', 'opus'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'base')
MODEL_PATH = os.getenv('WHISPER_MODEL_PATH', '/app/models')
# int8 quantization: real speed/memory win on CPU with minimal accuracy
# loss. Override to "float32" via env var if maximum accuracy is more
# important than speed/memory for a given deployment.
WHISPER_COMPUTE_TYPE = os.getenv('WHISPER_COMPUTE_TYPE', 'int8')
WHISPER_DEVICE = os.getenv('WHISPER_DEVICE', 'cpu')
# How many CPU threads faster-whisper uses internally. 0 = let CTranslate2
# choose automatically based on available cores.
WHISPER_CPU_THREADS = int(os.getenv('WHISPER_CPU_THREADS', '0'))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Global model cache
_model = None


def get_model():
    """Load faster-whisper model (cache on first use)."""
    global _model
    if _model is None:
        logger.info(
            f"Loading faster-whisper model: {WHISPER_MODEL} "
            f"(device={WHISPER_DEVICE}, compute_type={WHISPER_COMPUTE_TYPE})"
        )
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
            cpu_threads=WHISPER_CPU_THREADS,
            download_root=MODEL_PATH,
        )
        logger.info("faster-whisper model loaded successfully")
    return _model


def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def run_transcription(temp_path, language, temperature):
    """
    Runs faster-whisper's transcribe() and fully materializes the result.

    IMPORTANT: faster-whisper's transcribe() returns a LAZY GENERATOR of
    segments, not a fully-computed result dict like the reference
    openai-whisper implementation. Nothing is actually transcribed until
    you iterate it. Both endpoints below need the complete result (full
    text for /transcribe, full segment list for /transcribe/segments), so
    this helper fully consumes the generator once here rather than
    duplicating that logic in both routes.

    vad_filter=True enables the built-in Silero VAD model to strip
    non-speech segments before they reach Whisper itself — see the module
    docstring for why this matters here specifically.
    """
    model = get_model()
    segments_generator, info = model.transcribe(
        temp_path,
        language=language,
        temperature=temperature,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    segments = []
    for seg in segments_generator:
        segments.append({
            'id': seg.id,
            'start': seg.start,
            'end': seg.end,
            'text': seg.text.strip(),
            'avg_logprob': seg.avg_logprob,
            'no_speech_prob': seg.no_speech_prob,
        })

    full_text = ' '.join(s['text'] for s in segments).strip()

    return {
        'text': full_text,
        'segments': segments,
        'language': info.language,
    }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'model': WHISPER_MODEL}), 200


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe audio file.

    Expected: multipart/form-data with audio file.
    Returns: JSON with transcript text — same shape as the original service.

    Example:
        curl -F "audio=@call.wav" https://myboudica.com/whisper/transcribe
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(audio_file.filename):
            return jsonify({'error': f'File type not allowed. Supported: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

        language = request.form.get('language', None)
        temperature = float(request.form.get('temperature', '0.0'))

        temp_id = str(uuid.uuid4())
        filename = secure_filename(audio_file.filename)
        temp_path = os.path.join(UPLOAD_FOLDER, f"{temp_id}_{filename}")

        audio_file.save(temp_path)
        logger.info(f"Processing audio file: {filename} (temp_id: {temp_id})")

        result = run_transcription(temp_path, language, temperature)

        os.remove(temp_path)

        transcript_text = result['text']

        logger.info(f"Transcription completed (temp_id: {temp_id}, length: {len(transcript_text)} chars)")

        return jsonify({
            'status': 'success',
            'transcript': transcript_text,
            'language': result.get('language', 'unknown'),
            'file_id': temp_id,
            'segments': len(result.get('segments', [])),
        }), 200

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Transcription failed: {str(e)}'}), 500


@app.route('/transcribe/segments', methods=['POST'])
def transcribe_segments():
    """
    Transcribe audio file and return detailed segments.

    Returns: JSON with full segment list including timestamps and
    confidence — same shape as the original service (avg_logprob/
    no_speech_prob are the faster-whisper equivalents of the reference
    implementation's per-segment confidence fields).

    Example:
        curl -F "audio=@call.wav" https://myboudica.com/whisper/transcribe/segments
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        if not allowed_file(audio_file.filename):
            return jsonify({'error': 'File type not allowed'}), 400

        language = request.form.get('language', None)
        temperature = float(request.form.get('temperature', '0.0'))

        temp_id = str(uuid.uuid4())
        filename = secure_filename(audio_file.filename)
        temp_path = os.path.join(UPLOAD_FOLDER, f"{temp_id}_{filename}")
        audio_file.save(temp_path)

        logger.info(f"Processing segments for: {filename} (temp_id: {temp_id})")

        result = run_transcription(temp_path, language, temperature)

        os.remove(temp_path)

        logger.info(f"Segments completed (temp_id: {temp_id}, segments: {len(result.get('segments', []))})")

        return jsonify({
            'status': 'success',
            'transcript': result['text'],
            'language': result.get('language', 'unknown'),
            'file_id': temp_id,
            'segments': result.get('segments', []),
        }), 200

    except Exception as e:
        logger.error(f"Segments transcription error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Transcription failed: {str(e)}'}), 500


@app.route('/models', methods=['GET'])
def list_models():
    """List available Whisper models."""
    return jsonify({
        'available_models': ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'],
        'current_model': WHISPER_MODEL,
        'description': 'tiny=fastest, large-v3=best quality'
    }), 200


@app.route('/status', methods=['GET'])
def status():
    """Get service status."""
    return jsonify({
        'status': 'running',
        'model': WHISPER_MODEL,
        'device': WHISPER_DEVICE,
        'compute_type': WHISPER_COMPUTE_TYPE,
        'model_loaded': _model is not None,
        'upload_folder': UPLOAD_FOLDER,
        'max_file_size_mb': MAX_FILE_SIZE / (1024 * 1024),
        'supported_formats': list(ALLOWED_EXTENSIONS),
    }), 200


if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(MODEL_PATH, exist_ok=True)

    logger.info("Starting Whisper Transcription Service (faster-whisper)")
    logger.info(f"Model: {WHISPER_MODEL}")
    logger.info(f"Device: {WHISPER_DEVICE}, compute_type: {WHISPER_COMPUTE_TYPE}")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Model path: {MODEL_PATH}")

    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)