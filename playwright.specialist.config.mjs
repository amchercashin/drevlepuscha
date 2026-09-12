// Opt-in diagnostics: select a specific test file; this is not the normal workflow.
import active from './playwright.config.mjs';
export default {...active,testDir:'./tests/browser'};
