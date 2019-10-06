/*

- detail pages:
  - link to facebook (not sure how to handle that)
  - tickets link is a legit detail page  
    
    - CASE 4: RICHMOND Shows link - ignore bc that will be covered by another scrape job
      - https://www.richmondshows.com/event/1746765-cloud-nothings-richmond/
    - 


*/
declare const injectedHelpers : any, document: any; 

export const CAPTURE_KEY : string = 'strangeMatter';

import { puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  //TODO: explain this
  let fbLinkToDayNumberMap : any;
  let fbLinkToStartHourMap : any;
  let fbLinkToStartMinMap : any;

  let bundledRuntimeDependencies : any = {
    strMatterCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    navSettings: channelCfg.NAV_SETTINGS,
    coordinates: { type: "Point", coordinates: channelCfg.COORDINATES},
    neighborhood: channelCfg.NEIGHBORHOOD
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

  try {
    //set up puppeteer and navigate to page
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: channelCfg.PRIMARY_URI}, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    //capture from main page
    [log, results, fbLinkToDayNumberMap, fbLinkToStartHourMap, fbLinkToStartMinMap] = await 
      page.$$eval<[models.CaptureLog, models.CaptureResults, Map<string, number>, Map<string, number>, Map<string, number>], models.CaptureResults, models.CaptureLog, any>(
        'p span.band:first-child, p span.headline:first-child', 
        parseMainPageBrowserFn,
        results,
        log,
        bundledRuntimeDependencies
    ); //day eval

    console.log(`identified ${results.events.length} events`);

    log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);

    [log, results] = await captureDetails(results, log, page, bundledRuntimeDependencies);

    [log, results] = inferStartDatesWhereMissing(log, results, fbLinkToDayNumberMap, fbLinkToStartHourMap, fbLinkToStartMinMap);

    captureHelpers.removeEventsWithMissingDates(results, log);
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
}; //main

let captureDetails = async (results: models.CaptureResults, log: models.CaptureLog, page : puppeteer.Page, bundledRuntimeDependencies : any) : Promise<any> => {

  //Walk through each event in the results and navigate to its detail page
  for(let i = 0; results.events.length > 0 && i < results.events.length; i++) {
    let curEvent = results.events[i];

    curEvent.location = bundledRuntimeDependencies.coordinates;
    
    //take only first event detail page (if exists)
    if (curEvent.eventUris && curEvent.eventUris.length > 0) {
      let eventDetailUri = curEvent.eventUris[0];
    
      if (curEvent.eventUris.length > 1) {
        log.warningLogs.push(`Expected only 1 Event Detail URI, but there are ${curEvent.eventUris.length}: ${curEvent.eventUris.join(', ')}`);
      }
      
      try {
        //evaluate the kind of detail page, then parse
        if (eventDetailUri.uri.toLowerCase().includes("ticketfly.com/purchase/event")) {
          
          //normal ticketfly link
          bundledRuntimeDependencies.curUri = eventDetailUri.uri;
          [log, curEvent] = await captureHelpers.parseTicketFly(page, curEvent, log, bundledRuntimeDependencies);

        } else if (eventDetailUri.uri.toLowerCase().includes("lyte.com/ticketfly/exchange")) {
          
          //rewrite lyte.com to ticketfly and parse
          let re1 = /(\d+)\/?\??.*$/g;
          let parseRes = re1.exec(eventDetailUri.uri);
          if (parseRes && parseRes.length > 1) {
            let tempLink = `https://www.ticketfly.com/purchase/event/${parseRes[1]}`;
            log.infoLogs.push(`Converting lyte ticketfly detail link (${eventDetailUri.uri}) to regular ticketfly link: ${tempLink}`);
            eventDetailUri.uri = tempLink;
            
            bundledRuntimeDependencies.curUri = eventDetailUri.uri;
            [log, curEvent] = await captureHelpers.parseTicketFly(page, curEvent, log, bundledRuntimeDependencies);

          } else {
            log.errorLogs.push(`Could not convert lyte ticketfly detail link to regular ticketfly link: ${eventDetailUri.uri}`);
          }

        } else if (eventDetailUri.uri.toLowerCase().includes('eventbrite.com')) {
          //eventbrite link
          bundledRuntimeDependencies.curUri = eventDetailUri.uri;
          [log, curEvent] = await captureHelpers.parseEventbrite(page, curEvent, log, bundledRuntimeDependencies);

        } else if (eventDetailUri.uri.toLowerCase().includes('richmondshows.com')) {
          //richmondshows.com link
          bundledRuntimeDependencies.curUri = eventDetailUri.uri;
          [log, curEvent] = await captureHelpers.parseRichmondShows(page, curEvent, log, bundledRuntimeDependencies);
        }
        else {
          log.errorLogs.push(`Unknown detail link found at: ${eventDetailUri.uri}`);
        }

        results.events[i] = curEvent;
      }
      catch (e) {
        log.errorLogs.push(`Detail Processing Exception Thrown: ${e.message} for page: ${eventDetailUri.uri}`);
      }
    } //if event has detail page
    
  } //for each event


  return Promise.resolve([log, results]);
};

