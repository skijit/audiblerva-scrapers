export const traversePreviousElementSiblings = (elem: any, parms: any) : any[] => {
    let rv = [] as any[];
    let shortCircuit : boolean = false;
    let nextElem = elem.previousElementSibling;
    while (nextElem) {
        let passed : boolean = true;
        for(let propName of Object.keys(parms)) {
            switch (propName) {
                case "nodeName":
                    passed = nextElem.nodeName.toUpperCase() == parms[propName].toUpperCase();
                    break;
                case "className":
                    passed = nextElem.classList.contains(parms[propName]);
                    break;
                case "mustContain":
                    passed = (nextElem.querySelectorAll(parms[propName]).length > 0);
                    break;
                case "shortCircuit":
                    shortCircuit = parms[propName];
                    break;
                default:
                    passed = false;
                    break;
            }
            if (!passed)
                break;
        }
        if (passed) {
            rv.push(nextElem);
            if (shortCircuit)
                return rv;
        }
        nextElem = nextElem.previousElementSibling;
    }

    return rv;
};
