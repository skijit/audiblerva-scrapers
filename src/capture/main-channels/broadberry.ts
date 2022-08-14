export const CAPTURE_KEY: string = 'broadberry';

import { puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies: any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.MAIN_PAGE_EVENT_SELECTOR,
    navSettings: channelCfg.NAV_SETTINGS,
    neighborhood: channelCfg.NEIGHBORHOOD
  };

  let curDate: string = new Date().toISOString();

  //init return values
  let results: models.CaptureResults = {
    tenantName: channelCfg.TENANT_NAME,
    channelName: channelCfg.CHANNEL_NAME,
    channelBaseUri: channelCfg.PRIMARY_URI,
    captureDt: curDate,
    events: [] as models.CaptureEvent[],
  };

  let log: models.CaptureLog = {
    tenantName: channelCfg.TENANT_NAME,
    channelName: channelCfg.CHANNEL_NAME,
    channelBaseUri: channelCfg.PRIMARY_URI,
    logDt: curDate,
    mostRecentScreenShot: null,
    errorLogs: [] as string[],
    warningLogs: [] as string[],
    infoLogs: [] as string[],
    totalCapturedEvents: 0
  };

  try {

    //set up puppeteer and navigate to page
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: channelCfg.PRIMARY_URI }, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    //add jquery (NOT NEEDED CURRENTLY)
    //await puppeteerUtils.injectJquery(page, 'capJq');

    //capture from main page
    [log, results] = await
      page.$$eval<[models.CaptureLog, models.CaptureResults], models.CaptureResults, models.CaptureLog, any>(
        channelCfg.DAY_EVENT_SELECTOR, 
        captureHelpers.parseMainCamelOrBroadberryPgBrwserFn,
        results,
        log,
        bundledRuntimeDependencies
      ); //day eval

    console.log(`identified ${results.events.length} events`);

    log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);

    //Walk through each event in the results and navigate to its detail page
    for (let i = 0; results.events.length > 0 && i < results.events.length; i++) {
      let curEvent = results.events[i];

      //if venueName is BroadBerry, set location, etc.
      if (curEvent.venueName === channelCfg.VENUE_NAME) {
        curEvent.location = { type: "Point", coordinates: channelCfg.COORDINATES };
        curEvent.venueAddressLines = channelCfg.VENUE_ADDRESS;
        curEvent.neighborhood = channelCfg.NEIGHBORHOOD;
      } else {
        curEvent.location = curEvent.venueAddressLines = curEvent.neighborhood = null;
      }

      //take only first event detail page (if exists)
      if (curEvent.eventUris && curEvent.eventUris.length > 0) {
        let eventDetailUri = curEvent.eventUris.filter(x => x.isCaptureSrc)[0];
        bundledRuntimeDependencies.curUri = eventDetailUri.uri;

        //scrape details page
        bundledRuntimeDependencies.curUri = eventDetailUri.uri;
        [log, curEvent] = await captureHelpers.parseCamelOrBroadberry(page, curEvent, log, bundledRuntimeDependencies);

        results.events[i] = curEvent;
        // console.log(curEvent);
        // console.log(log)

      } //if event has detail page
    } //for each event

    captureHelpers.removeEventsWithMissingDates(results, log);
    log.totalCapturedEvents = results.events.length;

    if (envCfg.persistImagesToAws)
      [log, results] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);

  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${channelCfg.PRIMARY_URI}`);
  } finally {
    captureHelpers.outputLog(log);
  }

  let testHttp = await apiClient.postCaptureResults(log, results);

  return 0;
}; //main

