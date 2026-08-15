FROM python:3.11-slim

WORKDIR /app

# gcc/g++/make/build-essential and torch/torchaudio are gone — faster-whisper
# (CTranslate2) ships precompiled wheels and doesn't use PyTorch at all,
# unlike the old openai-whisper-based service this replaces.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir setuptools wheel

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY whisper_service.py /app/whisper_service.py

RUN mkdir -p /app/uploads && mkdir -p /app/models

# Model size is a build ARG rather than hardcoded, so a different size can
# be built later (e.g. medium, if large-v3's turnaround time proves too
# slow in practice) without editing this file — just
# `docker build --build-arg WHISPER_MODEL=medium ...`
ARG WHISPER_MODEL=large-v3
ENV WHISPER_MODEL=${WHISPER_MODEL}

# Pre-download the model at build time, same pattern as the original —
# avoids a multi-GB download happening awkwardly on the first real request.
RUN python -c "import os; from faster_whisper import WhisperModel; model_name = os.environ['WHISPER_MODEL']; print(f'Downloading {model_name} model...'); WhisperModel(model_name, device='cpu', compute_type='int8', download_root='/app/models'); print('Model ready!')"

EXPOSE 5000

ENV FLASK_APP=whisper_service.py
ENV WHISPER_MODEL_PATH=/app/models
ENV WHISPER_COMPUTE_TYPE=int8
ENV WHISPER_DEVICE=cpu

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["python", "-u", "whisper_service.py"]