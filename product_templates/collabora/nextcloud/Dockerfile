# Custom layer over the stock Nextcloud image, existing solely to fix the
# problem RUNBOOK.md section 6 flags explicitly: ffmpeg, janus-pp-rec, and
# the Boudica CSP Apache header rule were all previously applied by hand to
# a running container's writable layer on eu1 - meaning every plain restart
# silently lost all three, at real cost in debugging time. Baking them into
# the image instead makes them survive restarts/recreates like everything
# else.
#
# janus-pp-rec converts Janus's recorded .mjr files to .opus
# (MjrAudioExtractor.php, boudicaai app) - built from source because it
# isn't apt-packaged for Debian Trixie. ffmpeg then resamples that .opus to
# 16kHz mono .wav (the 48kHz stereo default causes Whisper tensor-shape
# errors - see RUNBOOK.md 4.5).
# Docker Hub only tags 3-segment versions - live eu1's config.php reports
# the 4-segment internal version 34.0.2.1, which corresponds to this image.
ARG NEXTCLOUD_VERSION=34.0.2
FROM nextcloud:${NEXTCLOUD_VERSION}-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        build-essential pkg-config git \
        libavformat-dev libavcodec-dev libavutil-dev libogg-dev \
        libjansson-dev libcurl4-openssl-dev libmicrohttpd-dev libnice-dev \
        libssl-dev libsrtp2-dev libsofia-sip-ua-dev libglib2.0-dev \
        libopus-dev gengetopt libtool automake autoconf cmake libconfig-dev \
    && cd /tmp \
    && git clone --depth 1 https://github.com/meetecho/janus-gateway.git \
    && cd janus-gateway \
    && ./autogen.sh \
    && ./configure --enable-post-processing --disable-websockets \
        --disable-mqtt --disable-nanomsg --disable-rabbitmq \
        --disable-turn-rest-api \
    && make \
    && cp src/janus-pp-rec /usr/local/bin/ \
    && cd / && rm -rf /tmp/janus-gateway \
    && apt-get purge -y build-essential pkg-config git \
        libavformat-dev libavcodec-dev libavutil-dev libogg-dev \
        libjansson-dev libcurl4-openssl-dev libmicrohttpd-dev libnice-dev \
        libssl-dev libsrtp2-dev libsofia-sip-ua-dev libglib2.0-dev \
        libopus-dev gengetopt libtool automake autoconf cmake libconfig-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# CSP fix for the widget's cross-origin fetch to the Boudica API (RUNBOOK.md
# 4.11) - stopgap until the real fix (proxying server-side through PHP
# instead of a direct browser fetch) happens; see Application.php's comment
# at the old CSP registration site. __BOUDICA_API_ORIGIN__ is substituted by
# setup.sh, matching the __PLACEHOLDER__ convention used throughout this
# product's other templates.
COPY boudica-csp.conf /etc/apache2/conf-available/boudica-csp.conf
RUN a2enmod headers && a2enconf boudica-csp

# Default "My Boudica" branding (logo/header/background/favicon + name/
# slogan/colors), pulled from the live eu1.myboudica.com install's theming
# app so a fresh install looks the same out of the box instead of showing
# stock Nextcloud branding until someone re-does it by hand in the admin
# UI. Applied by setup.sh's post-install step via apply-theming.php (the
# text values go through the existing `occ theming:config` command
# instead - no image-upload API for those). A deployment that wants
# different branding can just replace these 4 files and re-run setup.sh;
# nothing else references them by name.
COPY theming/images/ /opt/boudica-theming/images/
COPY theming/apply-theming.php /opt/boudica-theming/apply-theming.php
