Description
The project currently uses tsup as a devDependency for bundling TypeScript projects. However, tsup is no longer being actively maintained. According to the official tsup README, the maintainers recommend migrating to tsdown as the successor tool.

Current State
Package: tsup
Status: No longer receiving updates
Impact: Potential security vulnerabilities, lack of bug fixes, and missing new features
Proposed Solution
Migrate from tsup to tsdown as recommended by the original maintainers.

Migration Steps
Install tsdown as a devDependency;
Run the command npx tsdown migrate to migrate config of tsup to tsdown;
Test the build process to ensure compatibility
Update documentation/README if necessary
Benefits
Continued maintenance and updates
Access to new features and improvements
Security patches and bug fixes
Better long-term sustainability of the project
References
tsup README recommendation for migration to tsdown
tsdown repository
Priority
Medium - While the project currently works with tsup, migrating to an actively maintained tool ensures long-term reliability and security.
