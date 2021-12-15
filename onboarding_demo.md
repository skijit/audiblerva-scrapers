Onboarding Demo
====

## Install
- install node (v8+)
- [clone repository from github]()
- on the commandline, run: `npm install`

## Background
- Developer Tools
- Chrome Automation 
- Headless Chrome
- Puppeteer
- Key: Execution in:
  - Node environment
  - Browser
- Compare to traditional scraping approaches

## Design
- Transpile:
  - `npm run build`
  - dumps transpiled code to `dist/`
- Entry Point
  - `npm run app -- <channel-key>`
    - `<channel-key>` is defined in each of scrapers underneath `src/main-channels/<channel>`
    - e.g. `npm run app -- theNational`
  - runs the transpiled code in `dist/`
- Global Configuration
  - `config.ts`
  - Gets injected into each of the scrapers
  - Channel-specific info like selectors
  - Also some global configuration
- Scraper
  - Standard return values
  - Usually 2 loops:
    - Read a calendar, save detail pages and some initial info
    - Read detail pages
  - Upload images to S3
  - Upload event data to API

## One Scraper Walk Through
- Some quick adjustments:
  - Limit outer loop
  - Dump the scraped data to console
- Debugging:
  - Server: update the launch.json and run from vscode
  - Browser: set configuration `debug: true`
    - see `puppeteer-utils.ts`
    - you can set a `debugger` statement in js code executing in the browser




