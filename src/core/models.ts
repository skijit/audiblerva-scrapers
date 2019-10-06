export interface CaptureDto {
    captureLog : CaptureLog;
    captureResults : CaptureResults;
}

export interface CaptureLog {
    tenantName: string;
    channelName: string;
    channelBaseUri: string;
    logDt: string;
    mostRecentScreenShot: SavedImage;   //new
    errorLogs: string[];
    warningLogs: string[];
    infoLogs: string[];
    totalCapturedEvents: number;
}

export interface CaptureResults {
    tenantName: string;
    channelName: string;
    channelBaseUri: string;
    captureDt: string;    
    events: CaptureEvent[];
}

export interface CaptureEvent {
    tenantName: string;
    channelName: string;
    channelImage: SavedImage[];
    channelBaseUri: string;
    venueName: string;
    eventTitle: string;
    startDt: string;    
    endDt: string;
    doorTimeHours: number;
    doorTimeMin: number; 
    rawDoorTimeStr: string; 
    performers: CapturePerformer[];    
    eventUris: UriType[];
    eventDesc: string;
    ticketCostRaw: string; 
    ticketCost: TicketAmtInfo[]; 
    ticketUri: string;
    miscDetail: string[];
    unparsedDetail: string[];
    minAge?: number,
    facebookShareUri:string; 
    twitterShareUri:string; 
    iCalUri:string; 
    gCalUri:string; 
    eventContactInfo: ContactInfoItem[];
    eventImageUris: string[];
    savedEventImageUris : SavedImage[];
    venueAddressLines: string[]; 
    venueContactInfo: ContactInfoItem[]; 
    promoters: PromoterInfo[]; 
    program: ProgramItem[],    
    detailPageHtml: string,
    detailPageInnerText: string,
    location: Location,        
    neighborhood: string 
}

export interface SavedImage {
    src: string,
    key: string,
    height: number,
    width: number,
    type: string
}

export interface Location {
    type: "Point",
    coordinates: number[]
}

export interface ProgramItem { 
    composer: string,
    title:string
}

export interface PromoterInfo {
    name: string;
    uris: string[];
    desc: string;
}

export interface TicketAmtInfo {
    amt : number;
    qualifier : string;
}

export interface UriType { 
    uri: string;
    isCaptureSrc: boolean;
}

export interface ContactInfoItem {
    item: string,
    itemType: string
}

export const CONTACT_ITEM_TYPES = {
    PHONE: "phone",
    EMAIL: "email"
}

export interface CapturePerformer {
    performerName: string;
    isPrimaryPerformer: boolean;
    performerUris: string[];
    performerImageUris: string[];
    savedPerformerImageUris: SavedImage[];
    performerDesc: string;
    performerRole: string;
}