let inferStartDatesWhereMissing = (log: models.CaptureLog, results: models.CaptureResults, fbLinkToDayNumberMap: any, fbLinkToStartHourMap: any, fbLinkToStartMinMap: any) : [models.CaptureLog, models.CaptureResults] => {
  //traverse all events, finding those with no dates.  get the associated day and then determine the month by 
  //skipping to the day number of the next event (that has a date), and inspecting it's month.  
  try
  {
    for(let i = 0; results.events.length > 0 && i < results.events.length; i++) {
      let curEvent = results.events[i];
      if (!!curEvent.startDt) continue;
      
      if (!curEvent.eventUris || curEvent.eventUris.length == 0) {
        let dayNumber = fbLinkToDayNumberMap[curEvent.facebookShareUri];
        let success : boolean = false;
        let monthNum:number, yearNum: number;
        //try moving forward
        for(let j=i+1; !success && j < results.events.length; j++) {
          if (results.events[j].startDt && results.events[j].eventUris && results.events[j].eventUris.length > 0) {
            let tempDt = new Date(results.events[j].startDt);
            let tempDayNum = tempDt ? tempDt.getDate() : -1;
            if (tempDayNum > 0) {
              monthNum = tempDayNum > dayNumber ? tempDt.getMonth() : (tempDt.getMonth() == 0 ? 11 : tempDt.getMonth() - 1);
              yearNum = tempDayNum > dayNumber ? tempDt.getFullYear() : (tempDt.getMonth() == 0 ? tempDt.getFullYear()-1: tempDt.getFullYear());
              success = true;
            }
          }
        }
        if (success) {
          let updatedDt = (new Date(yearNum, monthNum, dayNumber))
          updatedDt.setHours(fbLinkToStartHourMap[curEvent.facebookShareUri], fbLinkToStartMinMap[curEvent.facebookShareUri]);
          curEvent.startDt = updatedDt.toISOString();
        }
        //TODO: handle the edge case if it's the last event in the calendar (of course, this will be fixed eventually as new events get added)
      }
    }
  }
  catch (e) {
    log.errorLogs.push(`Start Date time inference Exception Thrown: ${e.message}`);
  }
  return [log, results];
};


