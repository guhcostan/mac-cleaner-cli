class CleanMyMac < Formula
  desc "Open source CLI tool to clean your Mac"
  homepage "https://github.com/yourusername/clean-my-mac"
  url "https://registry.npmjs.org/clean-my-mac-cli/-/clean-my-mac-cli-1.0.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "clean-my-mac", shell_output("#{bin}/clean-my-mac --version")
  end
end

