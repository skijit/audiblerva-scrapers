Scrape / Capture Scripts
============

## Build, Run, & Debug
- Build:  `npm run build`
- Run (from cmdline):
  - run entire app: `npm run app`
  - just run camel job: 
    - `npm run app -- camel`
    - `npm run camel`
- Debugging via vscode
  - only keep open a few ts files only
  - do not catch all exceptions
  - if you just want to run 1 job (e.g. camel), update the launch.json.
  - after each instance, run a `pkill -f chromium` as the puppeteer instances don't get killed. (mac/linux only)

## Manual modifications to Build Properly:
- **UPDATE**: This is no longer necessary - as I've frozen the declaration to `type_overrides` folder
- In file: `\node_modules\@types\puppeteer\index.d.ts`, replace:
  ```
  $$eval<R, X1, X2, X3>(
    selector: string,
    pageFunction: (elements: Element[], x1: UnwrapElementHandle<X1>, x2: UnwrapElementHandle<X2>) => R | Promise<R>,
    x1: X1,
    x2: X2,
  ): Promise<WrapElementHandle<R>>;
  ```
  with this:
  ```
  $$eval<R, X1, X2, X3>(
    selector: string,
    pageFunction: (elements: Element[], x1: UnwrapElementHandle<X1>, x2: UnwrapElementHandle<X2>) => R | Promise<R>,
    x1: X1,
    x2: X2,
  ): Promise<R>;
  ```

