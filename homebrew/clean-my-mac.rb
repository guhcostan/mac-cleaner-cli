class CleanMyMac < Formula
  desc "Open source CLI tool to clean your Mac"
  homepage "https://github.com/guhcostan/clean-my-mac"
  url "https://github.com/guhcostan/clean-my-mac/releases/download/v1.0.0/clean-my-mac-1.0.0.tar.gz"
  sha256 "PLACEHOLDER_SHA256_WILL_BE_UPDATED_BY_CI"
  license "MIT"

  depends_on "node@20"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"node_modules/.bin/clean-my-mac" => "clean-my-mac"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/clean-my-mac --version")
  end
end