let parseMainPageBrowserFn = (dayFirstChildCtx, results, log, deps): [models.CaptureLog, models.CaptureResults, any, any, any] => {
  let fbEventToDayMap = {};
  let fbEventToStartHourMap = {};
  let fbEventToStartMinMap = {};
  
  try
  {
    for (let dayFirstChildItem of dayFirstChildCtx||[]) {
      
      //dayContainer is a <p>
      let dayContainerElem = dayFirstChildItem.parentElement; 
      
      //some days have multiple events
      //each event has a facebook link
      //get each fb event link and navigate relative to it
      let fbEventLinkCtx = dayContainerElem.querySelectorAll("a[href *= 'facebook.com/events']"); 
      for (let fbLink of fbEventLinkCtx||[]) {
        
        //make sure this is the facebook link with the fb image.  else skip.
        if (!fbLink.querySelector('img:first-child')) {
          log.infoLogs.push(`Couldn't zero in on FB link: ${fbLink.getAttribute('href')}`);
          continue;
        }
                  
        let fbHref = fbLink.getAttribute("href");
        
        //event detail link (if it exists) is the nextElementSibling
        let eventDetailUri = null as models.UriType;
        let eventDetailLink = fbLink.nextElementSibling;
        if (eventDetailLink && eventDetailLink.nodeName == "A") {
          eventDetailUri = {
            uri: eventDetailLink.getAttribute("href"),
            isCaptureSrc: true
          };
        } else {
          log.infoLogs.push(`Couldn't find an event detail page for event associated with with this FB link: ${fbLink.getAttribute('href')}`);
        }

        //get date TD
        if (dayContainerElem && dayContainerElem.parentElement) {
          let navOpts = { nodeName: "TD", mustContain: "img", shortCircuit: true };
          let tdWithDates = injectedHelpers.traversePreviousElementSiblings(dayContainerElem.parentElement, navOpts);
          if (tdWithDates && tdWithDates.length > 0) {
            let tdWithDate = tdWithDates[0];
            let dateImg = tdWithDate.querySelector('img');
            let dateRef = dateImg.getAttribute('src');
            let dateRE = /(\d+)\.jpg$/gi;
            let dateMatch = dateRE.exec(dateRef);
            if (dateMatch && dateMatch.length == 2) {
              fbEventToDayMap[fbHref] = parseInt(dateMatch[0]);
            } else {
              log.errorLogs.push(`Couldn't extract date from image for event associated with with this FB link: ${fbLink.getAttribute('href')}`);
            }
          } else {
            log.errorLogs.push(`Couldn't find a corresponding date TD for event associated with with this FB link: ${fbLink.getAttribute('href')}`);
          }
        }

        //get the text node that has all doortime, age restriction, and ticket cost
        //it is the previous sibling of fblink
        let comboTxtElem = fbLink.previousSibling;
        
        let rawDoorTimeStr, doorTimeHours, doorTimeMin, minAge, tixCost = [];
        if (comboTxtElem && comboTxtElem.nodeName == "#text") {
          let comboTxt = comboTxtElem.textContent.toLowerCase();

          //extract doortime
          let timeSegment = comboTxt.substring(0, comboTxt.indexOf("doors"));
          [rawDoorTimeStr, doorTimeHours, doorTimeMin ] = injectedHelpers.parseTime(timeSegment);

          //extract first time (regardless of doors)
          let anyTimeSeg = comboTxt.substring(0, comboTxt.toLowerCase().indexOf('pm')+2);
          let [anyTimeStr, anyTimeHours, anyTimeMin ] = injectedHelpers.parseTime(anyTimeSeg);
          fbEventToStartHourMap[fbHref]= anyTimeHours;
          fbEventToStartMinMap[fbHref]= anyTimeMin;

          //extract age restriction
          if (comboTxt.indexOf("18") >= 0)
            minAge = 18;
          else if (comboTxt.indexOf("21") >= 0)
            minAge = 21;
          else if (comboTxt.indexOf("All") >= 0)
            minAge = 0;
          else 
            minAge = null;

          //extract ticket cost here if the event doesn't have a detail page
          if (eventDetailUri) {
            let tixRE = /\s+\$\d{1,3}\s+/ig;
            let tixMatches = comboTxt.match(tixRE);
            if (tixMatches) {
              let trimmedTixMatches = tixMatches.map(x => x.replace("$","")).sort((a,b) => a-b).join(", ");
              tixCost = injectedHelpers.parseTicketString(trimmedTixMatches);
            }
          }

        } else {
          log.warningLogs.push(`Couldn't find line of text (previous sibling of fb even link) that shows door times and age restriction for FB link: ${fbLink.getAttribute('href')}`);
        }

        let event = <models.CaptureEvent> {
          tenantName: deps.strMatterCfg.TENANT_NAME,
          channelName: deps.strMatterCfg.CHANNEL_NAME,
          channelImage: deps.channelCfg.CHANNEL_IMAGE,
          channelBaseUri: deps.strMatterCfg.PRIMARY_URI,
          venueName: deps.strMatterCfg.VENUE_NAME,
          performers: [] as models.CapturePerformer[],
          eventImageUris: [] as string[],
          eventUris: (eventDetailUri ? [eventDetailUri] : []) as models.UriType[],
          miscDetail: [] as string[],
          unparsedDetail: [] as string[],
          ticketCost: tixCost as models.TicketAmtInfo[],
          facebookShareUri : fbLink.getAttribute("href"),
          ticketUri: eventDetailUri ? eventDetailUri.uri : null,
          venueAddressLines: deps.strMatterCfg.VENUE_ADDRESS,
          venueContactInfo: [ { item: deps.strMatterCfg.VENUE_PHONENUM, itemType: deps.CONTACT_ITEM_TYPES.PHONE }],
          eventContactInfo: [] as models.ContactInfoItem[],
          minAge: minAge,
          rawDoorTimeStr: rawDoorTimeStr,
          doorTimeHours: doorTimeHours,
          doorTimeMin: doorTimeMin,
          promoters: [] as models.PromoterInfo[],
          neighborhood: deps.neighborhood        
        };

        //get the first previous sibling span.band which contain links
        let navOpts = { nodeName: "SPAN", className: "band", mustContain: "a", shortCircuit: true };
        let bandSpans = injectedHelpers.traversePreviousElementSiblings(fbLink, navOpts);
        if (bandSpans[0]) {
          let bandSpanAnchors = bandSpans[0].querySelectorAll("a");
          //iterate over each of the links
          for(let bandSpanAnchor of bandSpanAnchors) {
            let curPerformerIsValid : boolean = true;
            let curPerformer = {} as models.CapturePerformer;
            
            //if the link has content, that is the performer name and uri
            if (bandSpanAnchor.innerText) {
              curPerformer.performerName = bandSpanAnchor.innerText;
              curPerformer.performerUris = [bandSpanAnchor.getAttribute('href')];
            } else {
              //else if the link is empty, check that the nextSibling.nodeName == "#text", and if so, grab from there
              let nextSib = bandSpanAnchor.nextSibling;
              if (nextSib && nextSib.nodeName == "#text") {
                curPerformer.performerName = nextSib.textContent.replace(/\s*[,\&]\s*$/, "");
                curPerformer.performerUris = [];
                log.infoLogs.push(`Performer ${curPerformer.performerName} has no website link from main page.  Associated with event corresponding to this fb link: ${fbLink.getAttribute('href')}`);
              } else {
                curPerformerIsValid = false;
              }
            }

            if (curPerformerIsValid)
              event.performers.push(curPerformer);
          }
        } else {
          log.warningLogs.push(`Couldn't find a band.span with band information (it must have at least one anchor embedded).  No performers can be assigned here, will attempt to assign at Detail page if one has been captured.  Event is associated with with this FB link: ${fbLink.getAttribute('href')}`);
        }

        if (event.performers && event.performers.length > 0 && !event.eventTitle) {
          event.eventTitle = event.performers.map(x => x.performerName).join(' / ');
        }

        results.events.push(event);
      } //event loop
    } //day loop

  }
  catch(e)
  {
    log.errorLogs.push(`Capture Main Page Exception Thrown: ${e.message}`);
  }

  return [log, results, fbEventToDayMap, fbEventToStartHourMap, fbEventToStartMinMap];
}

