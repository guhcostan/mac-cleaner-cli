# Publishing to Homebrew

This guide explains how to publish `clean-my-mac` to Homebrew so users can install it with `brew install`.

## Prerequisites

1. A GitHub account
2. npm account (for publishing to npm registry)
3. The project must be published to npm first

## Step 1: Publish to npm

```bash
# Make sure you're logged in to npm
npm login

# Build and publish
npm run build
npm publish
```

## Step 2: Create a Homebrew Tap

1. Create a new GitHub repository named `homebrew-clean-my-mac`
2. Clone it locally:

```bash
git clone https://github.com/yourusername/homebrew-clean-my-mac.git
cd homebrew-clean-my-mac
```

3. Create the Formula directory:

```bash
mkdir -p Formula
```

## Step 3: Create the Formula

1. Get the SHA256 of the npm package:

```bash
# Download the package
npm pack clean-my-mac-cli

# Get SHA256
shasum -a 256 clean-my-mac-cli-1.0.0.tgz
```

2. Copy the formula template and update it:

```bash
cp /path/to/clean-my-mac/homebrew/clean-my-mac.rb Formula/clean-my-mac.rb
```

3. Update the formula with:
   - Your GitHub username in the URLs
   - The correct SHA256 hash
   - The correct version number

## Step 4: Push and Test

```bash
cd homebrew-clean-my-mac
git add .
git commit -m "Add clean-my-mac formula"
git push
```

## Step 5: Install via Homebrew

Users can now install with:

```bash
# Add your tap
brew tap yourusername/clean-my-mac

# Install
brew install clean-my-mac
```

## Updating the Formula

When you release a new version:

1. Publish new version to npm
2. Update the formula with new version and SHA256
3. Commit and push to your tap repository

## Alternative: Homebrew Core

For wider distribution, you can submit your formula to homebrew-core:

1. Fork https://github.com/Homebrew/homebrew-core
2. Add your formula to `Formula/c/clean-my-mac.rb`
3. Submit a pull request

Requirements for homebrew-core:
- Must have 75+ GitHub stars or significant usage
- Must follow Homebrew's formula conventions
- Must pass `brew audit --strict`

