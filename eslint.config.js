export default [
  {
    files: ["js/**/*.js", "candidates/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        performance: "readonly",
        history: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        AudioContext: "readonly",
        webkitAudioContext: "readonly",
        URLSearchParams: "readonly",
        Math: "readonly",
        Map: "readonly",
        Set: "readonly",
        Infinity: "readonly",
        NaN: "readonly",
        isNaN: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly"
      }
    },
    rules: {
      "no-dupe-keys": "error",
      "no-dupe-class-members": "error",
      "no-func-assign": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrors": "none" }]
    }
  }
];
