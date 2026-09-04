# Thin layer over the official Collabora image adding the Boudica chat
# widget. Previously this was applied by hand-editing a running container's
# cool.html and copying in boudica_widget.js directly - lost on any image
# update (same class of problem as the Nextcloud Dockerfile in this same
# directory tree fixes). boudica-config.js is intentionally a separate file
# rather than an inline <script> block in cool.html, so its
# deployment-specific values (apiEndpoint) can be bind-mounted over at
# container start without needing to re-patch cool.html itself.
#
# collabora/code's own image ships with NO shell at all (no /bin/sh, no
# busybox) - `RUN sed` directly against it fails with "stat /bin/sh: no
# such file or directory". Edited in a throwaway alpine stage instead, which
# DOES have a shell, then copied into the final (still shell-less) image -
# COPY is a builder-side instruction, not something that runs inside the
# target container, so it works fine even without a shell there.
ARG COLLABORA_TAG=latest
FROM collabora/code:${COLLABORA_TAG} AS base

FROM alpine:3 AS editor
COPY --from=base /usr/share/coolwsd/browser/dist/cool.html /cool.html
# Inject before </head> - anchor chosen for stability across image updates
# rather than assuming any particular surrounding markup in cool.html.
RUN sed -i 's#</head>#<script src="boudica-config.js"></script><script src="boudica_widget.js" defer></script></head>#' \
    /cool.html

FROM collabora/code:${COLLABORA_TAG}
COPY boudica_widget.js boudica-config.js /usr/share/coolwsd/browser/dist/
COPY --from=editor /cool.html /usr/share/coolwsd/browser/dist/cool.html