## Debugging / Programming Tips
- puppeteer
  - use a `debugger;` statement to attach the debugger in debug mode.
  - The docs aren't super clear but page.exposeFunction() lets you reference a custom function from the browser, but it's executing **in the node context**
    - [src](https://stackoverflow.com/questions/48281130/why-cant-i-access-window-in-an-exposefunction-function-with-puppeteer)
  - addScriptTag is ok, but i think you have to attach all the helpers to the window object
    - [here's a base case](https://stackoverflow.com/questions/48207414/how-can-i-dynamically-inject-functions-to-evaluate-using-puppeteer?rq=1)
    - [here's a way that might work with modules](https://github.com/GoogleChrome/puppeteer/issues/2078)
      - almost there, but toString() is leaving out the name of the function
    - [src](https://stackoverflow.com/questions/48476356/is-there-a-way-to-add-script-to-add-new-functions-in-evaluate-context-of-chrom)
- typescript
  - to create a ambient declaration (to overcome the unknown name error), use the `declare` statement
    - [see this](https://basarat.gitbooks.io/typescript/docs/types/ambient/d.ts.html)
- serializing dates over the browser - node bridge doesn't work - it should be done as a string

## TODO: Other sources to scrape
- VCU Music Page: https://arts.vcu.edu/music/events/
- Modlin Center: https://modlin.richmond.edu/events/index.html
- The Hof: https://www.thehofgarden.com/#events-section
- The Canal Club: https://www.thecanalclub.com/
- Style Weekly: https://www.styleweekly.com/richmond/EventSearch
  - Probably need to filter on 'music' and put in some date searches
- Chamber Music Society of Central Va: http://cmscva.org/index.php/events-listing/
- Hippodrome: https://hippodromerichmond.com/
  - filter out to only the stuff which requires tickets
- Carpenter Theatre: https://www.dominionenergycenter.com/venues/detail/carpenter
- Richmond Jazz Society
- Current Neighborhoods to consider: 
  - "Fan"
  - "Museum District"
  - "Downtown"
  - "Scott’s Addition"
  - "VCU"
  - "Shockoe Bottom"
  - "Church Hill"
  - "Jackson Ward"
  - "Bon Air"
  - "Southside"
  - "West End"
## Technical TODO's / Bug Fixes:
- Node is going to no longer accept a rejected promise to be caught.
- All my await'ed functions will have to change to something like:
  - `catch((e) => throw new Error(e))`
  - or see this: `await page.goto('http://example.com/page-that-throws-an-error').catch(e => console.error(e));`
- Need to be able to break up a put into multiple requests as it sometimes creates an error.

## TODO / Redesign thoughts
- don't pass so much data into the browser functions! all that serialization will slow everything down!
  - start with richmond symphony
- need to be able to break up large files into multiple successive calls
- data-driven approach: 
  - tokenizing the page
  - then tagging the raw data (auto)
  - then using the token schema to extract info a strongly typed model
- add more high level methods
  - usual params / behaviors
    - name of my version of jquery (as it'll be renamed when passed into the query logic)
    - loop or getFirst
    - jquery selector
    - attributeNames
      - it will collect these for each element and stuff them in an object which contains the attributes and the current matching element
        - if any of these fails, it's logged accordingly
      - then it will pass them to the callback, along with the logging object
    - logging object
    - error message (fragment)
    - error severity
    - callback for special logic, misc assignment
      - params should be: orginal object sent in, object from selector, reference to jquery as $
    - where does the object get created?  is it returned?      
- consider general approaches to making it dumber
- utility method so that when adding to logs, it also gets output to console - for diagnostics
        

## Misc
- EventDesc
  - Not initally handled very well
  - Implementation notes:
    - Camel, Broadberry, Tin Pan, RichmondShows has performer notes, but no general event desc
    - The national puts all it's interesting info in performer notes, so it's ok there's no event desc here    
- Broken list (10/6/2019)

## Style Weekly Notes

- Main Page: `https://www.styleweekly.com/richmond/EventSearch?eventCategory=1400273&sortType=date`
- Pagination works with get: `https://www.styleweekly.com/richmond/EventSearch?eventCategory=1400273&sortType=date&page={page}`

- Special handlers:
  - unescaping urls
  - parsing/identifying recurrent events (need more examples)
  - add timezone info to dates in ld+json

- Main page selectors 
  - Get each events: `div.EventListing`
    - ld+json is the first element after the event listing - see event details below!
    - Event Detail Page link: `[...document.querySelectorAll('div.listing > h3 > a')].forEach(x => console.log(x.getAttribute('href')))`
    - neighborhood tag! `[...document.querySelectorAll('div.listing div.descripTxt span.locationRegion a')].forEach(x => console.log(x.innerText))` 
    - contact phone number: `[...document.querySelectorAll('div.listing div.descripTxt.longDescrip span.locationPhone')].forEach(x => console.log(x.innerText))`
      `[...document.querySelectorAll('div.descripTxt.longDescrip span.locationPhone')].forEach(x => console.log(x.innerText))`
    - venue link/info: 
      - `[...document.querySelectorAll("div:not([class='longDescrip']).descripTxt span.locationLabel a")].forEach(x => console.log(x.innerText))`
      - `[...document.querySelectorAll("div:not([class='longDescrip']).descripTxt span.locationLabel a")].forEach(x => console.log(x.getAttribute("href")))`
    - date/regular-event-identifier: `document.querySelectorAll('span.altTimeDisplay').forEach(x => console.log(x.innerText))`
      - How to handle regular events: have a configuration variable that says how many events to generate- should be roughly equivalent to scraping interval
      - Note- On the detail page, the dates are in the past


  - Event Details Page
    - Other data points:
      - Price: `document.querySelectorAll('span.eventInfo.eventPrice')[0].innerText` (sometimes?)
    - ld+json: `document.querySelectorAll('script[type="application/ld+json"]')[0].textContent`
      - No timezone
      - urls are overescaped
    - Format
    ```
    {
      "name": "Gull, Dumb Waiter, Imelda Marcos and  Jono Stewart",
        "image": {
          "url": "https://media2.fdncms.com/styleweekly/imager/u/original/15096976/imelda.jpg",
          "width": 640,
          "height": 960,
          "@type": "ImageObject"
        },
      "startDate" : "2019-10-08T19:00:00",
        "endDate" : "2019-10-08T23:00:00",          
        "url" : "https:\/\/www.facebook.com\/events\/2093602540943012\/",
      "location" : {
        "sameAs" : "https:\/\/www.styleweekly.com\/richmond\/gallery5\/Location?oid=1392088",
        "name" : "Gallery5",
        "address" : "200 W. Marshall St., Richmond, Va.",
        "@type" : "Place"
      },
      "@context": "https://schema.org",
      "@type": "Event"
    }

    {
      "name": "The Bopst Show",
        "description": "The critically acclaimed music radio show held by artist, musician, writer, DJ and founding member of influential Richmond bands Gwar, Alter Natives and Mao Tse Helen, Chris Bopst.",
        "image": {
          "url": "https:\/\/media2.fdncms.com\/styleweekly\/imager\/u\/original\/9191523\/podcast.jpg",
          "width": 1500,
          "height": 1491,
          "@type": "ImageObject"
        },          
      "startDate" : "2018-05-28T13:00:00",
        "endDate" : "2018-05-28T15:00:00",
        "url" : "http:\/\/www.richmondsoulradio.com\/",
      "location" : {
        "sameAs" : "https:\/\/www.styleweekly.com\/richmond\/wclm-1450-am\/Location?oid=2942975",
        "name" : "WCLM 1450 AM",
        "address" : "3203 Hull St., Richmond, Va. 23224",
        "@type" : "Place"
      },
      "@context": "https://schema.org",
      "@type": "Event"
    }
    ```