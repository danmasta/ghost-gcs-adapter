import { GCSAdapter } from './lib/adapter.mjs';

// Note: When the adapter is required, it is required as a directory
// So node skips the exports check in package.json, and checks the main field only
// Unfortunately this means we can't route to .cjs files programatically,
// and we have to set the packge type to commonjs for now
// Hopefully ghost supports esm soon
// Note: Ghost expects the adapter class to be module.export
// Note: Rollup can't mix named and default exports, so we can only export default
// from the main entrypoint
// https://nodejs.org/api/modules.html#all-together
export default GCSAdapter;
