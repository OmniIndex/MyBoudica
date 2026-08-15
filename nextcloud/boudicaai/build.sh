#!/bin/bash
# Build script without Node debugger
export NODE_OPTIONS=""
cd "$(dirname "$0")"
node_modules/.bin/vite build
