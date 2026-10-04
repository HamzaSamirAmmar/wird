// The displayed version has one source of truth: this package's manifest. Bumping
// "version" in package.json is all a release needs — this used to be a hand-maintained
// literal that drifted from the manifest whenever a bump forgot to touch it.
import pkg from '../package.json';

export const APP_VERSION: string = pkg.version;
