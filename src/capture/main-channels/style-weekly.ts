declare const injectedHelpers : any; 
declare const document : any;

export const CAPTURE_KEY : string = 'styleWeekly';

import { puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies : any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.MAIN_EVENT_SELECTOR,
    navSettings: channelCfg.NAV_SETTINGS    
  };
  
  let curDate : string = new Date().toISOString();

  //init return values
  let results : models.CaptureResults = {
    tenantName: channelCfg.TENANT_NAME,
    channelName: channelCfg.CHANNEL_NAME,
    channelBaseUri: channelCfg.PRIMARY_URI,
    captureDt: curDate,
    events: [] as models.CaptureEvent[],
  };

  let log : models.CaptureLog = {
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

  try
  {
    let isLastPage : boolean = false;
    let pageNum : number = 1;

    //set up puppeteer and navigate to page
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: `${channelCfg.PRIMARY_URI}${pageNum}`}, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    if (envCfg.persistImagesToAws)
      log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);

    do {
      //capture from main page
      try {
        [log, results] = await 
          page.$$eval<[models.CaptureLog, models.CaptureResults], models.CaptureResults, models.CaptureLog, any>(
            channelCfg.MAIN_EVENT_SELECTOR, 
            captureHelpers.parseStyleWeeklyPageBrowserFn,
            results,
            log,
            bundledRuntimeDependencies
        ); //day eval
      } catch {
        isLastPage = true;
      }
                  
      //page forward
      if (!isLastPage) {      
        pageNum++;

        await page.evaluate(
          (buttonSelector) => {
            var pagerElem = document.querySelector(buttonSelector);
            if (pagerElem) {
              pagerElem.click();
            }
          }, 
          'a.next');

        console.log('paging to next...')
      }      
      await page.waitFor(1000);      
    } while (!isLastPage && pageNum < 10)

    console.log(results.events.length);

    //Walk through each event in the results and navigate to its detail page
    for(let i = 0; results.events.length > 0 && i < results.events.length; i++) {
    let curEvent = results.events[i];
    
      //take only first event detail page (if exists)
      if (curEvent.eventUris && curEvent.eventUris.length > 0) {
        let eventDetailUri = curEvent.eventUris.filter(x => x.isCaptureSrc)[0];
        
        //scrape details page
        bundledRuntimeDependencies.curUri = eventDetailUri.uri;
        [log, curEvent] = await captureHelpers.parseStyleWeekly(page, curEvent, log, bundledRuntimeDependencies);

        results.events[i] = curEvent;        
      } //if event has detail page
    }
    
    log.totalCapturedEvents = results.events.length;

    if (envCfg.persistImagesToAws)
      [ log, results ] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);

  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${channelCfg.PRIMARY_URI}`);
  } finally {
    captureHelpers.outputLog(log);   
  }
    
  let testHttp = await apiClient.postCaptureResults(log, results);

  return 0;

}

