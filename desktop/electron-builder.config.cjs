// Packaging config for the macOS app (.dmg + .zip, Apple Silicon and Intel).
//
// Signing is optional:
// - With CSC_LINK / CSC_KEY_PASSWORD (a "Developer ID Application" certificate)
//   the app is signed with the hardened runtime, and when APPLE_ID,
//   APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are set it is also notarized.
// - Without them it is ad-hoc signed, which runs fine locally but is flagged by
//   Gatekeeper when downloaded (see desktop/README.md).
const hasCertificate = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const canNotarize = Boolean(
  hasCertificate && process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.github.guhcostan.maccleaner',
  productName: 'Mac Cleaner',
  copyright: 'Copyright © guhcostan',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: ['dist/**/*', 'assets/**/*', 'package.json'],
  asar: true,
  mac: {
    category: 'public.app-category.utilities',
    icon: 'build/icon.png',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    minimumSystemVersion: '12.0',
    extendInfo: {
      // Menu bar only: no Dock icon, no app menu.
      LSUIElement: true,
    },
    identity: hasCertificate ? undefined : '-',
    hardenedRuntime: hasCertificate,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: canNotarize,
    // Used by the zip target (the dmg target sets its own name below).
    artifactName: 'Mac-Cleaner-${version}-${arch}-mac.${ext}',
  },
  dmg: {
    title: 'Mac Cleaner ${version}',
    artifactName: 'Mac-Cleaner-${version}-${arch}.dmg',
  },
  publish: null,
};
