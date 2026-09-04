# Build context for this Dockerfile is vendor/nextcloud-spreed-signaling
# (see docker-compose.yml) - this file only adds one step over the vendored
# docker/server/Dockerfile: enable Janus recording for every publisher room
# (matches sfu/janus/janus.go.patch's intent - see
# vendor/nextcloud-spreed-signaling/VENDOR_PIN.md) before building. Applied
# via sed rather than `patch`, since janus.go.patch's hunk header is missing
# its line-number range (hand-written, not a real `diff -u` output) and
# `patch` refuses to apply it ("Only garbage was found in the patch input").
# sed matches on the exact source line instead, which also survives an
# upstream version bump better than a line-number-anchored patch would.
FROM --platform=${BUILDPLATFORM} golang:1.26-alpine AS builder
ARG TARGETARCH
ARG TARGETOS

WORKDIR /workdir

COPY . .
RUN grep -q '"videoorient_ext": false,' sfu/janus/janus.go || \
        (echo "FATAL: expected anchor line not found in sfu/janus/janus.go - upstream source changed, update this Dockerfile's sed insertion" && exit 1)
RUN sed -i 's#\("videoorient_ext": false,\)#\1\n\t\t"record":   true,\n\t\t"rec_dir":  "/opt/janus/share/janus/recordings",#' \
        sfu/janus/janus.go
RUN touch /.dockerenv && \
    apk add --no-cache bash git make && \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} make server

FROM alpine:3

ENV CONFIG=/config/server.conf
RUN addgroup -g 850 spreedbackend && \
    adduser -D --uid 850 -S -H -G spreedbackend spreedbackend && \
    apk add --no-cache bash tzdata ca-certificates su-exec

COPY --from=builder /workdir/bin/signaling /usr/bin/nextcloud-spreed-signaling
COPY --from=builder /workdir/server.conf.in /config/server.conf.in
COPY --from=builder /workdir/docker/server/entrypoint.sh /
COPY --from=builder /workdir/docker/server/stop.sh /
COPY --from=builder /workdir/docker/server/wait.sh /
RUN /usr/bin/nextcloud-spreed-signaling -version

STOPSIGNAL SIGUSR1
ENTRYPOINT [ "/entrypoint.sh" ]
