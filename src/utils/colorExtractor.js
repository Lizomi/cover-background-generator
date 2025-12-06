export function extractColors(imgElement) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    tempCanvas.width = 100;
    tempCanvas.height = 100;
    
    ctx.drawImage(imgElement, 0, 0, tempCanvas.width, tempCanvas.height);
    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    
    let pixelColors = [];
    const step = 2;

    for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = imageData[i];
        const g = imageData[i+1];
        const b = imageData[i+2];
        const brightness = (r + g + b) / 3;
        
        if (brightness > 10 && brightness < 245) {
            pixelColors.push([r/255, g/255, b/255]);
        }
    }

    if (pixelColors.length === 0) return [[0.5,0.5,0.5]];

    function distSq(c1, c2) {
        return Math.pow(c1[0]-c2[0], 2) + Math.pow(c1[1]-c2[1], 2) + Math.pow(c1[2]-c2[2], 2);
    }

    let bestSeed = pixelColors[0];
    let maxSat = -1;
    for(let i=0; i<pixelColors.length; i+=10) {
        let c = pixelColors[i];
        let sat = Math.max(c[0],c[1],c[2]) - Math.min(c[0],c[1],c[2]);
        if(sat > maxSat) {
            maxSat = sat;
            bestSeed = c;
        }
    }

    let finalColors = [bestSeed];
    const targetCount = 5;
    const sampleSize = 1000;
    let paletteCandidates = [];
    for(let i=0; i<sampleSize; i++) {
        paletteCandidates.push(pixelColors[Math.floor(Math.random() * pixelColors.length)]);
    }

    for(let k=1; k<targetCount; k++) {
        let maxDist = -1;
        let bestCandidate = paletteCandidates[0];
        for(let i=0; i<paletteCandidates.length; i++) {
            let c = paletteCandidates[i];
            let minDistToExisting = 100.0;
            for(let j=0; j<finalColors.length; j++) {
                let d = distSq(c, finalColors[j]);
                if(d < minDistToExisting) minDistToExisting = d;
            }
            if(minDistToExisting > maxDist) {
                maxDist = minDistToExisting;
                bestCandidate = c;
            }
        }
        finalColors.push(bestCandidate);
    }
    while(finalColors.length < 5) {
        finalColors.push(finalColors[0]);
    }
    return finalColors;
}
