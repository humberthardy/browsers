#!/bin/bash

git pull origin master --recurse-submodules
git submodule update --init --remote --merge
