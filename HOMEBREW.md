# Publishing to Homebrew

Users will be able to install with:

```bash
brew install guhcostan/clean-my-mac/clean-my-mac
```

Or:

```bash
brew tap guhcostan/clean-my-mac
brew install clean-my-mac
```

## Setup: Create Your Homebrew Tap

### 1. Create a new GitHub repository

Create a repository named **`homebrew-clean-my-mac`** on GitHub.

> The name MUST start with `homebrew-` for Homebrew to recognize it as a tap.

### 2. Add the formula

```bash
# Clone your tap repo
git clone https://github.com/guhcostan/homebrew-clean-my-mac.git
cd homebrew-clean-my-mac

# Copy the formula
cp /path/to/clean-my-mac/homebrew/clean-my-mac.rb .

# Push
git add .
git commit -m "Add clean-my-mac formula"
git push
```

### 3. Done!

Users can now install with:
```bash
brew install guhcostan/clean-my-mac/clean-my-mac
```

## Releasing New Versions

### 1. Update version in package.json

### 2. Create a tag and push

```bash
git add .
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

### 3. CI will automatically:
- Run tests
- Build the project
- Create a GitHub Release with the tarball
- Update the formula in your main repo

### 4. Update your tap repo

After CI updates `homebrew/clean-my-mac.rb`, copy it to your tap:

```bash
cd homebrew-clean-my-mac
cp /path/to/clean-my-mac/homebrew/clean-my-mac.rb .
git add .
git commit -m "Update to v1.0.0"
git push
```

Or set up a GitHub Action to do this automatically!

## Automatic Tap Updates (Optional)

Add this to your tap repo as `.github/workflows/sync.yml`:

```yaml
name: Sync Formula

on:
  repository_dispatch:
    types: [formula-updated]
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Download formula from main repo
        run: |
          curl -o clean-my-mac.rb https://raw.githubusercontent.com/guhcostan/clean-my-mac/main/homebrew/clean-my-mac.rb
      
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add clean-my-mac.rb
          git commit -m "Sync formula" || exit 0
          git push
```

## Testing Locally

```bash
# Build
npm run build

# Create tarball
tar -czvf clean-my-mac-1.0.0.tar.gz package.json dist/ node_modules/

# Test install
brew install --build-from-source ./homebrew/clean-my-mac.rb

# Test it works
clean-my-mac --help
```
