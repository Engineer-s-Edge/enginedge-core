#!/bin/bash
# Wrapper script to run the control center with the virtual environment
cd "$(dirname "$0")"
./venv/bin/python control-center.py "$@"
