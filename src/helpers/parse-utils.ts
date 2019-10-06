export const parseTime = (inVal: string) : [string, number, number] => {
    
    let reFormat1 = /(\d{1,2}):(\d{2})\s*([ap]m)/ig; //ex: "9:30 pm"
    let matchAttempt1 = reFormat1.exec(inVal);
    if (matchAttempt1 != null && matchAttempt1.length >= 4) {
        let fulltxt = matchAttempt1[0];
        let hours = parseInt(matchAttempt1[1]);
        let min = parseInt(matchAttempt1[2]);
        let meridian = matchAttempt1[3];
        if (meridian && meridian.toLowerCase()=="pm") {
            hours += 12;
        }
        if (!isNaN(hours) && !isNaN(min))
            return [ fulltxt, hours, min ];
    }

    let reFormat2 = /(\d{1,2})\s*([ap]m)/ig; //ex: "9pm"
    let matchAttempt2 = reFormat2.exec(inVal);
    if (matchAttempt2 != null && matchAttempt2.length >= 3) {
        let fulltxt = matchAttempt2[0];
        let hours = parseInt(matchAttempt2[1]);
        let min = 0;
        let meridian = matchAttempt2[2];
        if (meridian && meridian.toLowerCase()=="pm") {
            hours += 12;
        }
        if (!isNaN(hours) && !isNaN(min))
            return [ fulltxt, hours, min ];
    }

    return [ "", null, null ];
    
    //TODO: other formats here

};

export const correctZeroOffsetDateToLocal = (d: Date) : Date => {
    d.setTime( d.getTime() + d.getTimezoneOffset()*60*1000 );
    return d;
}

export const parseTicketString = (inVal:string) => {
    //TODO: not able to define global consts yet - maybe as a func
    let ticketTypes = {
        DOOR: "door",
        ADVANCE: "advance",
        UNK: "unknown"
    };
    let rv = [];

    let reExtractNumbers = /\d+\.?\d*/g;
    let tickNums = (inVal.match(reExtractNumbers)||[])
                    .map(x => parseFloat(x))
                    .filter(x => !isNaN(x)&&x!==null)
                    .sort((a, b) => a - b);
    
    if (tickNums.length == 1) {
        rv.push({amt: tickNums[0], qualifier: ticketTypes.DOOR});
    } else if (tickNums.length==2) {
        rv.push({amt: tickNums[0], qualifier: ticketTypes.ADVANCE});
        rv.push({amt: tickNums[1], qualifier: ticketTypes.DOOR});
    } else {
        tickNums.forEach(x => rv.push({amt: x, qualifier: ticketTypes.UNK}));
    }

    return rv;
};
