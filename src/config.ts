import { persistImagesToAws } from './helpers/aws-utils';

const NEIGHBORHOODS = {
  THE_FAN: "The Fan",
  VCU: "VCU",
  MUSEUM_DISTRICT: "Museum District",
  DOWNTOWN: "Downtown",
  SCOTTS_ADDITION: "Scott’s Addition",  
  SHOCKOE_BOTTOM: "Shockoe Bottom",
  CHURCH_HILL: "Church Hill",
  JACKSON_WARD: "Jackson Ward",
  BON_AIR: "Bon Air",
  SOUTHSIDE: "Southside",
  WEST_END: "West End"
}
export const CFG = {
  development: {
    debug: false,
    s3BucketName: 'musical.image-depot-1',
    persistImagesToAws: true
  },
  production: {
    debug: false,
    s3BucketName: 'musical.image-depot-1',
    persistImagesToAws: true
  },
  camel : {
    PRIMARY_URI: "https://www.thecamel.org/events/",
    DOMAIN_NAME: "https://www.thecamel.org",    
    // DAY_EVENT_SELECTOR : "div.fc-daygrid-body table td div.fc-daygrid-day-events div.fc-daygrid-event-harness",
    DAY_EVENT_SELECTOR : "#rhp-events-pg-template",
    MAIN_PAGE_EVENT_SELECTOR: ".eventWrapper",
    DETAIL_CONTENT_SELECTOR : "#eventTitle",
    CHANNEL_NAME: "The Camel Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/Camel-Logo-v3.jpg",
      key : "default-channel-images/Camel-Logo-v2.jpg",
      type : "jpg",
      height : 460,
      width : 593
    },      
    VENUE_NAME: "The Camel",
    TENANT_NAME: "UR",
    VENUE_ADDRESS: ["1621 W. Broad Street", "Richmond, VA 23220"],
    VENUE_PHONENUM: "804-353-4901",
    COORDINATES: [ -77.4570642, 37.5544959 ],  //lng,lat
    NEIGHBORHOOD: NEIGHBORHOODS.THE_FAN,
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    }
  },
  strangeMatter: {
    PRIMARY_URI: "http://www.strangematterrva.com/events.php",
    DOMAIN_NAME: "http://www.strangematterrva.com",
    CHANNEL_NAME: "Strange Matter Website",    
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/strange-matter.jpg",
      key : "default-channel-images/strange-matter.jpg",
      type : "jpg",
      height : 230,
      width : 219
    },     
    VENUE_NAME: "Strange Matter",
    TENANT_NAME: "UR",
    VENUE_ADDRESS: ["929 W Grace St", "Richmond, VA 23220"],
    COORDINATES: [-77.4527905,37.5506552],  //lng,lat
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    NEIGHBORHOOD: NEIGHBORHOODS.VCU
  },
  broadberry: {
    PRIMARY_URI: "https://www.thebroadberry.com/events/",
    DOMAIN_NAME: "https://www.thebroadberry.com",
    CHANNEL_NAME: "Broadberry Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/thebroadberry.jpg",
      key : "default-channel-images/thebroadberry.jpg",
      type : "jpg",
      height : 300,
      width : 682
    },    
    TENANT_NAME: "UR",
    DAY_EVENT_SELECTOR : "#rhp-events-pg-template",
    MAIN_PAGE_EVENT_SELECTOR: ".eventWrapper",    
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    COORDINATES: [-77.4692977, 37.5617414], //lng,lat -- default
    NEIGHBORHOOD: NEIGHBORHOODS.VCU,
    VENUE_ADDRESS: ["2729 W Broad St", "Richmond, VA 23220"], // default
    VENUE_NAME: 'The Broadberry'
  },
  theNational: {
    PRIMARY_URI: "https://www.thenationalva.com/events/all",
    DOMAIN_NAME: "https://www.thenationalva.com",
    CHANNEL_NAME: "The National Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/the-national.png",
      key : "default-channel-images/the-national.png",
      type : "png",
      height : 240,
      width : 232
    },       
    TENANT_NAME: "UR",
    DAY_EVENT_SELECTOR : "#eventsList",
    MAIN_PAGE_EVENT_SELECTOR: ".entry",
    DETAIL_CONTENT_SELECTOR : ".event_detail",
    VENUE_ADDRESS: ["708 E Broad St", "Richmond, VA 23219"],
    VENUE_PHONENUM: "804-612-1900",
    COORDINATES: [-77.4351138,37.5419945], //lng,lat
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    NEIGHBORHOOD: NEIGHBORHOODS.DOWNTOWN,
    VENUE_NAME: 'The National'
  },
  tinPan : {
    PRIMARY_URI: "https://www.tinpanrva.com/calendar/",
    DOMAIN_NAME: "https://www.tinpanrva.com",
    DAY_EVENT_SELECTOR : ".entry-content table td.vevent.has-event",
    MAIN_PAGE_EVENT_SELECTOR: ".one-event",
    DETAIL_CONTENT_SELECTOR : ".entry-content .event-detail",
    CHANNEL_NAME: "The Tin Pan Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/the-tin-pan.png",
      key : "default-channel-images/the-tin-pan.png",
      type : "png",
      height : 676,
      width : 821
    },       
    VENUE_NAME: "The Tin Pan",
    TENANT_NAME: "UR",
    VENUE_ADDRESS: ["8982 Quioccasin Road", "Richmond, VA 23229"],
    VENUE_PHONENUM: "804-447-8189",
    COORDINATES: [-77.571164, 37.605374], //lng,lat
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    NEIGHBORHOOD: NEIGHBORHOODS.WEST_END
  },
  caryStCafe : {
    PRIMARY_URI: "https://carystcafe.com/live-music/",
    DOMAIN_NAME: "https://carystcafe.com",
    DAY_EVENT_SELECTOR : "li.simcal-event",
    CHANNEL_NAME: "Cary St. Cafe Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/carystcafe.jpg",
      key : "default-channel-images/carystcafe.jpg",
      type : "jpg",
      height : 241,
      width : 209
    },       
    VENUE_NAME: "Cary St. Cafe",
    TENANT_NAME: "UR",
    VENUE_ADDRESS: ["2631 W Cary St", "Richmond, VA 23220"],
    VENUE_PHONENUM: "804-353-7445",
    COORDINATES: [-77.4743221, 37.5508072],  //lng,lat
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    NEIGHBORHOOD: NEIGHBORHOODS.THE_FAN
  },
  richmondSymphony : {
    PRIMARY_URI: "https://www.richmondsymphony.com/calendar/",
    DOMAIN_NAME: "https://www.richmondsymphony.com",
    DAY_EVENT_SELECTOR : "div.tribe_events",
    TENANT_NAME: "UR",
    CHANNEL_NAME: "Richmond Symphony Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/richmondsymphony.jpg",
      key : "default-channel-images/richmondsymphony.jpg",
      type : "jpg",
      height : 225,
      width : 225
    },        
    VIEW_PAST_EVENTS: true,
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    }
  },
  richmondShows : {
    PRIMARY_URI: "https://www.richmondshows.com/",
    DOMAIN_NAME: "https://www.richmondshows.com",
    CHANNEL_NAME: "RVA Shows! Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/rvashows.jpg",
      key : "default-channel-images/rvashows.jpg",
      type : "jpg",
      height : 225,
      width : 225
    },            
    TENANT_NAME: "UR",
    EVENT_CONTAINER_SELECTOR: ".list-view",
    DAY_EVENT_SELECTOR: ".list-view-item",
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    }
  },
  eventBrite : {
    PRIMARY_URI: "https://www.eventbrite.com/d/va--richmond/music--events/music/?page=",
    DOMAIN_NAME: "https://www.eventbrite.com",
    CHANNEL_NAME: "EventBrite Website",
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/eventbrite.png",
      key : "default-channel-images/eventbrite.png",
      type : "jpg",
      height : 225,
      width : 225
    },          
    TOTAL_PAGES: 8,
    EVENT_CONTAINER_SELECTOR: ".search-event-card-wrapper",
    DAY_EVENT_SELECTOR: ".eds-event-card--consumer",
    TENANT_NAME: "UR",
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: [ 'domcontentloaded', 'networkidle2' ]
    }
  },
  styleWeekly: {
    PRIMARY_URI: "https://www.styleweekly.com/richmond/EventSearch?eventCategory=1400273&sortType=&page=",
    DOMAIN_NAME: "www.styleweekly.com",
    CHANNEL_NAME: "Style Weekly Website",    
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/style-weekly.png",
      key : "default-channel-images/style-weekly.png",
      type : "png",
      height : 73,
      width : 192
    },         
    TENANT_NAME: "UR",    
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    MAIN_EVENT_SELECTOR: "div.EventListing",    
  },
  canalClub: {
    PRIMARY_URI: "https://thecanalclub.com/",
    DOMAIN_NAME: "https://thecanalclub.com/",
    CHANNEL_NAME: "The Canal Club Website",    
    CHANNEL_IMAGE: {
      src : "s3.amazonaws.com/musical.image-depot-1/default-channel-images/canal-club.png",
      key : "default-channel-images/canal-club.png",
      type : "png",
      height : 187,
      width : 300
    },         
    TENANT_NAME: "UR",
    DAY_EVENT_SELECTOR : "#seetickets",
    MAIN_PAGE_EVENT_SELECTOR: ".container > article",
    DETAIL_CONTENT_SELECTOR : "#container",
    VENUE_ADDRESS: ["1545 East Cary Street", "Richmond, VA 23219"],
    VENUE_PHONENUM: "804-643-2582",
    COORDINATES: [37.5324405683702, -77.42961121439001], //lng,lat
    NAV_SETTINGS: {
      timeout: 300000,
      waitUntil: []
    },
    NEIGHBORHOOD: NEIGHBORHOODS.SHOCKOE_BOTTOM,
    VENUE_NAME: 'The Canal Club'
  },
}